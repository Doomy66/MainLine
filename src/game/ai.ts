/**
 * The computer's factions.
 *
 * Each keeps a Home Guard at its capital and sends everything else out in
 * strike fleets. A strike fleet picks the most worthwhile world within four
 * jumps that it is strong enough to take, jumps there by way of wherever it can
 * refuel, and sits in orbit until the world submits. A beaten-up fleet goes
 * home to repair; one too weak for anything goes home and waits for more ships.
 * Treasuries go on the best fighting value for money the yards can build.
 *
 * It plays by the same rules as a human: it sees only what a human in its place
 * would see, and gives orders a human could give.
 */

import { damageAgainst, type ShipClass } from "../catalogue/shipclass";
import type { Game } from "./game";
import { canRefuelAt, jumpMap, pathIn, routeTo } from "./nav";
import { buildDaysFor, canBuildAt, defenceArmour, defenceAttacks, defenceMax, fixesCrits, income, repairRate, yardPrice } from "./rules";
import { distanceBetween } from "../sector/hex";
import { visibleSystems } from "./visibility";
import type { Faction, Fleet, StandingOrders, Temper } from "./types";
import { STANDING_PRESETS } from "./types";
import { ADMIRAL_TEMPERS, guardShare, nerve, oddsWanted, prize, travelOrders, withdrawAt } from "./temper";
import { roleOf } from "../catalogue/roles";
import { shipName } from "./names";

const HOME_GUARD = "Home Guard";
const MAX_HOPS = 4;
const RESERVE_MCR = 20;
/**
 * A Main is every world a jump-1 ship can reach, so a jump-1 ship can never
 * leave its own. Anything meant to go and take somebody else's worlds needs
 * jump-2 at least.
 */
const STRIKE_JUMP = 2;

function orders(name: keyof typeof STANDING_PRESETS): StandingOrders {
  return { ...STANDING_PRESETS[name]! };
}

/** Standing orders shaped to a character: its fleets break off when it would. */
function ordersWith(t: Temper, name: keyof typeof STANDING_PRESETS): StandingOrders {
  const o = orders(name);
  return o.withdrawAt >= 1 ? o : { ...o, withdrawAt: withdrawAt(t) };
}

function ordersFor(faction: Faction, name: keyof typeof STANDING_PRESETS): StandingOrders {
  return ordersWith(faction.temper, name);
}

/** Standing orders for a fleet on its way somewhere. */
function travelling(t: Temper): StandingOrders {
  return travelOrders(t, orders("Patrol"));
}

/**
 * Who is giving a fleet its orders: the Empire's own staff, or a player's
 * admiral, with the character they go by, the world they call home, and, for
 * an admiral, how far from home they will look for work.
 */
interface Commander {
  readonly temper: Temper;
  readonly home: string;
  readonly near?: { readonly at: string; readonly parsecs: number };
}

function staffOf(faction: Faction): Commander {
  return { temper: faction.temper, home: faction.capital };
}

/**
 * Why a fleet's commander did what it did today, in a few words a player can
 * check: what it saw, and the numbers it went by. An admiral reports it.
 */
const reasons = new Map<Fleet, string>();
function because(fleet: Fleet, why: string): void {
  reasons.set(fleet, why);
}

/** How the odds look, in a few words. */
function odds(mine: number, against: number): string {
  if (against <= 0) return "nothing stands in the way";
  const r = mine / against;
  const rough = r >= 10 ? "" : ` (about ${r.toFixed(1)} to 1)`;
  return `${r >= 3 ? "the odds are good" : r >= 1.6 ? "the odds look fair" : "the odds are close, but worth it"}${rough}`;
}

/** Civilian and support ships are no use in a war of fleets, however armed. */
function fighting(cls: ShipClass): boolean {
  return cls.armed && roleOf(cls) !== "civilian";
}

/**
 * How well a class suits the enemies an Empire has met, beside the others: the
 * share of its damage that would get through their armour, over the average
 * share. Near 1 for most; low for light guns against heavy armour.
 */
function fitAgainst(cls: ShipClass, armour: number, average: number): number {
  const open = damageAgainst(cls, 0);
  if (open <= 0 || average <= 0) return 1;
  return damageAgainst(cls, armour) / open / average;
}

/**
 * How much an Empire lets what it has learned of enemy armour sway its yards:
 * a little, more for a careful one. Enough that a laser boat fleet meeting
 * armour-12 Dragons drifts towards heavier guns over time, not so much that it
 * answers every design at once, which a player could not hope to match.
 */
