/**
 * Mains: runs of worlds each within one parsec of the next, so that a jump-1
 * ship can cross the whole of one. The same rule as PlanetHex's mainsIn: a
 * connected group under jump-1 of at least three worlds, named for its most
 * populous world.
 */

import { hexDistance } from "./hex";
import type { World } from "./sec";

export interface Main {
  readonly name: string;
  /** Hexes on it, in reading order. */
  readonly hexes: readonly string[];
  /** The most populous world, which is where its owner rules from. */
  readonly capital: string;
}

export const SHORTEST_MAIN = 3;

export function mainsIn(worlds: readonly World[], shortest = SHORTEST_MAIN): Main[] {
  const left = new Map(worlds.map((w) => [w.at, w]));
  const mains: Main[] = [];
  for (const world of worlds) {
    if (!left.has(world.at)) continue;
    const group: World[] = [];
    const walk = [world];
    left.delete(world.at);
    while (walk.length > 0) {
      const here = walk.pop()!;
      group.push(here);
      for (const other of [...left.values()]) {
        if (hexDistance(here.hex, other.hex) !== 1) continue;
        left.delete(other.at);
        walk.push(other);
      }
    }
    if (group.length < shortest) continue;
    const capital = [...group].sort(
      (a, b) =>
        b.uwp.population - a.uwp.population ||
        starportRank(a.uwp.starport) - starportRank(b.uwp.starport) ||
        b.uwp.tl - a.uwp.tl ||
        a.at.localeCompare(b.at),
    )[0]!;
    mains.push({
      name: capital.name,
      hexes: group.map((w) => w.at).sort((a, b) => a.localeCompare(b)),
      capital: capital.at,
    });
  }
  return mains.sort((a, b) => b.hexes.length - a.hexes.length || a.name.localeCompare(b.name));
}

/** A before B before C, so the better port sorts first. */
export function starportRank(port: string): number {
  const at = "ABCDEX".indexOf(port);
  return at < 0 ? 9 : at;
}
