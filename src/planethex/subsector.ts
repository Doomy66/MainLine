/**
 * The subsector record, and the thing a subsector save file holds.
 * SubSectorSpec section 5.
 *
 * A subsector is a seed, a letter, a density, a name, and whatever the referee
 * has written over what was rolled. No world is stored: load rebuilds all eighty
 * hexes from the seed and the density, exactly as the planet spec 6.3 rebuilds a
 * surface and the system spec 9.2 an orbit.
 */

import {
  DEFAULT_DENSITY,
  DENSITIES,
  generateSubsector,
  mainsIn,
  routesBetween,
  worldAt,
  type SubsectorWorld,
  type Density,
  type Subsector,
} from "./gen/subsector";
import { systemSeedFor } from "./gen/subsector";
import { parseSystemDoc, type SystemDoc } from "./system";
import { parseStars } from "./gen/star";
import { formatSectorHex, parseSectorHex, subsectorHexes } from "./location";
import { parseUwp } from "./planet";
import { parsePbg, tradeCodes } from "./gen/trade";
import { dateOrEpoch, EPOCH, formatImperialDate } from "./traveller";
import { parseSource, type ChartedSource } from "./source";
import { parseChartedMap, type ChartedMap } from "./charted-map";

/**
 * What the referee has written over one hex. Only what changed, under 5.3.1: a
 * subsector nobody has edited saves as its seed and nothing else, and a later change
 * to the generator improves the worlds nobody has touched while leaving the ones
 * they have alone.
 */
export interface HexOverride {
  /** The four digits of the hex this is about. */
  readonly at: string;
  readonly name?: string;
  readonly uwp?: string;
  /** The Bases column: "A", "N", "S" or "" for none. */
  readonly bases?: string;
  /** The Zone column: "A", "R" or "" for green. */
  readonly zone?: string;
  /** The Stars column, where the system below has been given other stars. */
  readonly stars?: string;
  /**
   * The Allegiance column: who holds the world. 5.3.7.
   *
   * Nothing generated has an allegiance worth storing - every rolled world is
   * non-aligned - so this is only ever written by a world that came from
   * somewhere with empires in it.
   */
  readonly allegiance?: string;
  /**
   * The PBG column, as its three digits. 5.3.8.
   *
   * Derived from the world's seed like everything else, and overridable for
   * the same reason the profile is: a world that arrives with its own figures
   * should keep them. Gas giants are not decoration - they are where a ship
   * refuels - so a wrong third digit is a wrong answer to a question players
   * actually ask.
   */
  readonly pbg?: string;
  /** Free prose about the system. 5.3.2. */
  readonly note?: string;
  /**
   * Whether the hex holds a system at all, where the referee has overruled the
   * density. 3.2.3 and 5.3.4.
   */
  readonly present?: boolean;
  /**
   * The seed of the system in this hex, where the referee has rolled a
   * different one. 5.3.5.
   *
   * The hex's own seed is derived from the subsector's under 3.1.3, and that is
   * what a hex holds until somebody deliberately replaces it. Storing the
   * replacement is what keeps the subsector and the system view agreeing about what
   * is in the hex: without it, a reroll would show one system and the subsector
   * would go on drawing another.
   */
  readonly systemSeed?: string;
}

/**
 * How far a region can be leaned, either way. SubSectorSpec 3.11.1.
 *
 * Three is already a lot: it moves the average world of a subsector by half the
 * scale, and past that the dice have stopped mattering and the referee is
 * writing the digits themselves, which is what an override is for.
 */
export const SHIFT_LIMIT = 3;

/** The fields of an override that are plain text. */
export type HexField = "name" | "uwp" | "bases" | "zone" | "note" | "stars";

export interface SubsectorDoc {
  /** Which level this document is, under the app spec 4.1. */
  readonly level: "subsector";
  readonly version: 1;
  name: string;
  /** The sector it belongs to, see 2.2.1. Free text. */
  sector: string;
  /** A to P, see 2.2.3. */
  letter: string;
  seed: string;
  /**
   * When this is, as an imperial date. SystemSpec 3.5, and the app spec 4.1.3.
   *
   * One date for the setting, and this level owns it while it is the top of
   * what is open: the systems carried under it hold a copy each, and it is this
   * one they are opened at.
   */
  date: string;
  density: Density;
  /**
   * Which way this region leans, as modifiers on the dice every world in it is
   * rolled with. SubSectorSpec 3.11.
   *
   * A settled region and a frontier are the same rules with a different thumb on
   * them, and that is a property of the region rather than of each world in it.
   */
  shifts: { population: number; tech: number };
  /**
   * Where this came from, where it was imported rather than rolled. AppSpec 8.4.
   *
   * Absent on everything this application makes for itself, which is why it is
   * optional and why the version does not move for it: a build that does not
   * know the field drops it and still reads every override under it.
   */
  source?: ChartedSource;
  /**
   * The borders, express routes and polity names that came with it. AppSpec 8.8.
   *
   * Carried rather than fetched again, so a saved sector draws its borders
   * with nothing but the file.
   */
  charted?: ChartedMap;
  overrides: HexOverride[];
  /**
   * The systems under this subsector that somebody has worked on, by hex, each
   * carrying its own worked up worlds. SubSectorSpec 5.7.
   *
   * One document for the level you opened. A referee working down from a subsector
   * should press Save once and have everything they touched kept, rather than
   * saving three times at three levels and keeping track of which folder each
   * of them went into.
   *
   * Only what was worked on. A hex nobody has opened is its seed, and eighty
   * systems describing what the seed already describes is eighty systems of
   * nothing.
   */
  systems: { at: string; doc: SystemDoc }[];
}