function armourWeight(faction: Faction): number {
  return 0.15 + 0.15 * faction.temper.caution;
}

/** Fighting value per MCr, the measure a yard order is chosen by. */
function valueFor(cls: ShipClass): number {
  return cls.strength / Math.max(1, cls.cost);
}

/**
 * Spend a budget on ships, best value first, with each repeat of a class
 * counting for a little less so a fleet is not one design fifty times over.
 */
export function chooseShips(classes: readonly ShipClass[], budget: number, minJump: number, jitter: () => number): string[] {
  const bought: string[] = [];
  const counts = new Map<string, number>();
  let left = budget;
  for (;;) {
    const options = classes.filter((c) => fighting(c) && c.cost <= left && c.jump >= minJump);
    if (options.length === 0) break;
    const scored = options
      .map((c) => ({ c, score: valueFor(c) * Math.pow(0.8, counts.get(c.id) ?? 0) * (0.8 + 0.4 * jitter()) }))
      .sort((a, b) => b.score - a.score);
    const pick = scored[0]!.c;
    bought.push(pick.id);
    counts.set(pick.id, (counts.get(pick.id) ?? 0) + 1);
    left -= pick.cost;
  }
  return bought;
}

/** Day zero: the computer buys its first fleet, split between guard and strike. */
export function aiStartingFleet(game: Game, faction: Faction): void {
  const classes = game.catalogue.all();
  const budget = faction.credits * 0.95;
  const guard = chooseShips(classes, budget * guardShare(faction.temper), 0, () => game.rng.next());
  const guardCost = guard.reduce((s, id) => s + game.catalogue.get(id).cost, 0);
  const strike = chooseShips(classes, budget - guardCost, STRIKE_JUMP, () => game.rng.next());
  const spend = (ids: string[]) => {
    faction.credits -= ids.reduce((s, id) => s + game.catalogue.get(id).cost, 0);
    return ids.flatMap((id) => game.commission(id));
  };
  if (guard.length > 0) {
    const f = game.newFleet(faction.id, faction.capital, "main", spend(guard), HOME_GUARD);
    f.standing = ordersFor(faction, "Guard");
  }
  if (strike.length > 0) {
    const f = game.newFleet(faction.id, faction.capital, "main", spend(strike));
    f.standing = ordersFor(faction, "Patrol");
  }
}

/** Strength of a world's defences as they stand, in the same measure as a fleet's. */
function defenceStrength(game: Game, at: string): number {
  const world = game.world(at);
  const ws = game.worldState(at);
  const navy = game.navyOf(at);
  const boats = navy.cls === undefined ? 0 : navy.boats * navy.cls.strength;
  if (ws.defence <= 0) return boats;
  const fire = defenceAttacks(world).reduce((t, a) => t + a.dice * 3.5 * a.multiple * a.count, 0.5);
  return Math.sqrt((ws.defence + defenceArmour(world) * 10) * fire) * (ws.defence / Math.max(1, defenceMax(world)) + 0.2) + boats;
}

/** Enemy strength a faction believes is at a system: what it sees, or last saw. */
function knownThreat(game: Game, faction: Faction, at: string, sees: ReadonlySet<string>): number {
  if (sees.has(at)) {
    return game
      .fleetsAt(at)
      .filter((f) => game.hostile(faction.id, f.owner))
      .reduce((s, f) => s + game.fleetStrength(f), 0);
  }
  const seen = Object.values(faction.intel)
    .filter((s) => s.system === at && s.left === undefined && game.state.day - s.day < 21)
    .reduce((t, s) => t + s.strength, 0);
  // Nobody leaves a world of theirs unwatched: expect something in orbit of an
  // enemy world, and a good deal more at an enemy capital.
  const owner = game.worldState(at).owner;
  if (owner === null || owner === faction.id) return seen;
  const guess = (game.faction(owner).capital === at ? 1.5 : 0.3) * defenceStrength(game, at) + 50;
  return Math.max(seen, guess);
}

/**
 * The nearest world of its own that can mend a fleet: any starport that
 * repairs hulls, or, for broken drives, one of class A to C, the only ones
 * that fix them.
 */
