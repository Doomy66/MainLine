/**
 * A subsector: eighty hexes, each of them empty space or a star system.
 * SubSectorSpec sections 2 and 3.
 *
 * What the subsector holds for a hex is what a subsector holds: the main world's
 * profile, its name, its trade classifications, its bases, its travel zone, its
 * PBG figures and its stars. Not a system - SystemSpec 11.4 has a hex generated
 * in full only when it is opened, and a subsector that laid out eighty systems of
 * orbits it will never draw would be doing seventy-nine of them for nothing.
 *
 * Everything here descends from the subsector's seed, and the chain runs
 * subsector to system to world: a hex names a system seed, the system names its
 * main world's, and that seed is an ordinary planet's. So a world found on this
 * subsector is the same world opened on its own, which is AppSpec 1.3.
 */

import { formatSectorHex, hexDistance, subsectorHexes, type SectorHex } from "../location";
import { parseUwp, rollUwp, seedFrom, type Uwp, type UwpShifts } from "../planet";
import { mainWorldSeed } from "./system";
import { starsFor, starsLabel, systemLuminosity, type Stars } from "./star";
import { formatPbg, pbgFor, tradeCodes, type Pbg, type TradeCode } from "./trade";
import { flavourFor, worldNameFor, type Flavour } from "./settle";
import { valueFor } from "./rng";
import { basesFor, zoneFor } from "./base";

/**
 * How thickly the stars lie. SubSectorSpec 3.2.2.
 *
 * Standard is the one in two that Traveller's own maps are built to; the
 * others are the rift and the cluster either side of it.
 */
export const DENSITIES = {
  /**
   * No systems at all, which is not a region of space but a blank sheet.
   *
   * Every other density is a threshold a fixed per-hex value is tested
   * against, and that value is in [0,1), so zero can never be under it and no
   * hex is ever occupied. What it is for is a subsector whose worlds all come
   * from somewhere else - a published sector read in, or eighty hexes a
   * referee means to place by hand - where a generated world appearing between
   * the real ones would be a world nobody put there.
   */
  none: 0,
  rift: 1 / 6,
  sparse: 1 / 3,
  standard: 1 / 2,
  dense: 2 / 3,
} as const;

export type Density = keyof typeof DENSITIES;
export const DEFAULT_DENSITY: Density = "standard";

/** How often a world takes the subsector's own way of naming things. 3.4.2. */
const FOLLOWS_THE_REGION = 0.75;

/**
 * A world on the subsector. Everything a sector line carries and everything the
 * subsector draws, and nothing that would need a system laid out to know.
 */
export interface SubsectorWorld {
  readonly hex: SectorHex;
  /** The four digits, sector-absolute. SubSectorSpec 2.2.2. */
  readonly at: string;
  readonly name: string;
  /** The seed of the system, from which everything below it descends. */
  readonly systemSeed: string;
  /** The seed of the world itself, which is an ordinary planet's. */
  readonly seed: string;
  readonly uwp: string;
  readonly profile: Uwp;
  readonly trade: readonly TradeCode[];
  readonly pbg: Pbg;
  readonly stars: Stars;
  /** Naval, scout, both or neither, as the Bases column writes them. 3.5. */
  readonly bases: string;
  /** "A" for amber, "R" for red where a referee has said so, else "". 3.6. */
  readonly zone: string;
  /**
   * Who holds the world, as the Allegiance column writes it.
   *
   * "Na" - non-aligned - for everything this application rolls, because nothing
   * generated here has an empire behind it to claim anything. It is a column on
   * every published sector map, so a world that arrives from outside carries
   * the code it arrived with and the export writes it back out.
   */
  readonly allegiance: string;
}

/** What a world nobody has claimed is down as. */
export const UNALIGNED = "Na";

/**
 * A route between two worlds. SubSectorSpec 3.9.
 *
 * Two kinds, as the published maps have two kinds. An X-boat route is a leg of
 * the express network: the scheduled run between the ports big enough to service
 * it, which is how word travels. A trade route is where two worlds want what
 * each other has, which is why a free trader goes.
 */