export function newSubsectorDoc(
  seed: string,
  letter: string,
  density: Density = DEFAULT_DENSITY,
  name = "",
): SubsectorDoc {
  return {
    level: "subsector",
    version: 1,
    name,
    sector: "",
    letter: letter.toUpperCase(),
    seed,
    date: formatImperialDate(EPOCH),
    density,
    shifts: { population: 0, tech: 0 },
    overrides: [],
    systems: [],
  };
}

/** The worked up system in a hex, or undefined where nobody has been in. */
export function savedSystem(doc: SubsectorDoc, at: string): SystemDoc | undefined {
  return doc.systems.find((held) => held.at === at)?.doc;
}

/** Put a system into a hex, replacing whatever was there. */
export function keepSystem(doc: SubsectorDoc, at: string, system: SystemDoc): void {
  const rest = doc.systems.filter((held) => held.at !== at);
  doc.systems = [...rest, { at, doc: system }].sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * Set the date on a subsector and on everything it carries. SystemSpec 3.5.4.
 *
 * Written through rather than left to the load, so a saved document does not
 * hold four dates that happen to agree. There is one date in the setting and a
 * file that said otherwise in three places would be a file to be suspicious of.
 */
export function setSubsectorDate(doc: SubsectorDoc, date: string): void {
  doc.date = date;
  for (const held of doc.systems) held.doc.date = date;
}

/** Forget a hex's system, when a different one has been rolled into it. */
export function dropSystem(doc: SubsectorDoc, at: string): void {
  doc.systems = doc.systems.filter((held) => held.at !== at);
}

/** What the referee wrote about one hex, or undefined where they wrote nothing. */
export function overrideFor(doc: SubsectorDoc, at: string): HexOverride | undefined {
  return doc.overrides.find((held) => held.at === at);
}

/** Whether an override says anything at all, or has been emptied back out. */
function saysNothing(held: HexOverride): boolean {
  return (
    held.name === undefined &&
    held.uwp === undefined &&
    held.bases === undefined &&
    held.zone === undefined &&
    held.stars === undefined &&
    held.allegiance === undefined &&
    held.pbg === undefined &&
    held.note === undefined &&
    held.present === undefined &&
    held.systemSeed === undefined
  );
}

function put(doc: SubsectorDoc, at: string, next: HexOverride): void {
  const rest = doc.overrides.filter((held) => held.at !== at);
  doc.overrides = saysNothing(next) ? rest : [...rest, next].sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * Write one field of one hex, or clear it where the value is empty.
 *
 * Clearing rather than storing a blank is what keeps 5.3.1's promise: a field
 * the referee has emptied is a field they have taken back, and a document full
 * of empty strings has stopped saying only what changed.
 */
export function setOverride(doc: SubsectorDoc, at: string, field: HexField, value: string): void {
  const held = overrideFor(doc, at);
  const next: HexOverride & Record<string, unknown> = { ...held, at, [field]: value.trim() };
  if (value.trim() === "") delete next[field];
  put(doc, at, next);
}

/**
 * Say whether a hex holds a system, against what the density decided. 5.3.4.
 *
 * Passing the generated answer back in clears the override rather than storing
 * agreement: a referee who turns a hex on and then off again has said nothing.
 */
export function setPresence(doc: SubsectorDoc, at: string, present: boolean, rolled: boolean): void {
  const held = overrideFor(doc, at);
  const next: HexOverride & Record<string, unknown> = { ...held, at, present };
  // Agreement is not an override: a referee who turns a hex on and then off
  // again has said nothing, and the field goes rather than storing the say-so.
  if (present === rolled) delete (next as Record<string, unknown>)["present"];
  put(doc, at, next);
}

/**
 * Put a different system into a hex. 5.3.5.
 *
 * Passing the hex's own seed back in clears the override, since a referee who
 * has rolled their way back to what was there has said nothing.
 */
export function setSystemSeed(doc: SubsectorDoc, at: string, seed: string, rolled: string): void {
  const held = overrideFor(doc, at);
  const next: HexOverride & Record<string, unknown> = { ...held, at, systemSeed: seed };
  if (seed === rolled) delete (next as Record<string, unknown>)["systemSeed"];
  put(doc, at, next);
}

/** The seed of the system in a hex, the referee's if they have put one there. */
export function systemSeedIn(doc: SubsectorDoc, at: string): string {
  return overrideFor(doc, at)?.systemSeed ?? systemSeedFor(doc.seed, at);
}

/**
 * The subsector a document describes: generated from its seed and density, with what
 * the referee wrote laid over the top. SubSectorSpec 5.2.
 *
 * An override never changes a world's seed, under 5.3.3. The seed is the world;
 * the override is what the referee says about it, so a hand-typed profile lands
 * on the world that was always in that hex.
 */
export function subsectorOf(doc: SubsectorDoc): Subsector {
  const rolled = generateSubsector(doc.seed, doc.letter, doc.density, doc.shifts);
  if (doc.overrides.length === 0) return rolled;

  const held = new Map(rolled.worlds.map((world) => [world.at, world]));

  for (const override of doc.overrides) {
    const hex = parseSectorHex(override.at);
    if (hex === null) continue;
    // A hex the referee turned on that the density left empty, 5.3.4 - dropping
    // it would lose written work to a slider - and a hex whose system they have
    // rolled again, 5.3.5.
    const wanted = override.present === true && !held.has(override.at);
    const replaced = override.systemSeed !== undefined && held.has(override.at);
    if (!wanted && !replaced) continue;
    const world = worldAt(
      doc.seed,
      override.at,
      hex,
      undefined,
      override.systemSeed,
      doc.shifts,
    );
    if (world !== null) held.set(override.at, world);
  }

  // By hex rather than by walking the list for each of the eighty. A subsector
  // read in from outside carries an override on every world it has, and this
  // loop runs again for all sixteen of them every time a sector is redrawn.
  const written = new Map(doc.overrides.map((one) => [one.at, one]));

  const worlds: SubsectorWorld[] = [];
  for (const hex of subsectorHexes(doc.letter)) {
    const at = formatSectorHex(hex);
    const world = held.get(at);
    if (world === undefined) continue;
    const override = written.get(at);
    if (override?.present === false) continue;
    worlds.push(override === undefined ? world : wearing(world, override));
  }

  return publishedRoutes(
    { ...rolled, worlds, routes: routesBetween(worlds), mains: mainsIn(worlds) },
    doc.charted,
  );
}

/**
 * The express legs a published sector came with, in place of the ones worked
 * out from the ports. AppSpec 8.8.2, and the same rule the sector follows.
 *
 * The whole sector's legs are passed through, not this subsector's share: the
 * map draws the ones whose hexes it has and ignores the rest, which is what
 * makes a route that runs off the edge stop at the edge rather than vanish.
 */
function publishedRoutes(subsector: Subsector, charted?: ChartedMap): Subsector {
  if (charted === undefined || charted.routes.length === 0) return subsector;
  const trade = subsector.routes.filter((route) => route.kind === "trade");
  const xboat = charted.routes.map((leg) => ({
    from: leg.from,
    to: leg.to,
    kind: "xboat" as const,
  }));
  return { ...subsector, routes: [...xboat, ...trade] };
}

/** One world, wearing what the referee wrote on it. */
function wearing(world: SubsectorWorld, override: HexOverride): SubsectorWorld {
  const uwp = override.uwp?.trim().toUpperCase();
  const profile = uwp === undefined ? null : parseUwp(uwp);
  // A profile that is not a profile is not applied. The referee is mid-typing,
  // and half a UWP should not blank the world they are typing it over.
  const changed = profile === null ? world.uwp : uwp!;
  return {
    ...world,
    name: override.name ?? world.name,
    uwp: changed,
    profile: profile ?? world.profile,
    trade: profile === null ? world.trade : tradeCodes(changed),
    bases: override.bases ?? world.bases,
    zone: override.zone ?? world.zone,
    stars: override.stars === undefined ? world.stars : parseStars(override.stars, world.stars),
    allegiance: override.allegiance ?? world.allegiance,
    pbg: parsePbg(override.pbg) ?? world.pbg,
  };
}


/**
 * Reads a subsector document back, or throws saying why not. The same contract
 * the planet spec 6.4.3 sets: a document that cannot produce the subsector it claims
 * to be fails loudly rather than opening a different one under the right name.
 */
export function parseSubsectorDoc(text: string): SubsectorDoc {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  if (typeof raw !== "object" || raw === null) throw new Error("That file is not a subsector.");
  const r = raw as Record<string, unknown>;
  if (r["level"] !== "subsector") {
    throw new Error(`That file is a ${describeLevel(r["level"])}, not a subsector.`);
  }
  if (r["version"] !== 1) {
    throw new Error(`Save version ${String(r["version"])} is not one this build understands.`);
  }
  if (typeof r["seed"] !== "string" || r["seed"] === "") {
    throw new Error("The save has no seed, so its subsector cannot be rebuilt.");
  }
  const letter = typeof r["letter"] === "string" ? r["letter"].toUpperCase() : "";
  if (!"ABCDEFGHIJKLMNOP".includes(letter) || letter === "") {
    throw new Error(`"${String(r["letter"])}" is not a subsector letter.`);
  }
  const density = r["density"];
  return {
    level: "subsector",
    version: 1,
    name: typeof r["name"] === "string" ? r["name"] : "Unnamed",
    sector: typeof r["sector"] === "string" ? r["sector"] : "",
    letter,
    seed: r["seed"],
    date: formatImperialDate(dateOrEpoch(r["date"])),
    density:
      typeof density === "string" && density in DENSITIES ? (density as Density) : DEFAULT_DENSITY,
    shifts: parseShifts(r["shifts"]),
    ...(parseSource(r["source"]) === undefined ? {} : { source: parseSource(r["source"])! }),
    ...(parseChartedMap(r["charted"]) === undefined
      ? {}
      : { charted: parseChartedMap(r["charted"])! }),
    overrides: parseOverrides(r["overrides"]),
    systems: parseSystems(r["systems"]),
  };
}

/**
 * The systems carried in a subsector document. One that cannot be read is left
 * out rather than taking the subsector down with it: the hex still has a seed, and
 * the seed still makes a system.
 */
function parseSystems(raw: unknown): { at: string; doc: SystemDoc }[] {
  if (!Array.isArray(raw)) return [];
  const out: { at: string; doc: SystemDoc }[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const r = entry as Record<string, unknown>;
    const at = r["at"];
    if (typeof at !== "string" || parseSectorHex(at) === null) continue;
    try {
      out.push({ at, doc: parseSystemDoc(JSON.stringify(r["doc"])) });
    } catch {
      // Left out.
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/** What a file says it is, for the complaint in parseSubsectorDoc. */
function describeLevel(level: unknown): string {
  return typeof level === "string" && level !== "" ? level : "planet or something else";
}

/** How far a region leans, held to what a modifier on 2D can sensibly be. */
function parseShifts(raw: unknown): { population: number; tech: number } {
  const held = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const one = (key: string) => {
    const value = held[key];
    if (typeof value !== "number" || !Number.isFinite(value)) return 0;
    return Math.max(-SHIFT_LIMIT, Math.min(SHIFT_LIMIT, Math.round(value)));
  };
  return { population: one("population"), tech: one("tech") };
}

function parseOverrides(raw: unknown): HexOverride[] {
  if (!Array.isArray(raw)) return [];
  const out: HexOverride[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const r = entry as Record<string, unknown>;
    const at = r["at"];
    if (typeof at !== "string" || parseSectorHex(at) === null) continue;
    const text = (key: string) => (typeof r[key] === "string" && r[key] !== "" ? r[key] : undefined);
    /**
     * A field whose empty string is a value rather than an absence.
     *
     * Bases and Zone are closed vocabularies, and in both of them "" says
     * something: no bases, and a green zone. Reading them the way free text is
     * read would drop the override and let the generated answer back in - a
     * world written down as having no naval base would come back from a save
     * with one, because basesFor gives one to better than a third of the good
     * ports. 5.3.6: the empty string is a value here, not an absence.
     */
    const code = (key: string) => (typeof r[key] === "string" ? (r[key] as string) : undefined);
    const present = typeof r["present"] === "boolean" ? r["present"] : undefined;
    const held: HexOverride = {
      at,
      ...(text("name") === undefined ? {} : { name: text("name")! }),
      ...(text("uwp") === undefined ? {} : { uwp: text("uwp")! }),
      ...(code("bases") === undefined ? {} : { bases: code("bases")! }),
      ...(code("zone") === undefined ? {} : { zone: code("zone")! }),
      ...(text("stars") === undefined ? {} : { stars: text("stars")! }),
      ...(text("allegiance") === undefined ? {} : { allegiance: text("allegiance")! }),
      ...(text("pbg") === undefined ? {} : { pbg: text("pbg")! }),
      ...(text("note") === undefined ? {} : { note: text("note")! }),
      ...(present === undefined ? {} : { present }),
      ...(text("systemSeed") === undefined ? {} : { systemSeed: text("systemSeed")! }),
    };
    if (saysNothing(held)) continue;
    out.push(held);
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}
