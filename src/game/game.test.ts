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
import { aiSetup, buyStarting, endTurn, orderBuild, runDays } from "./turn";
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

describe("shipyards", () => {
  it("build three at a time at a class A yard, and queue the rest", () => {
    const game = newGame({}, 1);
    game.state.phase = "play";
    game.state.day = 1;
    const me = game.humans()[0]!;
    const yard = game.state.sector.worlds.find((w) => w.uwp.starport === "A" && w.uwp.tl >= 12)!;
    game.worldState(yard.at).owner = me.id;
    me.credits = 10_000;
    for (let i = 0; i < 4; i++) expect(orderBuild(game, me, "Patrol-Corvette", yard.at)).toBe("");
    const [a, b, c, d] = me.builds;
    expect([a!.start, b!.start, c!.start]).toEqual([1, 1, 1]);
    expect(d!.start).toBe(a!.done);
    expect(d!.done - d!.start!).toBe(a!.done - a!.start!);
  });

  it("put a big ship on every spare slip, and give one back for a new order", () => {
    const game = newGame({}, 1);
    game.state.phase = "play";
    game.state.day = 1;
    const me = game.humans()[0]!;
    const yard = game.state.sector.worlds.find((w) => w.uwp.starport === "A" && w.uwp.tl >= 12)!;
    game.worldState(yard.at).owner = me.id;
    me.credits = 10_000;
    expect(orderBuild(game, me, "Hyperion-Escort-Carrier", yard.at)).toBe("");
    const big = me.builds[0]!;
    expect(big.done).toBe(1 + Math.ceil(big.work! / 3));
    const alone = big.done;
    expect(orderBuild(game, me, "Patrol-Corvette", yard.at)).toBe("");
    expect(big.done).toBeGreaterThan(alone);
  });
});

describe("the log", () => {
  it("keeps only what players read, and sheds the rest from older saves", () => {
    const game = newGame({}, 1, "LOG");
    game.state.phase = "play";
    const me = game.humans()[0]!;
    const ai = game.state.factions.filter((f) => !f.human).map((f) => f.id);
    game.log({ to: [ai[0]!, ai[1]!], kind: "info", text: "Between the computers" });
    game.log({ to: [me.id, ai[0]!], kind: "info", text: "Shared" });
    expect(game.state.log.some((e) => e.text === "Between the computers")).toBe(false);
    expect(game.state.log.find((e) => e.text === "Shared")!.to).toEqual([me.id]);
    const saved = JSON.parse(serialise(game));
    saved.log.push({ day: 0, to: [ai[0]], kind: "info", text: "Old news for a computer" });
    expect(parseGame(JSON.stringify(saved)).state.log.some((e) => e.text === "Old news for a computer")).toBe(false);
  });
});

describe("winning", () => {
  it("by population: ruling the share of the sector's people, however few its worlds", () => {
    const game = newGame({ victoryBy: "population", victoryShare: 0.3 }, 1, "WIN");
    game.state.phase = "play";
    game.state.day = 1;
    const me = game.humans()[0]!;
    const target = game.victoryTarget();
    const biggest = [...game.state.sector.worlds].sort((a, b) => b.uwp.population - a.uwp.population || b.pbg.multiplier - a.pbg.multiplier);
    for (const w of biggest) {
      if (game.holding(me.id).people >= target.need) break;
      game.worldState(w.at).owner = me.id;
    }
    expect(game.holding(me.id).worlds).toBeLessThan(target.worlds * 0.3);
    advanceDay(game);
    expect(game.state.winner).toBe(me.id);
  });

  it("by worlds in games saved before the choice", () => {
    const game = newGame({}, 1, "OLDWIN");
    const saved = JSON.parse(serialise(game));
    delete saved.options.victoryBy;
    expect(parseGame(JSON.stringify(saved)).state.options.victoryBy).toBe("worlds");
    expect(game.state.options.victoryBy).toBe("population");
  });
});