function nearestRepairYard(game: Game, fleet: Fleet, broken: boolean): string[] | null | "here" {
  const good = (at: string) => {
    const port = game.world(at).uwp.starport;
    return game.worldState(at).owner === fleet.owner && repairRate(port) > 0 && (!broken || fixesCrits(port));
  };
  if (good(fleet.system)) return "here";
  const map = jumpMap(game, fleet);
  let best: { at: string; hops: number } | null = null;
  for (const [at, step] of map) {
    if (!good(at)) continue;
    if (best === null || step.hops < best.hops) best = { at, hops: step.hops };
  }
  return best === null ? null : pathIn(map, fleet.system, best.at);
}

function build(game: Game, faction: Faction): void {
  if (faction.credits < RESERVE_MCR + 10) return;
  const own = game.ownedWorlds(faction.id).filter((w) => w.uwp.starport === "A" || w.uwp.starport === "B");
  // Independent yards too, the nearest few to the capital, at their markup.
  const foreign = game.state.sector.worlds
    .filter((w) => w.uwp.starport === "A" && game.worldState(w.at).owner === null)
    .sort((a, b) => distanceBetween(a.at, faction.capital) - distanceBetween(b.at, faction.capital))
    .slice(0, 2);
  const yards = [...own, ...foreign];
  if (yards.length === 0) return;
  // Not everything at once: a build queue a few deep is enough.
  if (faction.builds.length >= 3 + yards.length) return;
  const classes = game.catalogue.all();
  // Mostly ships that can go somewhere; a guard boat only when the guard at the
  // capital has fallen below a fifth of the faction's strength.
  const total = game.fleetsOf(faction.id).reduce((s, f) => s + game.fleetStrength(f), 0);
  const guardNow = game.fleetsOf(faction.id).filter((f) => f.name === HOME_GUARD).reduce((s, f) => s + game.fleetStrength(f), 0);
  const wantGuard = guardNow < total * guardShare(faction.temper) * 0.8;
  const wealth = Math.min(0.8, Math.max(0, Math.log10(faction.credits / 150) * 0.6));
  let best: { cls: ShipClass; at: string; score: number; price: number } | null = null;
  // What it has learned of its enemies' armour tilts the choice a little.
  const armour = faction.foeArmour;
  const weight = armour === undefined ? 0 : armourWeight(faction);
  const kept = armour === undefined ? [] : classes.filter(fighting).map((c) => (damageAgainst(c, 0) > 0 ? damageAgainst(c, armour) / damageAgainst(c, 0) : 1));
  const average = kept.length === 0 ? 1 : kept.reduce((s, x) => s + x, 0) / kept.length;
  const suits = (cls: ShipClass) => (armour === undefined ? 1 : 1 - weight + weight * Math.min(2, fitAgainst(cls, armour, average)));
  // A yard with a long queue is somewhere else's job.
  const busy = new Set(yards.filter((w) => game.scheduleAt(w.at, 1).start > game.state.day + 14).map((w) => w.at));
  for (const w of yards) {
    if (busy.has(w.at)) continue;
    for (const cls of classes) {
      const mine = game.worldState(w.at).owner === faction.id;
      const price = yardPrice(cls, mine);
      if (!fighting(cls) || price > faction.credits - RESERVE_MCR || !canBuildAt(w, cls)) continue;
      if (cls.jump < STRIKE_JUMP && !(wantGuard && w.at === faction.capital)) continue;
      const already = game.fleetsOf(faction.id).reduce((n, f) => n + f.ships.filter((sh) => sh.classId === cls.id).length, 0);
      // Slips are few, so a rich faction puts its money into bigger hulls
      // rather than a queue of cheap ones.
      const score = (cls.strength / price) * Math.pow(price, wealth) * Math.pow(0.9, already) * suits(cls) * (0.9 + 0.2 * game.rng.next());
      if (best === null || score > best.score) best = { cls, at: w.at, score, price };
    }
  }
  // Nothing that can go anywhere is to be had: a rich faction guards what it
  // has instead, with boats from its own yards.
  if (best === null && faction.credits > 400) {
    for (const w of own) {
      if (busy.has(w.at)) continue;
      for (const cls of classes) {
        if (!fighting(cls) || cls.jump > 0 || cls.cost > faction.credits - RESERVE_MCR || !canBuildAt(w, cls)) continue;
        const score = (cls.strength / cls.cost) * Math.pow(cls.cost, wealth) * suits(cls) * (0.9 + 0.2 * game.rng.next());
        if (best === null || score > best.score) best = { cls, at: w.at, score, price: cls.cost };
      }
    }
  }
  if (best === null) return;
  faction.credits -= best.price;
  const work = buildDaysFor(best.cls, game.state.options.buildSpeed);
  const today = game.state.day;
  faction.builds.push({ classId: best.cls.id, at: best.at, name: shipName(game.rng, game.shipNamesInUse()), placed: today, work, worked: 0, done: today + work });
  game.replanYard(best.at);
}

