/**
 * Height to colour. PlanetSpec.md section 5: blue for sea, ground colour for land, grey
 * and white for mountains, with the coastline reading the same on the map and on
 * the globe.
 *
 * The sea level moves with the UWP under 5.2, so heights are normalised against it
 * before the ramp is read. The ramp itself still pivots at 0.5, so the sea-land
 * boundary stays the coastline whatever fraction of the world is wet, and a dry
 * world does not come out as one unbroken sheet of mountain.
 *
 * There are two land ramps, not one, and the verdancy of 5.6 says how far between
 * them a world sits. Green is what a watered, breathing, temperate world looks
 * like; a world with none of that is sand and rock, and is drawn in yellows and
 * browns. Both ramps share their stops, so blending them cannot move the coastline
 * or the snow line.
 */

/** Used when the UWP cannot be read, so there is no hydrographics to work from. */
export const DEFAULT_SEA_LEVEL = 0.5;

/**
 * A ramp stop: a position and the colour there. The position is a height on the
 * ramps below and a temperature on the ones the visible view of 5.7 reads, since
 * sampling a ramp does not care what its axis means.
 */
export type Stop = readonly [number, readonly [number, number, number]];

/** Which of the two views of 5.7 a panel is drawing. */
export type ViewMode = "survey" | "orbital";

/**
 * A colour for one place on the world: how high it is, how far it sits from the
 * equator, and whether ice covers it. Everything else a view needs is about the
 * world rather than the place, so it is closed over rather than passed in, and the
 * three panels of section 4 all colour a hex by calling one of these.
 */
export type Shader = (height: number, sinLat: number, iced: boolean) => string;

const SEA: readonly Stop[] = [
  [0.0, [8, 34, 74]],
  [0.3, [17, 74, 130]],
  [0.5, [58, 132, 194]],
];

/** Land on a world with something growing on it. */
const VERDANT: readonly Stop[] = [
  [0.5001, [46, 110, 58]],
  [0.62, [104, 152, 70]],
  [0.72, [150, 156, 108]],
  [0.8, [136, 136, 132]],
  [0.9, [190, 190, 186]],
  [1.0, [252, 252, 250]],
];

/**
 * Land on a world with nothing growing on it: ochre lowlands, sand and dust
 * through the middle, and bare warm rock above. The peaks stay pale, since snow
 * and stripped stone are as light on a dead world as on a living one.
 */
const ARID: readonly Stop[] = [
  [0.5001, [150, 116, 72]],
  [0.62, [186, 156, 96]],
  [0.72, [176, 146, 108]],
  [0.8, [150, 128, 110]],
  [0.9, [196, 184, 170]],
  [1.0, [246, 242, 234]],
];

/**
 * Height onto [0, 1] with the sea level at the middle. Below it compresses into
 * the sea half of the ramp, above it into the land half.
 */
export function normalise(h: number, seaLevel: number): number {
  if (seaLevel <= 0) return h >= 1 ? 1 : 0.5 + 0.5 * h;
  if (seaLevel >= 1) return 0.5 * h;
  return h <= seaLevel ? 0.5 * (h / seaLevel) : 0.5 + 0.5 * ((h - seaLevel) / (1 - seaLevel));
}

/** Ice, and how far it covers the ground beneath. Spec 5.4.3. */
const ICE: readonly [number, number, number] = [232, 240, 250];
const ICE_COVER = 0.72;

export function heightColour(
  h: number,
  seaLevel = DEFAULT_SEA_LEVEL,
  iced = false,
  verdancy = 1,
): string {
  const n = normalise(h, seaLevel);
  const v = n < 0 ? 0 : n > 1 ? 1 : n;
  if (v <= 0.5) return under(sample(SEA, v), iced);
  const green = sample(VERDANT, v);
  const bare = sample(ARID, v);
  const t = verdancy < 0 ? 0 : verdancy > 1 ? 1 : verdancy;
  return under([0, 1, 2].map((i) => bare[i]! + (green[i]! - bare[i]!) * t), iced);
}

/** The colour a ramp gives at a point, clamped to its ends. */
export function sample(ramp: readonly Stop[], v: number): readonly number[] {
  const first = ramp[0]!;
  if (v <= first[0]) return first[1];
  for (let i = 1; i < ramp.length; i++) {
    const [hi, cHi] = ramp[i]!;
    if (v > hi) continue;
    const [lo, cLo] = ramp[i - 1]!;
    const t = hi === lo ? 0 : (v - lo) / (hi - lo);
    return [0, 1, 2].map((k) => cLo[k]! + (cHi[k]! - cLo[k]!) * t);
  }
  return ramp[ramp.length - 1]![1];
}

/**
 * A colour, put under ice if there is ice. The ground shows through rather than
 * being painted out, so a mountain under a cap still reads as a mountain.
 */
function under(rgb: readonly number[], iced: boolean): string {
  const shade = (i: number) =>
    Math.round(iced ? rgb[i]! + (ICE[i]! - rgb[i]!) * ICE_COVER : rgb[i]!);
  return `rgb(${shade(0)},${shade(1)},${shade(2)})`;
}

/** Two colours mixed, `t` of the way from the first to the second. */
export function mix(a: readonly number[], b: readonly number[], t: number): readonly number[] {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return [0, 1, 2].map((i) => a[i]! + (b[i]! - a[i]!) * k);
}

/** A colour back from the string above. Anything unreadable comes back black. */
export function parseRgb(colour: string): readonly [number, number, number] {
  const parts = colour.match(/\d+/g);
  if (parts === null || parts.length < 3) return [0, 0, 0];
  return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
}

/** A colour as the string an SVG fill or a three.js material will take. */
export function rgbText(c: readonly number[]): string {
  return `rgb(${Math.round(c[0]!)},${Math.round(c[1]!)},${Math.round(c[2]!)})`;
}

/** The height ramp above, as the shader the panels take. Spec 5.7.1.1. */
export function surveyShader(seaLevel: number, verdancy: number): Shader {
  return (height, _sinLat, iced) => heightColour(height, seaLevel, iced, verdancy);
}

/** The band a height falls in, for the hex properties readout. */
export function terrainBand(h: number, seaLevel = DEFAULT_SEA_LEVEL, iced = false): string {
  const n = normalise(h, seaLevel);
  if (iced) return n <= 0.5 ? "Ice over sea" : "Ice cap";
  if (n <= 0.3) return "Deep sea";
  if (n <= 0.5) return "Sea";
  if (n <= 0.66) return "Lowland";
  if (n <= 0.78) return "Upland";
  if (n <= 0.9) return "Mountain";
  return "Peak";
}
