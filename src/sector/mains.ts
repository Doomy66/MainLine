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
    const capital = [...group].sort(capitalFirst)[0]!;
    mains.push({
      name: capital.name,
      hexes: group.map((w) => w.at).sort((a, b) => a.localeCompare(b)),
      capital: capital.at,
    });
  }
  return mains.sort((a, b) => b.hexes.length - a.hexes.length || a.name.localeCompare(b.name));
}

/** The world a Main is ruled from sorts first: most people, then the best port, then tech. */
export function capitalFirst(a: World, b: World): number {
  return (
    b.uwp.population - a.uwp.population ||
    starportRank(a.uwp.starport) - starportRank(b.uwp.starport) ||
    b.uwp.tl - a.uwp.tl ||
    a.at.localeCompare(b.at)
  );
}

/** A before B before C, so the better port sorts first. */
export function starportRank(port: string): number {
  const at = "ABCDEX".indexOf(port);
  return at < 0 ? 9 : at;
}

/** A piece of a Main that splitMain has cut up. */
export interface MainPiece extends Main {
  /** The capital hex of the Main it was cut from. */
  readonly splitFrom: string;
}

/**
 * Cuts a Main too big to be one Empire into pieces worth no more than `limit`
 * each, where `worth` is whatever winning is counted in and `line` is what
 * winning takes, or gives null where the Main is to stay whole. At standard
 * density one Main can be most of a sector, and as one Empire it would win on
 * the second day.
 *
 * The Main's most populous worlds that lie far apart become capitals, and
 * every world joins the capital nearest it along the Main, counting jump-1
 * links, so each piece is still a run a jump-1 ship can cross. A piece of
 * fewer than `minWorlds` worlds is too small to be an Empire, so it joins the
 * least of the pieces beside it. Capitals are added until every piece is
 * small enough.
 *
 * Some Mains cannot be cut that fine: where most of the people live on one or
 * two worlds, or the Main is short. One of those is cut as fine as it can be
 * if that takes at least a third off its biggest piece, and otherwise stays
 * whole, as cutting it would only make weak Empires beside a strong one. But
 * a Main that holds what winning takes is cut until no piece does, into
 * pieces smaller than `minWorlds` if need be. Nothing here is random, so a
 * sector always splits the same way.
 */
export function splitMain(
  main: Main,
  worlds: ReadonlyMap<string, World>,
  worth: (w: World) => number,
  limit: number,
  line: number,
  minWorlds: number,
): MainPiece[] | null {
  const of = (hexes: readonly string[]) => hexes.reduce((t, at) => t + worth(worlds.get(at)!), 0);
  const whole = of(main.hexes);
  if (whole <= limit) return null;
  const links = new Map(main.hexes.map((at) => [at, main.hexes.filter((o) => hexDistance(worlds.get(at)!.hex, worlds.get(o)!.hex) === 1)]));
  const ranked = main.hexes.map((at) => worlds.get(at)!).sort(capitalFirst).map((w) => w.at);

  let best = cut(minWorlds);
  for (let fewest = minWorlds - 1; whole >= line && best.most >= line && fewest >= 1; fewest--) best = cut(fewest);
  const worthIt = best.most <= limit || best.most <= (whole * 2) / 3 || (whole >= line && best.most < line);
  if (best.pieces.length < 2 || !worthIt) return null;
  return best.pieces.map((hexes) => {
    const capital = hexes.map((at) => worlds.get(at)!).sort(capitalFirst)[0]!;
    return { name: capital.name, hexes: [...hexes].sort((a, b) => a.localeCompare(b)), capital: capital.at, splitFrom: main.capital };
  });

  /** The fewest pieces that bring every piece under the limit, or failing that the cut whose biggest piece is least. */
  function cut(fewest: number): { pieces: string[][]; most: number } {
    const capitals = [main.capital];
    let best = { pieces: [[...main.hexes]], most: whole };
    // More capitals than this and some piece is bound to be too small, and folded away.
    const mostCapitals = Math.floor(main.hexes.length / fewest);
    while (capitals.length < mostCapitals) {
      // Another capital: the most populous world at least half as far from
      // the capitals there are as the farthest world is, and of worlds as
      // populous the farthest, which keeps the pieces even along a run of
      // worlds much alike.
      const { jumps } = reach(capitals);
      const farthest = Math.max(...ranked.map((at) => jumps.get(at)!));
      const far = ranked.filter((at) => jumps.get(at)! >= Math.max(1, farthest / 2));
      const population = (at: string) => worlds.get(at)!.uwp.population;
      capitals.push(far.reduce((a, b) => (population(b) > population(a) || (population(b) === population(a) && jumps.get(b)! > jumps.get(a)!) ? b : a)));

      const { nearest } = reach(capitals);
      const pieces: string[][] = capitals.map(() => []);
      for (const at of main.hexes) pieces[nearest.get(at)!]!.push(at);
      foldSmall(pieces, nearest, fewest);
      const kept = pieces.filter((p) => p.length > 0);
      const most = Math.max(...kept.map(of));
      if (most < best.most) best = { pieces: kept, most };
      if (most <= limit) break;
    }
    return best;
  }

  /**
   * Jumps along the Main to the nearest of some capitals, and which one that
   * is. Each world takes the capital of the world it was reached from, ties
   * going to the capital listed first, so every piece is connected.
   */
  function reach(from: readonly string[]) {
    const nearest = new Map<string, number>(from.map((at, i) => [at, i]));
    const jumps = new Map<string, number>(from.map((at) => [at, 0]));
    const walk = [...from];
    for (let i = 0; i < walk.length; i++) {
      const here = walk[i]!;
      for (const next of links.get(here)!) {
        if (jumps.has(next)) continue;
        jumps.set(next, jumps.get(here)! + 1);
        nearest.set(next, nearest.get(here)!);
        walk.push(next);
      }
    }
    return { nearest, jumps };
  }

  /** Pieces too small to be an Empire join the least of the pieces beside them, the least of them first. */
  function foldSmall(pieces: string[][], pieceOf: Map<string, number>, fewest: number): void {
    const value = pieces.map(of);
    for (;;) {
      const small = pieces
        .map((_, i) => i)
        .filter((i) => pieces[i]!.length > 0 && pieces[i]!.length < fewest)
        .sort((a, b) => value[a]! - value[b]! || a - b)[0];
      if (small === undefined) return;
      const beside = new Set(pieces[small]!.flatMap((at) => links.get(at)!.map((o) => pieceOf.get(o)!)));
      beside.delete(small);
      const into = [...beside].sort((a, b) => value[a]! - value[b]! || a - b)[0];
      // The only piece left: the whole Main, which is never too small.
      if (into === undefined) return;
      for (const at of pieces[small]!) pieceOf.set(at, into);
      pieces[into]!.push(...pieces[small]!.splice(0));
      value[into] = value[into]! + value[small]!;
      value[small] = 0;
    }
  }
}
