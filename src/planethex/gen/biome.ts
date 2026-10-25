import {
  isTidallyLocked,
  latitudeContrastK,
  lockedContrastK,
  seasonalTiltDeg,
  temperatureAtLatitude,
  temperatureAtStar,
} from "./climate";
import { coverFactorsFor, warmthAt } from "./life";
import type { PlanetDetail } from "./detail";

/**
 * What the ground at a place is made of. Spec 5.8.
 *
 * The verdancy of 5.6 is one number for a whole world, which is as much as a
 * single colour for the whole of it can use. This is the same three factors taken
 * a place at a time: the air and the water are the world's and do not vary, and
 * the warmth is read at the local temperature of 5.7.3, so a world whose mean is
 * temperate is jungle at its equator and tundra at sixty degrees.
 *
 * It was written for the orbital view of 5.7, and for a while it was only that: a
 * number computed per hex, turned into a colour, and thrown away. But a colour is
 * not the answer to the question. What ground a hex is is a fact about the world,
 * and a referee wants it in the hex readout and in the exported table as much as
 * on the map, so the model lives here with the rest of what the world is made of
 * and ui/orbital.ts is left doing what its name says.
 *
 * Nothing here reads a height field. Every function takes the height it is asked
 * about, so the map, the globe, the local panel and the plate all ask the same
 * question of the same model and cannot get different answers.
 */

/* Constants ---------------------------------------------------------------- */

/** Normalised heights between which soil gives out and the rock comes through. */
export const BARE_FROM = 0.8;
export const BARE_TO = 0.93;

/**
 * The local mean temperatures between which the snow line climbs from the coast
 * to the highest peaks. At the cold end the ground is white from the water's edge
 * up; at the warm end only the summits hold any.
 *
 * It is permanent snow this is placing, not snow that falls, so both ends sit well
 * away from freezing. Earth's line runs about 5,000m at the equator, 2,700m at 45
 * degrees and down to the shore past 70, and these put it near enough there.
 *
 * The cold end is a long way below freezing on purpose. Anchorage and Reykjavik
 * sit at 62 degrees under an annual mean around -7C, and neither is under
 * permanent snow at sea level: what is white there is the mountains behind them.
 * Set any warmer and every temperate world comes out iced from the tree line down.
 */
const SNOW_TO_THE_COAST_K = 245;
const SNOW_ON_NOTHING_K = 295;

/** How wide a band the snow line is drawn as, in normalised height. */
const SNOW_BAND = 0.07;

/**
 * Surface water, as a percentage, between which a world goes from having nothing
 * to fall as snow to having enough to whiten everything cold enough for it. A
 * hydrographics digit of 0 is a trace rather than none, and a trace is a long way
 * short of a snowfield: a world with that much water reads as the rock it is.
 */
const SNOW_FROM_PCT = 3;
const SNOW_FULL_PCT = 20;

/**
 * The dry belts, in degrees from the equator, and how wide and how deep they cut.
 *
 * Air rising over the equator comes down again about this far north and south of
 * it, and it comes down having already rained. The Sahara, Arabia, the Kalahari,
 * the Thar, the Atacama and the Australian interior are one band and the same
 * band, and a world drawn without them has an unbroken green waist that no planet
 * has. It needs air to happen, so it is scaled by how much of it there is.
 */
const DRY_BELT_DEG = 26;
const DRY_BELT_WIDTH_DEG = 12;
const DRY_BELT_DEPTH = 0.62;

/**
 * What it takes for the ground to count as weathered rather than as bare stone.
 *
 * Air is the low bar. A trace of it is enough: Mars holds six thousandths of an
 * atmosphere and is the reddest surface in the solar system, because given four
 * billion years that is all the oxidation needs. It takes a true vacuum to leave
 * stone as stone, which is why Luna and Mercury are grey.
 *
 * Water is the higher one, and it is a hydrosphere that is wanted rather than a
 * trace. A hydrographics digit of 0 still allows a few percent, and a few percent
 * of frost on an airless rock leaves it an airless rock.
 */
