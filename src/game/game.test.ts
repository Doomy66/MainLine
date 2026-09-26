import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bundledDesigns } from "../catalogue/catalogue";
import { parseSec } from "../sector/sec";
import { distanceBetween } from "../sector/hex";
import { advanceDay } from "./day";
import type { Game } from "./game";
import { routeTo } from "./nav";
import { captureDays, defenceMax, jumpFuel } from "./rules";
import { parseGame, serialise } from "./save";
import { createGame, DEFAULT_OPTIONS } from "./setup";
import { aiSetup, buyStarting, endTurn, runDays } from "./turn";
import type { GameOptions } from "./types";
import { STANDING_PRESETS } from "./types";

const sector = parseSec(readFileSync("sectors/Driftwater-Reach.sec", "utf8"));
const designs = bundledDesigns();

function newGame(options: Partial<GameOptions> = {}, players = 0, seed = "TEST"): Game {
  const probe = createGame({ name: "t", sector, area: "ABCDEFGHIJKLMNOP".split(""), players: [], options: { ...DEFAULT_OPTIONS, ...options }, designs, seed });
  const humans = probe.state.factions.slice(0, players).map((f, i) => ({ name: `P${i + 1}`, capital: f.capital }));
  return createGame({ name: "t", sector, area: "ABCDEFGHIJKLMNOP".split(""), players: humans, options: { ...DEFAULT_OPTIONS, ...options }, designs, seed });
}

describe("the catalogue", () => {
  it("holds every bundled design, and each is a legal ship", () => {
    const game = newGame();
    const all = game.catalogue.all();
    expect(all.length).toBeGreaterThanOrEqual(30);
    for (const c of all) {
      expect(c.sheet.problems.filter((p) => p.severity === "error")).toEqual([]);
      expect(c.hull).toBeGreaterThan(0);
      expect(c.cost).toBeGreaterThan(0);
    }
  });

  it("reads the book's Patrol Corvette off the design engine", () => {
    const pc = newGame().catalogue.get("Patrol-Corvette");
    expect(pc.tons).toBe(400);
    expect(pc.hull).toBe(160);
    expect(pc.thrust).toBe(4);
    expect(pc.jump).toBe(3);
    expect(pc.armour).toBe(4);
    // Two triple turrets of pulse lasers, two of missile racks.
    expect(pc.attacks.find((a) => a.label === "Pulse Laser")?.count).toBe(6);
    expect(pc.attacks.find((a) => a.label === "Missile Rack")?.count).toBe(6);
    expect(pc.missiles).toBe(72);
  });
});

describe("setting up", () => {
  it("makes every Main of four or more a faction, holding its own worlds", () => {
    const game = newGame();
    expect(game.state.factions.length).toBeGreaterThan(10);
    for (const f of game.state.factions) {
      expect(game.worldState(f.capital).owner).toBe(f.id);
      expect(f.credits).toBeGreaterThan(0);
    }
  });

  it("gives the computer its first fleet and waits for players", () => {
    const game = newGame({}, 1);
    aiSetup(game);
    expect(game.state.phase).toBe("setup");
    const ai = game.state.factions.find((f) => !f.human)!;
    expect(game.fleetsOf(ai.id).length).toBeGreaterThan(0);
    const me = game.humans()[0]!;
    expect(buyStarting(game, me, "Patrol-Corvette")).toBe("");
    expect(game.fleetsOf(me.id)[0]!.ships).toHaveLength(1);
    endTurn(game);
    expect(game.state.phase).toBe("play");
    expect(game.state.day).toBe(1);
  });
});

describe("jumping", () => {
  it("takes a week and a tenth of the hull in fuel a parsec", () => {
    const game = newGame({}, 1);
    const me = game.humans()[0]!;
    const fleet = game.newFleet(me.id, me.capital, "main", [game.newShip("Patrol-Corvette")]);
    const target = game.state.sector.worlds.find((w) => distanceBetween(me.capital, w.at) === 2)!;
    game.state.phase = "play";
    fleet.order = { kind: "jump", route: [target.at] };
    const before = fleet.ships[0]!.fuel;
    advanceDay(game);
    expect(fleet.transit?.to).toBe(target.at);
    expect(fleet.ships[0]!.fuel).toBeCloseTo(before - jumpFuel(400, 2));
    const due = fleet.transit!.arrive;
    expect(due - game.state.day).toBeGreaterThanOrEqual(7);
    while (game.state.day < due) advanceDay(game);
    expect(fleet.transit).toBeNull();
    expect(fleet.system).toBe(target.at);
    expect(fleet.loc).toBe("deep");
  });

  it("finds a route beyond one jump through places to refuel", () => {
    const game = newGame({}, 1);
    const me = game.humans()[0]!;
    const fleet = game.newFleet(me.id, me.capital, "main", [game.newShip("Scout-Courier")]);
    const far = game.state.sector.worlds
      .filter((w) => distanceBetween(me.capital, w.at) >= 6)
      .map((w) => ({ w, route: routeTo(game, fleet, w.at) }))
      .find((x) => x.route !== null);
    expect(far).toBeDefined();
    const route = far!.route!;
    expect(route.length).toBeGreaterThanOrEqual(3);
    let from = me.capital;
    for (const at of route) {
      expect(distanceBetween(from, at)).toBeLessThanOrEqual(2);
      from = at;
    }
  });

  it("will not jump a fleet with a ship that has no jump drive", () => {
    const game = newGame({}, 1);
    const me = game.humans()[0]!;
    const fleet = game.newFleet(me.id, me.capital, "main", [game.newShip("Patrol-Corvette"), game.newShip("Pinnace")]);
    const near = game.state.sector.worlds.find((w) => distanceBetween(me.capital, w.at) === 1)!;
    expect(game.canJump(fleet, near.at).ok).toBe(false);
  });
});

