/**
 * How the Empires stand with one another: a score for every pair from -100 to
 * 100, and whether they are at war.
 *
 * Every Empire used to be at war with every other from the first day. Now each
 * pair starts somewhere: two Empires of one polity as friends, two rivals with
 * a border between them close to blows, and most pairs at an uneasy peace.
 * What happens moves the score: a world taken, a battle, a siege, a border
 * pressed, a common enemy. Over the weeks each pair drifts back towards where
 * it started, so old friends make up and old enemies stay wary.
 *
 * Peace holds until the score falls far enough for one side to declare war,
 * and a war ends when it climbs back. Friends do fall out. An Empire with no
 * independent world it could take and no enemy within reach grows restless
 * with the neighbours it is at peace with, the more so the bolder and
 * hungrier it is, and in time that is a war even between two halves of one
 * polity.
 *
 * Players declare war themselves. The computer declares war on them as it does
 * on anyone, but only a player can end a war with a player.
 */

import { attackDamage, STRENGTH_ARMOUR } from "../catalogue/shipclass";
import { distanceBetween } from "../sector/hex";
import { clientOf, polityFamily } from "../sector/polities";
import type { Polity, SectorData, World } from "../sector/sec";
import type { Game } from "./game";
import { defenceArmour, defenceAttacks, isWeekEnd } from "./rules";
import { Rng, seedOf } from "./rng";
import type { Faction, Offer, Relation } from "./types";

/** At or below this, a pair at peace goes to war. */
export const WAR_AT = -40;
/** At or above this, two computer Empires at war make peace. */
export const PEACE_AT = 10;
/** How much of the way back to its starting score a pair drifts in a week. */
const DRIFT = 0.05;
/** Parsecs within which an Empire counts as having something to take, and a neighbour as a neighbour. */
const REACH = 4;
/** Parsecs within which two Empires' worlds make them neighbours from the first day. */
const BORDER = 2;
/** Days after the last battle or capture between two Empires before they will talk peace. */
const COOLING = 14;
/** How much a week of a war with no fighting in it raises the score. */
const WEARINESS = 5;
/** The share of victory at which an Empire's neighbours start to fear it. */
const FEAR_FROM = 0.75;
/** How far a week of that fear lowers a neighbour's score, when the leader is one step from winning. */
const FEAR = 4;
/** Days after a peace before an Empire with nothing to take grows restless with the same neighbour. */
const RESTLESS_AFTER = 120;

export function relationKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** The pair's standing, where the game keeps one. */
export function relationOf(game: Game, a: string, b: string): Relation | undefined {
  return game.state.relations?.[relationKey(a, b)];
}

/**
 * Whether two Empires are at war. A game from before relations has no record
 * of them, and there everyone is at war with everyone, as it always was.
 */
export function atWar(game: Game, a: string, b: string): boolean {
  if (a === b) return false;
  const relations = game.state.relations;
  if (relations === undefined) return true;
  return relations[relationKey(a, b)]?.war ?? true;
}

/** The score in a word, for a player. */
export function describeScore(score: number): string {
  if (score >= 60) return "friendly";
  if (score >= 25) return "cordial";
  if (score > -10) return "wary";
  if (score > WAR_AT) return "cold";
  return "hostile";
}

/* Starting ------------------------------------------------------------------ */

/** What sort of rule a government code is, for whether two get on. */
function rule(world: World | undefined): "many" | "few" | "one" | "other" {
  const g = world?.uwp.government ?? 0;
  if (g === 2 || g === 4) return "many";
  if ([1, 3, 5, 8, 9, 12].includes(g)) return "few";
  if ([10, 11, 13, 14, 15].includes(g)) return "one";
  return "other";
}

/** Two pieces of one Main that was too big to be one Empire. */
function splitKin(a: Faction, b: Faction): boolean {
  return a.splitFrom !== undefined && a.splitFrom === b.splitFrom;
}

