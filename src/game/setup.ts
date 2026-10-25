/**
 * Starting a game: a sector, the subsectors in play, which Mains belong to
 * which players, and the credits each faction has to buy its first fleet with.
 */

import type { Design } from "../shipdesign/engine/design";
import { subsectorOf } from "../sector/hex";
import { mainsIn, type Main } from "../sector/mains";
import { claimedBy, polityMains } from "../sector/polities";
import type { SectorData, World } from "../sector/sec";
import { Game } from "./game";
import { colourTerritories, factionColour, polityName } from "./names";
import { distanceBetween } from "../sector/hex";
import { Rng, seedOf } from "./rng";
import { temperFromId } from "./temper";
import { startingRelations } from "./relations";
import { defenceMax, income } from "./rules";
import type { Faction, GameOptions, GameState, Personality } from "./types";

export const DEFAULT_OPTIONS: GameOptions = {
  victoryShare: 0.5,
  victoryBy: "population",
  startingCredits: "wealth",
  startingWealth: 1,
  buildSpeed: 0.25,
  factionMinWorlds: 4,
  empiresFrom: "mains",
  newsLag: 0,
  fullFog: false,
};

/** The worlds of a sector that are inside the subsectors in play. */
export function worldsInArea(sector: SectorData, area: readonly string[]): World[] {
  const letters = new Set(area);
  return sector.worlds.filter((w) => letters.has(subsectorOf(w.hex)));
}

/** Where an Empire starts: a Main, and the polity it belongs to when Empires come from allegiances. */
export type Start = Main & { readonly allegiance?: string };

/** The Mains that become factions, longest first. */
export function factionMains(
  sector: SectorData,
  area: readonly string[],
  options: Pick<GameOptions, "factionMinWorlds" | "empiresFrom">,
): Start[] {
  const inArea = worldsInArea(sector, area);
  if (options.empiresFrom === "allegiance") return polityMains(inArea, options.factionMinWorlds);
  return mainsIn(inArea).filter((m) => m.hexes.length >= options.factionMinWorlds);
}

/** Whether any world in the sector belongs to somebody, so Empires can come from allegiances. */
export function hasAllegiances(sector: SectorData): boolean {
  return sector.worlds.some((w) => claimedBy(w) !== null);
}

/**
 * An Empire's name from the polity it belongs to: "Third Imperium", or
 * "Third Imperium (Regina)" where the polity is several Empires. Null where
 * the polity has no name to give, or is a client state, whose Mains are each
 * a small state of their own and are named as any Main is.
 */
export function empireName(start: Start, sector: SectorData, all: readonly Start[]): string | null {
  const code = start.allegiance;
  if (code === undefined || code.startsWith("Cs")) return null;
  const polity = sector.polities?.find((p) => p.code === code);
  const base = polity?.name.split(",")[0]!.trim() ?? "";
  if (base === "") return null;
  return all.filter((m) => m.allegiance === code).length > 1 ? `${base} (${start.name})` : base;
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
  const mains = factionMains(spec.sector, spec.area, spec.options);
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
      name: empireName(main, spec.sector, mains) ?? polityName(byHex.get(main.capital)!.name, rng),
      colour: colours.get(main.capital) ?? factionColour(i, human !== undefined, human?.index ?? 0),
      human: human !== undefined,
      playerName: human?.name ?? "",
      main: main.name,
      ...(main.allegiance === undefined ? {} : { allegiance: main.allegiance }),
      capital: main.capital,
      credits: startingCredits(main, byHex, spec.options),
      alive: true,
      personality: rng.pick(PERSONALITIES),
      temper: { aggression: 0, resolve: 0, expansion: 0, caution: 0 },
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
  // Each Empire's character, varied from its personality by the game's seed.
  for (const f of factions) f.temper = temperFromId(f.personality, `${spec.seed}|${f.id}`);
  const relations = startingRelations(factions, { name: spec.sector.name, worlds: inArea }, owner, spec.seed);
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
    sector: { name: spec.sector.name, worlds: inArea, ...(spec.sector.polities === undefined ? {} : { polities: spec.sector.polities }) },
    area: [...spec.area],
    day: 0,
    factions,
    worlds: Object.fromEntries(
      inArea.map((w) => [w.at, { owner: owner.get(w.at) ?? null, defence: defenceMax(w), siege: null, fought: -1 }]),
    ),
    fleets: [],
    relations,
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
