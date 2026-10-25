/**
 * A day of battle at one place in one system.
 *
 * Space combat in the manner of High Guard, cut down to what a strategic game
 * can resolve without asking anybody anything:
 *
 * - Every weapon fires once a round at an enemy. An attack hits on 8+ on 2D,
 *   plus the gunner, Fire Control software and the sensor suite, minus the
 *   target's Evade software (no more than its Thrust). Bays and spinal mounts
 *   are clumsy against small ships. The margin is the Effect.
 * - Damage is the weapon's dice plus the Effect, less armour (armour piercing
 *   and meson weapons excepted), times the mounting's damage multiple.
 * - Missiles and torpedoes are fired in salvos from a finite magazine. Point
 *   defence and laser turrets shoot some down; each that gets through hits on
 *   its own.
 * - Sandcasters scatter lasers; meson screens and nuclear dampers blunt the
 *   weapons they are built against.
 * - A ship suffers a critical hit for every tenth of its hull it loses and for
 *   any hit with an Effect of 6 or more. It is destroyed at no hull at all.
 * - At the start of each round a fleet that wants out — evasive, or down to
 *   its withdrawal point — tries to break off: 8+ on 2D plus the difference
 *   between its Thrust and its fastest pursuer's.
 *
 * All fire in a round is simultaneous: every attack is rolled, then all the
 * damage lands.
 */

import { strengthOf, type Attack, type ShipClass } from "../catalogue/shipclass";
import type { Game } from "./game";
import { allied } from "./relations";
import type { Rng } from "./rng";
import { defenceArmour, defenceAttacks, defenceFireControl, defenceMax, ROUNDS_PER_DAY } from "./rules";
import type { Fleet, Loc, Ship, TargetPriority } from "./types";
import { LOC_NAMES } from "./types";

interface Combatant {
  readonly label: string;
  readonly tons: number;
  readonly hullMax: number;
  hull: number;
  armour: number;
  thrust: number;
  evade: number;
  sensorDm: number;
  fireControl: number;
  gunnery: number;
  attacks: Attack[];
  readonly sandcasters: number;
  readonly pointDefence: number;
  readonly lasers: number;
  readonly mesonScreen: number;
  readonly nuclearDamper: number;
  missiles: number;
  torpedoes: number;
  readonly ship?: Ship;
  /** Missiles this combatant can still shoot down this round. */
  pdLeft: number;
  sandLeft: number;
  crits: number;
}

interface Party {
  readonly key: string;
  /** Faction id, or null for an independent world's defences. */
  readonly side: string | null;
  readonly label: string;
  readonly fleet?: Fleet;
  readonly worldAt?: string;
  readonly combatants: Combatant[];
  escaped: boolean;
  readonly startHull: number;
  /** Fighting value going in, for standing orders that only take on weaker fleets. */
  readonly strength: number;
}

export interface BattleReport {
  readonly system: string;
  readonly loc: Loc;
  /** Faction ids involved, who all hear of it. */
  readonly factions: readonly string[];
  readonly headline: string;
  readonly lines: readonly string[];
}

const DAMAGE_CRIT_EFFECT = 6;
/** A ship that survives a round takes no more than this many critical hits in it. */
const MAX_CRITS_PER_HIT = 3;

function alive(c: Combatant): boolean {
  return c.hull > 0;
}

function partyAlive(p: Party): boolean {
  return !p.escaped && p.combatants.some(alive);
}

function partyThrust(p: Party): number {
  const live = p.combatants.filter(alive);
  return live.length === 0 ? 0 : Math.min(...live.map((c) => c.thrust));
}

function partyHullShare(p: Party): number {
  const left = p.combatants.reduce((s, c) => s + Math.max(0, c.hull), 0);
  return p.startHull === 0 ? 0 : left / p.startHull;
}