/**
 * How two Empires stand by where they came from. Two pieces of one Main start
 * as Empires of one polity do. Otherwise it goes by polity: by the polities'
 * names where the sector gives them, so that the Thoengling Empire and the
 * Thirz Empire, VThE and VTzE, are strangers for all their codes look alike,
 * and by the codes where it does not. A client state is not a polity: each of
 * its Mains is a small state of its own, so two of them share a patron and no
 * more, even under one code.
 */
function kinship(a: Faction, b: Faction, polities: readonly Polity[] | undefined): number {
  if (splitKin(a, b)) return 70;
  const x = a.allegiance;
  const y = b.allegiance;
  if (x === undefined || y === undefined) return 0;
  const client = (code: string) => code.startsWith("Cs");
  if (x === y && !client(x)) return 70;
  const byName = [x, y].every((code) => (client(code) ? clientOf(polities, code) : polityFamily(polities, code)) !== "");
  const family = (code: string) => (client(code) ? null : byName ? polityFamily(polities, code) : code.slice(0, 2));
  const patron = (code: string) => (!client(code) ? null : byName ? clientOf(polities, code) : code.slice(2, 4));
  if (family(x) !== null && family(x) === family(y)) return 50;
  if (patron(x) !== null && patron(x) === family(y)) return 40;
  if (patron(y) !== null && patron(y) === family(x)) return 40;
  if (patron(x) !== null && patron(x) === patron(y)) return 20;
  return -20;
}

/**
 * Where every pair starts. Empires of one polity, or a client state and its
 * patron, start as friends and other polities as rivals, and so do the pieces
 * of a Main too big to be one Empire. On top of that, and all there is
 * between other Empires made from Mains: neighbours are rivals for the
 * worlds between them, two governments alike get on and a democracy and a
 * dictatorship do not, bold Empires are hard to like, and the seed adds a
 * little of its own so that no two games start the same.
 */
export function startingRelations(
  factions: readonly Faction[],
  sector: SectorData,
  owner: ReadonlyMap<string, string>,
  seed: string,
): Record<string, Relation> {
  const rng = new Rng(seedOf(`${seed}|relations`));
  const byHex = new Map(sector.worlds.map((w) => [w.at, w]));
  const held = new Map<string, string[]>();
  for (const [at, id] of owner) held.set(id, [...(held.get(id) ?? []), at]);
  const neighbours = (a: string, b: string) =>
    (held.get(a) ?? []).some((x) => (held.get(b) ?? []).some((y) => distanceBetween(x, y) <= BORDER));
  const byAllegiance = factions.some((f) => f.allegiance !== undefined);
  const out: Record<string, Relation> = {};
  for (let i = 0; i < factions.length; i++) {
    for (let j = i + 1; j < factions.length; j++) {
      const a = factions[i]!;
      const b = factions[j]!;
      const kin = byAllegiance || splitKin(a, b);
      let score = kin ? kinship(a, b, sector.polities) : 0;
      if (neighbours(a.id, b.id)) score -= 15;
      const ra = rule(byHex.get(a.capital));
      const rb = rule(byHex.get(b.capital));
      if (ra === rb && ra !== "other") score += 10;
      else if ((ra === "many" && rb === "one") || (ra === "one" && rb === "many")) score -= 15;
      score -= 20 * ((a.temper.aggression + b.temper.aggression) / 2);
      score += (rng.next() * 2 - 1) * (kin ? 10 : 25);
      score = Math.round(clamp(score));
      const war = score <= WAR_AT;
      out[relationKey(a.id, b.id)] = { base: score, score, war, since: 0, ...(war ? { cause: "over old grievances" } : {}) };
    }
  }
  return out;
}

/* Changing ------------------------------------------------------------------ */

function clamp(score: number): number {
  return Math.max(-100, Math.min(100, score));
}

/**
 * Moves a pair's score. A fall big enough to matter remembers why, and whose
 * grievance it was, so a war that follows can say what it is about.
 */
export function shift(game: Game, a: string, b: string, by: number, cause?: { text: string; who: string }): void {
  if (a === b) return;
  const r = relationOf(game, a, b);
  if (r === undefined) return;
  r.score = clamp(r.score + by);
  if (cause !== undefined && by <= -3) {
    r.cause = cause.text;
    r.causeBy = cause.who;
  }
}

