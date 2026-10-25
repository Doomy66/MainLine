import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bundledDesigns } from "../catalogue/catalogue";
import { parseSectorFile } from "../sector/sectorfile";
import { distanceBetween } from "../sector/hex";
import { advanceDay } from "./day";
import type { Game } from "./game";
import { createGame, DEFAULT_OPTIONS } from "./setup";
import type { GameOptions } from "./types";
import { STANDING_PRESETS } from "./types";

const sector = parseSectorFile(readFileSync("sectors/Driftwater-Reach.sector", "utf8"));
const designs = bundledDesigns();

/** A game with one human, playing from day one, and nobody else's fleets about. */
function oneHuman(options: Partial<GameOptions> = {}): { game: Game; me: Game["state"]["factions"][number] } {
  const probe = createGame({ name: "t", sector, area: "ABCDEFGHIJKLMNOP".split(""), players: [], options: { ...DEFAULT_OPTIONS, ...options }, designs, seed: "FOG" });
  const capital = probe.state.factions[0]!.capital;
  const game = createGame({ name: "t", sector, area: "ABCDEFGHIJKLMNOP".split(""), players: [{ name: "P", capital }], options: { ...DEFAULT_OPTIONS, ...options }, designs, seed: "FOG" });
  game.state.phase = "play";
  game.state.day = 1;
  return { game, me: game.humans()[0]! };
}

function independentWith(game: Game, pred: (at: string) => boolean = () => true): string {
  return game.state.sector.worlds.find(
    (w) => game.worldState(w.at).owner === null && w.uwp.population >= 4 && w.uwp.tl >= 9 && game.fleetsAt(w.at).length === 0 && pred(w.at),
  )!.at;
}

describe("fleets passing through", () => {
  it("do not besiege a world they stop at on the way somewhere", () => {
    const { game, me } = oneHuman({ newsLag: 0 });
    const at = independentWith(game);
    const fleet = game.newFleet(me.id, at, "main", [game.newShip("Broadsword-Mercenary-Cruiser")]);
    fleet.standing = { ...STANDING_PRESETS["Seek and destroy"]! };
    // On a route with the next jump still to make: passing through.
    const onward = game.state.sector.worlds.find((w) => w.at !== at && distanceBetween(at, w.at) <= 2)!.at;
    fleet.order = { kind: "jump", route: [onward] };
    fleet.ships[0]!.fuel = 0; // stuck refuelling here for now
    advanceDay(game);
    expect(game.state.log.some((e) => e.kind === "combat" && e.at === at)).toBe(false);
  });
});

describe("enemy fleets", () => {
  it("are reported arriving with the day they came, and reported gone when they go", () => {
    const { game, me } = oneHuman({ newsLag: 0 });
    const enemy = game.state.factions.find((f) => !f.human)!;
    // Kept out of the computer's hands, so the visitor goes only where the test sends it.
    (enemy as { human: boolean }).human = true;
    const home = me.capital;
    const visitor = game.newFleet(enemy.id, home, "deep", [game.newShip("Scout-Courier")]);
    visitor.standing = { ...STANDING_PRESETS["Avoid battle"]! };
    advanceDay(game);
    const seen = me.intel[visitor.id]!;
    expect(seen.since).toBe(game.state.day);
    expect(game.logFor(me.id).some((e) => e.kind === "sighting" && /arrive/.test(e.text))).toBe(true);
    advanceDay(game);
    expect(me.intel[visitor.id]!.since).toBe(seen.since);
    // It leaves.
    const away = game.state.sector.worlds.find((w) => distanceBetween(home, w.at) === 2)!.at;
    visitor.transit = { from: home, to: away, depart: game.state.day, arrive: game.state.day + 7 };
    advanceDay(game);
    const gone = me.intel[visitor.id]!;
    expect(gone.left).toBe(game.state.day);
    expect(game.logFor(me.id).some((e) => e.kind === "sighting" && /gone/.test(e.text) && e.text.includes(`day ${seen.since}`))).toBe(true);
  });
});