/** A craft of a class that is not one of anybody's ships: a world's defence boat. */
function classCombatant(c: ShipClass, damage: number, label: string): Combatant {
  return {
    label,
    tons: c.tons,
    hullMax: c.hull,
    hull: c.hull - damage,
    armour: c.armour,
    thrust: c.thrust,
    evade: c.evade,
    sensorDm: c.sensorDm,
    fireControl: c.fireControl,
    gunnery: 1,
    attacks: c.attacks.map((a) => ({ ...a })),
    sandcasters: c.sandcasters,
    pointDefence: c.pointDefence,
    lasers: c.attacks.filter((a) => a.laser && a.multiple === 1).reduce((n, a) => n + a.count, 0),
    mesonScreen: c.mesonScreen,
    nuclearDamper: c.nuclearDamper,
    // Boats defending their own world reload between fights.
    missiles: c.missiles,
    torpedoes: c.torpedoes,
    pdLeft: 0,
    sandLeft: 0,
    crits: 0,
  };
}

/** Fighting value of a combatant as it stands, in the same measure as a class's strength. */
function combatantStrength(c: Combatant): number {
  return strengthOf(c.hull, c.armour, c.attacks);
}

/** A ship as it goes into battle, damage and critical hits and all. */
function shipCombatant(game: Game, ship: Ship): Combatant {
  const c = game.cls(ship);
  // Knocked-out weapons come off the end of the list, one mount at a time.
  let lost = ship.crits.weapons;
  const attacks: Attack[] = [];
  for (const a of [...c.attacks].reverse()) {
    const off = Math.min(lost, a.count);
    lost -= off;
    if (a.count - off > 0) attacks.unshift({ ...a, count: a.count - off });
  }
  return {
    label: `${ship.name} (${c.name})`,
    tons: c.tons,
    hullMax: c.hull,
    hull: c.hull - ship.damage,
    armour: Math.max(0, c.armour - ship.crits.armour),
    thrust: Math.max(0, c.thrust - ship.crits.thrust),
    evade: c.evade,
    sensorDm: c.sensorDm - ship.crits.sensors,
    fireControl: Math.max(0, c.fireControl - ship.crits.computer),
    gunnery: 1 - ship.crits.crew,
    attacks,
    sandcasters: c.sandcasters,
    pointDefence: c.pointDefence,
    lasers: attacks.filter((a) => a.laser && a.multiple === 1).reduce((n, a) => n + a.count, 0),
    mesonScreen: c.mesonScreen,
    nuclearDamper: c.nuclearDamper,
    missiles: ship.missiles,
    torpedoes: ship.torpedoes,
    ship,
    pdLeft: 0,
    sandLeft: 0,
    crits: 0,
  };
}

/** Whether a fleet is where it means to be, rather than on its way somewhere. */
export function besieging(fleet: Fleet): boolean {
  return fleet.order === null || fleet.order.kind === "move" || fleet.order.kind === "garrison";
}

/** Whether two factions are at war, so their ships and worlds fight. */
type War = (a: string, b: string) => boolean;

/** Whether party a opens fire on party b of its own accord. */
function aggressor(a: Party, b: Party, war: War): boolean {
  if (a.side !== null && a.side === b.side) return false;
  if (a.side === null && b.side === null) return false;
  // Empires at peace share an orbit without a shot fired.
  if (a.side !== null && b.side !== null && !war(a.side, b.side)) return false;
  // A fleet goes by its standing orders: which fleets to engage, and whether to
  // attack the defences of a world it does not own, which is a siege.
  if (a.fleet !== undefined) {
    const orders = a.fleet.standing;
    // A fleet passing through, or stopping to refuel, is not laying siege.
    if (b.worldAt !== undefined) return orders.besiege && besieging(a.fleet);
    if (orders.engage === "any") return true;
    if (orders.engage === "weaker") return a.strength > b.strength * 1.25;
    return false;
  }
  // Defences. A faction's worlds fire on every other faction's ships in orbit;
  // an independent world only on ships that are attacking it.
  if (a.side !== null) return true;
  return b.fleet !== undefined && b.fleet.standing.besiege && besieging(b.fleet);
}

/** Everyone in a place who is fighting someone, and whom each is fighting. */
function engagements(parties: Party[], war: War): Map<Party, Party[]> {
  const out = new Map<Party, Party[]>();
  for (const a of parties) {
    if (!partyAlive(a)) continue;
    for (const b of parties) {
      if (a === b || !partyAlive(b)) continue;
      if (a.side === null && b.side === null) continue;
      if (aggressor(a, b, war) || aggressor(b, a, war)) {
        const held = out.get(a) ?? [];
        held.push(b);
        out.set(a, held);
      }
    }
  }
  return out;
}