/** A world has changed hands. */
export function onCapture(game: Game, at: string, by: string, from: string | null): void {
  const world = game.world(at);
  if (from !== null) {
    const r = relationOf(game, by, from);
    if (r !== undefined) r.clash = game.state.day;
    shift(game, by, from, -30, { text: `over the fall of ${world.name}`, who: from });
    // The victim's friends nearby take it badly too. Not those already at war
    // with the taker, who have no worse to think of it, and not those far off:
    // inside a big polity every capture soured some twenty pairs, and the
    // polity fell into a civil war that never ended.
    for (const f of alive(game)) {
      if (f.id === by || f.id === from || atWar(game, f.id, by) || !holdsNear(game, f.id, [at])) continue;
      if ((relationOf(game, f.id, from)?.score ?? 0) >= 40) shift(game, f.id, by, -10, { text: `over the fall of ${world.name} to ${game.faction(by).name}`, who: f.id });
    }
    return;
  }
  // An independent world taken on somebody else's border presses on it.
  for (const f of alive(game)) {
    if (f.id === by || atWar(game, f.id, by)) continue;
    if (game.ownedWorlds(f.id).some((w) => distanceBetween(w.at, at) <= BORDER)) {
      shift(game, f.id, by, -3, { text: `over ${game.faction(by).name}'s taking of ${world.name} on its border`, who: f.id });
    }
  }
}

/** Two Empires have fought. */
export function onBattle(game: Game, factions: readonly string[], at: string): void {
  for (let i = 0; i < factions.length; i++) {
    for (let j = i + 1; j < factions.length; j++) {
      const a = factions[i]!;
      const b = factions[j]!;
      if (!atWar(game, a, b)) continue;
      const r = relationOf(game, a, b);
      if (r !== undefined) r.clash = game.state.day;
      shift(game, a, b, -4, { text: `over the fighting at ${game.world(at).name}`, who: a });
    }
  }
}

/** A siege has silenced a world's defences. */
export function onSiege(game: Game, at: string, by: string, owner: string | null): void {
  if (owner === null) return;
  shift(game, by, owner, -8, { text: `over the siege of ${game.world(at).name}`, who: owner });
}

function alive(game: Game): Faction[] {
  return game.state.factions.filter((f) => f.alive);
}

/** Whether an Empire holds a world within reach of any of these. */
function holdsNear(game: Game, id: string, places: readonly string[]): boolean {
  return game.ownedWorlds(id).some((w) => places.some((at) => distanceBetween(w.at, at) <= REACH));
}

/* Each day and each week ------------------------------------------------- */

/** How much the batteries reckon for against a fleet's strength, and each boat of a world's navy. As the computer's admirals reckon them. */
const BATTERY_WEIGHT = 0.75;
const NAVY_WEIGHT = 7.5;

/** A world's defences as a fleet strength, worked out as the computer's admirals work it out in ai.ts. */
function defenceStrength(game: Game, at: string): number {
  const world = game.world(at);
  const ws = game.worldState(at);
  const navy = game.navyOf(at);
  const boats = navy.cls === undefined ? 0 : navy.boats * navy.cls.strength * NAVY_WEIGHT;
  if (ws.defence <= 0) return boats;
  const fire = Math.max(attackDamage(defenceAttacks(world), STRENGTH_ARMOUR), 0.5);
  return BATTERY_WEIGHT * Math.sqrt(ws.defence * (1 + defenceArmour(world) / 3) * fire) + boats;
}

/**
 * Whether a faction has anything it could take near its worlds: an enemy's
 * or an independent peopled world whose defences its whole navy could beat.
 * A world far beyond its strength is not something to take, or a rich Empire
 * beside one never grew restless.
 */
