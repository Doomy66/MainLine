/**
 * Everything a game is, as plain data. A saved game is this object as JSON,
 * with the sector and every ship design it uses carried inside it, so it opens
 * on any machine whatever catalogue that machine has.
 */

import type { Design } from "../shipdesign/engine/design";
import type { SectorData } from "../sector/sec";

/**
 * Where a fleet can be within a system. A day is long enough to get anywhere in
 * a system, so these are places rather than distances.
 *
 * - main: orbit of the main world, its starport, and its defences.
 * - gg: a gas giant, where a ship with scoops can skim fuel.
 * - belt: the planetoid belt, somewhere to lie low.
 * - deep: the jump limit, where ships arrive out of jump space.
 */
export type Loc = "main" | "gg" | "belt" | "deep";

export const LOC_NAMES: Readonly<Record<Loc, string>> = {
  main: "Main world orbit",
  gg: "Gas giant",
  belt: "Planetoid belt",
  deep: "Jump point",
};

/** Which enemy fleets a fleet attacks without being told to. */
export type Engage = "any" | "weaker" | "none";

/** What a fleet's guns look for first. */
export type TargetPriority = "warships" | "largest" | "smallest" | "damaged" | "unarmed";

/**
 * How a fleet behaves when it meets the enemy and nobody is there to tell it.
 * Set once and kept until changed.
 */
export interface StandingOrders {
  /**
   * any: attack every enemy fleet it finds.
   * weaker: attack only fleets it outguns.
   * none: fight only when attacked.
   */
  engage: Engage;
  /** Attack the defences of a world it does not own, and hold it until it submits. */
  besiege: boolean;
  /** Go after enemy fleets seen elsewhere in the same system that it would engage. */
  intercept: boolean;
  /** Try to break off whenever attacked, rather than only at the withdrawal point. */
  evade: boolean;
  target: TargetPriority;
  /** Break off when the fleet is down to this share of its hull. Zero never. */
  withdrawAt: number;
}

export const STANDING_PRESETS: Readonly<Record<string, StandingOrders>> = {
  "Seek and destroy": { engage: "any", besiege: true, intercept: true, evade: false, target: "warships", withdrawAt: 0.25 },
  Raider: { engage: "weaker", besiege: false, intercept: true, evade: false, target: "unarmed", withdrawAt: 0.6 },
  Patrol: { engage: "any", besiege: false, intercept: true, evade: false, target: "warships", withdrawAt: 0.4 },
  Guard: { engage: "any", besiege: false, intercept: false, evade: false, target: "largest", withdrawAt: 0.3 },
  Defensive: { engage: "none", besiege: false, intercept: false, evade: false, target: "warships", withdrawAt: 0.4 },
  "Avoid battle": { engage: "none", besiege: false, intercept: false, evade: true, target: "warships", withdrawAt: 1 },
};

export interface Crits {
  sensors: number;
  thrust: number;
  /** Weapon lines knocked out, one at a time. */
  weapons: number;
  armour: number;
  jump: boolean;
  crew: number;
  computer: number;
}

export interface Ship {
  readonly id: string;
  readonly classId: string;
  name: string;
  /** Hull points lost. */
  damage: number;
  /** Tons in the tanks. */
  fuel: number;
  /** The tanks hold unrefined fuel, which makes a rough jump likelier. */
  unrefined: boolean;
  missiles: number;
  torpedoes: number;
  crits: Crits;
}

export type Order =
  | { readonly kind: "move"; readonly to: Loc }
  /**
   * Hexes still to jump to, in order. The first is the next jump. `tender`
   * hires jump tenders to carry the fleet's ships that have no jump drive.
   */
  | { readonly kind: "jump"; readonly route: string[]; readonly tender?: boolean }
  | { readonly kind: "refuel" }
  | { readonly kind: "repair" }
  /**
   * Join the defences of a world the faction holds, for good: its ships guard
   * the world's orbit with any other garrison there, off the map and beyond
   * further orders, and go with the world if it is lost.
   */
  | { readonly kind: "garrison" };

export interface Transit {
  readonly from: string;
  readonly to: string;
  readonly depart: number;
  readonly arrive: number;
}