/** How much one battle moves the computer's idea of its enemies' armour. */
const FOE_LEARNING = 0.15;

/** The tons a world's defences count as: a million, for they are a world. */
const DEFENCE_TONS = 1_000_000;

/**
 * How big a target looks to a gunner choosing one. A world's defences count
 * as no bigger than the largest ship beside them: sized as the world they
 * are, they drew most of every fleet's fire and let the boats defending them
 * fight on untouched.
 */
function sizeAsTarget(c: Combatant, live: readonly Combatant[]): number {
  if (c.tons !== DEFENCE_TONS) return c.tons;
  const ships = live.filter((x) => x.tons !== DEFENCE_TONS).map((x) => x.tons);
  return ships.length === 0 ? c.tons : Math.max(...ships);
}

/** How much a target priority favours a target, as a weight multiplier. */
function preference(priority: TargetPriority | undefined, c: Combatant, pool: Combatant[], live: readonly Combatant[]): number {
  switch (priority) {
    case "warships":
      return c.attacks.length > 0 ? 4 : 1;
    case "unarmed":
      return c.attacks.length === 0 ? 6 : 1;
    case "largest":
      return sizeAsTarget(c, live) >= Math.max(...pool.map((x) => sizeAsTarget(x, live))) ? 6 : 1;
    case "smallest":
      return sizeAsTarget(c, live) <= Math.min(...pool.map((x) => sizeAsTarget(x, live))) ? 6 : 1;
    case "damaged":
      return 1 + 5 * (1 - Math.max(0, c.hull) / c.hullMax);
    default:
      return 1;
  }
}