describe("news of your own fleets", () => {
  it("comes at once without full fog, however far away the fleet is", () => {
    const { game, me } = oneHuman({ newsLag: 1 });
    const at = independentWith(game, (x) => distanceBetween(me.capital, x) >= 4);
    const fleet = game.newFleet(me.id, at, "main", Array.from({ length: 4 }, () => game.newShip("Broadsword-Mercenary-Cruiser")));
    fleet.standing = { ...STANDING_PRESETS["Seek and destroy"]! };
    advanceDay(game);
    expect(game.logFor(me.id).some((e) => e.kind === "combat" && e.at === at)).toBe(true);
  });

  it("comes by courier under full fog, and so do orders", () => {
    const { game, me } = oneHuman({ newsLag: 1, fullFog: true });
    const far = game.state.sector.worlds.find((w) => distanceBetween(me.capital, w.at) === 3)!.at;
    const fleet = game.newFleet(me.id, far, "deep", [game.newShip("Scout-Courier")]);
    game.setFog(1, false);
    game.setFog(1, true); // the capital starts knowing where everything is
    expect(me.reports[fleet.id]?.fleet.loc).toBe("deep");
    const lands = game.command(me.id, fleet.id, { order: { kind: "move", to: "main" } }, "to orbit");
    expect(lands - game.state.day).toBe(21);
    expect(fleet.order).toBeNull();
    while (game.state.day < lands) advanceDay(game);
    expect(fleet.loc).toBe("main");
    // The capital has not heard yet that it moved.
    expect(me.reports[fleet.id]?.fleet.loc).toBe("deep");
    for (let i = 0; i < 21; i++) advanceDay(game);
    expect(me.reports[fleet.id]?.fleet.loc).toBe("main");
  });

  it("goes back to the plain truth when full fog is turned off, orders in the post arriving at once", () => {
    const { game, me } = oneHuman({ newsLag: 1, fullFog: true });
    const far = game.state.sector.worlds.find((w) => distanceBetween(me.capital, w.at) === 3)!.at;
    const fleet = game.newFleet(me.id, far, "deep", [game.newShip("Scout-Courier")]);
    game.setFog(1, false);
    game.setFog(1, true);
    game.command(me.id, fleet.id, { order: { kind: "move", to: "main" } }, "to orbit");
    expect(me.orders).toHaveLength(1);
    game.setFog(1, false);
    expect(me.orders).toHaveLength(0);
    expect(fleet.order).toEqual({ kind: "move", to: "main" });
    expect(game.fleetsSeenBy(me.id)).toContain(fleet);
  });

  it("keeps showing a lost fleet until the news of its loss arrives", () => {
    const { game, me } = oneHuman({ newsLag: 1, fullFog: true });
    const at = independentWith(game, (x) => distanceBetween(me.capital, x) >= 2 && distanceBetween(me.capital, x) <= 10);
    const fleet = game.newFleet(me.id, at, "main", [game.newShip("Seeker-Mining-Ship")]);
    fleet.standing = { ...STANDING_PRESETS["Seek and destroy"]!, withdrawAt: 0 };
    game.setFog(1, false);
    game.setFog(1, true);
    for (let i = 0; i < 6 && game.fleet(fleet.id) !== undefined; i++) advanceDay(game);
    expect(game.fleet(fleet.id)).toBeUndefined();
    expect(me.reports[fleet.id]).toBeDefined();
    const lag = game.lag(me.id, at);
    for (let i = 0; i <= lag; i++) advanceDay(game);
    expect(me.reports[fleet.id]).toBeUndefined();
    expect(game.logFor(me.id).some((e) => e.kind === "combat" && e.at === at)).toBe(true);
  });
});

describe("news of other fleets in the post", () => {
  it("is not sent where it would be forgotten on arrival, and news that overtakes older news replaces it", () => {
    const { game, me } = oneHuman({ newsLag: 1 });
    const enemy = game.state.factions.find((f) => !f.human)!;
    // Kept out of the computer's hands, so its fleets stay where the test puts them.
    (enemy as { human: boolean }).human = true;
    const world = (pred: (d: number) => boolean) => game.state.sector.worlds.find((w) => pred(distanceBetween(me.capital, w.at)))!.at;
    const beyond = world((d) => d >= 9);
    const far = world((d) => d === 5);
    const near = world((d) => d === 1);
    expect(game.lag(me.id, beyond)).toBeGreaterThan(60);
    const scout = (fleetOwner: string, at: string) => {
      const f = game.newFleet(fleetOwner, at, "deep", [game.newShip("Scout-Courier")]);
      f.standing = { ...STANDING_PRESETS["Avoid battle"]! };
      return f;
    };
    for (const at of [beyond, far, near]) scout(me.id, at);
    const lost = scout(enemy.id, beyond);
    const moving = scout(enemy.id, far);
    const posted = (id: string) => me.inbox.filter((d) => d.kind === "sighting" && d.sighting.fleetId === id);

    advanceDay(game);
    expect(me.intel[lost.id]).toBeDefined();
    expect(posted(lost.id)).toHaveLength(0);
    expect(posted(moving.id).map((d) => d.arrives)).toEqual([game.state.day + 35]);

    // It comes nearer the capital, so news of it there gets home first.
    moving.system = near;
    advanceDay(game);
    expect(posted(moving.id).map((d) => d.arrives)).toEqual([game.state.day + 7]);
  });

  it("is not sent to the computer's Empires, which go by what they see", () => {
    const { game, me } = oneHuman({ newsLag: 1 });
    const computer = game.state.factions.find((f) => !f.human && game.ownedWorlds(f.id).some((w) => game.lag(f.id, w.at) > 0))!;
    const at = game.ownedWorlds(computer.id).find((w) => game.lag(computer.id, w.at) > 0)!.at;
    const visitor = game.newFleet(me.id, at, "deep", [game.newShip("Scout-Courier")]);
    visitor.standing = { ...STANDING_PRESETS["Avoid battle"]! };
    advanceDay(game);
    expect(computer.intel[visitor.id]).toBeDefined();
    expect(computer.inbox.filter((d) => d.kind === "sighting")).toHaveLength(0);
  });
});
