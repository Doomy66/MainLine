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

import type { Attack, ShipClass } from "../catalogue/shipclass";
import type { Game } from "./game";
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
  const fire = c.attacks.reduce((t, a) => t + a.dice * 3.5 * a.multiple * a.count * a.perSalvo * (a.ion ? 0.5 : 1), 0.5);
  return Math.sqrt((Math.max(0, c.hull) + c.armour * 10) * fire);
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
  return fleet.order === null || fleet.order.kind === "move";
}

/** Whether party a opens fire on party b of its own accord. */
function aggressor(a: Party, b: Party): boolean {
  if (a.side !== null && a.side === b.side) return false;
  if (a.side === null && b.side === null) return false;
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
function engagements(parties: Party[]): Map<Party, Party[]> {
  const out = new Map<Party, Party[]>();
  for (const a of parties) {
    if (!partyAlive(a)) continue;
    for (const b of parties) {
      if (a === b || !partyAlive(b)) continue;
      if (a.side === null && b.side === null) continue;
      if (aggressor(a, b) || aggressor(b, a)) {
        const held = out.get(a) ?? [];
        held.push(b);
        out.set(a, held);
      }
    }
  }
  return out;
}

/** How much a target priority favours a target, as a weight multiplier. */
function preference(priority: TargetPriority | undefined, c: Combatant, pool: Combatant[]): number {
  switch (priority) {
    case "warships":
      return c.attacks.length > 0 ? 4 : 1;
    case "unarmed":
      return c.attacks.length === 0 ? 6 : 1;
    case "largest":
      return c.tons >= Math.max(...pool.map((x) => x.tons)) ? 6 : 1;
    case "smallest":
      return c.tons <= Math.min(...pool.map((x) => x.tons)) ? 6 : 1;
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
  const pool = attack.heavy && live.some((c) => c.tons > 2000) ? live.filter((c) => c.tons > 2000) : live;
  const weights = pool.map((c) => Math.sqrt(Math.min(c.tons, 100_000)) * preference(priority, c, pool));
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
  if (attack.vsShips !== 0 && target.tons !== 1_000_000) parts.push(["orbital weapon", attack.vsShips]);
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
 * The round's fire, one line for each weapon of each ship at each target: how
 * many fired, what they needed, how many hit and for how much. Enough to see
 * who did what to whom, without a line for every laser.
 */
function describeShots(shots: readonly Shot[], lines: string[]): void {
  const groups = new Map<string, Shot[]>();
  for (const s of shots) {
    const key = `${s.from.label}|${s.attack.label}|${s.target.label}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  for (const group of groups.values()) {
    const first = group[0]!;
    const a = first.attack;
    const rolled = group.filter((s) => s.effect !== null);
    const hitting = rolled.filter((s) => s.effect! >= 0);
    const need = 8 - first.dm.total;
    const dms = first.dm.parts.length === 0 ? "no DMs" : first.dm.parts.join(", ");
    const what =
      a.ordnance !== undefined
        ? `${group.reduce((n, s) => n + s.launched, 0)} ${a.ordnance === "missile" ? "missile" : "torpedo"}${group.reduce((n, s) => n + s.launched, 0) === 1 ? "" : "s"} from ${group.length} ${a.label}`
        : `${group.length} × ${a.label}`;
    const stopped = group.reduce((n, s) => n + s.stopped, 0);
    const damage = hitting.map((s) => s.amount);
    const armourNote = first.armour > 0 ? `, armour ${first.armour}` : a.meson ? ", armour ignored" : "";
    const mult = a.multiple > 1 ? `, ×${a.multiple}` : "";
    lines.push(
      `    ${first.from.label} → ${first.target.label}: ${what}, needing ${need}+ (${dms}${armourNote}${mult}).` +
        `${stopped > 0 ? ` ${stopped} shot down.` : ""}` +
        ` ${hitting.length} of ${rolled.length} hit${hitting.length > 0 ? `, for ${damage.join(", ")}` : ""}.`,
    );
  }
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
    if (c.hull <= 0) lines.push(c.ship === undefined ? `  ${c.label} are silenced.` : `  ${c.label} is destroyed.`);
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
      tons: 1_000_000,
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
  const opening = engagements(parties);
  if (opening.size === 0) return null;

  const involved = [...opening.keys()];
  const lines: string[] = [];
  const before = new Map(involved.map((p) => [p, p.combatants.filter(alive).length]));
  for (let round = 1; round <= ROUNDS_PER_DAY; round++) {
    const engaged = engagements(parties);
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
        .filter((f) => aggressor(f, p))
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
    const firing = engagements(parties);
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
    describeShots(shots, lines);
    const dealt = new Map<Combatant, number>();
    for (const h of hits) dealt.set(h.target, (dealt.get(h.target) ?? 0) + h.amount);
    for (const [c, amount] of dealt) lines.push(`  ${c.label} takes ${amount} damage.`);
    if (hits.length === 0) lines.push("  No hits.");
    land(rng, hits, lines);
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
        `${p.label}: ${before.get(p)} in, ${lost.length} lost${lost.length > 0 ? ` (${lost.join(", ")})` : ""}${
          p.escaped && left > 0 ? ", broke off" : ""
        }.`,
      );
      if (p.escaped && left > 0) {
        fleet.loc = fleeTo(game, system, loc);
        if (fleet.order?.kind === "move") fleet.order = null;
      }
    } else if (p.worldAt !== undefined) {
      const batteries = p.combatants.find((c) => c.tons === 1_000_000);
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