function pickTarget(
  rng: Rng,
  attack: Attack,
  enemies: Combatant[],
  priority: TargetPriority | undefined,
): Combatant | undefined {
  const live = enemies.filter(alive);
  if (live.length === 0) return undefined;
  // Heavy guns look for heavy targets; everything else goes by the fleet's
  // target priority, with bigger ships being easier to find.
  const size = (c: Combatant) => sizeAsTarget(c, live);
  const pool = attack.heavy && live.some((c) => size(c) > 2000) ? live.filter((c) => size(c) > 2000) : live;
  // Orbital weapons, poor against ships, are laid on the world's defences.
  const orbital = (c: Combatant) => (attack.vsShips < 0 && c.tons === DEFENCE_TONS ? 6 : 1);
  const weights = pool.map((c) => Math.sqrt(Math.min(size(c), 100_000)) * preference(priority, c, pool, live) * orbital(c));
  let r = rng.next() * weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

interface Hit {
  readonly target: Combatant;
  readonly amount: number;
  readonly effect: number;
}

/** The modifiers to one attack, each named, so a battle report can show its working. */
function attackDms(from: Combatant, target: Combatant, attack: Attack): { total: number; parts: string[] } {
  const parts: [string, number][] = [
    ["gunner", from.gunnery],
    ["fire control", from.fireControl],
    ["sensors", Math.max(-2, Math.min(2, from.sensorDm))],
    ["evade", -Math.min(target.evade, target.thrust)],
  ];
  // Ground-attack weapons against anything that can dodge; a world's defences cannot.
  if (attack.vsShips !== 0 && target.tons !== DEFENCE_TONS) parts.push(["orbital weapon", attack.vsShips]);
  if (attack.ordnance !== undefined) parts.push(["smart", 2]);
  else if (attack.heavy) parts.push(["small target", target.tons <= 100 ? -4 : target.tons <= 2000 ? -2 : 0]);
  const shown = parts.filter(([, v]) => v !== 0);
  return {
    total: parts.reduce((t, [, v]) => t + v, 0),
    parts: shown.map(([k, v]) => `${k} ${v > 0 ? "+" : ""}${v}`),
  };
}

function armourAgainst(target: Combatant, attack: Attack): number {
  if (attack.meson) return 0;
  return Math.max(0, target.armour - attack.ap);
}

/** One attack as it happened, for the report. */
interface Shot {
  readonly from: Combatant;
  readonly target: Combatant;
  readonly attack: Attack;
  readonly dm: { total: number; parts: string[] };
  /** Missiles or torpedoes launched, and how many point defence stopped. */
  readonly launched: number;
  readonly stopped: number;
  /** Null where nothing got through to roll for. */
  readonly effect: number | null;
  readonly armour: number;
  readonly amount: number;
}

/** One shot, or one salvo, from one weapon. */
function fire(
  rng: Rng,
  from: Combatant,
  attack: Attack,
  enemies: Combatant[],
  hits: Hit[],
  priority: TargetPriority | undefined,
  shots: Shot[],
): void {
  const target = pickTarget(rng, attack, enemies, priority);
  if (target === undefined) return;
  const dm = attackDms(from, target, attack);
  const armour = armourAgainst(target, attack);
  let salvo = 1;
  let launched = 0;
  let stopped = 0;
  if (attack.ordnance !== undefined) {
    const store = attack.ordnance === "missile" ? "missiles" : "torpedoes";
    // Defences have magazines deep enough not to count.
    if (from.ship !== undefined) {
      if (from[store] < attack.perSalvo) return;
      from[store] -= attack.perSalvo;
    }
    salvo = attack.perSalvo;
    launched = salvo;
    stopped = Math.min(target.pdLeft, salvo);
    target.pdLeft -= stopped;
    salvo -= stopped;
    if (salvo === 0) {
      shots.push({ from, target, attack, dm, launched, stopped, effect: null, armour, amount: 0 });
      return;
    }
  }
  const effect = rng.twoD() + dm.total - 8;
  if (effect < 0) {
    shots.push({ from, target, attack, dm, launched, stopped, effect, armour, amount: 0 });
    return;
  }
  let amount = 0;
  if (attack.ordnance !== undefined) {
    for (let i = 0; i < salvo; i++) amount += Math.max(0, rng.roll(attack.dice) + (i === 0 ? effect : 0) - armour);
  } else {
    let base = rng.roll(attack.dice) + effect - armour;
    if (attack.laser && target.sandLeft > 0) {
      target.sandLeft--;
      base -= rng.d6();
    }
    if (attack.meson && target.mesonScreen > 0) base -= rng.roll(2 * target.mesonScreen);
    if (attack.radiation && target.nuclearDamper > 0) base -= rng.roll(target.nuclearDamper);
    amount = Math.max(0, base) * attack.multiple;
  }
  if (attack.ion) amount = Math.floor(amount / 2);
  shots.push({ from, target, attack, dm, launched, stopped, effect, armour, amount });
  if (amount > 0) hits.push({ target, amount, effect });
}

/**
 * How many lines of each part of a round a report keeps: fire, damage, and
 * critical hits and losses. A battle between big fleets otherwise writes
 * hundreds of lines a round, which nobody reads and every save carries.
 */
const REPORT_FIRE_LINES = 8;
const REPORT_DAMAGE_LINES = 8;
const REPORT_AFTERMATH_LINES = 12;

/**
 * The most telling of some lines, in their own order: those that weigh most,
 * the earlier on a tie.
 */
function keepMost<T>(items: readonly T[], max: number, weight: (t: T) => number): { kept: T[]; rest: T[] } {
  if (items.length <= max) return { kept: [...items], rest: [] };
  const chosen = new Set(
    items
      .map((t, i) => ({ i, w: weight(t) }))
      .sort((a, b) => b.w - a.w || a.i - b.i)
      .slice(0, max)
      .map((x) => x.i),
  );
  return { kept: items.filter((_, i) => chosen.has(i)), rest: items.filter((_, i) => !chosen.has(i)) };
}

/**
 * The round's fire, one line for each weapon of each ship at each target: how
 * many fired, what they needed, how many hit and for how much. Enough to see
 * who did what to whom, without a line for every laser. In a big battle only
 * the heaviest fire is told line by line, and the rest is added up by side.
 */
function describeShots(shots: readonly Shot[], lines: string[], sideOf: ReadonlyMap<Combatant, string>): void {
  const groups = new Map<string, Shot[]>();
  for (const s of shots) {
    const key = `${s.from.label}|${s.attack.label}|${s.target.label}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const told = [...groups.values()].map((group) => {
    const first = group[0]!;
    const a = first.attack;
    const rolled = group.filter((s) => s.effect !== null);
    const hitting = rolled.filter((s) => s.effect! >= 0);
    const need = 8 - first.dm.total;
    const dms = first.dm.parts.length === 0 ? "no DMs" : first.dm.parts.join(", ");
    const fired = a.ordnance !== undefined ? group.reduce((n, s) => n + s.launched, 0) : group.length;
    const what =
      a.ordnance !== undefined
        ? `${fired} ${a.ordnance === "missile" ? "missile" : "torpedo"}${fired === 1 ? "" : "s"} from ${group.length} ${a.label}`
        : `${group.length} × ${a.label}`;
    const stopped = group.reduce((n, s) => n + s.stopped, 0);
    const damage = hitting.map((s) => s.amount);
    const armourNote = first.armour > 0 ? `, armour ${first.armour}` : a.meson ? ", armour ignored" : "";
    const mult = a.multiple > 1 ? `, ×${a.multiple}` : "";
    const line =
      `    ${first.from.label} → ${first.target.label}: ${what}, needing ${need}+ (${dms}${armourNote}${mult}).` +
      `${stopped > 0 ? ` ${stopped} shot down.` : ""}` +
      ` ${hitting.length} of ${rolled.length} hit${hitting.length > 0 ? `, for ${damage.join(", ")}` : ""}.`;
    return { line, side: sideOf.get(first.from) ?? first.from.label, fired, hits: hitting.length, damage: damage.reduce((t, d) => t + d, 0) };
  });
  const { kept, rest } = keepMost(told, REPORT_FIRE_LINES, (t) => t.damage);
  for (const t of kept) lines.push(t.line);
  if (rest.length === 0) return;
  lines.push("    The rest of the fire, side by side:");
  const bySide = new Map<string, { fired: number; hits: number; damage: number }>();
  for (const t of rest) {
    const sum = bySide.get(t.side) ?? { fired: 0, hits: 0, damage: 0 };
    bySide.set(t.side, { fired: sum.fired + t.fired, hits: sum.hits + t.hits, damage: sum.damage + t.damage });
  }
  for (const [side, sum] of bySide) {
    lines.push(`      ${side}: ${sum.fired} shot${sum.fired === 1 ? "" : "s"}, ${sum.hits > 0 ? `${sum.hits} hit, for ${sum.damage} in all` : "none hit"}.`);
  }
}

/** The round's damage, ship by ship, the worst of it in full. */
function describeDamage(dealt: ReadonlyMap<Combatant, number>, lines: string[]): void {
  const { kept, rest } = keepMost([...dealt], REPORT_DAMAGE_LINES, ([, amount]) => amount);
  for (const [c, amount] of kept) lines.push(`  ${c.label} takes ${amount} damage.`);
  if (rest.length > 0) {
    const total = rest.reduce((t, [, amount]) => t + amount, 0);
    lines.push(rest.length === 1 ? `  And one more takes ${total} damage.` : `  And ${rest.length} more take ${total} damage between them.`);
  }
}

/**
 * The round's critical hits and losses. A world's defences falling silent is
 * always told; past that, losses come before critical hits.
 */
function describeAftermath(after: readonly string[], lines: string[]): void {
  const lost = (l: string) => l.endsWith(" is destroyed.");
  const { kept, rest } = keepMost(after, REPORT_AFTERMATH_LINES, (l) => (l.endsWith(" are silenced.") ? 2 : lost(l) ? 1 : 0));
  lines.push(...kept);
  const crits = rest.filter((l) => !lost(l)).length;
  const sunk = rest.length - crits;
  const parts = [crits > 0 ? `${crits} more critical hit${crits === 1 ? "" : "s"}` : "", sunk > 0 ? `${sunk} more ship${sunk === 1 ? "" : "s"} destroyed` : ""].filter((p) => p !== "");
  if (parts.length > 0) lines.push(`  And ${parts.join(" and ")}.`);
}

/** The ships a side lost, by name, up to a score of them. */
function namesOf(lost: readonly string[]): string {
  const max = 20;
  return lost.length <= max ? lost.join(", ") : `${lost.slice(0, max).join(", ")} and ${lost.length - max} more`;
}

/** Critical hits, High Guard's location table cut to what the game tracks. */
function critical(rng: Rng, c: Combatant, lines: string[]): void {
  c.crits++;
  const ship = c.ship;
  if (ship === undefined) return;
  const roll = rng.twoD();
  const crits = ship.crits;
  let what: string;
  switch (roll) {
    case 2:
    case 12:
      crits.computer++;
      c.fireControl = Math.max(0, c.fireControl - 1);
      what = "computer";
      break;
    case 3:
    case 11:
      crits.crew++;
      c.gunnery--;
      what = "crew casualties";
      break;
    case 4:
      ship.fuel = Math.max(0, ship.fuel * (1 - rng.d6() / 10));
      what = "fuel tanks holed";
      break;
    case 5:
    case 9:
      crits.weapons++;
      if (c.attacks.length > 0) {
        const last = c.attacks[c.attacks.length - 1]!;
        if (last.count > 1) c.attacks[c.attacks.length - 1] = { ...last, count: last.count - 1 };
        else c.attacks.pop();
      }
      what = "weapon knocked out";
      break;
    case 6:
      crits.armour++;
      c.armour = Math.max(0, c.armour - 1);
      what = "armour breached";
      break;
    case 7: {
      const extra = rng.d6();
      c.hull -= extra;
      what = `hull, ${extra} more damage`;
      break;
    }
    case 8:
      crits.thrust++;
      c.thrust = Math.max(0, c.thrust - 1);
      what = "manoeuvre drive";
      break;
    case 10:
      crits.jump = true;
      what = "jump drive disabled";
      break;
    default:
      crits.sensors++;
      c.sensorDm--;
      what = "sensors";
  }
  lines.push(`  ${c.label}: critical hit, ${what}.`);
}

/**
 * All of a round's damage lands at once. Critical hits are worked out per ship
 * for the round rather than per hit, and not at all for a ship that did not
 * survive it: a wreck does not need its every system listed.
 */
function land(rng: Rng, hits: Hit[], lines: string[]): void {
  const byTarget = new Map<Combatant, { amount: number; effect: number }>();
  for (const hit of hits) {
    const held = byTarget.get(hit.target) ?? { amount: 0, effect: 0 };
    byTarget.set(hit.target, { amount: held.amount + hit.amount, effect: Math.max(held.effect, hit.effect) });
  }
  for (const [c, { amount, effect }] of byTarget) {
    if (c.hull <= 0) continue;
    const before = c.hull;
    c.hull -= amount;
    if (c.ship !== undefined && c.hull > 0) {
      const step = c.hullMax / 10;
      const crossed = Math.floor((c.hullMax - c.hull) / step) - Math.floor((c.hullMax - before) / step);
      const count = Math.min(MAX_CRITS_PER_HIT, crossed + (effect >= DAMAGE_CRIT_EFFECT ? 1 : 0));
      for (let i = 0; i < count && c.hull > 0; i++) critical(rng, c, lines);
    }
    // Batteries fall silent; a navy boat, though nobody's ship, is destroyed like one.
    if (c.hull <= 0) lines.push(c.tons === DEFENCE_TONS ? `  ${c.label} are silenced.` : `  ${c.label} is destroyed.`);
  }
}

/** Where a fleet that breaks off goes: anywhere in the system but here. */
function fleeTo(game: Game, system: string, from: Loc): Loc {
  const w = game.world(system);
  const options: Loc[] = ["deep", "belt", "gg", "main"];
  return options.find((l) => l !== from && (l !== "belt" || w.pbg.belts > 0) && (l !== "gg" || w.pbg.giants > 0)) ?? "deep";
}

/**
 * Fight whatever battle there is at one place today. Returns null where nobody
 * there is fighting anybody.
 */
export function battleAt(game: Game, system: string, loc: Loc): BattleReport | null {
  const rng = game.rng;
  const world = game.world(system);
  const ws = game.worldState(system);
  const parties: Party[] = [];
  for (const fleet of game.fleetsAt(system, loc)) {
    if (fleet.ships.length === 0) continue;
    const combatants = fleet.ships.map((s) => shipCombatant(game, s));
    parties.push({
      key: fleet.id,
      side: fleet.owner,
      label: `${game.faction(fleet.owner).name} ${fleet.name}`,
      fleet,
      combatants,
      escaped: false,
      startHull: combatants.reduce((s, c) => s + c.hull, 0),
      strength: game.fleetStrength(fleet),
    });
  }
  const navy = ws.navy ?? null;
  const navyClass = navy !== null && game.catalogue.has(navy.classId) ? game.catalogue.get(navy.classId) : undefined;
  const boats = navyClass === undefined ? [] : navy!.boats;
  if (loc === "main" && (ws.defence > 0 || boats.length > 0) && world.uwp.population > 0) {
    const attacks = defenceAttacks(world);
    const defences: Combatant = {
      label: `${world.name} defences`,
      tons: DEFENCE_TONS,
      hullMax: defenceMax(world),
      hull: ws.defence,
      armour: defenceArmour(world),
      thrust: 0,
      evade: 0,
      sensorDm: 0,
      fireControl: defenceFireControl(world),
      gunnery: 1,
      attacks,
      sandcasters: 0,
      pointDefence: world.uwp.tl >= 10 ? 2 * Math.max(1, world.uwp.population - 4) : 0,
      lasers: 0,
      mesonScreen: world.uwp.tl >= 13 ? 1 : 0,
      nuclearDamper: world.uwp.tl >= 12 ? 1 : 0,
      missiles: 0,
      torpedoes: 0,
      pdLeft: 0,
      sandLeft: 0,
      crits: 0,
    };
    // The planetary navy fights beside the batteries.
    const navyCombatants = boats.map((damage, i) => classCombatant(navyClass!, damage, `${world.name} navy ${navyClass!.name} ${i + 1}`));
    const combatants = [...(ws.defence > 0 ? [defences] : []), ...navyCombatants];
    parties.push({
      key: `def:${system}`,
      side: ws.owner,
      label: ws.owner === null ? `independent ${world.name}` : `${world.name} (${game.faction(ws.owner).name})`,
      worldAt: system,
      combatants,
      escaped: false,
      startHull: combatants.reduce((s, c) => s + c.hull, 0),
      strength: combatants.reduce((s, c) => s + combatantStrength(c), 0),
    });
  }
  if (parties.length < 2) return null;
  // Allies in the same place fight on the same side: an Empire fights
  // whoever is at war with an ally of its present here, as well as its own
  // enemies.
  const present = [...new Set(parties.map((p) => p.side).filter((s): s is string => s !== null))];
  const war: War = (a, b) =>
    game.hostile(a, b) ||
    (!allied(game, a, b) &&
      present.some((x) => x !== a && x !== b && ((allied(game, a, x) && game.hostile(x, b)) || (allied(game, b, x) && game.hostile(a, x)))));
  const opening = engagements(parties, war);
  if (opening.size === 0) return null;

  const involved = [...opening.keys()];
  const lines: string[] = [];
  const sideOf = new Map(involved.flatMap((p) => p.combatants.map((c) => [c, p.label] as const)));
  const before = new Map(involved.map((p) => [p, p.combatants.filter(alive).length]));
  for (let round = 1; round <= ROUNDS_PER_DAY; round++) {
    const engaged = engagements(parties, war);
    if (engaged.size === 0) break;
    lines.push(`Round ${round}:`);
    // Breaking off.
    for (const [p, foes] of engaged) {
      if (p.fleet === undefined) continue;
      const wants = p.fleet.standing.evade || partyHullShare(p) <= p.fleet.standing.withdrawAt;
      if (!wants) continue;
      // Only a real threat can hold a fleet: an armed, armoured ship that can
      // move, in a force not trivial beside the fleet it is chasing. A boat that
      // cannot hurt you does not keep you under a world's guns.
      const fleeing = p.combatants.filter(alive).reduce((s, c) => s + combatantStrength(c), 0);
      const chasers = foes
        .filter((f) => aggressor(f, p, war))
        .map((f) => f.combatants.filter((c) => alive(c) && c.thrust > 0 && c.armour > 0 && c.attacks.length > 0))
        .filter((cs) => cs.length > 0 && cs.reduce((s, c) => s + combatantStrength(c), 0) >= fleeing * 0.25);
      const chase = chasers.length === 0 ? 0 : Math.max(...chasers.map((cs) => Math.max(...cs.map((c) => c.thrust))));
      const roll = rng.twoD() + partyThrust(p) - chase;
      if (chasers.length === 0 || roll >= 8) {
        p.escaped = true;
        lines.push(`  ${p.label} breaks off.`);
      } else {
        lines.push(`  ${p.label} tries to break off and cannot.`);
      }
    }
    const firing = engagements(parties, war);
    for (const p of firing.keys()) {
      for (const c of p.combatants) {
        c.pdLeft = c.pointDefence > 0 ? rng.roll(c.pointDefence) : 0;
        for (let i = 0; i < c.lasers; i++) if (rng.d6() === 6) c.pdLeft++;
        c.sandLeft = c.sandcasters;
      }
    }
    const hits: Hit[] = [];
    const shots: Shot[] = [];
    for (const [p, foes] of firing) {
      const enemies = foes.flatMap((f) => f.combatants);
      for (const c of p.combatants) {
        if (!alive(c)) continue;
        for (const attack of c.attacks) {
          for (let i = 0; i < attack.count; i++) fire(rng, c, attack, enemies, hits, p.fleet?.standing.target, shots);
        }
      }
    }
    describeShots(shots, lines, sideOf);
    const dealt = new Map<Combatant, number>();
    for (const h of hits) dealt.set(h.target, (dealt.get(h.target) ?? 0) + h.amount);
    describeDamage(dealt, lines);
    if (hits.length === 0) lines.push("  No hits.");
    const after: string[] = [];
    land(rng, hits, after);
    describeAftermath(after, lines);
  }

  // What each computer Empire learns of its enemies' armour: a rough average of
  // the ships it met, weighed by size, that moves only a little each battle.
  for (const p of involved) {
    if (p.side === null) continue;
    const learner = game.faction(p.side);
    if (learner.human) continue;
    const met = involved
      .filter((q) => q.side !== p.side && q.side !== null)
      .flatMap((q) => q.combatants)
      .filter((c) => c.tons < DEFENCE_TONS);
    const tons = met.reduce((t, c) => t + c.tons, 0);
    if (tons === 0) continue;
    const seen = met.reduce((t, c) => t + c.armour * c.tons, 0) / tons;
    learner.foeArmour = learner.foeArmour === undefined ? seen : learner.foeArmour * (1 - FOE_LEARNING) + seen * FOE_LEARNING;
  }

  // Write back what happened.
  const factions = new Set<string>();
  const summary: string[] = [];
  for (const p of involved) {
    if (p.side !== null) factions.add(p.side);
    if (p.fleet !== undefined) {
      const fleet = p.fleet;
      const lost: string[] = [];
      for (const c of p.combatants) {
        const ship = c.ship!;
        ship.damage = Math.min(c.hullMax, c.hullMax - c.hull);
        ship.missiles = c.missiles;
        ship.torpedoes = c.torpedoes;
        if (c.hull <= 0) lost.push(c.label);
      }
      fleet.ships = fleet.ships.filter((s) => s.damage < game.cls(s).hull);
      const left = fleet.ships.length;
      summary.push(
        `${p.label}: ${before.get(p)} in, ${lost.length} lost${lost.length > 0 ? ` (${namesOf(lost)})` : ""}${
          p.escaped && left > 0 ? ", broke off" : ""
        }.`,
      );
      if (p.escaped && left > 0) {
        fleet.loc = fleeTo(game, system, loc);
        if (fleet.order?.kind === "move") fleet.order = null;
      }
    } else if (p.worldAt !== undefined) {
      const batteries = p.combatants.find((c) => c.tons === DEFENCE_TONS);
      if (batteries !== undefined) ws.defence = Math.max(0, Math.round(batteries.hull));
      ws.fought = game.state.day;
      const max = defenceMax(world);
      const boatsIn = p.combatants.filter((c) => c !== batteries);
      const boatsLeft = boatsIn.filter(alive);
      if (navy !== null && navyClass !== undefined) navy.boats = boatsLeft.map((c) => c.hullMax - c.hull);
      const parts = [
        ws.defence === 0 ? "defences silenced" : `defences at ${Math.round((100 * ws.defence) / Math.max(1, max))}%`,
        boatsIn.length === 0 ? "" : `navy ${boatsLeft.length} of ${boatsIn.length} boats left`,
      ].filter((x) => x !== "");
      summary.push(`${p.label}: ${parts.join(", ")}.`);
    }
  }
  const names = involved.map((p) => p.label);
  return {
    system,
    loc,
    factions: [...factions],
    headline: `Battle at ${world.name}, ${LOC_NAMES[loc].toLowerCase()}: ${names.join(" against ")}.`,
    lines: [...summary, "", ...lines],
  };
}