export interface Route {
  readonly from: string;
  readonly to: string;
  readonly kind: "xboat" | "trade";
}

/**
 * A Main: a run of worlds every one of which is within one jump of the next.
 * SubSectorSpec 3.10.
 *
 * The oldest piece of Traveller astrography there is, and the one a region ends
 * up named after - the Spinward Main, the Trojan Reach Main. It matters because
 * a jump-1 ship can cross the whole of one, which decides where trade goes,
 * where a polity can hold together, and where the far side of a two hex gap is
 * a different world entirely.
 */
export interface Main {
  /** What it is called: the busiest world on it. 3.10.3. */
  readonly name: string;
  /** The hexes it runs through, in reading order. */
  readonly hexes: readonly string[];
}

export interface Subsector {
  readonly seed: string;
  readonly letter: string;
  readonly density: Density;
  /** Which way this region leans, if the referee has leaned it. 3.11. */
  readonly shifts: UwpShifts;
  /** The eighty hexes, in reading order, with the worlds among them. */
  readonly worlds: readonly SubsectorWorld[];
  /** The routes between them, each pair once. 3.9. */
  readonly routes: readonly Route[];
  /** The jump-1 chains among them, longest first. 3.10. */
  readonly mains: readonly Main[];
}

/** How many worlds in a row make a chain worth calling a Main. 3.10.2. */
const SHORTEST_MAIN = 3;

/**
 * The Mains. SubSectorSpec 3.10.
 *
 * Every world that can be reached from another in one jump is on the same Main
 * as it, which is a connected group and nothing cleverer: walk out from each
 * world that has not been seen and take everything the walk reaches.
 *
 * Every world counts, whether anybody lives on it or not. A Main is a fact about
 * where a ship can go, and an empty world with a gas giant to skim is as much a
 * step along one as a hive world.
 */
export function mainsIn(worlds: readonly SubsectorWorld[]): Main[] {
  const left = new Map(worlds.map((world) => [world.at, world]));
  const mains: Main[] = [];
  for (const world of worlds) {
    if (!left.has(world.at)) continue;
    const group: SubsectorWorld[] = [];
    const walk = [world];
    left.delete(world.at);
    while (walk.length > 0) {
      const here = walk.pop()!;
      group.push(here);
      for (const other of [...left.values()]) {
        if (hexDistance(here.hex, other.hex) !== 1) continue;
        left.delete(other.at);
        walk.push(other);
      }
    }
    if (group.length < SHORTEST_MAIN) continue;
    // Named for the busiest world on it, which is the one anybody would say they
    // were heading for.
    const busiest = [...group].sort(
      (a, b) => b.profile.population - a.profile.population || a.at.localeCompare(b.at),
    )[0]!;
    mains.push({
      name: busiest.name,
      hexes: group.map((held) => held.at).sort((a, b) => a.localeCompare(b)),
    });
  }
  return mains.sort((a, b) => b.hexes.length - a.hexes.length || a.name.localeCompare(b.name));
}

/**
 * How far an X-boat leg runs, in jumps. SubSectorSpec 3.9.2.
 *
 * The express boats are jump-4 ships and the network is built of long legs, but
 * a leg still ends at a port that can service one: class A or B, which is where
 * an X-boat station is. Two hexes here, because a subsector is eight across and
 * legs of four would be two lines from one side to the other.
 */
const XBOAT_REACH = 2;

/** How far a trader will go for a cargo. SubSectorSpec 3.9.3. */
const TRADE_REACH = 2;

/**
 * What a world wants from a world that has the other. SubSectorSpec 3.9.3.1.
 *
 * The classic pairs: food for the worlds that grow none, manufactures for the
 * worlds that make none, and the run between somewhere rich and somewhere that
 * is not. A route needs one of these to point at, in either direction.
 */
