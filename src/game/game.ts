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
import { routeTo } from "./nav";
import { buildDaysFor, jumpFuel, MODULAR_TONS, navySize, people, slipsAt, TENDER_JUMP } from "./rules";
import { forecast, shares, work, type Job } from "./yard";
import { temperFromId } from "./temper";
import type { Admiral, Build, Crits, Faction, Temper, Fleet, FleetReport, GameState, LogEntry, Loc, Order, Ship, StandingOrders, WorldState } from "./types";
import { STANDING_PRESETS } from "./types";
import { colourTerritories, shipName } from "./names";

export function noCrits(): Crits {
  return { sensors: 0, thrust: 0, weapons: 0, armour: 0, jump: false, crew: 0, computer: 0 };
}

/** What an order from the player changes on a fleet. */
export interface FleetChange {
  readonly order?: Order | null;
  readonly standing?: StandingOrders;
  readonly admiral?: Admiral | null;
}

export class Game {
  readonly catalogue: Catalogue;
  readonly worlds: ReadonlyMap<string, World>;
  readonly rng: Rng;

  constructor(readonly state: GameState) {
    // Games saved before news took time to travel.
    const opts = state.options as { newsLag?: number; fullFog?: boolean };
    if (opts.newsLag === undefined) opts.newsLag = 0;
    if (opts.fullFog === undefined) opts.fullFog = false;
    const more = state.options as { startingWealth?: number; victoryBy?: "population" | "worlds" };
    if (more.startingWealth === undefined) more.startingWealth = 1;
    // Games from before victory could be by population keep counting worlds.
    if (more.victoryBy === undefined) more.victoryBy = "worlds";
    for (const f of state.factions) {
      f.news ??= { ...f.intel };
      f.inbox ??= [];
      f.reports ??= {};
      f.orders ??= [];
      f.known ??= Object.fromEntries(Object.entries(state.worlds).map(([at, w]) => [at, w.owner]));
    }
    this.catalogue = new Catalogue(new Map(Object.entries(state.designs)));
    this.worlds = new Map(state.sector.worlds.map((w) => [w.at, w]));
    // Games made before Empires had characters: each is given one, the same every time.
    for (const f of state.factions) (f as { temper?: Temper }).temper ??= temperFromId(f.personality, f.id);
    // Games made before worlds had planetary navies are given them, at full strength.
    for (const w of state.sector.worlds) {
      const ws = state.worlds[w.at];
      if (ws !== undefined && ws.navy === undefined) ws.navy = this.freshNavy(w);
    }
    // Games made before slips were shared out by the day: each ship on order
    // is given her work, and what is done of it.
    for (const f of state.factions) {
      for (const b of f.builds) {
        if (b.work !== undefined || !this.catalogue.has(b.classId)) continue;
        const work = buildDaysFor(this.catalogue.get(b.classId), state.options.buildSpeed);
        const begun = b.start !== undefined && b.start < state.day;
        b.work = work;
        b.worked = begun ? Math.min(work - 1, state.day - b.start!) : 0;
        b.placed = b.start ?? state.day;
      }
    }
    if (state.colourScheme !== 2) {
      // Games made before colours were chosen by neighbourhood: recolour the
      // computer's factions by the worlds they hold now.
      const held = new Map<string, string[]>();
      for (const [at, w] of Object.entries(state.worlds)) if (w.owner !== null) held.set(w.owner, [...(held.get(w.owner) ?? []), at]);
      const humans = state.factions.filter((f) => f.human);
      const colours = colourTerritories(
        state.factions.map((f) => ({ key: f.id, hexes: held.get(f.id) ?? [f.capital], human: f.human ? humans.indexOf(f) : undefined })),
        distanceBetween,
      );
      for (const f of state.factions) if (!f.human) (f as { colour: string }).colour = colours.get(f.id) ?? f.colour;
      state.colourScheme = 2;
    }
    this.worlds = new Map(state.sector.worlds.map((w) => [w.at, w]));
    this.rng = new Rng(state.rng);
    // Games from before reports were kept for players only lose the rest.
    if (state.factions.some((f) => f.human) && state.log.some((e) => this.readers(e.to).length < e.to.length)) {
      state.log = state.log.flatMap((e) => {
        const to = this.readers(e.to);
        return to.length === 0 ? [] : [to.length === e.to.length ? e : { ...e, to: [...to] }];
      });
    }
    for (const at of new Set(state.factions.flatMap((f) => f.builds.map((b) => b.at)))) this.replanYard(at);
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

  /**
   * Ships a fleet's carriers hold in their hangars: craft without a jump drive,
   * biggest first, each into a hangar built for its size or bigger.
   */
  hangared(fleet: Fleet): Set<string> {
    const slots: number[] = [];
    for (const s of fleet.ships) for (const h of this.cls(s).hangars) for (let i = 0; i < h.slots; i++) slots.push(h.tons);
    const out = new Set<string>();
    if (slots.length === 0) return out;
    slots.sort((a, b) => a - b);
    const craft = fleet.ships.filter((s) => this.cls(s).jump === 0).sort((a, b) => this.cls(b).tons - this.cls(a).tons);
    for (const s of craft) {
      const tons = this.cls(s).tons;
      const at = slots.findIndex((t) => t >= tons);
      if (at < 0) continue;
      slots.splice(at, 1);
      out.add(s.id);
    }
    return out;
  }

  /** Hangar space in a fleet, and how much of it is filled. */
  hangarSpace(fleet: Fleet): { slots: number; filled: number } {
    let slots = 0;
    for (const s of fleet.ships) for (const h of this.cls(s).hangars) slots += h.slots;
    return { slots, filled: slots === 0 ? 0 : this.hangared(fleet).size };
  }

  /** A new ship of a class, and the fighters that come with it if it is a carrier. */
  commission(classId: string, name?: string): Ship[] {
    const ship = this.newShip(classId, name);
    const out = [ship];
    for (const h of this.cls(ship).hangars) {
      const fighter = this.catalogue.fighterFor(h);
      if (fighter === undefined) continue;
      for (let i = 0; i < h.slots; i++) out.push(this.newShip(fighter.id, `${ship.name} ${fighter.name.split(" ").pop()} ${i + 1}`));
    }
    return out;
  }

  /** Whether a fleet has tenders with it, or has orders to hire them. */
  tendered(fleet: Fleet): boolean {
    return fleet.tender === true || (fleet.order?.kind === "jump" && fleet.order.tender === true);
  }

  /** A ship carried through jump: one with no drive, in a carrier's hangar or aboard hired tenders. */
  carried(fleet: Fleet, ship: Ship): boolean {
    if (this.cls(ship).jump !== 0) return false;
    return this.tendered(fleet) || this.hangared(fleet).has(ship.id);
  }

  /** Tons the tenders would carry: ships without jump drives that no hangar holds. */
  carriedTons(fleet: Fleet): number {
    const held = this.hangared(fleet);
    return fleet.ships.filter((s) => this.cls(s).jump === 0 && !held.has(s.id)).reduce((t, s) => t + this.cls(s).tons, 0);
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
    return fleet.ships.reduce((low, s) => Math.min(low, this.carried(fleet, s) ? TENDER_JUMP : this.shipJump(s)), Infinity);
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
      if (this.carried(fleet, s)) continue;
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
        reason: this.cls(lame).jump === 0 ? `${lame.name} has no jump drive; hire jump tenders at a class A or B starport` : `${lame.name}'s jump drive is damaged`,
      };
    }
    if (parsecs > drive) return { ok: false, reason: `${parsecs} parsecs; the fleet jumps ${drive}` };
    for (const s of fleet.ships) {
      if (this.carried(fleet, s)) continue;
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

  /** An Empire's share of the sector, or the independents' for null: peopled worlds held, and the people on them. */
  holding(factionId: string | null): { worlds: number; people: number } {
    let worlds = 0;
    let folk = 0;
    for (const w of this.state.sector.worlds) {
      if (w.uwp.population === 0 || this.state.worlds[w.at]?.owner !== factionId) continue;
      worlds++;
      folk += people(w);
    }
    return { worlds, people: folk };
  }

  /** What winning takes: the sector's peopled worlds and people, and how much of the chosen one to hold. */
  victoryTarget(): { by: "population" | "worlds"; worlds: number; people: number; need: number } {
    const peopled = this.state.sector.worlds.filter((w) => w.uwp.population > 0);
    const total = { worlds: peopled.length, people: peopled.reduce((s, w) => s + people(w), 0) };
    const by = this.state.options.victoryBy;
    const need = by === "population" ? total.people * this.state.options.victoryShare : Math.ceil(total.worlds * this.state.options.victoryShare);
    return { by, ...total, need };
  }

  /** Names taken: every ship's, and every ship's on order, so two laid down together are not twins. */
  shipNamesInUse(): Set<string> {
    return new Set([...this.state.fleets.flatMap((f) => f.ships.map((s) => s.name)), ...this.state.factions.flatMap((f) => f.builds.map((b) => b.name))]);
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

  /* Planetary navies ------------------------------------------------------ */

  /**
   * The class of a world's system defence boats: the strongest armed craft with
   * no jump drive that a world of its tech level could build.
   */
  navyClassFor(world: World): ShipClass | undefined {
    const boats = this.catalogue.all().filter((c) => c.jump === 0 && c.armed && c.tons >= 20);
    const own = boats.filter((c) => c.tl <= world.uwp.tl).sort((a, b) => b.strength - a.strength || a.cost - b.cost)[0];
    // A world that cannot build one makes do with an import, as High Guard's
    // planetary navies make do with antiques: the lowest-tech boat there is.
    return own ?? [...boats].sort((a, b) => a.tl - b.tl || b.strength - a.strength)[0];
  }

  /** A world's navy at full strength, fresh. */
  freshNavy(world: World): WorldState["navy"] {
    const size = navySize(world);
    const cls = size > 0 ? this.navyClassFor(world) : undefined;
    return cls === undefined ? null : { classId: cls.id, boats: Array.from({ length: size }, () => 0) };
  }

  /** Boats a world has now, and how many it should have. */
  navyOf(at: string): { cls: ShipClass | undefined; boats: number; full: number } {
    const world = this.world(at);
    const navy = this.worldState(at).navy;
    const cls = navy === null || navy === undefined ? undefined : this.catalogue.has(navy.classId) ? this.catalogue.get(navy.classId) : undefined;
    return { cls, boats: navy?.boats.length ?? 0, full: cls === undefined ? 0 : navySize(world) };
  }

  /* Shipyards ------------------------------------------------------------- */

  /** Every ship on the slips or waiting for one at a yard, whoever ordered it. */
  buildsAt(at: string): Build[] {
    return this.state.factions.flatMap((f) => f.builds.filter((b) => b.at === at));
  }

  /** The ships on order at a yard, in the order they were placed, with their work as the slips see it. */
  private jobsAt(at: string): { build: Build; job: Job }[] {
    const today = this.state.day;
    return this.state.factions
      .flatMap((f) =>
        f.builds
          .filter((b) => b.at === at)
          .map((b) => ({
            build: b,
            job: {
              work: b.work ?? 1,
              worked: b.worked ?? 0,
              placed: b.placed ?? today,
              modular: this.catalogue.get(b.classId).tons >= MODULAR_TONS,
              idleUntil: f.disorderUntil ?? 0,
            },
          })),
      )
      .sort((a, b) => a.job.placed - b.job.placed);
  }

  /**
   * When a ship ordered today at a yard would start and finish, taking the
   * first slip to come free and, if she is big, any spare ones.
   */
  scheduleAt(at: string, work: number, tons = 0): { start: number; done: number } {
    const today = this.state.day;
    const jobs = this.jobsAt(at).map((j) => j.job);
    jobs.push({ work: Math.max(1, work), worked: 0, placed: today, modular: tons >= MODULAR_TONS, idleUntil: 0 });
    return forecast(jobs, slipsAt(this.world(at)), today).at(-1)!;
  }

  /** Brings a yard's forecasts up to date: when each ship on order starts and is due. */
  replanYard(at: string): void {
    const today = this.state.day;
    const jobs = this.jobsAt(at);
    const plan = forecast(
      jobs.map((j) => j.job),
      slipsAt(this.world(at)),
      today,
    );
    jobs.forEach(({ build }, i) => {
      const p = plan[i]!;
      if ((build.worked ?? 0) === 0) build.start = p.start;
      build.done = p.done;
    });
  }

  /** A day's work at a yard: every ship on order that has a slip moves on. */
  workYard(at: string, day: number): void {
    const jobs = this.jobsAt(at);
    work(
      jobs.map((j) => j.job),
      slipsAt(this.world(at)),
      day,
    );
    for (const { build, job } of jobs) {
      if (job.worked > (build.worked ?? 0) && (build.worked ?? 0) === 0) build.start = day - 1;
      build.worked = job.worked;
    }
  }

  /** Slips each ship at a yard has tomorrow; a big one may have several. */
  slipsTomorrow(at: string): Map<Build, number> {
    const jobs = this.jobsAt(at);
    const s = shares(
      jobs.map((j) => j.job),
      slipsAt(this.world(at)),
      this.state.day + 1,
    );
    return new Map(jobs.map((j, i) => [j.build, s[i]!]));
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

  /**
   * News of something at a place, reaching each faction when a courier would
   * bring it. `firsthand` are the factions whose own ships or worlds were
   * there: they know at once, unless full fog of war says even that has to
   * come by courier.
   */
  log(entry: Omit<LogEntry, "day" | "happened"> & { readonly firsthand?: readonly string[] }): void {
    const { firsthand = [], ...rest } = entry;
    const today = this.state.day;
    // Only players read the reports: the computer's Empires act on the state
    // itself. News for them alone would only swell the save (it was most of a
    // long game's), so it is not kept, except in a game with no players at
    // all, a simulation, where the log is all there is to read.
    const readers = this.readers(entry.to);
    if (readers.length === 0) return;
    const byLag = new Map<number, string[]>();
    for (const id of readers) {
      const direct = firsthand.includes(id) && !this.fogged(id);
      const lag = entry.at === undefined || direct ? 0 : this.lag(id, entry.at);
      byLag.set(lag, [...(byLag.get(lag) ?? []), id]);
    }
    // A report to one faction alone is about that faction.
    const about = firsthand.length > 0 ? [...firsthand] : entry.to.length === 1 ? [...entry.to] : [];
    for (const [lag, to] of byLag) {
      const e = { ...rest, to, about };
      this.state.log.push(lag === 0 ? { ...e, day: today } : { ...e, day: today + lag, happened: today });
    }
  }

  /** Of the factions a report is for, those who read reports: the players, or everyone in a game without any. */
  private readers(to: readonly string[]): readonly string[] {
    const players = this.state.factions.filter((f) => f.human).map((f) => f.id);
    return players.length === 0 ? to : to.filter((id) => players.includes(id));
  }

  /** Whether a faction sees its own fleets only by courier: full fog, for players. */
  fogged(factionId: string): boolean {
    const o = this.state.options;
    if (!o.fullFog || o.newsLag <= 0) return false;
    return this.state.factions.find((f) => f.id === factionId)?.human === true;
  }

  /** A fleet as it is today, copied, to be sent home as a report. */
  reportOf(fleet: Fleet): FleetReport {
    return { day: this.state.day, fleet: JSON.parse(JSON.stringify(fleet)) as Fleet };
  }

  /** The fleets a faction's player sees as theirs: live, or as last reported under full fog. */
  fleetsSeenBy(factionId: string): Fleet[] {
    if (!this.fogged(factionId)) return this.fleetsOf(factionId);
    return Object.values(this.faction(factionId).reports).map((r) => r.fleet);
  }

  /** One of a faction's fleets as its player sees it. */
  fleetSeenBy(factionId: string, id: string): Fleet | undefined {
    if (!this.fogged(factionId)) {
      const f = this.fleet(id);
      return f?.owner === factionId ? f : undefined;
    }
    return this.faction(factionId).reports[id]?.fleet;
  }

  /** How old a player's picture of one of their fleets is, in days. */
  reportAge(factionId: string, id: string): number {
    if (!this.fogged(factionId)) return 0;
    const r = this.faction(factionId).reports[id];
    return r === undefined ? 0 : this.state.day - r.day;
  }

  /**
   * Give a fleet an order. Straight away where the fleet can be reached at once;
   * otherwise it goes by courier and lands when a courier would get there.
   * Returns the day it takes effect.
   */
  command(factionId: string, fleetId: string, change: FleetChange, text: string): number {
    const real = this.fleet(fleetId);
    const where = real === undefined ? null : real.transit?.to ?? real.system;
    const lag = !this.fogged(factionId) || where === null ? 0 : this.lag(factionId, where);
    if (lag === 0) {
      if (real !== undefined) this.applyCommand(real, change);
      const seen = this.faction(factionId).reports[fleetId];
      if (seen !== undefined && real !== undefined) this.faction(factionId).reports[fleetId] = this.reportOf(real);
      return this.state.day;
    }
    const f = this.faction(factionId);
    f.orders.push({ fleetId, sent: this.state.day, arrives: this.state.day + lag, ...change, text });
    return this.state.day + lag;
  }

  /** An order landing on a fleet. A jump is re-planned from wherever it is when the order arrives. */
  applyCommand(fleet: Fleet, change: FleetChange): void {
    if (change.standing !== undefined) fleet.standing = { ...change.standing };
    // An admiral handed the fleet, or relieved; any order of the player's own relieves one.
    if (change.admiral !== undefined) {
      if (change.admiral === null) delete fleet.admiral;
      else fleet.admiral = { ...change.admiral };
    } else if (change.order !== undefined) delete fleet.admiral;
    if (change.order === undefined) return;
    const order = change.order;
    // Any order but another tendered jump sends hired tenders away.
    if (!(order?.kind === "jump" && order.tender === true)) fleet.tender = false;
    if (order?.kind === "jump" && order.route.length > 0 && fleet.transit === null) {
      const dest = order.route[order.route.length - 1]!;
      const first = order.route[0]!;
      // Judged as the fleet will be once the order is on it: a tendered jump
      // counts the tenders, which a fleet of boats without jump drives needs to
      // go anywhere at all.
      const probe: Fleet = { ...fleet, order };
      if (distanceBetween(fleet.system, first) > this.fleetJump(probe) || fleet.system === first) {
        const again = routeTo(this, probe, dest);
        fleet.order = again === null ? null : { kind: "jump", route: again, tender: order.tender };
        if (again === null) {
          this.log({
            to: [fleet.owner],
            kind: "info",
            text: `${fleet.name} can find no way to ${this.world(dest).name} from ${this.world(fleet.system).name}, and waits for orders.`,
            at: fleet.system,
            wake: true,
            firsthand: [fleet.owner],
          });
        }
        return;
      }
    }
    fleet.order = order === null ? null : order.kind === "jump" ? { ...order, route: [...order.route] } : { ...order };
  }


  /**
   * Change how fast news travels, and whether players see their own fleets only
   * by courier, in the middle of a game.
   */
  setFog(newsLag: number, fullFog: boolean): void {
    const o = this.state.options;
    const wasFogged = o.fullFog && o.newsLag > 0;
    o.newsLag = newsLag;
    o.fullFog = fullFog;
    const nowFogged = fullFog && newsLag > 0;
    const day = this.state.day;
    for (const f of this.state.factions) {
      if (newsLag <= 0) {
        // Everything on its way arrives at once.
        for (const d of f.inbox) {
          if (d.kind === "owner") f.known[d.at] = d.owner;
          else if (d.kind === "sighting") f.news[d.sighting.fleetId] = d.sighting;
        }
        f.inbox = [];
        for (const e of this.state.log) {
          if (e.day > day && e.to.includes(f.id)) (e as { day: number }).day = day;
        }
      }
      if (!f.human) continue;
      if (nowFogged && !wasFogged) {
        // The picture starts true: the capital knows where it sent everything.
        f.reports = Object.fromEntries(this.fleetsOf(f.id).map((fl) => [fl.id, this.reportOf(fl)]));
      }
      if (!nowFogged && wasFogged) {
        // Orders in the post arrive now.
        for (const c of f.orders) {
          const real = this.fleet(c.fleetId);
          if (real !== undefined) this.applyCommand(real, c);
        }
        f.orders = [];
        f.inbox = f.inbox.filter((d) => d.kind !== "fleet" && d.kind !== "fleetLost");
      }
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

  /** Whether a report concerns a faction's own ships, worlds or treasury, rather than just news. */
  concerns(e: LogEntry, factionId: string): boolean {
    if (e.about !== undefined) return e.about.includes(factionId);
    return e.wake === true || e.to.length === 1;
  }

  /** Who a faction believes holds a world. Its own worlds it always knows. */
  knownOwner(factionId: string, at: string): string | null {
    const actual = this.state.worlds[at]?.owner ?? null;
    if (actual === factionId || this.state.options.newsLag <= 0) return actual;
    const f = this.state.factions.find((x) => x.id === factionId);
    return f?.known[at] ?? actual;
  }
}

/** "1 ship", "3 ships". */
export function ships(n: number): string {
  return `${n} ship${n === 1 ? "" : "s"}`;
}

export function round(n: number, places = 1): string {
  const f = Math.pow(10, places);
  return String(Math.round(n * f) / f);
}
