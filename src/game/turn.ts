/**
 * What a player can do, and the turn going round.
 *
 * Players share one screen and take turns giving orders for the same day. When
 * the last of them is done the day is resolved for everybody at once. A player
 * can instead ask to sleep until something happens; once every player has, the
 * days run on by themselves until one of them has something to look at.
 */

import { aiStartingFleet } from "./ai";
import { advanceDay } from "./day";
import type { Game } from "./game";
import { canBuildAt, whyNotBuild, yardPrice } from "./rules";
import { shipName } from "./names";
import type { Faction } from "./types";
import { STANDING_PRESETS } from "./types";

/** The computer's factions buy their first fleets as the game is made. */
export function aiSetup(game: Game): void {
  for (const f of game.state.factions) if (!f.human) aiStartingFleet(game, f);
  if (game.humans().length === 0) beginPlay(game);
}

/** Day zero: a player buys a ship for the first fleet, delivered at the capital. */
export function buyStarting(game: Game, faction: Faction, classId: string): string {
  const cls = game.catalogue.get(classId);
  if (game.state.phase !== "setup") return "The first fleet has already sailed.";
  if (cls.cost > faction.credits + 1e-9) return `The ${cls.name} costs MCr${cls.cost.toFixed(2)}; the treasury has MCr${faction.credits.toFixed(2)}.`;
  faction.credits -= cls.cost;
  const ship = game.newShip(classId);
  const home =
    game.fleetsAt(faction.capital, "main").find((f) => f.owner === faction.id && f.name === "Home Fleet") ??
    game.newFleet(faction.id, faction.capital, "main", [], "Home Fleet");
  home.ships.push(ship);
  home.standing = { ...STANDING_PRESETS["Guard"]! };
  return "";
}

/** Day zero: take a ship back before the game starts. */
export function sellStarting(game: Game, faction: Faction, shipId: string): void {
  if (game.state.phase !== "setup") return;
  for (const f of game.fleetsOf(faction.id)) {
    const ship = f.ships.find((s) => s.id === shipId);
    if (ship === undefined) continue;
    faction.credits += game.cls(ship).cost;
    f.ships = f.ships.filter((s) => s !== ship);
  }
  game.removeEmptyFleets();
}

/** Lay down a ship at a yard the faction holds. Returns why not, or "". */
export function orderBuild(game: Game, faction: Faction, classId: string, at: string): string {
  const cls = game.catalogue.get(classId);
  const world = game.world(at);
  const owner = game.worldState(at).owner;
  if (owner !== faction.id && owner !== null) return `${world.name} belongs to ${game.faction(owner).name}.`;
  if (!canBuildAt(world, cls)) return `${world.name} cannot build the ${cls.name}: ${whyNotBuild(world, cls)}.`;
  const price = yardPrice(cls, owner === faction.id);
  if (price > faction.credits + 1e-9) return `The ${cls.name} costs MCr${price.toFixed(2)} here; the treasury has MCr${faction.credits.toFixed(2)}.`;
  faction.credits -= price;
  const days = Math.max(7, Math.ceil(cls.buildDays * game.state.options.buildSpeed));
  faction.builds.push({ classId, at, done: game.state.day + days, name: shipName(game.rng, game.shipNamesInUse()) });
  game.log({ to: [faction.id], kind: "build", text: `The ${cls.name} is laid down at ${world.name}, due in ${days} days.`, at });
  return "";
}

function beginPlay(game: Game): void {
  game.state.phase = "play";
  game.state.day = 1;
  game.state.turn = 0;
  for (const f of game.state.factions) {
    f.ready = false;
    game.log({ to: [f.id], kind: "info", text: "The fleet is commissioned. Day one." });
  }
}

/**
 * The current player is done. Returns true when that ended the day (or the
 * setup), so the screen can show what happened.
 */
export function endTurn(game: Game): boolean {
  const s = game.state;
  const players = game.humans().filter((f) => f.alive);
  const me = game.currentHuman();
  if (me !== undefined) me.ready = true;
  if (players.some((f) => !f.ready)) {
    s.turn = players.findIndex((f) => !f.ready);
    return false;
  }
  s.turn = 0;
  if (s.phase === "setup") {
    beginPlay(game);
    return true;
  }
  if (players.every((f) => f.waiting)) {
    sleep(game);
  } else {
    advanceDay(game);
  }
  for (const f of players) {
    f.ready = false;
  }
  return true;
}

/** The current player sleeps until something happens that they should see. */
export function waitForEvents(game: Game): boolean {
  const me = game.currentHuman();
  if (me !== undefined) me.waiting = true;
  return endTurn(game);
}

/** Run days until a sleeping player is woken, or a month has passed. */
function sleep(game: Game, limit = 30): void {
  const players = game.humans().filter((f) => f.alive).map((f) => f.id);
  for (let i = 0; i < limit && game.state.phase === "play"; i++) {
    advanceDay(game);
    // News that reached a sleeping player today, whenever it happened.
    const today = game.state.day;
    const woke = game.state.log.some((e) => e.day === today && e.wake === true && e.to.some((id) => players.includes(id)));
    if (woke) break;
  }
  for (const f of game.humans()) f.waiting = false;
}

/** With no humans, the computer plays itself: for tests and for watching. */
export function runDays(game: Game, days: number): void {
  for (let i = 0; i < days && game.state.phase === "play"; i++) advanceDay(game);
}