function somethingToTake(game: Game, f: Faction, own: readonly World[], strength: number): boolean {
  return game.state.sector.worlds.some((w) => {
    if (w.uwp.population === 0) return false;
    const owner = game.worldState(w.at).owner;
    if (owner === f.id || (owner !== null && !atWar(game, f.id, owner))) return false;
    if (!own.some((o) => distanceBetween(o.at, w.at) <= REACH)) return false;
    return defenceStrength(game, w.at) < strength;
  });
}

/** The week's slow changes: drift home, common enemies, a leader feared, and restlessness. */
function weekly(game: Game): void {
  const relations = game.state.relations!;
  const living = alive(game);
  const ids = new Set(living.map((f) => f.id));
  // Who is at war with whom, gathered once: asking pair by pair for a common
  // enemy took seconds a week with a hundred Empires. Nothing below makes or
  // ends a war, so it holds for the whole of the week's changes.
  const enemies = new Map(living.map((f) => [f.id, new Set<string>()]));
  for (const [key, r] of Object.entries(relations)) {
    if (!r.war) continue;
    const [a, b] = key.split("|") as [string, string];
    enemies.get(a)?.add(b);
    enemies.get(b)?.add(a);
  }
  const commonEnemy = (a: string, b: string) => {
    const [few, many] = [enemies.get(a)!, enemies.get(b)!].sort((x, y) => x.size - y.size) as [Set<string>, Set<string>];
    for (const c of few) if (many.has(c)) return true;
    return false;
  };
  for (const [key, r] of Object.entries(relations)) {
    const [a, b] = key.split("|") as [string, string];
    if (!ids.has(a) || !ids.has(b)) continue;
    r.score = clamp(r.score + (r.base - r.score) * DRIFT);
    // A war nobody is fighting wearies both sides of it. The last clash may
    // be from an earlier war between them, so a war begun since counts from
    // its own first day.
    if (r.war && game.state.day - Math.max(r.clash ?? r.since, r.since) >= COOLING) r.score = clamp(r.score + WEARINESS);
    // A common enemy brings two Empires at peace closer.
    if (!r.war && commonEnemy(a, b)) r.score = clamp(r.score + 3);
  }

  // One Empire close to winning makes its neighbours uneasy. Those already at
  // war with it are left alone, so that their wars can still end: when fear
  // outran weariness every war on a leader went on for ever, and the leader
  // sat a step short of victory for months.
  for (const leader of living) {
    const share = nearVictory(game, leader.id);
    if (share <= FEAR_FROM) continue;
    const held = game.ownedWorlds(leader.id).map((w) => w.at);
    for (const f of living) {
      if (f.id === leader.id || atWar(game, f.id, leader.id) || !holdsNear(game, f.id, held)) continue;
      shift(game, f.id, leader.id, (-FEAR * (share - FEAR_FROM)) / (1 - FEAR_FROM), { text: `over ${leader.name}'s growing power`, who: f.id });
    }
  }

  // A computer Empire with nothing to take grows restless with its neighbours,
  // though not with its allies, nor with one it made peace with lately. One
  // with no navy has nothing to be restless with.
  const owned = new Map(living.map((f) => [f.id, game.ownedWorlds(f.id)]));
  for (const f of living) {
    if (f.human) continue;
    const own = owned.get(f.id)!;
    const strength = strengthOf(game, f.id);
    if (own.length === 0 || strength <= 0 || somethingToTake(game, f, own, strength)) continue;
    const restless = 3 * (0.5 + f.temper.aggression + f.temper.expansion);
    for (const g of living) {
      if (g.id === f.id || atWar(game, f.id, g.id) || allied(game, f.id, g.id)) continue;
      const r = relationOf(game, f.id, g.id);
      if (r !== undefined && r.since > 0 && game.state.day - r.since < RESTLESS_AFTER) continue;
      // Only a neighbour with a world near enough and weak enough to take: a
      // small Empire does not pick a quarrel with one it could never hurt.
      const prey = owned.get(g.id)!.some((w) => defenceStrength(game, w.at) < strength && own.some((o) => distanceBetween(o.at, w.at) <= REACH));
      if (prey) shift(game, f.id, g.id, -restless, { text: "with no other worlds within its reach", who: f.id });
    }
  }
}

