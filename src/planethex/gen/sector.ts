/**
 * A sector: sixteen subsectors, and the worlds in all of them. SectorSpec
 * sections 2 and 3.
 *
 * The same arithmetic one level up, and deliberately no new arithmetic at all.
 * A sector's seed fixes its sixteen subsector seeds, each of those fixes eighty
 * hex seeds, and the chain from there down is the one the subsector spec already
 * describes. So a subsector opened out of a sector is the same subsector opened
 * on its own from that seed, which is AppSpec 1.3 at the top of the chain.
 *
 * What the level adds is the things that only exist across a whole sector: a
 * Main that runs past a subsector's edge, a route between two worlds in
 * different subsectors, and a sector file that a map can read whole.
 */

import {
  hexDistance,
  parseSectorHex,
  subsectorHexes,
  subsectorLetter,
  SECTOR_COLS,
  SECTOR_ROWS,
  SUBSECTOR_LETTERS,
} from "../location";
import { seedFrom, type UwpShifts } from "../planet";
import {
  generateSubsector,
  mainsIn,
  routesBetween,
  DEFAULT_DENSITY,
  type SubsectorWorld,
  type Density,
  type Main,
  type Route,
  type Subsector,
} from "./subsector";

/** The sixteen letters, A to P, in the order the subsector lays them out. */
export const SECTOR_SUBSECTORS = SUBSECTOR_LETTERS.split("");

/**
 * The seed of one subsector of a sector. SectorSpec 3.1.
 *
 * Derived from the sector's seed and the letter, so a sector is a seed and
 * nothing else: sixteen subsectors, each of eighty hexes, all of it reachable from
 * one word. The letter rather than the position, because the letter is what a
 * referee says and what the document stores.
 */
export function subsectorSeedFor(sectorSeed: string, letter: string): string {
  return seedFrom(sectorSeed, letter.toUpperCase());
}

export interface Sector {
  readonly seed: string;
  readonly density: Density;
  readonly shifts: UwpShifts;
  /** The sixteen subsectors, in letter order. */
  readonly subsectors: readonly Subsector[];
  /** Every world in the sector, in hex order. */
  readonly worlds: readonly SubsectorWorld[];
  /**
   * The routes across the whole sector. SectorSpec 3.3: a route between two
   * worlds either side of a subsector's edge is a route, and only this level can
   * see it.
   */
  readonly routes: readonly Route[];
  /** The Mains across the whole sector, longest first. SectorSpec 3.4. */
  readonly mains: readonly Main[];
}

/** How many hexes a sector holds, which is what the drawing has to fit. */
export const SECTOR_HEXES = SECTOR_COLS * SECTOR_ROWS;

/**
 * A whole sector. SectorSpec section 3.
 *
 * Sixteen subsectors generated the way one subsector is generated - bar any the referee
 * has worked on, which are handed in and used as they stand - and then the two
 * things that are only true across all of them worked out again over the lot.
 * The routes and Mains a subsector knows about are its own, and a subsector
 * cannot see past its edge; here there is no edge to see past.
 */
export function generateSector(
  seed: string,
  density: Density = DEFAULT_DENSITY,
  shifts: UwpShifts = {},
  worked: ReadonlyMap<string, Subsector> = new Map(),
): Sector {
  const subsectors = SECTOR_SUBSECTORS.map(
    (letter) =>
      // A subsector the referee has worked on is that subsector, not the one the sector
      // would roll for the letter. A density they changed, a hex they turned on
      // and a world they renamed are all facts about the sector, and the routes
      // and Mains below are worked out over what is actually there rather than
      // over what was first rolled.
      worked.get(letter) ??
      generateSubsector(subsectorSeedFor(seed, letter), letter, density, shifts),
  );
  const worlds = subsectors
    .flatMap((held) => held.worlds)
    .sort((a, b) => a.at.localeCompare(b.at));
  return {
    seed,
    density,
    shifts,
    subsectors,
    worlds,
    // Worked out over every world at once. A route that crossed a subsector's
    // edge was invisible to both of the subsectors it joined.
    routes: routesBetween(worlds),
    mains: mainsIn(worlds),
  };
}

/**
 * How far past its own edge a subsector looks. SectorSpec 4.5.
 *
 * Two hexes, which is exactly as far as a route reaches: every route that
 * crosses the edge has its far end inside the border, so a subsector never draws a
 * line running off to somewhere it is not showing.
 */
export const BORDER_REACH = 2;

/**
 * What lies just outside one subsector of a sector. SectorSpec 4.5.
 *
 * The worlds within two hexes of its edge, and the routes with one end inside
 * it and one end out. A subsector drawn without them says a subsector's edge is the
 * edge of the universe, which is the one thing about a subsector that is never
 * true - it is a square drawn on a sector, and its neighbours are right there.
 */
export function aroundSubsector(
  sector: Sector,
  letter: string,
  reach = BORDER_REACH,
): { worlds: SubsectorWorld[]; routes: Route[] } {
  const want = letter.toUpperCase();
  const inside = new Set(
    sector.worlds.filter((world) => subsectorLetter(world.hex) === want).map((world) => world.at),
  );
  const hexes = subsectorHexes(want);
  const near = (world: SubsectorWorld) =>
    hexes.some((hex) => hexDistance(hex, world.hex) <= reach);

  const worlds = sector.worlds.filter((world) => !inside.has(world.at) && near(world));
  const shown = new Set(worlds.map((world) => world.at));
  // A route counts as crossing when one end is in the subsector and the other is in
  // the border being drawn. One that leaves the border as well is a route to
  // somewhere off the page, and drawing half of it would say less than nothing.
  const routes = sector.routes.filter((route) => {
    const from = inside.has(route.from);
    const to = inside.has(route.to);
    if (from === to) return false;
    return shown.has(from ? route.to : route.from);
  });
  return { worlds, routes };
}

/** Which subsector a sector-absolute hex falls in, by its four digits. */
export function letterAt(at: string): string {
  const hex = parseSectorHex(at);
  return hex === null ? "" : subsectorLetter(hex);
}
