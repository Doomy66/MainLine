import { DEFAULT_DETAIL, DETAIL_LEVELS, nearestDetail } from "./grid/coord";
import { valueFor } from "./gen/rng";
import { splitLegacyLocation } from "./location";
import { parsePois, type Poi } from "./poi";

/**
 * The planet record, and the thing a save file holds. PlanetSpec.md section 6.1.
 *
 * Heights are absent on purpose: they are rebuilt from seed and size on load, so
 * a save can never disagree with what the generator produces.
 */
export interface Planet {
  /** Save format version, so a later phase can add fields. Spec 6.4.2. */
  readonly version: 1;
  name: string;
  /**
   * Where the world sits in its system - "Sol-3", "Regina Belt-1" - or null for
   * a world that has no system. SystemSpec 7.2 and AppSpec 4.2.1.
   *
   * A world's name is what people call it and can be anything; its designation
   * is which body of which system it is, and is what its files are named for. A
   * world named Earth is still Sol-3 on disk, because a folder of files is read
   * by somebody looking for the third orbit of a system whose folder they are
   * standing in.
   *
   * Stored rather than worked out, because a world opened from a file has no
   * system to ask. Null for a planet rolled on its own, which is named for
   * itself and saved into a folder of its own - AppSpec 4.2.4.
   */
  designation: string | null;
  /** The sector the world sits in, free text. Spec 6.14. */
  sector: string;
  /**
   * Which subsector of it, free text. Spec 6.14.2: the letter follows from the
   * hex, but what the sixteen are called does not, and a world can sit in the
   * Regina subsector of a referee's own map that has no hex grid at all.
   */
  subsector: string;
  /** Its four digit hex within that sector, held as typed. Spec 6.14. */
  hex: string;
  uwp: string;
  narrative: string;
  /**
   * The world settings of 6.15, where the user has overruled what was rolled.
   * Null means the rolled value stands, so a save carries only what was changed
   * and a planet left alone re-derives the lot from its seed and its UWP.
   */
  tiltDeg: number | null;
  orbitAu: number | null;
  /**
   * The output of the star this world orbits, relative to the Sun, or null for a
   * world whose star nobody has named. PlanetSpec 6.15.13.
   *
   * Here rather than in the system it came from, because a save has to hold
   * everything its surface is built from: a world lifted out of a system and
   * opened on its own has to come up the same world, and its climate cannot be
   * worked out without knowing what is shining on it. Null means the Sun, which
   * is what every world generated before systems existed was assumed to have.
   */
  luminosity: number | null;
  /**
   * The star, as a label: "G2 V", or null for a world whose star nobody has
   * named. PlanetSpec 6.15.13.1.
   *
   * Beside the luminosity rather than instead of it, because they answer
   * different questions. The luminosity is what the climate is worked out from
   * and is the only figure generation reads; the label is what a referee wrote
   * down, what a sector line carries, and what the field on screen shows. A
   * world handed down from a system gets both from that system's primary.
   */
  star: string | null;
  rotationHours: number | null;
  /** How many impacts the surface carries, or null for what the seed rolled. Spec 6.15.12. */
  craters: number | null;
  seed: string;
  /** The detail level of 2.2.1, one of DETAIL_LEVELS. */
  size: number;
  /** The points of interest of 6.5, keyed by the hex name of 2.4. */
  pois: Poi[];
}

export const DEFAULT_SIZE = DEFAULT_DETAIL;

/**
 * A planet record with nothing rolled into it, for a window that has not opened
 * a planet yet. AppSpec 2.5: the landing page is a chooser, and choosing nothing
 * must cost nothing.
 *
 * Every field is the empty form of itself rather than a default worth looking
 * at, because nothing reads this record: New replaces it under AppSpec 3.1 and
 * Load overwrites it. A blank seed is the tell. No seed means no world, where a
 * seed that happened to be lying about would mean a world nobody asked for.
 */
export function blankPlanet(): Planet {
  return {
    version: 1,
    name: "",
    sector: "",
    subsector: "",
    hex: "",
    uwp: "",
    narrative: "",
    tiltDeg: null,
    orbitAu: null,
    luminosity: null,
    star: null,
    designation: null,
    rotationHours: null,
    craters: null,
    seed: "",
    size: DEFAULT_DETAIL,
    pois: [],
  };
}

export function newPlanet(seed = randomSeed()): Planet {
  return {
    version: 1,
    name: "Unnamed",
    sector: "",
    subsector: "",
    hex: "",
    uwp: rollUwp(seed),
    narrative: "",
    tiltDeg: null,
    orbitAu: null,
    luminosity: null,
    star: null,
    designation: null,
    rotationHours: null,
    craters: null,
    seed,
    size: DEFAULT_DETAIL,
    pois: [],
  };
}