describe("taking a world", () => {
  it("silences its defences and holds orbit until it submits", () => {
    const game = newGame({}, 1);
    game.state.phase = "play";
    const me = game.humans()[0]!;
    const target = game.state.sector.worlds.find(
      (w) => game.worldState(w.at).owner === null && w.uwp.population >= 3 && defenceMax(w) > 0 && game.fleetsAt(w.at).length === 0,
    )!;
    const ships = Array.from({ length: 6 }, () => game.newShip("Broadsword-Mercenary-Cruiser"));
    const fleet = game.newFleet(me.id, target.at, "main", ships);
    fleet.standing = { ...STANDING_PRESETS["Seek and destroy"]! };
    for (let i = 0; i < 40 && game.worldState(target.at).owner !== me.id; i++) advanceDay(game);
    expect(game.worldState(target.at).owner).toBe(me.id);
    expect(game.state.log.some((e) => e.kind === "capture" && e.at === target.at)).toBe(true);
    expect(captureDays(target)).toBeGreaterThan(2);
  });

  it("leaves a world alone when the fleet's orders say not to besiege", () => {
    const game = newGame({}, 1);
    game.state.phase = "play";
    const me = game.humans()[0]!;
    const target = game.state.sector.worlds.find((w) => game.worldState(w.at).owner === null && w.uwp.population >= 3 && game.fleetsAt(w.at).length === 0)!;
    const fleet = game.newFleet(me.id, target.at, "main", [game.newShip("Broadsword-Mercenary-Cruiser")]);
    fleet.standing = { ...STANDING_PRESETS["Patrol"]! };
    for (let i = 0; i < 10; i++) advanceDay(game);
    expect(game.worldState(target.at).owner).toBeNull();
    expect(game.state.log.some((e) => e.kind === "combat" && e.at === target.at)).toBe(false);
  });
});

describe("news", () => {
  it("reaches a distant capital a week per courier jump", () => {
    const game = newGame({ newsLag: 2 });
    const me = game.state.factions[0]!;
    const far = game.state.sector.worlds.find((w) => distanceBetween(me.capital, w.at) === 5)!;
    expect(game.lag(me.id, far.at)).toBe(21);
    expect(game.lag(me.id, me.capital)).toBe(0);
    game.log({ to: [me.id], kind: "info", text: "far away", at: far.at });
    expect(game.logFor(me.id).some((e) => e.text === "far away")).toBe(false);
    game.state.day += 21;
    const e = game.logFor(me.id).find((x) => x.text === "far away");
    expect(e?.happened).toBe(0);
  });
});

describe("a whole game", () => {
  it("plays a hundred days with the computer on every side, and saves and loads", () => {
    const game = newGame({}, 0, "WHOLE");
    aiSetup(game);
    expect(game.state.phase).toBe("play");
    runDays(game, 100);
    expect(game.state.day).toBeGreaterThanOrEqual(100);
    expect(game.state.log.some((e) => e.kind === "combat")).toBe(true);
    expect(game.state.log.some((e) => e.kind === "capture")).toBe(true);
    for (const f of game.state.fleets) {
      for (const s of f.ships) {
        expect(s.damage).toBeLessThan(game.cls(s).hull);
        expect(s.fuel).toBeGreaterThanOrEqual(0);
      }
    }
    const again = parseGame(serialise(game));
    expect(again.state.day).toBe(game.state.day);
    expect(again.state.fleets.length).toBe(game.state.fleets.length);
    runDays(again, 5);
    expect(again.state.day).toBe(game.state.day + 5);
  });

  it("rolls the same game from the same seed", () => {
    const a = newGame({}, 0, "SAME");
    const b = newGame({}, 0, "SAME");
    aiSetup(a);
    aiSetup(b);
    runDays(a, 30);
    runDays(b, 30);
    expect(serialise(a)).toBe(serialise(b));
  });
});
