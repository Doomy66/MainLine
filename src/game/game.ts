/**
 * A game in play: the saved state, and everything worked out from it that is
 * quicker to ask for than to store — the catalogue, the worlds by hex, what a
 * fleet can do.
 */

import { Catalogue } from "../catalogue/catalogue";
import type { ShipClass } from "../catalogue/shipclass";
import { distanceBetween } from "../sector/hex";
import type { World } from "../sector/sec";
import { Rng } from "./rng";
import { jumpFuel } from "./rules";
import type { Crits, Faction, Fleet, GameState, LogEntry, Loc, Ship, WorldState } from "./types";
import { STANDING_PRESETS } from "./types";
import { shipName } from "./names";

export function noCrits(): Crits {
  return { sensors: 0, thrust: 0, weapons: 0, armour: 0, jump: false, crew: 0, computer: 0 };
}

export class Game {
  readonly catalogue: Catalogue;
  readonly worlds: ReadonlyMap<string, World>;
  readonly rng: Rng;

  constructor(readonly state: GameState) {
    // Games saved before news took time to travel.
    const opts = state.options as { newsLag?: number };
    if (opts.newsLag === undefined) opts.newsLag = 0;
    for (const f of state.factions) {
      f.news ??= { ...f.intel };
      f.inbox ??= [];
      f.known ??= Object.fromEntries(Object.entries(state.worlds).map(([at, w]) => [at, w.owner]));
    }
    this.catalogue = new Catalogue(new Map(Object.entries(state.designs)));
    this.worlds = new Map(state.sector.worlds.map((w) => [w.at, w]));
    this.rng = new Rng(state.rng);
  }

  private readonly near = new Map<number, Map<string, string[]>>();

  /** Systems within a number of parsecs of one, nearest first. Cached: the map never changes. */
  neighbours(at: string, parsecs: number): readonly string[] {
    let byRange = this.near.get(parsecs);
    if (byRange === undefined) {
      byRange = new Map();
      this.near.set(parsecs, byRange);
    }
    let held = byRange.get(at);
    if (held === undefined) {
      held = this.state.sector.worlds
        .map((w) => ({ at: w.at, d: distanceBetween(at, w.at) }))
        .filter((x) => x.d > 0 && x.d <= parsecs)
        .sort((a, b) => a.d - b.d)
        .map((x) => x.at);
      byRange.set(at, held);
    }
    return held;
  }

  /** The state with the dice written back, ready to save. */
  snapshot(): GameState {
    this.state.rng = this.rng.state;
    return this.state;
  }

  /* Lookups --------------------------------------------------------------- */

  world(at: string): World {
    const w = this.worlds.get(at);
    if (w === undefined) throw new Error(`No world at ${at}.`);
    return w;
  }

  worldState(at: string): WorldState {
    const w = this.state.worlds[at];
    if (w === undefined) throw new Error(`No world at ${at}.`);
    return w;
  }

  faction(id: string): Faction {
    const f = this.state.factions.find((x) => x.id === id);
    if (f === undefined) throw new Error(`No faction ${id}.`);
    return f;
  }

  fleet(id: string): Fleet | undefined {
    return this.state.fleets.find((f) => f.id === id);
  }

  cls(ship: Ship): ShipClass {
    return this.catalogue.get(ship.classId);
  }

  humans(): Faction[] {
    return this.state.factions.filter((f) => f.human);
  }

  /** The human giving orders now, or undefined when there are none. */
  currentHuman(): Faction | undefined {
    const alive = this.humans().filter((f) => f.alive);
    return alive[this.state.turn % Math.max(1, alive.length)];
  }

  ownedWorlds(factionId: string): World[] {
    return this.state.sector.worlds.filter((w) => this.state.worlds[w.at]?.owner === factionId);
  }

  fleetsOf(factionId: string): Fleet[] {
    return this.state.fleets.filter((f) => f.owner === factionId);
  }

  /** Fleets in a system and not in jump space, optionally at one place in it. */
  fleetsAt(system: string, loc?: Loc): Fleet[] {
    return this.state.fleets.filter(
      (f) => f.transit === null && f.system === system && (loc === undefined || f.loc === loc),
    );
  }