const WEATHERED_ATM = 0.004;
const WEATHERED_FROM_PCT = 5;
const WEATHERED_FULL_PCT = 25;

/** What a world with no readable profile is taken for: middling, not lush. */
const DEFAULT_AIR = 0.7;
const DEFAULT_WATER = 0.7;

/* The world ---------------------------------------------------------------- */

/** Everything the model needs about the world. The rest is per place. */
export interface BiomeWorld {
  readonly meanTempK: number;
  /**
   * How far the surface swings either side of the mean, in kelvin. From the
   * equator to the poles on a turning world, 5.7.3; from the point under the
   * star to the far side on a locked one, 5.7.7.
   */
  readonly contrastK: number;
  /**
   * Which way that swing runs.
   *
   * A locked world's surface is not banded by latitude at all: the only axis
   * that means anything on it runs from the point under its star to the point
   * opposite, and its own poles both sit on the terminator at the same
   * temperature as each other. So a locked world is modelled with that axis as
   * its polar axis - the star overhead at the north pole, endless night at the
   * south - and every figure below that takes a sine of latitude is reading the
   * cosine of the angle to the star instead. It is the same sphere with its
   * label changed, and it is what puts the ice cap on the dark side and the open
   * water in a ring rather than a belt.
   */
  readonly gradient: "latitude" | "substellar";
  readonly air: number;
  readonly water: number;
  /** How far air and water have worked the surface over, 0 for bare stone. */
  readonly weathering: number;
  /** How much water there is to fall as snow, 0 to 1. */
  readonly snow: number;
}

export function biomeWorldFor(uwp: string, detail: PlanetDetail): BiomeWorld {
  const cover = coverFactorsFor(uwp, detail);
  const pressure = detail.pressureAtm ?? 0;
  const wet = detail.hydrographicsPct ?? 0;
  const locked = isTidallyLocked(
    detail.rotationHours,
    detail.orbitAu,
    detail.climate.luminosity,
  );
  return {
    meanTempK: detail.meanTempK,
    gradient: locked ? "substellar" : "latitude",
    contrastK: locked
      ? lockedContrastK(detail.meanTempK, pressure)
      : latitudeContrastK(seasonalTiltDeg(detail.axialTiltDeg), pressure),
    air: cover?.air ?? DEFAULT_AIR,
    water: cover?.water ?? DEFAULT_WATER,
    weathering: Math.max(
      ramp(pressure, 0, WEATHERED_ATM),
      ramp(wet, WEATHERED_FROM_PCT, WEATHERED_FULL_PCT),
    ),
    snow: ramp(wet, SNOW_FROM_PCT, SNOW_FULL_PCT),
  };
}

/* One place ---------------------------------------------------------------- */

/**
 * The mean temperature at a place, in kelvin. Spec 5.7.3, or 5.7.7 where the
 * world is locked and `sinLat` is the cosine of the angle to its star.
 */
export function temperatureAt(world: BiomeWorld, sinLat: number): number {
  return world.gradient === "substellar"
    ? temperatureAtStar(world.meanTempK, world.contrastK, sinLat)
    : temperatureAtLatitude(world.meanTempK, world.contrastK, sinLat);
}

/**
 * How much of the ground at a latitude is under cover, 0 to 1. The verdancy of
 * 5.6 with its warmth read here rather than at the world's mean, and with the dry
 * belts of 5.7.2.2 taken out of it.
 */
export function coverAt(world: BiomeWorld, sinLat: number, tempK = temperatureAt(world, sinLat)): number {
  // The dry belts are a turning world's cells, thrown by the spin that a locked
  // world has not got. Its own dry half is the night side, and the temperature
  // above has already said so.
  const belts = world.gradient === "substellar" ? 1 : dryBelt(sinLat, world.air);
  return world.air * world.water * warmthAt(tempK) * belts;
}