/** War, peace and alliances, as the scores now stand; offers answered; and the week's slow changes on a week's end. */
export function diplomacy(game: Game): void {
  const relations = game.state.relations;
  if (relations === undefined) return;
  answerOffers(game);
  if (isWeekEnd(game.state.day)) {
    weekly(game);
    proposals(game);
  }
  const ids = new Map(alive(game).map((f) => [f.id, f]));
  for (const [key, r] of Object.entries(relations)) {
    const [a, b] = key.split("|") as [string, string];
    const fa = ids.get(a);
    const fb = ids.get(b);
    if (fa === undefined || fb === undefined) continue;
    if (r.allied === true && r.score < ALLY_BREAK) {
      endAlliance(game, a, b, `${fa.name} and ${fb.name} are allies no longer.`);
    } else if (!r.war && r.score <= WAR_AT) {
      // Only the computer declares war of its own accord: the Empire whose
      // grievance it is, or the bolder of the two.
      const computers = [fa, fb].filter((f) => !f.human);
      if (computers.length === 0) continue;
      const aggrieved = computers.find((f) => f.id === r.causeBy);
      const by = aggrieved ?? computers.sort((x, y) => y.temper.aggression - x.temper.aggression)[0]!;
      declareWar(game, by.id, by.id === a ? b : a, r.cause ?? "as relations have broken down");
    } else if (r.war && r.score >= PEACE_AT && !fa.human && !fb.human && game.state.day - (r.clash ?? -Infinity) >= COOLING) {
      makePeace(game, a, b);
    }
  }
}

/** One Empire declares war on another, for everyone to hear. */
export function declareWar(game: Game, by: string, on: string, why: string): void {
  const r = relationOf(game, by, on);
  if (r === undefined || r.war) return;
  const betrayed = r.allied === true;
  r.war = true;
  r.declaredBy = by;
  r.allied = false;
  r.since = game.state.day;
  r.score = Math.min(r.score, WAR_AT);
  withdrawOffers(game, by, on);
  const aggressor = game.faction(by);
  const victim = game.faction(on);
  // Breaking a peace is noticed by the victim's friends nearby, and turning on
  // an ally by everyone. Those already at war with the aggressor think no
  // worse of it.
  const victimHolds = game.ownedWorlds(on).map((w) => w.at);
  for (const f of alive(game)) {
    if (f.id === by || f.id === on || atWar(game, f.id, by)) continue;
    if ((relationOf(game, f.id, on)?.score ?? 0) >= 40 && (betrayed || holdsNear(game, f.id, victimHolds))) shift(game, f.id, by, betrayed ? -20 : -10, { text: `over its war on ${victim.name}`, who: f.id });
    else if (betrayed) shift(game, f.id, by, -5, { text: `over its betrayal of ${victim.name}`, who: f.id });
  }
  announce(game, [by, on], `${aggressor.name} ${betrayed ? "turns on its ally" : "declares war on"} ${victim.name}, ${why}.`);
}

/** Two Empires at war make peace. */
export function makePeace(game: Game, a: string, b: string): void {
  const r = relationOf(game, a, b);
  if (r === undefined || !r.war) return;
  r.war = false;
  r.since = game.state.day;
  // A peace starts no colder than the line it was made at.
  r.score = Math.max(r.score, PEACE_AT);
  delete r.cause;
  delete r.causeBy;
  // Their sieges of each other's worlds end with the war, not a day later.
  for (const ws of Object.values(game.state.worlds)) {
    if (ws.siege !== null && ((ws.siege.by === a && ws.owner === b) || (ws.siege.by === b && ws.owner === a))) ws.siege = null;
  }
  announce(game, [a, b], `${game.faction(a).name} and ${game.faction(b).name} make peace.`);
}

function announce(game: Game, parties: readonly string[], text: string): void {
  const everyone = alive(game).map((f) => f.id);
  game.log({ to: parties, kind: "diplomacy", text, wake: true, firsthand: parties, about: parties });
  const others = everyone.filter((id) => !parties.includes(id));
  if (others.length > 0) game.log({ to: others, kind: "diplomacy", text });
}