export interface Fleet {
  readonly id: string;
  name: string;
  owner: string;
  /** The hex it is in, or the hex it left while in jump space. */
  system: string;
  loc: Loc;
  ships: Ship[];
  standing: StandingOrders;
  order: Order | null;
  transit: Transit | null;
  /** Jump tenders hired and alongside, carrying the ships with no jump drive. */
  tender?: boolean;
  /**
   * Days running it has fought in one place: a computer fleet that has fought
   * there three days and got nowhere stops trying.
   */
  fighting?: { readonly at: string; readonly loc: Loc; readonly since: number; readonly last: number };
  /** A player's fleet handed to an admiral, who gives it its orders day by day. */
  admiral?: Admiral;
}

/** What an admiral does with a fleet: take worlds, or defend them, working from a base. */
export interface Admiral {
  readonly mission: "conquer" | "defend";
  /** How good the odds must be before it attacks, and how soon it breaks off. */
  readonly style: "bold" | "steady" | "careful";
  /** Where it works from: home for repairs, and the middle of the worlds it defends. */
  readonly base: string;
}

export interface Build {
  readonly classId: string;
  readonly at: string;
  readonly name: string;
  /** The day she was ordered. */
  placed?: number;
  /** Slip-days of work she needs: her days on one slip. */
  work?: number;
  /** Slip-days done. */
  worked?: number;
  /** When work begins: today, or when a slip at the yard comes free. A forecast until then. */
  start?: number;
  /** When she is due: a forecast, which moves as slips come free or are taken. */
  done: number;
}

/** An enemy fleet as last seen, which is all a faction knows of it once it has gone. */
export interface Sighting {
  readonly fleetId: string;
  readonly owner: string;
  readonly system: string;
  readonly loc: Loc;
  /** The last day it was seen. */
  readonly day: number;
  /** The day it was first seen at this system: when it arrived, as far as anyone knows. */
  readonly since: number;
  /** Set once it has been seen to be gone: the day its absence was noticed. */
  readonly left?: number;
  readonly ships: number;
  readonly tons: number;
  readonly strength: number;
}

/** A piece of news on its way to a faction's capital. */
export type Dispatch =
  | { readonly arrives: number; readonly kind: "sighting"; readonly sighting: Sighting }
  | { readonly arrives: number; readonly kind: "owner"; readonly at: string; readonly owner: string | null }
  | { readonly arrives: number; readonly kind: "fleet"; readonly report: FleetReport }
  | { readonly arrives: number; readonly kind: "fleetLost"; readonly fleetId: string };

/**
 * What a capital last heard of one of its own fleets, under full fog of war: the
 * fleet as it was on the day the report was sent.
 */
export interface FleetReport {
  readonly day: number;
  readonly fleet: Fleet;
}

/**
 * An order on its way from a capital to a fleet, under full fog of war. Only
 * what is set changes when it arrives.
 */
export interface Command {
  readonly fleetId: string;
  readonly sent: number;
  readonly arrives: number;
  /** A new order; null cancels. Left out, the order stands. */
  readonly order?: Order | null;
  readonly standing?: StandingOrders;
  /** An admiral to take the fleet over; null relieves one. Left out, any admiral stays, unless an order comes. */
  readonly admiral?: Admiral | null;
  /** What it says, for the list of orders in the post. */
  readonly text: string;
}

export type Personality = "aggressive" | "cautious" | "expansionist";

export interface Faction {
  readonly id: string;
  name: string;
  readonly colour: string;
  readonly human: boolean;
  playerName: string;
  /** The Main it began on. */
  readonly main: string;
  capital: string;
  /** MCr. */
  credits: number;
  alive: boolean;
  readonly personality: Personality;
  /** The computer's character, which its admirals go by. Given to every Empire; players' go unused. */
  temper: Temper;
  /**
   * The computer's rough idea of how much armour its enemies' ships carry: an
   * average of what it has met in battle, slow to change. Its yards lean a
   * little towards weapons that would get through.
   */
  foeArmour?: number;
  /** The most peopled worlds a player has held, and when: for the end of the game. */
  peak?: { worlds: number; day: number };
  intel: Record<string, Sighting>;
  builds: Build[];
  /**
   * What the capital knows of other factions' fleets: sightings as they arrive
   * by courier. With news travelling instantly this is the same as intel.
   */
  news: Record<string, Sighting>;
  /** Who the capital believes holds each world, as the news has it. */
  known: Record<string, string | null>;
  /** News on its way to the capital. */
  inbox: Dispatch[];
  /** Under full fog of war: what the capital last heard of each of its own fleets. */
  reports: Record<string, FleetReport>;
  /** Under full fog of war: orders sent and not yet arrived. */
  orders: Command[];
  /**
   * The day the disorder that follows losing a capital ends. Until then income
   * is cut and the yards stand idle.
   */
  disorderUntil?: number;
  /** A human who has finished their orders for the day. */
  ready: boolean;
  /** A human who wants the days to run until something happens. */
  waiting: boolean;
}

