import { valueFor } from "./rng";
import { parseUwp, type Uwp } from "../planet";
import { climateFor, type Climate, type ClimateOverrides } from "./climate";

/**
 * Detail values: the fine numbers that sit inside the coarse ones. Spec 6.12.
 *
 * Every attribute is the same shape. A fraction in [0, 1) comes from the seed and
 * never changes; a range comes from somewhere else; the value is the fraction
 * placed linearly in the range. For attributes the UWP already states as a range,
 * the range is the band that digit names, so editing the digit re-reads the same
 * fraction against the new band and moves the value without re-rolling it.
 *
 * Fractions come from a named stream per attribute rather than from positions in
 * a list, so adding an attribute later cannot shift any existing one.
 */

/** The fraction for one attribute. Fixed by the seed, in [0, 1). Spec 6.12.1. */
export function fractionFor(seed: string, attribute: string): number {
  return valueFor(`${seed}:detail:${attribute}`, 0);
}

function lerp(min: number, max: number, fraction: number): number {
  return min + (max - min) * fraction;
}

/** Reads a band table where each entry is the top of that digit's range. */
function bandFromTops(tops: readonly number[], digit: number, floor = 0): readonly [number, number] {
  const d = clamp(digit, tops.length - 1);
  return [d === 0 ? floor : tops[d - 1]!, tops[d]!];
}

function clamp(digit: number, top: number): number {
  return Math.min(Math.max(Math.trunc(digit), 0), top);
}

/* Bands ------------------------------------------------------------------ */

/** Diameter at the top of each size digit, km. Cheatsheet, section 7. */
const DIAMETER_TOPS = [1000, 1600, 3200, 4800, 6400, 8000, 9600, 11200, 12800, 14400, 16000];

/** Surface gravity at the top of each size digit, g. Cheatsheet, section 7. */
const GRAVITY_TOPS = [0, 0.05, 0.15, 0.25, 0.35, 0.45, 0.7, 0.9, 1.0, 1.25, 1.4];

/**
 * Atmospheric pressure per atmosphere digit, in atmospheres. The cheatsheet gives
 * one nominal figure per digit rather than a range, and repeats it across the
 * tainted and untainted pairs, so these bands are read around those nominals. The
 * digits it marks "Varies" get the whole habitable spread. Spec 6.12.2.
 */
const PRESSURE_BANDS: readonly (readonly [number, number])[] = [
  [0, 0], // 0 None
  [0.001, 0.09], // 1 Trace
  [0.1, 0.42], // 2 Very thin, tainted
  [0.1, 0.42], // 3 Very thin
  [0.43, 0.7], // 4 Thin, tainted
  [0.43, 0.7], // 5 Thin
  [0.71, 1.49], // 6 Standard
  [0.71, 1.49], // 7 Standard, tainted
  [1.5, 2.49], // 8 Dense
  [1.5, 2.49], // 9 Dense, tainted
  [0.1, 2.49], // A Exotic, varies
  [0.1, 2.49], // B Corrosive, varies
  [0.1, 2.49], // C Insidious, varies
  [2.5, 10], // D Very dense
  [0.001, 0.5], // E Low
  [0.1, 2.49], // F Unusual, varies
];

/** Surface water per hydrographics digit, %. The cheatsheet gives these outright. */
const HYDROGRAPHICS_BANDS: readonly (readonly [number, number])[] = [
  [0, 5],
  [6, 15],
  [16, 25],
  [26, 35],
  [36, 45],
  [46, 55],
  [56, 65],
  [66, 75],
  [76, 85],
  [86, 95],
  [96, 100],
];

/**
 * Inhabitants per population digit. The digit is the exponent, so digit n covers
 * 10^n up to the next power. Digit 0 is nobody rather than one person.
 */
function populationBand(digit: number): readonly [number, number] {
  const d = clamp(digit, 15);
  return d === 0 ? [0, 0] : [10 ** d, 10 ** (d + 1) - 1];
}

/* Attributes ------------------------------------------------------------- */

/** Which UWP position sets an attribute's range, or null for a fixed range. */
type Position = keyof Pick<Uwp, "size" | "atmosphere" | "hydrographics" | "population">;

interface Attribute {
  readonly key: string;
  readonly label: string;
  readonly position: Position | null;
  readonly band: (digit: number) => readonly [number, number];
  readonly round?: boolean;
  readonly format: (value: number) => string;
  /** Set where format loses precision the reader might still want. */
  readonly exact?: (value: number) => string;
}