/* Alliances ------------------------------------------------------------------ */

/**
 * Allies are friends who have said so. They see what each other sees, their
 * fleets in the same place fight on the same side, and each can refuel and
 * repair at the other's ports. Each still wins or loses alone, so an ally is
 * always a rival in the end.
 */
export function allied(game: Game, a: string, b: string): boolean {
  if (a === b) return false;
  return relationOf(game, a, b)?.allied === true;
}

/** The Empires a faction is allied with. */
export function alliesOf(game: Game, id: string): string[] {
  return alive(game)
    .filter((f) => allied(game, id, f.id))
    .map((f) => f.id);
}

/** Where a pair stands, in a word. */
export function standing(game: Game, a: string, b: string): "war" | "peace" | "alliance" {
  if (atWar(game, a, b)) return "war";
  return allied(game, a, b) ? "alliance" : "peace";
}

/** At or above this, a computer Empire will be an ally. */
export const ALLY_AT = 50;
/**
 * The most allies a computer Empire keeps. Without a limit every Empire of a
 * big polity allied with every other, and the polity was one Empire again.
 */
const MOST_ALLIES = 2;
/** Below this, an alliance falls back to peace. */
const ALLY_BREAK = 25;
/** Days between offers between the same two Empires. */
const OFFER_EVERY = 21;
/** Days a player has to answer an offer before it lapses. */
const OFFER_LASTS = 14;

/** Whether an Empire, if the computer's, already has all the allies it keeps. */
function fullOfAllies(game: Game, id: string): boolean {
  return !game.faction(id).human && alliesOf(game, id).length >= MOST_ALLIES;
}

function formAlliance(game: Game, a: string, b: string): void {
  const r = relationOf(game, a, b);
  if (r === undefined || r.war || r.allied === true) return;
  r.allied = true;
  r.since = game.state.day;
  // An alliance starts no colder than a little above the line it breaks at,
  // or one made on a cool day ended the same day.
  r.score = Math.max(r.score, ALLY_BREAK + 5);
  announce(game, [a, b], `${game.faction(a).name} and ${game.faction(b).name} become allies.`);
}

function endAlliance(game: Game, a: string, b: string, text: string): void {
  const r = relationOf(game, a, b);
  if (r === undefined || r.allied !== true) return;
  r.allied = false;
  r.since = game.state.day;
  announce(game, [a, b], text);
}

/** A player leaves an alliance, back to peace, which the old ally takes badly. */
export function leaveAlliance(game: Game, by: string, from: string): void {
  shift(game, by, from, -20, { text: `over ${game.faction(by).name} leaving their alliance`, who: from });
  endAlliance(game, by, from, `${game.faction(by).name} leaves its alliance with ${game.faction(from).name}.`);
}

/* Offers --------------------------------------------------------------------- */

/**
 * Offers still standing: not from or to an Empire that has fallen since. The
 * day's diplomacy clears those away, but until it does they are not offers.
 */
function standingOffers(game: Game): Offer[] {
  return (game.state.offers ?? []).filter((o) => game.faction(o.from).alive && game.faction(o.to).alive);
}

/** An offer waiting for an answer between two Empires, either way. */
export function offerBetween(game: Game, a: string, b: string): Offer | undefined {
  return standingOffers(game).find((o) => (o.from === a && o.to === b) || (o.from === b && o.to === a));
}

/** Offers waiting on an Empire's answer. */
export function offersTo(game: Game, id: string): Offer[] {
  return standingOffers(game).filter((o) => o.to === id);
}

/**
 * One Empire offers another peace, or an alliance. A computer Empire answers
 * the next day; a player answers when they choose, within two weeks. Null
 * when it is made, or why it cannot be.
 */