/** Fleets of one faction idle in one place become one fleet, guard kept apart. */
function gather(game: Game, faction: Faction): void {
  const idle = game.fleetsOf(faction.id).filter((f) => f.transit === null && f.order === null);
  for (let i = 0; i < idle.length; i++) {
    const a = idle[i]!;
    if (!game.state.fleets.includes(a)) continue;
    for (let j = i + 1; j < idle.length; j++) {
      const b = idle[j]!;
      if (!game.state.fleets.includes(b)) continue;
      if (a.system !== b.system || a.loc !== b.loc) continue;
      // The guard stays the guard: strike fleets do not fold into it, and it
      // does not wander off with them.
      if ((a.name === HOME_GUARD) !== (b.name === HOME_GUARD)) continue;
      game.mergeFleets(a, b);
    }
  }
  // Ships that cannot jump do not belong in a fleet that means to; at the
  // capital they join the guard.
  for (const f of game.fleetsOf(faction.id)) {
    if (f.transit !== null || f.order !== null || f.name === HOME_GUARD) continue;
    // Fighters in a carrier's hangars stay with it.
    const aboard = game.hangared(f);
    const lame = f.ships.filter((s) => game.cls(s).jump < STRIKE_JUMP && !aboard.has(s.id)).map((s) => s.id);
    if (lame.length > 0 && lame.length < f.ships.length) {
      const guardHere = game
        .fleetsAt(f.system, f.loc)
        .find((g) => g.owner === faction.id && g.name === HOME_GUARD && g.order === null);
      const made = game.splitFleet(f, lame);
      if (made !== null && guardHere !== undefined) {
        game.mergeFleets(guardHere, made);
      } else if (made !== null) {
        made.name = f.system === faction.capital ? HOME_GUARD : `${game.world(f.system).name} Guard`;
        made.standing = ordersFor(faction, "Guard");
      }
    }
  }
}

/** Hurt: go and mend. Returns whether the fleet was sent. */
function mend(game: Game, fleet: Fleet): boolean {
  const battered = game.fleetHullShare(fleet) < 0.6;
  const broken = fleet.ships.some((s) => s.crits.jump || s.crits.thrust > 0);
  if (!battered && !broken) return false;
  const damage = fleet.ships.some((s) => s.crits.jump)
    ? "a jump drive is damaged"
    : fleet.ships.some((s) => s.crits.thrust > 0)
      ? "a drive is damaged"
      : `the fleet is badly hurt (hull at ${Math.round(game.fleetHullShare(fleet) * 100)}%)`;
  // Broken drives want a yard that can fix them; if none is in reach, a
  // battered hull can still be patched at the nearest that repairs at all.
  let yard = broken ? nearestRepairYard(game, fleet, true) : null;
  if (yard === null && battered) yard = nearestRepairYard(game, fleet, false);
  if (yard === null) return false;
  if (yard === "here") {
    fleet.order = { kind: "repair" };
    because(fleet, `puts in for repairs at ${game.world(fleet.system).name}, because ${damage}.`);
    return true;
  }
  if (yard !== null) {
    fleet.standing = orders("Avoid battle");
    fleet.order = { kind: "jump", route: yard };
    because(fleet, `heads for ${game.world(yard.at(-1)!).name}, the nearest yard, to mend, because ${damage}.`);
    return true;
  }
  return false;
}