/** How far the soil has given way to the rock under it, 0 to 1. */
export function rockAt(n: number): number {
  return ramp(n, BARE_FROM, BARE_TO);
}

/**
 * How much permanent snow lies on ground of this height at this temperature, 0 to
 * 1. A world with no water to speak of has none however cold it is.
 */
export function snowAt(world: BiomeWorld, tempK: number, n: number): number {
  const line = 0.5 + 0.5 * ramp(tempK, SNOW_TO_THE_COAST_K, SNOW_ON_NOTHING_K);
  return world.snow * ramp(n, line - SNOW_BAND, line);
}

/**
 * What the subtropical dry belts leave of the ground cover at a latitude. One at
 * the equator and in the temperate belts, less in the two bands either side of the
 * equator where the air comes back down.
 */
export function dryBelt(sinLat: number, air: number): number {
  const latDeg = (Math.asin(clamp(sinLat, -1, 1)) * 180) / Math.PI;
  const off = (Math.abs(latDeg) - DRY_BELT_DEG) / DRY_BELT_WIDTH_DEG;
  return 1 - DRY_BELT_DEPTH * air * Math.exp(-off * off);
}

/* Naming it ---------------------------------------------------------------- */

/**
 * Cover fractions above which the ground reads as closed cover and as open cover.
 * Below the second there is not enough of it to name the place after.
 */
const CLOSED_COVER = 0.55;
const OPEN_COVER = 0.2;

/** Weathering below which bare ground is stone rather than dust and sand. */
const STONE = 0.35;

/** Snow and rock fractions above which they are what the place is. */
const SNOW_COVERED = 0.5;
const ROCK_EXPOSED = 0.55;

/**
 * What the ground at a place is, in a word. Spec 5.8.2.
 *
 * This is the terrain type of 8.3, derived rather than drawn. It is not the
 * terrain band of 5.1: that says how high the ground is, which is a different
 * question with a different answer, and a hex has both.
 *
 * The order the tests come in is the order the answers overrule each other. Ice
 * and open water are what a place is whatever is under them; snow and bare stone
 * are what it is whatever would otherwise grow; and only past all of those does
 * the cover of 5.8.1 get to name it.
 */
export function biomeAt(
  world: BiomeWorld,
  n: number,
  sinLat: number,
  iced: boolean,
): string {
  if (n <= 0.5) {
    if (iced) return "Sea ice";
    if (n <= 0.3) return "Deep sea";
    return n <= 0.46 ? "Sea" : "Shelf sea";
  }
  if (iced) return "Ice cap";

  const tempK = temperatureAt(world, sinLat);
  if (snowAt(world, tempK, n) >= SNOW_COVERED) return "Snowfield";
  if (rockAt(n) >= ROCK_EXPOSED) return "Bare rock";

  const cover = coverAt(world, sinLat, tempK);
  if (cover >= CLOSED_COVER) {
    if (tempK >= 298) return "Rainforest";
    // Closed broadleaf holds down to an annual mean of about 6C, which is Paris
    // and Vancouver. Below that it is conifer, and taiga proper runs from there
    // to about -5C, where the trees give out and the ground is tundra.
    if (tempK >= 279) return "Forest";
    if (tempK >= 268) return "Boreal forest";
    return "Tundra";
  }
  if (cover >= OPEN_COVER) {
    if (tempK >= 298) return "Savannah";
    if (tempK >= 278) return "Grassland";
    if (tempK >= 265) return "Steppe";
    return "Tundra";
  }
  if (world.weathering < STONE) return "Bare rock";
  if (tempK >= 288) return "Desert";
  return tempK >= 263 ? "Cold desert" : "Polar desert";
}

/* Helpers ------------------------------------------------------------------ */

/** Zero at the `none` end, one at the `full` end, linear between. Either order. */
export function ramp(value: number, none: number, full: number): number {
  if (none === full) return value >= full ? 1 : 0;
  return clamp01((value - none) / (full - none));
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
