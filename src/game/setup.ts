/**
 * Starting a game: a sector, the subsectors in play, which Mains belong to
 * which players, and the credits each faction has to buy its first fleet with.
 */

import type { Design } from "../shipdesign/engine/design";
import { subsectorOf } from "../sector/hex";
import { mainsIn, type Main } from "../sector/mains";
import type { SectorData, World } from "../sector/sec";
import { Game } from "./game";
import { colourTerritories, factionColour, polityName } from "./names";
import { distanceBetween } from "../sector/hex";
import { Rng, seedOf } from "./rng";
import { defenceMax, income } from "./rules";
import type { Faction, GameOptions, GameState, Personality } from "./types";

export const DEFAULT_OPTIONS: GameOptions = {
  victoryShare: 0.5,
  startingCredits: "wealth",
  startingWealth: 1,
  buildSpeed: 0.25,
  factionMinWorlds: 4,
  newsLag: 0,
  fullFog: false,
};

/** The worlds of a sector that are inside the subsectors in play. */
export function worldsInArea(sector: SectorData, area: readonly string[]): World[] {
  const letters = new Set(area);
  return sector.worlds.filter((w) => letters.has(subsectorOf(w.hex)));
}

/** The Mains that become factions, longest first. */
export function factionMains(sector: SectorData, area: readonly string[], minWorlds: number): Main[] {
  return mainsIn(worldsInArea(sector, area)).filter((m) => m.hexes.length >= minWorlds);
}

/** MCr a week a Main's worlds pay together. */
export function mainIncome(main: Main, worlds: ReadonlyMap<string, World>): number {
  return main.hexes.reduce((sum, at) => sum + income(worlds.get(at)!), 0);
}

/**
 * What a faction starts with. By wealth, a Main starts with a base sum plus ten
 * weeks of what its worlds pay, so a rich Main fields a bigger first fleet; by
 * equal shares everybody starts with the same.
 */
export function startingCredits(main: Main, worlds: ReadonlyMap<string, World>, options: GameOptions): number {
  const base = options.startingCredits === "equal" ? 600 : 250 + 10 * mainIncome(main, worlds);
  return Math.round(base * (options.startingWealth ?? 1));
}

export interface PlayerChoice {
  readonly name: string;
  /** The capital hex of the Main they play. */
  readonly capital: string;
}

export interface NewGame {
  readonly name: string;
  readonly sector: SectorData;
  readonly area: readonly string[];
  readonly players: readonly PlayerChoice[];
  readonly options: GameOptions;
  readonly designs: ReadonlyMap<string, Design>;
  readonly seed: string;
}

const PERSONALITIES: readonly Personality[] = ["aggressive", "cautious", "expansionist"];

export function createGame(spec: NewGame): Game {
  const rng = new Rng(seedOf(spec.seed));
  const inArea = worldsInArea(spec.sector, spec.area);
  const byHex = new Map(inArea.map((w) => [w.at, w]));
  const mains = factionMains(spec.sector, spec.area, spec.options.factionMinWorlds);
  const humans = new Map(spec.players.map((p, i) => [p.capital, { ...p, index: i }]));
  const colours = colourTerritories(
    mains.map((m) => ({ key: m.capital, hexes: m.hexes, human: humans.get(m.capital)?.index })),
    distanceBetween,
  );

  const factions: Faction[] = [];
  const owner = new Map<string, string>();
  mains.forEach((main, i) => {
    const human = humans.get(main.capital);
    const id = `F${i + 1}`;
    for (const at of main.hexes) owner.set(at, id);
    factions.push({
      id,
      name: polityName(byHex.get(main.capital)!.name, rng),
      colour: colours.get(main.capital) ?? factionColour(i, human !== undefined, human?.index ?? 0),
      human: human !== undefined,
      playerName: human?.name ?? "",
      main: main.name,
      capital: main.capital,
      credits: startingCredits(main, byHex, spec.options),
      alive: true,
      personality: rng.pick(PERSONALITIES),
      intel: {},
      builds: [],
      news: {},
      known: {},
      inbox: [],
      reports: {},
      orders: [],
      ready: false,
      waiting: false,
    });
  });
  // Humans give orders in the order they were listed.
  const humanOrder = new Map(spec.players.map((p, i) => [p.capital, i]));
  factions.sort((a, b) => {
    const ha = humanOrder.get(a.capital);
    const hb = humanOrder.get(b.capital);
    if (ha !== undefined && hb !== undefined) return ha - hb;
    if (ha !== undefined) return -1;
    if (hb !== undefined) return 1;
    return 0;
  });

  const state: GameState = {
    version: 1,
    name: spec.name,
    sector: { name: spec.sector.name, worlds: inArea },
    area: [...spec.area],
    day: 0,
    factions,
    worlds: Object.fromEntries(
      inArea.map((w) => [w.at, { owner: owner.get(w.at) ?? null, defence: defenceMax(w), siege: null, fought: -1 }]),
    ),
    fleets: [],
    designs: Object.fromEntries(spec.designs),
    rng: rng.state,
    nextId: 1,
    log: [],
    options: { ...spec.options },
    turn: 0,
    phase: "setup",
    winner: null,
    colourScheme: 2,
  };
  for (const f of factions) f.known = Object.fromEntries(Object.entries(state.worlds).map(([at, w]) => [at, w.owner]));
  // Worlds are given their navies as the game is made, by the Game itself.
  const game = new Game(state);
  for (const f of factions) {
    game.log({
      to: [f.id],
      kind: "info",
      text: `${f.name} rules the ${f.main} Empire from ${game.world(f.capital).name}. The treasury holds MCr${f.credits} for a first fleet.`,
      at: f.capital,
    });
  }
  return game;
}