function strike(game: Game, faction: Faction, fleet: Fleet, sees: ReadonlySet<string>, by: Commander = staffOf(faction)): void {
  const here = game.worldState(fleet.system);
  const mine = game.fleetStrength(fleet);

  if (mend(game, fleet)) return;

  // At a world it does not hold: take it, or give up if it cannot.
  if (here.owner !== faction.id && (by.near === undefined || distanceBetween(by.near.at, fleet.system) <= by.near.parsecs)) {
    const against = defenceStrength(game, fleet.system) + knownThreat(game, faction, fleet.system, sees);
    if (mine >= against * nerve(by.temper)) {
      fleet.standing = ordersWith(by.temper, "Seek and destroy");
      if (fleet.loc !== "main") fleet.order = { kind: "move", to: "main" };
      because(fleet, `attacks ${game.world(fleet.system).name}, because ${odds(mine, against)}.`);
      return;
    }
  }

  // Short of fuel for anything: fill up.
  if (game.fleetRange(fleet) < game.fleetJump(fleet)) {
    fleet.order = { kind: "refuel" };
    because(fleet, `takes on fuel at ${game.world(fleet.system).name}, because the tanks are low.`);
    return;
  }

  // Somewhere worth taking.
  const map = jumpMap(game, fleet);
  const margin = oddsWanted(by.temper);
  let best: { at: string; score: number; need: number } | null = null;
  let looked = 0;
  for (const [at, step] of map) {
    if (step.hops > MAX_HOPS) continue;
    if (by.near !== undefined && distanceBetween(by.near.at, at) > by.near.parsecs) continue;
    const ws = game.worldState(at);
    if (ws.owner === faction.id) continue;
    const world = game.world(at);
    const need = defenceStrength(game, at) + knownThreat(game, faction, at, sees);
    looked++;
    if (mine < need * margin) continue;
    let value = income(world) * 3 + (world.uwp.population > 0 ? 2 : 0.2);
    value *= prize(by.temper, ws.owner !== null);
    if (ws.owner !== null && game.faction(ws.owner).capital === at) value *= 1.5;
    const score = value / Math.pow(step.hops + 1, 1.3);
    if (best === null || score > best.score) best = { at, score, need };
  }
  if (best !== null) {
    const route = pathIn(map, fleet.system, best.at);
    if (route !== null) {
      fleet.standing = travelling(by.temper);
      fleet.order = { kind: "jump", route };
      const world = game.world(best.at);
      const owner = game.worldState(best.at).owner;
      const r = best.need <= 0 ? Infinity : mine / best.need;
      const held = owner === null ? "an independent world" : game.faction(owner).capital === best.at ? `${game.faction(owner).name}'s capital` : `a ${game.faction(owner).name} world`;
      const looks = r >= 3 ? "lightly held" : r >= 1.6 ? "within our strength" : "a hard fight, but worth it";
      because(fleet, `heads for ${world.name}, because it looks a good target: ${held}, worth MCr${income(world).toFixed(1)} a week, and ${looks}.`);
      return;
    }
  }

  // Nothing it can take: home, to wait for more.
  goHome(game, fleet, by, looked === 0 ? "there is nothing within reach to take" : "there is nothing within reach it can beat");
}

function goHome(game: Game, fleet: Fleet, by: Commander, why: string): void {
  if (fleet.system !== by.home) {
    const route = routeTo(game, fleet, by.home);
    if (route !== null) {
      fleet.standing = travelling(by.temper);
      fleet.order = { kind: "jump", route };
      because(fleet, `heads home to ${game.world(by.home).name} to wait, because ${why}.`);
    }
  } else if (fleet.loc !== "main") {
    fleet.order = { kind: "move", to: "main" };
    because(fleet, `waits in orbit at ${game.world(by.home).name}, because ${why}.`);
  }
}

function guard(game: Game, faction: Faction, fleet: Fleet): void {
  if (fleet.system === faction.capital) {
    if (fleet.loc !== "main") fleet.order = { kind: "move", to: "main" };
    fleet.standing = ordersFor(faction, "Guard");
    return;
  }
  const route = routeTo(game, fleet, faction.capital);
  if (route !== null) {
    fleet.standing = travelling(faction.temper);
    fleet.order = { kind: "jump", route };
  }
}

/** Answer an enemy fleet sitting at one of our worlds, if a strike fleet can. */
function respond(game: Game, faction: Faction, sees: ReadonlySet<string>): Set<string> {
  const busy = new Set<string>();
  const threatened = game
    .ownedWorlds(faction.id)
    .map((w) => ({ at: w.at, threat: knownThreat(game, faction, w.at, sees), value: income(w) }))
    .filter((t) => t.threat > 0)
    .sort((a, b) => b.value - a.value);
  for (const t of threatened) {
    const candidates = game
      .fleetsOf(faction.id)
      .filter((f) => f.transit === null && f.order === null && f.name !== HOME_GUARD && !busy.has(f.id))
      .filter((f) => game.fleetStrength(f) > t.threat * 1.3 && game.fleetHullShare(f) >= 0.6);
    for (const f of candidates) {
      if (f.system === t.at) {
        f.standing = ordersFor(faction, "Patrol");
        busy.add(f.id);
        break;
      }
      const route = routeTo(game, f, t.at);
      if (route !== null && route.length <= 2) {
        f.standing = ordersFor(faction, "Patrol");
        f.order = { kind: "jump", route };
        busy.add(f.id);
        break;
      }
    }
  }
  return busy;
}