describe("garrisons", () => {
  it("join a world's defences for good, as one fleet, and go with the world", () => {
    const game = newGame({}, 1, "GARRISON");
    game.state.phase = "play";
    game.state.day = 1;
    const me = game.humans()[0]!;
    const at = me.capital;
    const a = game.newFleet(me.id, at, "gg", [game.newShip("Patrol-Corvette")], "Stray");
    const b = game.newFleet(me.id, at, "main", [game.newShip("Patrol-Corvette"), game.newShip("Patrol-Corvette")], "Lost boys");
    for (const f of [a, b]) f.order = { kind: "garrison" };
    advanceDay(game);
    const held = game.fleetsOf(me.id).filter((f) => f.order?.kind === "garrison");
    expect(held.length).toBe(1);
    expect(held[0]!.loc).toBe("main");
    expect(held[0]!.ships.length).toBe(3);
    expect(held[0]!.name).toBe(`${game.world(at).name} Garrison`);
    // The world goes, and its garrison with it.
    game.worldState(at).owner = null;
    advanceDay(game);
    expect(game.fleetsOf(me.id).some((f) => f.order?.kind === "garrison")).toBe(false);
  });
});

describe("losing a capital", () => {
  it("moves the government, throws the faction into disorder, and may lose it worlds", () => {
    const game = newGame({}, 1, "FALL");
    game.state.phase = "play";
    game.state.day = 1;
    const me = game.humans()[0]!;
    const victim = [...game.state.factions].filter((f) => !f.human).sort((a, b) => game.ownedWorlds(b.id).length - game.ownedWorlds(a.id).length)[0]!;
    (victim as { human: boolean }).human = true; // kept still for the test
    const capital = victim.capital;
    const before = game.ownedWorlds(victim.id).length;
    game.state.fleets = game.state.fleets.filter((f) => f.system !== capital);
    game.worldState(capital).defence = 0;
    const fleet = game.newFleet(me.id, capital, "main", Array.from({ length: 4 }, () => game.newShip("Broadsword-Mercenary-Cruiser")));
    fleet.standing = { ...STANDING_PRESETS["Seek and destroy"]! };
    for (let i = 0; i < 20 && game.worldState(capital).owner !== me.id; i++) advanceDay(game);
    expect(game.worldState(capital).owner).toBe(me.id);
    expect(victim.capital).not.toBe(capital);
    expect(game.worldState(victim.capital).owner).toBe(victim.id);
    expect(victim.disorderUntil).toBeGreaterThan(game.state.day);
    const after = game.ownedWorlds(victim.id).length;
    const brokeAway = game.state.log.filter((e) => /breaks away from/.test(e.text) && e.text.includes(victim.name)).length;
    expect(after).toBe(before - 1 - brokeAway);
    // Nothing on its slips moves while the disorder lasts.
    const yard = game.ownedWorlds(victim.id).find((w) => w.uwp.starport === "A" || w.uwp.starport === "B");
    if (yard !== undefined) {
      const build = { classId: "Pinnace", at: yard.at, name: "Test", placed: game.state.day - 1, work: 7, worked: 0, done: game.state.day + 7 };
      victim.builds.push(build);
      game.replanYard(yard.at);
      const due = build.done;
      advanceDay(game);
      expect(build.worked).toBe(0);
      // The forecast knew of the disorder: work starts the day it ends, and takes a week.
      expect(build.done).toBe(due);
      expect(due).toBe(victim.disorderUntil! + 6);
    }
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

  it("gains catalogue classes added since it was saved, and keeps its own", () => {
    const game = newGame({}, 0, "OLD");
    const saved = JSON.parse(serialise(game));
    delete saved.designs["Wasp-Heavy-Fighter"];
    saved.designs["Patrol-Corvette"].notes = "as saved";
    const loaded = parseGame(JSON.stringify(saved));
    expect(loaded.catalogue.has("Wasp-Heavy-Fighter")).toBe(true);
    expect(loaded.catalogue.get("Patrol-Corvette").notes).toBe("as saved");
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
