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
 * independent world and no enemy within reach grows restless with the
 * neighbours it is at peace with, the more so the bolder and hungrier it is,
 * and in time that is a war even between two halves of one polity.
 *
 * Players declare war themselves. The computer declares war on them as it does
 * on anyone, but only a player can end a war with a player.
 */

import { distanceBetween } from "../sector/hex";
import type { SectorData, World } from "../sector/sec";
import type { Game } from "./game";
import { isWeekEnd } from "./rules";
import { Rng, seedOf } from "./rng";
import type { Faction, Relation } from "./types";

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

/** How two polities stand by their Allegiance codes alone. */
function kinship(a: string | undefined, b: string | undefined): number {
  if (a === undefined || b === undefined) return 0;
  if (a === b) return 70;
  const family = (code: string) => (code.startsWith("Cs") ? null : code.slice(0, 2));
  const patron = (code: string) => (code.startsWith("Cs") ? code.slice(2, 4) : null);
  if (family(a) !== null && family(a) === family(b)) return 50;
  if (patron(a) !== null && patron(a) === family(b)) return 40;
  if (patron(b) !== null && patron(b) === family(a)) return 40;
  if (patron(a) !== null && patron(a) === patron(b)) return 20;
  return -20;
}

/**
 * Where every pair starts. Empires of one polity, or a client state and its
 * patron, start as friends and other polities as rivals. On top of that, and
 * all there is between Empires made from Mains: neighbours are rivals for the
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
      let score = byAllegiance ? kinship(a.allegiance, b.allegiance) : 0;
      if (neighbours(a.id, b.id)) score -= 15;
      const ra = rule(byHex.get(a.capital));
      const rb = rule(byHex.get(b.capital));
      if (ra === rb && ra !== "other") score += 10;
      else if ((ra === "many" && rb === "one") || (ra === "one" && rb === "many")) score -= 15;
      score -= 20 * ((a.temper.aggression + b.temper.aggression) / 2);
      score += (rng.next() * 2 - 1) * (byAllegiance ? 10 : 25);
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
    // The victim's friends take it badly too.
    for (const f of alive(game)) {
      if (f.id === by || f.id === from) continue;
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

/* Each day and each week ------------------------------------------------- */

/** Whether a faction has anything it could take near its worlds: a peopled world independent or an enemy's. */
function somethingToTake(game: Game, f: Faction, own: readonly World[]): boolean {
  return game.state.sector.worlds.some((w) => {
    if (w.uwp.population === 0) return false;
    const owner = game.worldState(w.at).owner;
    if (owner === f.id || (owner !== null && !atWar(game, f.id, owner))) return false;
    return own.some((o) => distanceBetween(o.at, w.at) <= REACH);
  });
}

/** The week's slow changes: drift home, common enemies, a leader feared, and restlessness. */
function weekly(game: Game): void {
  const relations = game.state.relations!;
  const living = alive(game);
  const ids = new Set(living.map((f) => f.id));
  for (const [key, r] of Object.entries(relations)) {
    const [a, b] = key.split("|") as [string, string];
    if (!ids.has(a) || !ids.has(b)) continue;
    r.score = clamp(r.score + (r.base - r.score) * DRIFT);
    // A war nobody is fighting wearies both sides of it.
    if (r.war && game.state.day - (r.clash ?? r.since) >= COOLING) r.score = clamp(r.score + WEARINESS);
    // A common enemy brings two Empires at peace closer.
    if (!r.war && living.some((c) => c.id !== a && c.id !== b && atWar(game, a, c.id) && atWar(game, b, c.id))) r.score = clamp(r.score + 3);
  }

  // One Empire close to winning makes the rest uneasy.
  const target = game.victoryTarget();
  const of = target.by === "population" ? target.people : target.worlds;
  for (const leader of living) {
    const held = game.holding(leader.id);
    const share = of === 0 ? 0 : (target.by === "population" ? held.people : held.worlds) / of / game.state.options.victoryShare;
    if (share <= 0.6) continue;
    for (const f of living) {
      if (f.id !== leader.id) shift(game, f.id, leader.id, (-8 * (share - 0.6)) / 0.4, { text: `over ${leader.name}'s growing power`, who: f.id });
    }
  }

  // A computer Empire with nothing to take grows restless with its neighbours.
  for (const f of living) {
    if (f.human) continue;
    const own = game.ownedWorlds(f.id);
    if (own.length === 0 || somethingToTake(game, f, own)) continue;
    const restless = 3 * (0.5 + f.temper.aggression + f.temper.expansion);
    for (const g of living) {
      if (g.id === f.id || atWar(game, f.id, g.id)) continue;
      const near = game.ownedWorlds(g.id).some((w) => own.some((o) => distanceBetween(o.at, w.at) <= REACH));
      if (near) shift(game, f.id, g.id, -restless, { text: "with no other worlds within its reach", who: f.id });
    }
  }
}

/** War and peace, as the scores now stand, and the week's slow changes on a week's end. */
export function diplomacy(game: Game): void {
  const relations = game.state.relations;
  if (relations === undefined) return;
  if (isWeekEnd(game.state.day)) weekly(game);
  const ids = new Map(alive(game).map((f) => [f.id, f]));
  for (const [key, r] of Object.entries(relations)) {
    const [a, b] = key.split("|") as [string, string];
    const fa = ids.get(a);
    const fb = ids.get(b);
    if (fa === undefined || fb === undefined) continue;
    if (!r.war && r.score <= WAR_AT) {
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
  r.war = true;
  r.since = game.state.day;
  r.score = Math.min(r.score, WAR_AT);
  const aggressor = game.faction(by);
  const victim = game.faction(on);
  // Breaking a peace is noticed by the victim's friends.
  for (const f of alive(game)) {
    if (f.id === by || f.id === on) continue;
    if ((relationOf(game, f.id, on)?.score ?? 0) >= 40) shift(game, f.id, by, -10, { text: `over its war on ${victim.name}`, who: f.id });
  }
  announce(game, [by, on], `${aggressor.name} declares war on ${victim.name}, ${why}.`);
}

/** Two Empires at war make peace. */
export function makePeace(game: Game, a: string, b: string): void {
  const r = relationOf(game, a, b);
  if (r === undefined || !r.war) return;
  r.war = false;
  r.since = game.state.day;
  delete r.cause;
  delete r.causeBy;
  announce(game, [a, b], `${game.faction(a).name} and ${game.faction(b).name} make peace.`);
}

function announce(game: Game, parties: readonly string[], text: string): void {
  const everyone = alive(game).map((f) => f.id);
  game.log({ to: parties, kind: "diplomacy", text, wake: true, firsthand: parties, about: parties });
  const others = everyone.filter((id) => !parties.includes(id));
  if (others.length > 0) game.log({ to: others, kind: "diplomacy", text });
}