/**
 * A fleet that has fought in the same place three days running without
 * settling it stops: it keeps out of fights until it is on its way, so it can
 * take on fuel and go. A fleet guarding its own world fights on, and so does
 * one laying siege, unless five days have not silenced the defences.
 */
function standOff(game: Game, faction: Faction, fleets: readonly Fleet[], byOf: (f: Fleet) => Commander): void {
  const today = game.state.day;
  for (const fleet of fleets) {
    const f = fleet.fighting;
    if (fleet.transit !== null || f === undefined || f.last !== today - 1 || f.last - f.since < 2) continue;
    if (f.at !== fleet.system || f.loc !== fleet.loc) continue;
    const owner = game.worldState(fleet.system).owner;
    const sieging = fleet.loc === "main" && owner !== faction.id && fleet.standing.besiege && fleet.order === null;
    const guarding = owner === faction.id && fleet.order === null;
    if (guarding) continue;
    if (sieging) {
      // A siege holds once the defences are silenced. Five days of fighting
      // that has not got that far will not: give it up and go home.
      if (game.worldState(fleet.system).siege?.by === faction.id || f.last - f.since < 4) continue;
      const by = byOf(fleet);
      const route = routeTo(game, fleet, by.home);
      if (route !== null) {
        fleet.standing = travelling(by.temper);
        fleet.order = { kind: "jump", route };
        because(fleet, `gives up the siege of ${game.world(fleet.system).name} and heads home, because its defences are holding out.`);
        continue;
      }
    }
    fleet.standing = orders("Avoid battle");
    // Fuel first, where it is quiet, then on its way.
    if (fleet.order === null && game.fleetRange(fleet) < game.fleetJump(fleet)) fleet.order = { kind: "refuel" };
    const where = { main: "in orbit", gg: "at the gas giant", belt: "in the belt", deep: "at the jump point" }[fleet.loc];
    because(fleet, `pulls back from the fighting ${where} at ${game.world(fleet.system).name}, because ${f.last - f.since + 1} days of it have got nowhere.`);
  }
}

/* Admirals ---------------------------------------------------------------- */

/** How far from its base, in parsecs, an admiral looks for worlds to take. */
const CONQUER_NEAR = 10;
/** How far from its base an admiral defends a player's worlds. */
const DEFEND_NEAR = 6;

function admiralOf(fleet: Fleet): Commander {
  const a = fleet.admiral!;
  return { temper: ADMIRAL_TEMPERS[a.style], home: a.base, near: { at: a.base, parsecs: a.mission === "conquer" ? CONQUER_NEAR : DEFEND_NEAR } };
}

/**
 * An admiral defending: mend when hurt, fill up when short, go to the aid of
 * a world near its base that an enemy is at, if it can beat what is there,
 * and otherwise wait at its base on guard.
 */