/**
 * The alphabet a seed is written in. No letters that can be read as digits, since
 * a seed is meant to be copied off a screen and typed back in.
 */
const SEED_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SEED_LENGTH = 8;

/** A short readable seed. Uses Math.random because this is a choice, not generation. */
export function randomSeed(): string {
  let out = "";
  for (let i = 0; i < SEED_LENGTH; i++) {
    out += SEED_ALPHABET[Math.floor(Math.random() * SEED_ALPHABET.length)];
  }
  return out;
}

/**
 * A seed derived from other seeds, in the same form and alphabet as one drawn at
 * random. SubSectorSpec 3.1.3 and SystemSpec 5.1.
 *
 * This is what makes a chain of levels a chain: a subsector names its hexes'
 * system seeds, a system names its worlds' seeds, and every one of them is an
 * ordinary seed that can be copied off the screen and opened on its own. Under
 * AppSpec 1.3 the world that comes back has to be the same world, which needs
 * only that the derivation is a function of its parts and nothing else.
 *
 * The parts are joined with a separator that cannot appear in them, so no two
 * different chains can collide by running together into the same string.
 */
export function seedFrom(...parts: readonly string[]): string {
  const key = parts.join("\u0000");
  let out = "";
  for (let i = 0; i < SEED_LENGTH; i++) {
    const value = valueFor(key, i);
    out += SEED_ALPHABET[Math.min(SEED_ALPHABET.length - 1, Math.floor(value * SEED_ALPHABET.length))];
  }
  return out;
}

/**
 * Starport class by 2D roll, index 2 to 12. Traveller SRD, world creation.
 */
const STARPORT_BY_ROLL = ["", "", "X", "E", "E", "D", "D", "C", "C", "B", "B", "A", "A"];

/** Highest value each position can take, in UWP order. Spec 6.7.1. */
const SIZE_LIMIT = 10;
const ATMOSPHERE_LIMIT = 15;
const HYDROGRAPHICS_LIMIT = 10;
const POPULATION_LIMIT = 12;
const GOVERNMENT_LIMIT = 13;
const LAW_LIMIT = 9;
const TECH_LIMIT = 15;

/** Atmospheres that will not hold surface water: none, trace, exotic, corrosive, insidious. */
const WATERLESS_ATMOSPHERES = new Set([0, 1, 10, 11, 12]);

/**
 * Rolls a world to the Traveller world creation rules. Spec 6.7.2.
 *
 * Every position is 2D, chained off the ones before it, so the digits describe one
 * world rather than eight unrelated numbers: a small world holds little air, a
 * thin or corrosive atmosphere keeps little water, and nothing is governed or
 * built where nobody lives. Tech level is 1D plus modifiers from all of it.
 *
 * The dice come from the seed rather than Math.random, so the profile is part of
 * what the seed names and a shared seed brings the same world with it.
 */
/**
 * What a region does to the worlds in it. SubSectorSpec 3.11.
 *
 * A modifier on the dice rather than a number written over the answer, so a
 * settled region rolls settled worlds: a population modifier carries into the
 * government and the law that follow from it, which is how the rules work and
 * what a figure written over the top afterwards would miss.
 */
export interface UwpShifts {
  readonly population?: number;
  readonly tech?: number;
}

export function rollUwp(seed: string, shifts: UwpShifts = {}): string {
  let die = 0;
  const d6 = () => Math.floor(valueFor(seed + ":uwp", die++) * 6) + 1;
  const roll2 = () => d6() + d6();
  // Every roll is taken whether or not it is used, so a digit forced to 0 by the
  // rules below cannot shift the dice the later digits read.
  const rolls = { size: roll2(), atmosphere: roll2(), hydrographics: roll2() };

  const starport = STARPORT_BY_ROLL[roll2()]!;
  const size = clamp(rolls.size - 2, SIZE_LIMIT);
  // A world with no size has no gravity well, so nothing to hold air or water.
  const atmosphere = size === 0 ? 0 : clamp(rolls.atmosphere - 7 + size, ATMOSPHERE_LIMIT);
  const waterDm = WATERLESS_ATMOSPHERES.has(atmosphere) ? -4 : 0;
  const hydrographics =
    size <= 1 ? 0 : clamp(rolls.hydrographics - 7 + size + waterDm, HYDROGRAPHICS_LIMIT);

  const population = clamp(roll2() - 2 + (shifts.population ?? 0), POPULATION_LIMIT);
  const governmentRoll = roll2();
  const lawRoll = roll2();
  const techRoll = d6();
  // An empty world has no government, no laws and no industry. SRD: population 0
  // sets the remaining three to 0.
  const government = population === 0 ? 0 : clamp(governmentRoll - 7 + population, GOVERNMENT_LIMIT);
  const law = population === 0 ? 0 : clamp(lawRoll - 7 + government, LAW_LIMIT);
  const profile = { starport, size, atmosphere, hydrographics, population, government, law };
  const tech =
    population === 0 ? 0 : clamp(techRoll + techLevelDm(profile) + (shifts.tech ?? 0), TECH_LIMIT);

  const digits = [size, atmosphere, hydrographics, population, government, law];
  return `${starport}${digits.map(hexDigit).join("")}-${hexDigit(tech)}`;
}