const WANTS: readonly (readonly [string, string])[] = [
  ["Ag", "Na"],
  ["Ag", "In"],
  ["In", "NI"],
  ["Hi", "Lo"],
  ["Ri", "Po"],
  ["Ht", "Lt"],
];

function hasCode(world: SubsectorWorld, code: string): boolean {
  return world.trade.some((held) => held.code === code);
}

/** Whether two worlds have anything to sell each other. */
function trades(from: SubsectorWorld, to: SubsectorWorld): boolean {
  return WANTS.some(
    ([one, other]) =>
      (hasCode(from, one) && hasCode(to, other)) || (hasCode(from, other) && hasCode(to, one)),
  );
}

/** Whether a world can service an X-boat: a class A or B port. */
function station(world: SubsectorWorld): boolean {
  return world.profile.starport === "A" || world.profile.starport === "B";
}

/**
 * The routes. SubSectorSpec 3.9.
 *
 * Nothing is rolled: two profiles and two hex numbers decide both kinds, which
 * means a route cannot disagree with the worlds at its ends, and a subsector
 * regenerated from its seed has the same network on it.
 *
 * A red zone is off both networks. An interdiction is exactly the thing a
 * scheduled run is not flown through, and nobody is trading with it either.
 */
export function routesBetween(worlds: readonly SubsectorWorld[]): Route[] {
  const open = worlds.filter((world) => world.profile.population > 0 && world.zone !== "R");
  const routes: Route[] = [];
  for (const [at, from] of open.entries()) {
    for (const to of open.slice(at + 1)) {
      const far = hexDistance(from.hex, to.hex);
      if (far === 0) continue;
      if (station(from) && station(to) && far <= XBOAT_REACH) {
        routes.push({ from: from.at, to: to.at, kind: "xboat" });
        continue;
      }
      // A trade route where the X-boats do not run: two worlds that want what
      // each other has, close enough for a free trader to make the crossing.
      if (far <= TRADE_REACH && trades(from, to)) {
        routes.push({ from: from.at, to: to.at, kind: "trade" });
      }
    }
  }
  return routes;
}

/** The seed of the system in a hex. SubSectorSpec 3.1.3. */
export function systemSeedFor(subsectorSeed: string, at: string): string {
  return seedFrom(subsectorSeed, at);
}

/**
 * Whether a hex holds a system. SubSectorSpec 3.2.1.
 *
 * A fixed value per hex against a threshold, rather than a roll per density, so
 * that raising the density only ever adds systems and never moves the ones
 * already there. 3.2.2.1: the referee who has written notes on half a subsector and
 * then decides the region should be busier keeps the half they wrote.
 */
export function holdsSystem(seed: string, at: string, density: Density): boolean {
  return presenceOf(seed, at) < DENSITIES[density];
}

function presenceOf(seed: string, at: string): number {
  return valueFor(`${seed}:presence`, Number(at));
}

/** The world in one hex, or null where the hex is empty space. */
export function subsectorWorld(
  seed: string,
  at: string,
  hex: SectorHex,
  density: Density,
  regional = flavourFor(`${seed}:flavour`),
  shifts: UwpShifts = {},
): SubsectorWorld | null {
  if (!holdsSystem(seed, at, density)) return null;
  return worldAt(seed, at, hex, regional, undefined, shifts);
}

/**
 * The world a hex would hold, whether or not the density puts one there.
 *
 * The same world either way: what the density decides is whether the hex is
 * occupied, not what occupies it. A referee who puts a system into an empty hex
 * under 5.3.4 gets the world that hex always had.
 */
