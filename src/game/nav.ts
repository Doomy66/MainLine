/**
 * Finding a way across the map: which systems a fleet can reach on the fuel it
 * has, and a route of jumps to somewhere further, stopping where it can refuel.
 */

import type { Game } from "./game";
import { fuelSources, jumpFuel } from "./rules";
import type { Fleet } from "./types";

/** Systems a fleet could jump to today. */
export function inRange(game: Game, fleet: Fleet): string[] {
  const range = game.fleetRange(fleet);
  if (range === 0 || fleet.transit !== null) return [];
  return [...game.neighbours(fleet.system, range)];
}

/** Whether every ship in a fleet could fill its tanks at a system. */
export function canRefuelAt(game: Game, fleet: Fleet, at: string): boolean {
  const world = game.world(at);
  const hostile = game.hostile(fleet.owner, game.worldState(at).owner);
  return fleet.ships.every((s) => game.carried(fleet, s) || fuelSources(world, game.cls(s), hostile).length > 0);
}

/** Whether every ship's tanks hold enough for a jump of this many parsecs when full. */
function tanksBigEnough(game: Game, fleet: Fleet, parsecs: number): boolean {
  return fleet.ships.every((s) => {
    if (game.carried(fleet, s)) return true;
    const c = game.cls(s);
    return c.fuelCapacity + 1e-9 >= jumpFuel(c.tons, parsecs);
  });
}

/**
 * Every system a fleet can get to, and the fewest jumps to each, every stop
 * along the way somewhere it can refuel. The first jump may be made on the fuel
 * it has, or on a full load where it can refuel before it goes; after that it
 * fills up at every stop. A system it cannot refuel at can be the end of a
 * route but not a stop on one.
 */
export function jumpMap(game: Game, fleet: Fleet, avoid: ReadonlySet<string> = new Set()): Map<string, { hops: number; prev: string }> {
  const out = new Map<string, { hops: number; prev: string }>();
  if (fleet.transit !== null) return out;
  const drive = game.fleetJump(fleet);
  if (drive === 0) return out;
  let reach = drive;
  while (reach > 0 && !tanksBigEnough(game, fleet, reach)) reach--;
  if (reach === 0) return out;
  const startFuelled = canRefuelAt(game, fleet, fleet.system);
  const firstReach = Math.max(game.fleetRange(fleet), startFuelled ? reach : 0);
  if (firstReach === 0) return out;

  const refuels = new Map<string, boolean>();
  const canStop = (at: string) => {
    let held = refuels.get(at);
    if (held === undefined) {
      held = !avoid.has(at) && canRefuelAt(game, fleet, at);
      refuels.set(at, held);
    }
    return held;
  };
  const seen = new Set([fleet.system]);
  let frontier = [fleet.system];
  let hops = 0;
  while (frontier.length > 0) {
    hops++;
    const next: string[] = [];
    for (const here of frontier) {
      const hop = here === fleet.system ? firstReach : reach;
      for (const at of game.neighbours(here, hop)) {
        if (seen.has(at)) continue;
        seen.add(at);
        out.set(at, { hops, prev: here });
        if (canStop(at)) next.push(at);
      }
    }
    frontier = next;
  }
  return out;
}

/** The hexes to jump to in order from where the fleet is, out of a jump map. */
export function pathIn(map: ReadonlyMap<string, { hops: number; prev: string }>, from: string, to: string): string[] | null {
  if (!map.has(to)) return null;
  const path = [to];
  let at = map.get(to)!.prev;
  while (at !== from) {
    path.unshift(at);
    at = map.get(at)!.prev;
  }
  return path;
}

/**
 * The fewest jumps from where a fleet is to a system. Returns the hexes to jump
 * to in order, not counting where it starts, or null where there is no way.
 */
export function routeTo(game: Game, fleet: Fleet, to: string, avoid: ReadonlySet<string> = new Set()): string[] | null {
  if (fleet.system === to || !game.worlds.has(to)) return null;
  return pathIn(jumpMap(game, fleet, avoid), fleet.system, to);
}