export const ATTRIBUTES: readonly Attribute[] = [
  {
    key: "diameter",
    label: "Diameter",
    position: "size",
    band: (d) => bandFromTops(DIAMETER_TOPS, d),
    round: true,
    format: (v) => `${v.toLocaleString("en-GB")} km`,
  },
  {
    key: "gravity",
    label: "Gravity",
    position: "size",
    band: (d) => bandFromTops(GRAVITY_TOPS, d),
    format: (v) => `${v.toFixed(2)} g`,
  },
  {
    key: "pressure",
    label: "Pressure",
    position: "atmosphere",
    band: (d) => PRESSURE_BANDS[clamp(d, PRESSURE_BANDS.length - 1)]!,
    format: (v) => `${v.toFixed(2)} atm`,
  },
  {
    key: "hydrographics",
    label: "Surface water",
    position: "hydrographics",
    band: (d) => HYDROGRAPHICS_BANDS[clamp(d, HYDROGRAPHICS_BANDS.length - 1)]!,
    format: (v) => `${v.toFixed(0)}%`,
  },
  {
    key: "population",
    label: "Population",
    position: "population",
    band: populationBand,
    round: true,
    format: compactNumber,
    exact: (v) => `${v.toLocaleString("en-GB")} people`,
  },
];

/** The value an attribute takes for one seed and one UWP. Null if the UWP set its
 * range and could not be read. */
export function valueOf(attribute: Attribute, seed: string, uwp: Uwp | null): number | null {
  if (attribute.position !== null && uwp === null) return null;
  const digit = attribute.position === null ? 0 : uwp![attribute.position];
  const [min, max] = attribute.band(digit);
  const value = lerp(min, max, fractionFor(seed, attribute.key));
  return attribute.round ? Math.round(value) : value;
}

/**
 * A large number as prose. A population runs to sixteen digits at the top of the
 * scale, which no column can hold and no reader can take in, so the row says
 * "707 trillion" and keeps the figure itself for the title.
 */
export function compactNumber(value: number): string {
  const scales: readonly [number, string][] = [
    [1e15, "quadrillion"],
    [1e12, "trillion"],
    [1e9, "billion"],
    [1e6, "million"],
    [1e3, "thousand"],
  ];
  for (const [size, name] of scales) {
    if (value >= size) {
      const n = value / size;
      return `${n < 10 ? n.toFixed(1) : Math.round(n).toLocaleString("en-GB")} ${name}`;
    }
  }
  return value.toLocaleString("en-GB");
}

export interface DetailRow {
  readonly key: string;
  readonly label: string;
  readonly text: string;
  /** The unrounded figure, where the text above is a readable stand-in for it. */
  readonly exact?: string;
}

export interface PlanetDetail {
  readonly diameterKm: number | null;
  readonly gravityG: number | null;
  readonly pressureAtm: number | null;
  readonly hydrographicsPct: number | null;
  readonly population: number | null;
  /** The world settings of 6.15, rolled from the seed or as the user set them. */
  readonly climate: Climate;
  readonly axialTiltDeg: number;
  readonly orbitAu: number;
  readonly meanTempK: number;
  readonly rotationHours: number;
  /** The same values, laid out for the panel. Spec 4.2.5. */
  readonly rows: readonly DetailRow[];
}

export function planetDetail(
  seed: string,
  uwp: string,
  overrides: ClimateOverrides = {},
): PlanetDetail {
  const parsed = parseUwp(uwp);
  const values = new Map<string, number | null>();
  const rows: DetailRow[] = [];
  for (const attribute of ATTRIBUTES) {
    const value = valueOf(attribute, seed, parsed);
    values.set(attribute.key, value);
    rows.push({
      key: attribute.key,
      label: attribute.label,
      text: value === null ? "—" : attribute.format(value),
      ...(value !== null && attribute.exact ? { exact: attribute.exact(value) } : {}),
    });
  }
  const climate = climateFor(
    seed,
    parsed,
    values.get("pressure") ?? 0,
    values.get("hydrographics") ?? 0,
    overrides,
  );
  return {
    diameterKm: values.get("diameter")!,
    gravityG: values.get("gravity")!,
    pressureAtm: values.get("pressure")!,
    hydrographicsPct: values.get("hydrographics")!,
    population: values.get("population")!,
    climate,
    axialTiltDeg: climate.obliquityDeg,
    orbitAu: climate.orbitAu,
    meanTempK: climate.meanTempK,
    rotationHours: climate.rotationHours,
    rows,
  };
}