export function makeOffer(game: Game, from: string, to: string, kind: Offer["kind"]): string | null {
  const r = relationOf(game, from, to);
  if (r === undefined) return "There is no talking to them.";
  if (kind === "peace" && !r.war) return "You are not at war.";
  if (kind === "alliance" && (r.war || r.allied === true)) return r.war ? "Make peace first." : "You are already allies.";
  if (offerBetween(game, from, to) !== undefined) return "An offer between you is already waiting for an answer.";
  game.state.offers = [...(game.state.offers ?? []), { from, to, kind, day: game.state.day }];
  r.offered = game.state.day;
  const text = `${game.faction(from).name} offers ${game.faction(to).name} ${kind === "peace" ? "peace" : "an alliance"}.`;
  game.log({ to: [from, to], kind: "diplomacy", text, wake: true, firsthand: [from, to], about: [from, to] });
  return null;
}

/**
 * An offer answered, yes or no. Null when the answer stands, or why an
 * acceptance came to nothing.
 */
export function answerOffer(game: Game, offer: Offer, yes: boolean): string | null {
  game.state.offers = (game.state.offers ?? []).filter((o) => o !== offer);
  const from = game.faction(offer.from);
  const to = game.faction(offer.to);
  if (!from.alive || !to.alive) return `${!from.alive ? from.name : to.name} has fallen.`;
  if (yes) {
    if (offer.kind === "peace") {
      makePeace(game, offer.from, offer.to);
      return null;
    }
    // A computer Empire may have found all the allies it keeps since it
    // offered or was asked: several offers out at once, or a player slow to
    // answer. Then the offer has gone.
    const full = [from, to].find((f) => fullOfAllies(game, f.id));
    if (full !== undefined) {
      const text = `${from.name}'s offer of an alliance to ${to.name} no longer stands: ${full.name} has all the allies it wants.`;
      game.log({ to: [offer.from, offer.to], kind: "diplomacy", text, wake: true, firsthand: [offer.from, offer.to], about: [offer.from, offer.to] });
      return text;
    }
    formAlliance(game, offer.from, offer.to);
    return null;
  }
  // A refusal stings a little.
  shift(game, offer.from, offer.to, -3);
  const text = `${to.name} turns down ${from.name}'s offer of ${offer.kind === "peace" ? "peace" : "an alliance"}.`;
  game.log({ to: [offer.from, offer.to], kind: "diplomacy", text, wake: true, firsthand: [offer.from, offer.to], about: [offer.from, offer.to] });
  return null;
}

function withdrawOffers(game: Game, a: string, b: string): void {
  if (game.state.offers === undefined) return;
  game.state.offers = game.state.offers.filter((o) => !((o.from === a && o.to === b) || (o.from === b && o.to === a)));
}

/**
 * The computer answers what has waited a day, and offers to players lapse
 * unanswered. Offers from or to an Empire that has fallen go without a word.
 */
function answerOffers(game: Game): void {
  const day = game.state.day;
  if (game.state.offers !== undefined) game.state.offers = standingOffers(game);
  for (const offer of [...(game.state.offers ?? [])]) {
    const to = game.faction(offer.to);
    if (to.human) {
      // An offer of alliance from an Empire that has found its allies
      // elsewhere is withdrawn, rather than left waiting to be accepted.
      if (offer.kind === "alliance" && fullOfAllies(game, offer.from)) {
        game.state.offers = (game.state.offers ?? []).filter((o) => o !== offer);
        const text = `${game.faction(offer.from).name}'s offer of an alliance to ${to.name} no longer stands: it has all the allies it wants.`;
        game.log({ to: [offer.from, offer.to], kind: "diplomacy", text, wake: true, firsthand: [offer.from, offer.to], about: [offer.from, offer.to] });
        continue;
      }
      if (day - offer.day >= OFFER_LASTS) {
        game.state.offers = (game.state.offers ?? []).filter((o) => o !== offer);
        game.log({ to: [offer.from, offer.to], kind: "diplomacy", text: `${game.faction(offer.from).name}'s offer to ${to.name} lapses unanswered.` });
      }
      continue;
    }
    if (offer.day >= day) continue;
    answerOffer(game, offer, willing(game, to, offer.from, offer.kind));
  }
}

