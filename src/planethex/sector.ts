/**
 * The sector record, and the thing a sector save file holds. SectorSpec
 * section 5.
 *
 * A sector is a seed, a name, a density, a lean, and whatever the referee has
 * worked up under it. No world is stored: load rebuilds all sixteen subsectors from
 * the seed, exactly as a subsector rebuilds its eighty hexes and a planet its
 * surface.
 *
 * It carries the subsectors somebody has worked on, each of those carrying its
 * own worked up systems and their worlds, under the app spec 4.1.2 — one
 * document for the level you opened, all the way down.
 */

import {
  DEFAULT_DENSITY,
  DENSITIES,
  type Density,
} from "./gen/subsector";
import { generateSector, subsectorSeedFor, type Sector } from "./gen/sector";
import type { Subsector, Route } from "./gen/subsector";
import {
  newSubsectorDoc,
  parseSubsectorDoc,
  setSubsectorDate,
  subsectorOf,
  type SubsectorDoc,
} from "./subsector";
import { SUBSECTOR_LETTERS } from "./location";
import { dateOrEpoch, EPOCH, formatImperialDate } from "./traveller";
import { parseSource, type ChartedSource } from "./source";
import { parseChartedMap, type ChartedMap } from "./charted-map";

export interface SectorDoc {
  /** Which level this document is, under the app spec 4.1. */
  readonly level: "sector";
  readonly version: 1;
  name: string;
  seed: string;
  /**
   * When this is, as an imperial date. SystemSpec 3.5, and the app spec 4.1.3.
   *
   * The top of the deepest chain there is, so where a sector is open its date is
   * the setting's and every subsector and system under it is opened at it.
   */
  date: string;
  density: Density;
  /** Which way the whole sector leans. The subsector spec 3.11. */
  shifts: { population: number; tech: number };
  /**
   * Where this came from, where it was imported rather than rolled. AppSpec 8.4.
   *
   * Optional, and the version does not move for it: a build that does not know
   * the field drops it and still reads every subsector under it.
   */
  source?: ChartedSource;
  /**
   * The borders, express routes and polity names that came with it. AppSpec 8.8.
   *
   * Carried rather than fetched again, so a saved sector draws its borders
   * with nothing but the file.
   */
  charted?: ChartedMap;
  /** The subsectors somebody has worked on, by letter. SectorSpec 5.3. */
  subsectors: { letter: string; doc: SubsectorDoc }[];
}

export function newSectorDoc(
  seed: string,
  name = "",
  density: Density = DEFAULT_DENSITY,
): SectorDoc {
  return {
    level: "sector",
    version: 1,
    name,
    seed,
    date: formatImperialDate(EPOCH),
    density,
    shifts: { population: 0, tech: 0 },
    subsectors: [],
  };
}

/** The date on a sector and on every subsector and system under it. 3.5.4. */
export function setSectorDate(doc: SectorDoc, date: string): void {
  doc.date = date;
  for (const held of doc.subsectors) setSubsectorDate(held.doc, date);
}

/** The worked up subsector under a letter, or undefined where nobody has been. */
export function savedSubsector(doc: SectorDoc, letter: string): SubsectorDoc | undefined {
  return doc.subsectors.find((held) => held.letter === letter)?.doc;
}

/** Put a subsector under a letter, replacing whatever was there. */
export function keepSubsector(doc: SectorDoc, letter: string, held: SubsectorDoc): void {
  const rest = doc.subsectors.filter((one) => one.letter !== letter);
  doc.subsectors = [...rest, { letter, doc: held }].sort((a, b) =>
    a.letter.localeCompare(b.letter),
  );
}

/**
 * The document a subsector of this sector opens as. SectorSpec 7.1.
 *
 * The one the referee left if they have been in it, and a fresh one off the
 * letter's own seed if they have not — wearing the sector's density and lean,
 * because those are the sector's and a subsector pulled out of it should look like
 * the rest of the sector rather than like a subsector rolled from nowhere.
 */
export function subsectorIn(doc: SectorDoc, letter: string): SubsectorDoc {
  const held = savedSubsector(doc, letter);
  if (held !== undefined) return held;
  const fresh = newSubsectorDoc(
    subsectorSeedFor(doc.seed, letter),
    letter,
    doc.density,
    `Subsector ${letter}`,
  );
  fresh.sector = doc.name;
  fresh.shifts = { ...doc.shifts };
  return fresh;
}