/**
 * A world's planetary navy: system defence boats of one class, each by the
 * damage it carries. A boat lost is gone from the list until it is replaced.
 */
export interface Navy {
  readonly classId: string;
  boats: number[];
}

export interface WorldState {
  owner: string | null;
  /** Defence hull points left. */
  defence: number;
  /** The planetary navy, where the world has one. */
  navy?: Navy | null;
  siege: { by: string; days: number } | null;
  /** The last day there was a battle at the main world. */
  fought: number;
}

export type LogKind = "combat" | "capture" | "arrival" | "build" | "economy" | "info" | "lost" | "sighting";

export interface LogEntry {
  /** The day the news reaches the faction, which is when it is shown. */
  readonly day: number;
  /** The day it happened, where the news took time to arrive. */
  readonly happened?: number;
  /** Faction ids who hear of it. */
  readonly to: readonly string[];
  readonly kind: LogKind;
  readonly text: string;
  readonly at?: string;
  readonly detail?: readonly string[];
  /** Factions whose own ships, worlds or treasury it concerns. Others merely heard of it. */
  readonly about?: readonly string[];
  /** Something a human sleeping until something happens should be woken for. */
  readonly wake?: boolean;
}

/** A computer Empire's character, each from 0 to 1. */
export interface Temper {
  /** Boldness: the odds it wants before it attacks, and how much it prizes rivals' worlds. */
  aggression: number;
  /** Staying power: how far down its fleets fight before they break off. */
  resolve: number;
  /** Land hunger: how much it prizes independent worlds. */
  expansion: number;
  /** Care for home: how much of its strength it keeps guarding the capital. */
  caution: number;
}

export interface GameOptions {
  /** Share of the sector that wins the game: of its people, or of its peopled worlds. */
  victoryShare: number;
  /** What the share is of. Games from before the choice count worlds. */
  victoryBy: "population" | "worlds";
  startingCredits: "wealth" | "equal";
  /** Multiplies the starting treasury, one to five. Weekly income is untouched. */
  startingWealth: number;
  /** Multiplies the sheet's construction time. */
  buildSpeed: number;
  /** Mains shorter than this are left as independent worlds. */
  factionMinWorlds: number;
  /**
   * How fast news reaches a capital: the jump rating of the couriers that carry
   * it, a week a jump. Zero is instantly. Fleets on the spot act on their
   * standing orders at once; it is the capital that learns late.
   */
  newsLag: number;
  /**
   * Full fog of war: a player's own fleets report by courier too, and orders take
   * as long to reach them as their news takes to come back. Players only; the
   * computer's admirals always know where their fleets are.
   */
  fullFog: boolean;
}

export interface GameState {
  readonly version: 1;
  readonly name: string;
  readonly sector: SectorData;
  /** The subsectors in play. Worlds outside them are not in the game. */
  readonly area: readonly string[];
  day: number;
  factions: Faction[];
  worlds: Record<string, WorldState>;
  fleets: Fleet[];
  designs: Record<string, Design>;
  rng: number;
  nextId: number;
  log: LogEntry[];
  readonly options: GameOptions;
  /** Which human is giving orders, by index into the humans. */
  turn: number;
  /** Day zero is buying the starting fleets. */
  phase: "setup" | "play" | "over";
  winner: string | null;
  /** 2: colours chosen so neighbours differ. Older games are recoloured on loading. */
  colourScheme?: number;
}