/** Clamps a rolled value to 0 and the position's ceiling. */
function clamp(value: number, limit: number): number {
  return Math.min(limit, Math.max(0, value));
}

/**
 * The digits a UWP position can take, in order. Traveller's pseudo-hex: the
 * ordinary sixteen and then on up the alphabet, with I and O left out because
 * they cannot be told from 1 and 0 on a printed map.
 *
 * Generation never goes past F — every limit at 6.7.1 stops at 15 — so for
 * everything this application rolls, this is plain hexadecimal and nothing
 * moves. It matters for profiles that arrive from outside: a tech level of G
 * or H is ordinary in published data, and `toString(16)` would write 16 as
 * "10" and make a nine-character UWP that nothing can read back.
 */
const UWP_DIGITS = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function hexDigit(value: number): string {
  const at = Math.max(0, Math.min(UWP_DIGITS.length - 1, Math.round(value)));
  return UWP_DIGITS[at]!;
}

/** What one UWP digit is worth, or -1 where the character is not a digit. */
function digitValue(character: string): number {
  return UWP_DIGITS.indexOf(character);
}

/**
 * The tech level modifiers, summed. A good starport, a hostile world that has to
 * be engineered around, and a large population all push it up; isolation pushes
 * it down. The atmosphere row covers the digits that need sealed habitats:
 * 0 to 3 for too little air, A to F for air that cannot be breathed as it is.
 */
const STARPORT_TECH_DM: Record<string, number> = { A: 6, B: 4, C: 2, D: 0, E: 0, X: -4 };

function techLevelDm(w: Omit<Uwp, "tech">): number {
  let dm = 0;
  dm += STARPORT_TECH_DM[w.starport] ?? 0;
  if (w.size <= 1) dm += 2;
  else if (w.size <= 4) dm += 1;
  if (w.atmosphere <= 3 || w.atmosphere >= 10) dm += 1;
  if (w.hydrographics === 0 || w.hydrographics === 9) dm += 1;
  else if (w.hydrographics === 10) dm += 2;
  if (w.population >= 1 && w.population <= 5) dm += 1;
  else if (w.population === 9) dm += 1;
  else if (w.population === 10) dm += 2;
  else if (w.population === 11) dm += 3;
  else if (w.population >= 12) dm += 4;
  if (w.government === 0 || w.government === 5) dm += 1;
  else if (w.government === 7) dm += 2;
  else if (w.government === 13 || w.government === 14) dm -= 2;
  return dm;
}

/** Validates a loaded save. Spec 6.4.3: fail loudly rather than open a different world. */
export function parsePlanet(text: string): Planet {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  if (typeof raw !== "object" || raw === null) throw new Error("That file is not a planet.");
  const r = raw as Record<string, unknown>;
  if (r["version"] !== 1) {
    throw new Error(`Save version ${String(r["version"])} is not one this build understands.`);
  }
  if (typeof r["seed"] !== "string" || r["seed"] === "") {
    throw new Error("The save has no seed, so its surface cannot be rebuilt.");
  }
  if (typeof r["size"] !== "number" || !Number.isInteger(r["size"]) || r["size"] < 1) {
    throw new Error("The save has no usable detail level, so its surface cannot be rebuilt.");
  }
  // A level off the ladder is snapped rather than refused. Under 3.2.4 the field
  // is the same at every level, so this changes how much of the world is drawn
  // and not which world it is, which is not the kind of mismatch 6.4.3 is about.
  const size = DETAIL_LEVELS.includes(r["size"] as never)
    ? r["size"]
    : nearestDetail(r["size"]);
  return {
    version: 1,
    name: typeof r["name"] === "string" ? r["name"] : "Unnamed",
    // A save written before systems existed has no designation, which is the
    // same planet as one rolled on its own: named for itself, and saved under
    // its own name. AppSpec 4.2.4.
    designation:
      typeof r["designation"] === "string" && r["designation"].trim() !== ""
        ? r["designation"]
        : null,
    star: typeof r["star"] === "string" && r["star"].trim() !== "" ? r["star"] : null,
    ...readLocation(r),
    // "upp" is the field name this build used before the rename to UWP.
    uwp: typeof r["uwp"] === "string" ? r["uwp"] : typeof r["upp"] === "string" ? r["upp"] : "",
    narrative: typeof r["narrative"] === "string" ? r["narrative"] : "",
    ...readSettings(r),
    seed: r["seed"],
    size,
    // A save written before POIs existed has none, which is the same planet as
    // one nobody has annotated. Spec 6.5.5.
    pois: parsePois(r["pois"]),
  };
}