function defend(game: Game, faction: Faction, fleet: Fleet, sees: ReadonlySet<string>, by: Commander): void {
  if (mend(game, fleet)) return;
  const mine = game.fleetStrength(fleet);
  const threats = game
    .ownedWorlds(faction.id)
    .filter((w) => distanceBetween(by.home, w.at) <= by.near!.parsecs)
    .map((w) => ({ at: w.at, threat: knownThreat(game, faction, w.at, sees), value: income(w) + (game.worldState(w.at).siege !== null ? 100 : 0) }))
    .filter((t) => t.threat > 0 && mine >= t.threat * nerve(by.temper))
    .sort((a, b) => b.value - a.value);
  const plight = (at: string) => (game.worldState(at).siege !== null ? ", under siege" : "");
  for (const t of threats) {
    if (t.at === fleet.system) {
      fleet.standing = ordersWith(by.temper, "Patrol");
      because(fleet, `stands and fights at ${game.world(t.at).name}, because the enemy is here${plight(t.at)} and ${odds(mine, t.threat)}.`);
      return;
    }
    if (game.fleetRange(fleet) < game.fleetJump(fleet)) {
      fleet.order = { kind: "refuel" };
      because(fleet, `takes on fuel at ${game.world(fleet.system).name} before going to ${game.world(t.at).name}'s aid, because the tanks are low.`);
      return;
    }
    const route = routeTo(game, fleet, t.at);
    if (route === null || route.length > 3) continue;
    fleet.standing = ordersWith(by.temper, "Patrol");
    fleet.order = { kind: "jump", route };
    because(fleet, `goes to ${game.world(t.at).name}'s aid, because an enemy was sighted there${plight(t.at)} and ${odds(mine, t.threat)}.`);
    return;
  }
  if (game.fleetRange(fleet) < game.fleetJump(fleet) && fleet.system !== by.home) {
    fleet.order = { kind: "refuel" };
    because(fleet, `takes on fuel at ${game.world(fleet.system).name}, because the tanks are low.`);
    return;
  }
  if (fleet.system === by.home) {
    fleet.standing = ordersWith(by.temper, "Guard");
    because(fleet, `stands guard at ${game.world(by.home).name}, because no enemy is in sight.`);
  }
  goHome(game, fleet, by, "no enemy is in sight");
}

/**
 * The day's orders for a player's fleets under admirals. They act on the
 * spot, as any fleet's captain does, and say where they are going and why.
 */
export function planAdmirals(game: Game, faction: Faction): void {
  const fleets = game.fleetsOf(faction.id).filter((f) => f.admiral !== undefined && f.order?.kind !== "garrison");
  if (fleets.length === 0) return;
  const sees = visibleSystems(game, faction.id);
  for (const f of fleets) {
    // A base lost: home to the capital instead.
    if (game.worldState(f.admiral!.base).owner !== faction.id) {
      const lost = game.world(f.admiral!.base).name;
      f.admiral = { ...f.admiral!, base: faction.capital };
      admiralNotice(game, f, `${lost} is lost; ${f.name}'s admiral now works from ${game.world(faction.capital).name}.`);
    }
  }
  // What each fleet was doing, so only a change is news.
  const doing = (f: Fleet) => JSON.stringify([f.order, f.standing.engage, f.standing.besiege, f.standing.evade, f.standing.intercept]);
  const before = new Map(fleets.map((f) => [f, doing(f)]));
  reasons.clear();
  standOff(game, faction, fleets, admiralOf);
  for (const fleet of fleets) {
    if (fleet.transit !== null || fleet.order !== null) continue;
    // Out of fuel with none to be had here: nothing an admiral can do.
    if (game.fleetJump(fleet) > 0 && game.fleetRange(fleet) < game.fleetJump(fleet) && !canRefuelAt(game, fleet, fleet.system)) {
      delete fleet.admiral;
      game.log({
        to: [fleet.owner],
        kind: "info",
        text: `${fleet.name}'s admiral hands the fleet back: it is out of fuel at ${game.world(fleet.system).name}, and there is none to be had there.`,
        at: fleet.system,
        wake: true,
        firsthand: [fleet.owner],
      });
      continue;
    }
    const by = admiralOf(fleet);
    if (fleet.admiral!.mission === "conquer") strike(game, faction, fleet, sees, by);
    else defend(game, faction, fleet, sees, by);
  }
  // Every change an admiral made today is news, with the reason for it.
  for (const fleet of fleets) {
    if (doing(fleet) === before.get(fleet)) continue;
    const why = reasons.get(fleet);
    admiralNotice(game, fleet, why === undefined ? `${fleet.name}'s admiral changes its orders.` : `${fleet.name}'s admiral ${why}`);
  }
  reasons.clear();
}

function admiralNotice(game: Game, fleet: Fleet, text: string): void {
  game.log({ to: [fleet.owner], kind: "info", text, at: fleet.system, firsthand: [fleet.owner] });
}

export function planAi(game: Game, faction: Faction): void {
  build(game, faction);
  gather(game, faction);
  const sees = visibleSystems(game, faction.id);
  const busy = respond(game, faction, sees);
  standOff(game, faction, game.fleetsOf(faction.id), () => staffOf(faction));
  for (const fleet of game.fleetsOf(faction.id)) {
    if (fleet.transit !== null || fleet.order !== null || busy.has(fleet.id)) continue;
    if (fleet.name === HOME_GUARD) guard(game, faction, fleet);
    else strike(game, faction, fleet, sees);
  }
}