  /** Whether two factions are at war. Everyone is, with everyone. */
  hostile(a: string | null, b: string | null): boolean {
    return a !== null && b !== null && a !== b;
  }

  /* Ships ----------------------------------------------------------------- */

  shipThrust(ship: Ship): number {
    return Math.max(0, this.cls(ship).thrust - ship.crits.thrust);
  }

  shipJump(ship: Ship): number {
    return ship.crits.jump ? 0 : this.cls(ship).jump;
  }

  hullLeft(ship: Ship): number {
    return Math.max(0, this.cls(ship).hull - ship.damage);
  }

  /* Fleets ---------------------------------------------------------------- */

  /** A fleet moves at the pace of its slowest ship. */
  fleetThrust(fleet: Fleet): number {
    return fleet.ships.reduce((low, s) => Math.min(low, this.shipThrust(s)), Infinity) || 0;
  }

  /** And jumps as far as its shortest-legged ship. */
  fleetJump(fleet: Fleet): number {
    if (fleet.ships.length === 0) return 0;
    return fleet.ships.reduce((low, s) => Math.min(low, this.shipJump(s)), Infinity);
  }

  fleetTons(fleet: Fleet): number {
    return fleet.ships.reduce((sum, s) => sum + this.cls(s).tons, 0);
  }

  /** Fighting value, scaled down by damage taken. */
  fleetStrength(fleet: Fleet): number {
    return fleet.ships.reduce((sum, s) => {
      const c = this.cls(s);
      return sum + c.strength * (this.hullLeft(s) / c.hull);
    }, 0);
  }

  fleetArmed(fleet: Fleet): boolean {
    return fleet.ships.some((s) => this.cls(s).armed);
  }

  /** Share of the fleet's hull still standing. */
  fleetHullShare(fleet: Fleet): number {
    let left = 0;
    let whole = 0;
    for (const s of fleet.ships) {
      left += this.hullLeft(s);
      whole += this.cls(s).hull;
    }
    return whole === 0 ? 0 : left / whole;
  }

  /** How many parsecs the fleet could jump now on the fuel it carries. */
  fleetRange(fleet: Fleet): number {
    let range = this.fleetJump(fleet);
    for (const s of fleet.ships) {
      const c = this.cls(s);
      range = Math.min(range, Math.floor((s.fuel + 1e-9) / jumpFuel(c.tons, 1)));
    }
    return Math.max(0, range);
  }

  /** Whether the fleet can jump to a hex now, and why not if it cannot. */
  canJump(fleet: Fleet, to: string): { ok: boolean; reason: string } {
    if (fleet.transit !== null) return { ok: false, reason: "already in jump space" };
    if (fleet.ships.length === 0) return { ok: false, reason: "no ships" };
    if (!this.worlds.has(to)) return { ok: false, reason: "not a system in play" };
    const parsecs = distanceBetween(fleet.system, to);
    if (parsecs === 0) return { ok: false, reason: "already there" };
    const drive = this.fleetJump(fleet);
    if (drive === 0) {
      const lame = fleet.ships.find((s) => this.shipJump(s) === 0)!;
      return {
        ok: false,
        reason: this.cls(lame).jump === 0 ? `${lame.name} has no jump drive` : `${lame.name}'s jump drive is damaged`,
      };
    }
    if (parsecs > drive) return { ok: false, reason: `${parsecs} parsecs; the fleet jumps ${drive}` };
    for (const s of fleet.ships) {
      const need = jumpFuel(this.cls(s).tons, parsecs);
      if (s.fuel + 1e-9 < need) {
        return { ok: false, reason: `${s.name} has ${round(s.fuel)} of the ${round(need)} tons of fuel it needs` };
      }
    }
    return { ok: true, reason: "" };
  }

  /* Making things --------------------------------------------------------- */

  newId(prefix: string): string {
    return `${prefix}${this.state.nextId++}`;
  }

  shipNamesInUse(): Set<string> {
    return new Set(this.state.fleets.flatMap((f) => f.ships.map((s) => s.name)));
  }