/**
 * The world settings of 6.15. A save written before they existed has none, and a
 * planet with none is one nobody has overruled, so the absent case and the
 * unchanged case are the same case and neither needs a version of its own.
 */
function readSettings(r: Record<string, unknown>): {
  tiltDeg: number | null;
  orbitAu: number | null;
  luminosity: number | null;
  rotationHours: number | null;
  craters: number | null;
} {
  const setting = (key: string) => {
    const value = r[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };
  return {
    tiltDeg: setting("tiltDeg"),
    orbitAu: setting("orbitAu"),
    // A save written before stars existed says nothing about one, and a world
    // around no star is a world around the Sun. PlanetSpec 6.15.13.1.
    luminosity: setting("luminosity"),
    rotationHours: setting("rotationHours"),
    craters: setting("craters"),
  };
}

/**
 * The location fields. Saves written before the format was settled carried a
 * single free text "location", which is split rather than dropped, so an old file
 * keeps whatever the user had written in it. Spec 6.14.6.
 *
 * A save written before the subsector was a field of its own has none, and a
 * world with none is a world nobody said one about: the letter still follows
 * from the hex, so nothing has been lost that was ever stored.
 */
function readLocation(r: Record<string, unknown>): {
  sector: string;
  subsector: string;
  hex: string;
} {
  const subsector = typeof r["subsector"] === "string" ? r["subsector"] : "";
  if (typeof r["sector"] === "string" || typeof r["hex"] === "string") {
    return {
      sector: typeof r["sector"] === "string" ? r["sector"] : "",
      subsector,
      hex: typeof r["hex"] === "string" ? r["hex"] : "",
    };
  }
  if (typeof r["location"] === "string") {
    return { ...splitLegacyLocation(r["location"]), subsector };
  }
  return { sector: "", subsector, hex: "" };
}

/** The eight positions of a UWP, as numbers. Spec 6.7.1. */
export interface Uwp {
  starport: string;
  size: number;
  atmosphere: number;
  hydrographics: number;
  population: number;
  government: number;
  law: number;
  tech: number;
}

/**
 * A readable UWP: a starport, six pseudo-hex digits, a dash and a tech level.
 *
 * The digit positions are the UWP_DIGITS alphabet rather than every letter,
 * because I and O are not digits - they are left out of pseudo-hex precisely so
 * they cannot be read as 1 and 0 - and a position holding one is a typo rather
 * than a value. Rejecting it here is what keeps parseUwp's promise that what it
 * returns is numbers.
 */
const UWP_PATTERN =
  /^([A-EX])([0-9A-HJ-NP-Z])([0-9A-HJ-NP-Z])([0-9A-HJ-NP-Z])([0-9A-HJ-NP-Z])([0-9A-HJ-NP-Z])([0-9A-HJ-NP-Z])-([0-9A-HJ-NP-Z])$/;

/**
 * Reads the digits back off a UWP string, or null if it is not one. The field is
 * free text the user can type into, so anything downstream of it has to cope with
 * half-finished input rather than assume eight good positions.
 */
/**
 * The digits written back as a profile string. The inverse of parseUwp, for
 * anything that works out a profile rather than rolling one: a world in a system
 * under [SystemSpec.md](SystemSpec.md) 6.3 and 6.4 takes its physical digits from
 * its own seed and its social ones from the world it was settled from, and has to
 * put the two halves back together.
 */
export function formatUwp(profile: Uwp): string {
  const digits = [
    profile.size,
    profile.atmosphere,
    profile.hydrographics,
    profile.population,
    profile.government,
    profile.law,
  ];
  return `${profile.starport}${digits.map(hexDigit).join("")}-${hexDigit(profile.tech)}`;
}

export function parseUwp(uwp: string): Uwp | null {
  const match = UWP_PATTERN.exec(uwp.trim().toUpperCase());
  if (!match) return null;
  const digit = (i: number) => digitValue(match[i]!);
  return {
    starport: match[1]!,
    size: digit(2),
    atmosphere: digit(3),
    hydrographics: digit(4),
    population: digit(5),
    government: digit(6),
    law: digit(7),
    tech: digit(8),
  };
}