/** An Empire's share of what wins, as a fraction of it. */
function nearVictory(game: Game, id: string): number {
  const target = game.victoryTarget();
  const of = target.by === "population" ? target.people : target.worlds;
  const held = game.holding(id);
  return of === 0 ? 0 : (target.by === "population" ? held.people : held.worlds) / of / game.state.options.victoryShare;
}

function strengthOf(game: Game, id: string): number {
  return game.fleetsOf(id).reduce((t, f) => t + game.fleetStrength(f), 0);
}

/**
 * Whether a computer Empire would take peace or an alliance with another. Peace
 * comes easier to the less bold, to one losing the war or with other wars on
 * its hands, and harder while the fighting is fresh. An alliance wants a warm
 * standing, comes easier against a common enemy and harder to the careful, and
 * never with an Empire close to winning.
 */
function willing(game: Game, who: Faction, other: string, kind: Offer["kind"]): boolean {
  const r = relationOf(game, who.id, other);
  if (r === undefined) return false;
  const enemies = (id: string) => alive(game).filter((f) => f.id !== id && atWar(game, id, f.id)).map((f) => f.id);
  if (kind === "peace") {
    if (!r.war) return false;
    const mine = strengthOf(game, who.id);
    const theirs = strengthOf(game, other);
    const ratio = theirs <= 0 ? 10 : mine / theirs;
    let will = r.score + 20 * (1 - who.temper.aggression);
    will += 8 * (enemies(who.id).length - 1);
    if (ratio < 0.67) will += 20;
    // The stronger it is, the less it wants peace: from 20 against it at half
    // as strong again, to 50 at four times as strong.
    if (ratio > 1.5) will -= 20 + 30 * Math.min(1, (ratio - 1.5) / 2.5);
    if (game.state.day - (r.clash ?? -Infinity) < 7) will -= 15;
    return will >= 0;
  }
  if (r.war || r.allied === true || r.score < ALLY_BREAK || nearVictory(game, other) > 0.6) return false;
  if (fullOfAllies(game, who.id)) return false;
  const theirEnemies = new Set(enemies(other));
  const common = enemies(who.id).filter((id) => theirEnemies.has(id)).length;
  return r.score + 15 * Math.min(common, 2) - 15 * who.temper.caution >= ALLY_AT;
}

/**
 * A week's offers from the computer: peace to a player it would make peace
 * with, and an alliance to a friend, player or computer, when it would have
 * one. Not more often than every three weeks between the same two. Peace
 * between two computer Empires comes as their standing mends, without asking.
 */
function proposals(game: Game): void {
  const day = game.state.day;
  const living = alive(game);
  // Alliances an offer still waiting would make count against the limit too,
  // or an Empire offered one to every friend in the same week.
  // Counted once and kept up as offers go out: counting afresh for every pair
  // took over a second a week with a hundred Empires.
  const counts = new Map<string, number>();
  const committed = (id: string) => {
    let n = counts.get(id);
    if (n === undefined) {
      n = alliesOf(game, id).length + standingOffers(game).filter((o) => o.kind === "alliance" && (o.from === id || o.to === id)).length;
      counts.set(id, n);
    }
    return n;
  };
  const room = (g: Faction) => g.human || committed(g.id) < MOST_ALLIES;
  for (const f of living) {
    if (f.human) continue;
    for (const g of living) {
      if (g.id === f.id) continue;
      const r = relationOf(game, f.id, g.id);
      if (r === undefined || day - (r.offered ?? -Infinity) < OFFER_EVERY || offerBetween(game, f.id, g.id) !== undefined) continue;
      if (r.war && g.human && willing(game, f, g.id, "peace")) makeOffer(game, f.id, g.id, "peace");
      else if (!r.war && r.allied !== true && r.score >= ALLY_AT && room(f) && room(g) && willing(game, f, g.id, "alliance")) {
        makeOffer(game, f.id, g.id, "alliance");
        counts.set(f.id, committed(f.id) + 1);
        counts.set(g.id, committed(g.id) + 1);
      }
    }
  }
}