  /** A new ship of a class, fuelled, armed and undamaged. */
  newShip(classId: string, name?: string): Ship {
    const c = this.catalogue.get(classId);
    return {
      id: this.newId("s"),
      classId,
      name: name ?? shipName(this.rng, this.shipNamesInUse()),
      damage: 0,
      fuel: c.fuelCapacity,
      unrefined: false,
      missiles: c.missiles,
      torpedoes: c.torpedoes,
      crits: noCrits(),
    };
  }

  newFleet(owner: string, system: string, loc: Loc, ships: Ship[], name?: string): Fleet {
    const fleet: Fleet = {
      id: this.newId("f"),
      name: name ?? this.fleetName(owner),
      owner,
      system,
      loc,
      ships,
      standing: { ...STANDING_PRESETS["Defensive"]! },
      order: null,
      transit: null,
    };
    this.state.fleets.push(fleet);
    return fleet;
  }

  /** "3rd Squadron", counting the owner's fleets ever made. */
  fleetName(owner: string): string {
    const n = this.state.fleets.filter((f) => f.owner === owner).length + 1;
    const suffix = n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th";
    return `${n}${suffix} Squadron`;
  }

  /* Fleet handling -------------------------------------------------------- */

  /** Take ships out of a fleet into a new one in the same place. */
  splitFleet(fleet: Fleet, shipIds: readonly string[]): Fleet | null {
    if (fleet.transit !== null) return null;
    const moving = fleet.ships.filter((s) => shipIds.includes(s.id));
    if (moving.length === 0 || moving.length === fleet.ships.length) return null;
    fleet.ships = fleet.ships.filter((s) => !shipIds.includes(s.id));
    const made = this.newFleet(fleet.owner, fleet.system, fleet.loc, moving);
    made.standing = { ...fleet.standing };
    return made;
  }

  /** Fold one fleet into another in the same place. */
  mergeFleets(into: Fleet, from: Fleet): boolean {
    if (into === from || into.owner !== from.owner) return false;
    if (into.transit !== null || from.transit !== null) return false;
    if (into.system !== from.system || into.loc !== from.loc) return false;
    into.ships.push(...from.ships);
    this.state.fleets = this.state.fleets.filter((f) => f !== from);
    return true;
  }

  removeEmptyFleets(): void {
    this.state.fleets = this.state.fleets.filter((f) => f.ships.length > 0);
  }

  /* The log --------------------------------------------------------------- */

  /**
   * Days for news from a system to reach a faction's capital: a week for every
   * jump a courier makes. None where news travels instantly.
   */
  lag(factionId: string, at: string): number {
    const rating = this.state.options.newsLag;
    if (rating <= 0) return 0;
    const capital = this.state.factions.find((f) => f.id === factionId)?.capital;
    if (capital === undefined) return 0;
    return 7 * Math.ceil(distanceBetween(at, capital) / rating);
  }

  /** News of something at a place, reaching each faction when a courier would bring it. */
  log(entry: Omit<LogEntry, "day" | "happened">): void {
    const today = this.state.day;
    const byLag = new Map<number, string[]>();
    for (const id of entry.to) {
      const lag = entry.at === undefined ? 0 : this.lag(id, entry.at);
      byLag.set(lag, [...(byLag.get(lag) ?? []), id]);
    }
    for (const [lag, to] of byLag) {
      this.state.log.push(lag === 0 ? { ...entry, to, day: today } : { ...entry, to, day: today + lag, happened: today });
    }
  }

  /** What a faction has heard by now, newest first. */
  logFor(factionId: string, limit = 400): LogEntry[] {
    const today = this.state.day;
    const out: LogEntry[] = [];
    for (let i = this.state.log.length - 1; i >= 0; i--) {
      const e = this.state.log[i]!;
      if (e.day <= today && e.to.includes(factionId)) out.push(e);
    }
    return out.sort((a, b) => b.day - a.day).slice(0, limit);
  }

  /** Who a faction believes holds a world. Its own worlds it always knows. */
  knownOwner(factionId: string, at: string): string | null {
    const actual = this.state.worlds[at]?.owner ?? null;
    if (actual === factionId || this.state.options.newsLag <= 0) return actual;
    const f = this.state.factions.find((x) => x.id === factionId);
    return f?.known[at] ?? actual;
  }
}

export function round(n: number, places = 1): string {
  const f = Math.pow(10, places);
  return String(Math.round(n * f) / f);
}