/**
 * The sector a document describes: generated from its seed, with the subsectors the
 * referee has worked on laid over the top. SectorSpec 5.2.
 *
 * Laid over rather than merged: a worked subsector carries its own density, lean and
 * written hexes, and it is that subsector which goes into the sector. So a subsector
 * turned up to dense shows more systems on the sector map, and the routes and
 * Mains of 3.3 and 3.4 are worked out again over the worlds that are now there.
 *
 * `open` is the subsector being looked at this moment, which wins over the stored
 * one: an edit shows on the sector without having to be put away first.
 */
export function sectorOf(doc: SectorDoc, open?: SubsectorDoc): Sector {
  const worked = new Map<string, Subsector>();
  for (const held of doc.subsectors) worked.set(held.letter.toUpperCase(), subsectorOf(held.doc));
  if (open !== undefined) worked.set(open.letter.toUpperCase(), subsectorOf(open));
  const sector = generateSector(doc.seed, doc.density, doc.shifts, worked);
  return wearingRoutes(sector, doc.charted);
}

/**
 * The express network a published sector came with, in place of the one worked
 * out here. AppSpec 8.8.2.
 *
 * 3.3 wires every pair of good ports within two hexes, which is a fair guess
 * at where the mail would go and is not where it goes. The real network is a
 * chosen few legs, and on a map anybody recognises the difference between the
 * two is the most visible thing on it. So where the real one is known it
 * replaces the guess rather than being drawn beside it.
 *
 * Trade routes are left alone: nothing published says where a free trader
 * goes, and 3.3's answer to that is as good as any.
 */
function wearingRoutes(sector: Sector, charted?: ChartedMap): Sector {
  if (charted === undefined || charted.routes.length === 0) return sector;
  const trade = sector.routes.filter((route) => route.kind === "trade");
  const xboat: Route[] = charted.routes.map((leg) => ({
    from: leg.from,
    to: leg.to,
    kind: "xboat" as const,
  }));
  return { ...sector, routes: [...xboat, ...trade] };
}

/**
 * Reads a sector document back, or throws saying why not. The same contract the
 * planet spec 6.4.3 sets: a document that cannot produce the sector it claims to
 * be fails loudly rather than opening a different one under the right name.
 */
export function parseSectorDoc(text: string): SectorDoc {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  if (typeof raw !== "object" || raw === null) throw new Error("That file is not a sector.");
  const r = raw as Record<string, unknown>;
  if (r["level"] !== "sector") {
    throw new Error(`That file is a ${describeLevel(r["level"])}, not a sector.`);
  }
  if (r["version"] !== 1) {
    throw new Error(`Save version ${String(r["version"])} is not one this build understands.`);
  }
  if (typeof r["seed"] !== "string" || r["seed"] === "") {
    throw new Error("The save has no seed, so its sector cannot be rebuilt.");
  }
  const density = r["density"];
  return {
    level: "sector",
    version: 1,
    name: typeof r["name"] === "string" ? r["name"] : "Unnamed",
    seed: r["seed"],
    date: formatImperialDate(dateOrEpoch(r["date"])),
    density:
      typeof density === "string" && density in DENSITIES ? (density as Density) : DEFAULT_DENSITY,
    shifts: parseShifts(r["shifts"]),
    ...(parseSource(r["source"]) === undefined ? {} : { source: parseSource(r["source"])! }),
    ...(parseChartedMap(r["charted"]) === undefined
      ? {}
      : { charted: parseChartedMap(r["charted"])! }),
    subsectors: parseSubsectors(r["subsectors"]),
  };
}

function describeLevel(level: unknown): string {
  return typeof level === "string" && level !== "" ? level : "planet or something else";
}

/** How far a sector leans, held to what a modifier on 2D can sensibly be. */
function parseShifts(raw: unknown): { population: number; tech: number } {
  const held = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const one = (key: string) => {
    const value = held[key];
    if (typeof value !== "number" || !Number.isFinite(value)) return 0;
    return Math.max(-3, Math.min(3, Math.round(value)));
  };
  return { population: one("population"), tech: one("tech") };
}

/**
 * The subsectors carried in a sector document. One that cannot be read is left out
 * rather than taking the sector down with it: the letter still has a seed, and
 * the seed still makes a subsector.
 */
function parseSubsectors(raw: unknown): { letter: string; doc: SubsectorDoc }[] {
  if (!Array.isArray(raw)) return [];
  const out: { letter: string; doc: SubsectorDoc }[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const r = entry as Record<string, unknown>;
    const letter = typeof r["letter"] === "string" ? r["letter"].toUpperCase() : "";
    if (!SUBSECTOR_LETTERS.includes(letter) || letter === "") continue;
    try {
      out.push({ letter, doc: parseSubsectorDoc(JSON.stringify(r["doc"])) });
    } catch {
      // Left out.
    }
  }
  return out.sort((a, b) => a.letter.localeCompare(b.letter));
}