export function worldAt(
  seed: string,
  at: string,
  hex: SectorHex,
  regional = flavourFor(`${seed}:flavour`),
  given?: string,
  shifts: UwpShifts = {},
): SubsectorWorld | null {
  // The hex's own system unless the referee has put another one there. A reroll
  // from inside the system view is the one thing that can do that, and what it
  // changes is which system is in the hex rather than anything about the hex.
  const systemSeed = given ?? systemSeedFor(seed, at);
  const worldSeed = mainWorldSeed(systemSeed);
  const uwp = rollUwp(worldSeed, shifts);
  const profile = parseUwp(uwp);
  if (profile === null) return null;
  // Most worlds are named the way the region names things, and the rest are
  // wherever somebody from somewhere else settled. SubSectorSpec 3.4.2.1.
  const follows = valueFor(`${seed}:flavour-follows`, Number(at)) < FOLLOWS_THE_REGION;
  const flavour = follows ? regional : flavourFor(`${systemSeed}:names`);
  return {
    hex,
    at,
    name: worldNameFor(`${systemSeed}:names`, flavour),
    systemSeed,
    seed: worldSeed,
    uwp,
    profile,
    trade: tradeCodes(uwp),
    pbg: pbgFor(worldSeed, uwp),
    stars: starsFor(systemSeed),
    bases: basesFor(worldSeed, profile),
    zone: zoneFor(worldSeed, profile),
    allegiance: UNALIGNED,
  };
}

/** The whole subsector. SubSectorSpec 3. */
export function generateSubsector(
  seed: string,
  letter: string,
  density: Density = DEFAULT_DENSITY,
  shifts: UwpShifts = {},
): Subsector {
  const regional = flavourFor(`${seed}:flavour`);
  const worlds: SubsectorWorld[] = [];
  for (const hex of subsectorHexes(letter)) {
    const at = formatSectorHex(hex);
    const world = subsectorWorld(seed, at, hex, density, regional, shifts);
    if (world !== null) worlds.push(world);
  }
  // Named before anything is worked out over them, since a Main is called after
  // the busiest world on it and that world's name is settled here.
  const held = unrepeated(worlds, seed, regional);
  return {
    seed,
    letter: letter.toUpperCase(),
    density,
    shifts,
    worlds: held,
    routes: routesBetween(held),
    mains: mainsIn(held),
  };
}

/**
 * No two worlds of a subsector called the same thing. SubSectorSpec 3.4.4.
 *
 * Every world draws its name from its own seed, so two of them landing on one
 * name is unlikely and not impossible - and a referee saying "go to Kadrin" on a
 * subsector with two Kadrins has a subsector with a mistake in it.
 *
 * Walked in hex order, so the subsector comes out the same every time it is built.
 * The first world to claim a name keeps it and the next draws again, which is
 * the rule settlementNames already follows within one world.
 *
 * Kept to the subsector. A sector is sixteen of these and cannot rename across them
 * without a subsector opened from a sector being different from the same
 * subsector opened on its own, which is the one thing AppSpec 1.3 does not
 * allow. Collisions across a sector are rare enough to live with once a flavour
 * has more than a handful of names in it, which 3.4.3 is about.
 */
function unrepeated(
  worlds: readonly SubsectorWorld[],
  seed: string,
  regional: Flavour,
): SubsectorWorld[] {
  const used = new Set<string>();
  return worlds.map((world) => {
    if (!used.has(world.name)) {
      used.add(world.name);
      return world;
    }
    const follows = valueFor(`${seed}:flavour-follows`, Number(world.at)) < FOLLOWS_THE_REGION;
    const flavour = follows ? regional : flavourFor(`${world.systemSeed}:names`);
    let name = world.name;
    for (let attempt = 1; attempt < 12 && used.has(name); attempt++) {
      name = worldNameFor(`${world.systemSeed}:names`, flavour, attempt);
    }
    used.add(name);
    return { ...world, name };
  });
}

/** What lights a world's orbits, which is both stars of a close pair. 2.4.2. */
export function luminosityOfWorld(world: SubsectorWorld): number {
  return systemLuminosity(world.stars);
}

/** The Stars column of a sector line. SystemSpec 1.6.4. */
export function starsOf(world: SubsectorWorld): string {
  return starsLabel(world.stars);
}

/** The PBG column. SubSectorSpec 3.3.3. */
export function pbgOf(world: SubsectorWorld): string {
  return formatPbg(world.pbg);
}
