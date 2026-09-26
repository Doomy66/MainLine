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
  /** Hexes still to jump to, in order. The first is the next jump. */
  | { readonly kind: "jump"; readonly route: string[] }
  | { readonly kind: "refuel" }
  | { readonly kind: "repair" };

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
}

export interface Build {
  readonly classId: string;
  readonly at: string;
  readonly done: number;
  readonly name: string;
}

/** An enemy fleet as last seen, which is all a faction knows of it once it has gone. */
export interface Sighting {
  readonly fleetId: string;
  readonly owner: string;
  readonly system: string;
  readonly loc: Loc;
  readonly day: number;
  readonly ships: number;
  readonly tons: number;
  readonly strength: number;
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
  intel: Record<string, Sighting>;
  builds: Build[];
  /** A human who has finished their orders for the day. */
  ready: boolean;
  /** A human who wants the days to run until something happens. */
  waiting: boolean;
}

export interface WorldState {
  owner: string | null;
  /** Defence hull points left. */
  defence: number;
  siege: { by: string; days: number } | null;
  /** The last day there was a battle at the main world. */
  fought: number;
}

export type LogKind = "combat" | "capture" | "arrival" | "build" | "economy" | "info" | "lost" | "sighting";

export interface LogEntry {
  readonly day: number;
  /** Faction ids who hear of it. */
  readonly to: readonly string[];
  readonly kind: LogKind;
  readonly text: string;
  readonly at?: string;
  readonly detail?: readonly string[];
  /** Something a human sleeping until something happens should be woken for. */
  readonly wake?: boolean;
}

export interface GameOptions {
  /** Share of the populated worlds in play that wins the game. */
  victoryShare: number;
  startingCredits: "wealth" | "equal";
  /** Multiplies the sheet's construction time. */
  buildSpeed: number;
  /** Mains shorter than this are left as independent worlds. */
  factionMinWorlds: number;
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
}
