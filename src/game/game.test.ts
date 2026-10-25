import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bundledDesigns, Catalogue } from "../catalogue/catalogue";
import { damageAgainst } from "../catalogue/shipclass";
import { parseSec } from "../sector/sec";
import { parseSectorFile } from "../sector/sectorfile";
import { distanceBetween } from "../sector/hex";
import { planAi } from "./ai";
import { advanceDay } from "./day";
import type { Game } from "./game";
import { routeTo } from "./nav";
import { alliesOf, answerOffer, atWar, declareWar, diplomacy, makeOffer, offerBetween, offersTo, onCapture, PEACE_AT, relationOf, standing, WAR_AT } from "./relations";
import { alerts } from "./attention";
import { battleAt } from "./combat";
import { visibleSystems } from "./visibility";
import { captureDays, defenceMax, jumpFuel, repairPort, slipsAt } from "./rules";
import { parseGame, serialise } from "./save";
import { BIGGEST_START, createGame, DEFAULT_OPTIONS, factionMains, hasAllegiances, victoryLine, worldsInArea } from "./setup";
import { mainsIn } from "../sector/mains";
import { aiSetup, buyStarting, endTurn, orderBuild, runDays } from "./turn";
import type { Faction, GameOptions } from "./types";
import { STANDING_PRESETS } from "./types";

const sector = parseSectorFile(readFileSync("sectors/Driftwater-Reach.sector", "utf8"));
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

describe("the computer's character", () => {
  it("differs between Empires of one personality, and is the same each time for an old save", () => {
    const game = newGame({}, 0, "TEMPER");
    const alike = game.state.factions.filter((f) => f.personality === game.state.factions[0]!.personality);
    expect(new Set(alike.map((f) => JSON.stringify(f.temper))).size).toBe(alike.length);
    const saved = JSON.parse(serialise(game));
    for (const f of saved.factions) delete f.temper;
    const again = parseGame(JSON.stringify(saved));
    const twice = parseGame(JSON.stringify(saved));
    expect(again.state.factions.map((f) => f.temper)).toEqual(twice.state.factions.map((f) => f.temper));
  });

  it("stops a fleet that has fought in one place three days to no end", () => {
    const game = newGame({}, 1, "STANDOFF");
    game.state.phase = "play";
    game.state.day = 10;
    const ai = game.state.factions.find((f) => !f.human)!;
    const elsewhere = game.state.sector.worlds.find((w) => game.worldState(w.at).owner !== ai.id && w.pbg.giants > 0)!;
    const f = game.newFleet(ai.id, elsewhere.at, "gg", [game.newShip("Patrol-Corvette")], "Strike");
    f.order = { kind: "jump", route: [ai.capital] };
    f.fighting = { at: f.system, loc: "gg", since: 7, last: 9 };
    planAi(game, ai);
    expect(f.standing.engage).toBe("none");
    expect(f.order?.kind).toBe("jump");
  });
});

describe("building for the enemy", () => {
  it("knows light guns suffer against heavy armour and meson guns do not", () => {
    const cat = new Catalogue(designs);
    const kept = (id: string, armour: number) => damageAgainst(cat.get(id), armour) / damageAgainst(cat.get(id), 0);
    // The Broadsword's beam lasers against a Dragon's armour 12, beside a Dragon's own particle bay.
    expect(kept("Broadsword-Mercenary-Cruiser", 12)).toBeLessThan(kept("Dragon-System-Defence-Boat", 12));
    expect(kept("Broadsword-Mercenary-Cruiser", 12)).toBeLessThan(0.5);
    expect(kept("Broadsword-Mercenary-Cruiser", 0)).toBe(1);
  });
});

describe("fuel", () => {
  it("is shared within a fleet where there is none to be had, and carries it over the jump", () => {
    const game = newGame({}, 1, "FUEL");
    game.state.phase = "play";
    game.state.day = 1;
    const me = game.humans()[0]!;
    // A system with no gas giant, no water and no starport that will sell.
    const dry = game.state.sector.worlds.find((w) => w.pbg.giants === 0 && w.uwp.hydrographics === 0 && !"ABCD".includes(w.uwp.starport))!;
    const next = game.neighbours(dry.at, 1).find((at) => at !== dry.at)!;
    const tanker = game.newShip("Hydrogen-Fleet-Tanker");
    const corvette = game.newShip("Patrol-Corvette");
    corvette.fuel = 0;
    const fleet = game.newFleet(me.id, dry.at, "deep", [tanker, corvette], "Thirsty");
    fleet.order = { kind: "jump", route: [next] };
    advanceDay(game);
    expect(corvette.fuel).toBeGreaterThan(0);
    advanceDay(game);
    expect(fleet.transit?.to).toBe(next);
  });
});

describe("admirals", () => {
  it("take worlds near their base, day after day, with nobody giving orders", () => {
    const game = newGame({}, 1, "ADMIRAL");
    game.state.phase = "play";
    game.state.day = 1;
    const me = game.humans()[0]!;
    const before = game.ownedWorlds(me.id).length;
    const fleet = game.newFleet(me.id, me.capital, "main", Array.from({ length: 4 }, () => game.newShip("Broadsword-Mercenary-Cruiser")), "Admiral's own");
    game.applyCommand(fleet, { admiral: { mission: "conquer", style: "bold", base: me.capital } });
    for (let i = 0; i < 90; i++) advanceDay(game);
    expect(game.ownedWorlds(me.id).length).toBeGreaterThan(before);
    expect(game.state.log.some((e) => e.to.includes(me.id) && /admiral heads for .*, because it looks a good target/.test(e.text))).toBe(true);
  });

  it("do not sit repairing at a class D port that cannot fix what is broken", () => {
    const game = newGame({}, 1, "MEND");
    game.state.phase = "play";
    game.state.day = 1;
    const me = game.humans()[0]!;
    const port = game.state.sector.worlds.find((w) => w.uwp.starport === "D" && w.at !== me.capital)!;
    game.worldState(port.at).owner = me.id;
    const ship = game.newShip("Patrol-Corvette");
    ship.crits.thrust = 1;
    const fleet = game.newFleet(me.id, port.at, "main", [ship], "Limping");
    // By hand: the order ends once the hull is whole, with word of why.
    fleet.order = { kind: "repair" };
    advanceDay(game);
    expect(fleet.order).toBeNull();
    expect(game.state.log.some((e) => /cannot fix damaged drives/.test(e.text))).toBe(true);
    // Under an admiral: it does not put in here again for the drive.
    game.applyCommand(fleet, { admiral: { mission: "defend", style: "steady", base: port.at } });
    advanceDay(game);
    expect(fleet.order?.kind === "repair" && fleet.system === port.at).toBe(false);
  });

  it("are relieved by an order given by hand", () => {
    const game = newGame({}, 1, "RELIEF");
    const me = game.humans()[0]!;
    const fleet = game.newFleet(me.id, me.capital, "main", [game.newShip("Patrol-Corvette")], "Relieved");
    game.applyCommand(fleet, { admiral: { mission: "defend", style: "steady", base: me.capital } });
    expect(fleet.admiral?.mission).toBe("defend");
    game.applyCommand(fleet, { order: { kind: "move", to: "gg" } });
    expect(fleet.admiral).toBeUndefined();
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
    declareWar(game, me.id, victim.id, "to test the fall of a capital");
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

  it("does not move the government to a world with enemy warships in the system", () => {
    const game = newGame({}, 1, "FALL");
    game.state.phase = "play";
    game.state.day = 1;
    const me = game.humans()[0]!;
    const victim = [...game.state.factions].filter((f) => !f.human).sort((a, b) => game.ownedWorlds(b.id).length - game.ownedWorlds(a.id).length)[0]!;
    (victim as { human: boolean }).human = true; // kept still for the test
    const capital = victim.capital;
    // Every great world of the victim's but one has our warships waiting off it.
    const others = game.ownedWorlds(victim.id).filter((w) => w.at !== capital);
    const most = Math.max(...others.map((w) => w.uwp.population));
    const great = others.filter((w) => w.uwp.population >= most - 2).sort((a, b) => b.uwp.population - a.uwp.population);
    const spared = great[great.length - 1]!;
    const watched = great.filter((w) => w !== spared);
    expect(watched.length).toBeGreaterThan(0);
    game.state.fleets = game.state.fleets.filter((f) => f.system !== capital && !watched.some((w) => w.at === f.system));
    for (const w of watched) {
      const f = game.newFleet(me.id, w.at, "deep", [game.newShip("Patrol-Corvette")], `Watching ${w.name}`);
      f.standing = { ...f.standing, intercept: false, besiege: false };
    }
    game.worldState(capital).defence = 0;
    const fleet = game.newFleet(me.id, capital, "main", Array.from({ length: 4 }, () => game.newShip("Broadsword-Mercenary-Cruiser")));
    fleet.standing = { ...STANDING_PRESETS["Seek and destroy"]! };
    declareWar(game, me.id, victim.id, "to test the fall of a capital");
    for (let i = 0; i < 20 && game.worldState(capital).owner !== me.id; i++) advanceDay(game);
    expect(game.worldState(capital).owner).toBe(me.id);
    expect(watched.map((w) => w.at)).not.toContain(victim.capital);
    expect(game.fleetsAt(victim.capital).some((f) => f.owner === me.id)).toBe(false);
  });
});

describe("bases", () => {
  it("repair as a class A port at a naval base and a class B at a scout base, but build nothing", () => {
    const any = newGame({}, 0, "BASES").state.sector.worlds[0]!;
    const world = (port: string, bases: string) => ({ ...any, uwp: { ...any.uwp, starport: port }, bases });
    expect(repairPort(world("E", "N"))).toBe("A");
    expect(repairPort(world("X", "S"))).toBe("B");
    expect(repairPort(world("D", "A"))).toBe("A");
    expect(repairPort(world("C", ""))).toBe("C");
    expect(repairPort(world("A", "S"))).toBe("A");
    expect(slipsAt(world("E", "N"))).toBe(0);
  });
});

describe("the end of an Empire", () => {
  /** A faction stripped of its worlds, its fleets and its slips. */
  function strip(game: Game, f: Faction): void {
    for (const w of game.ownedWorlds(f.id)) game.worldState(w.at).owner = null;
    game.state.fleets = game.state.fleets.filter((x) => x.owner !== f.id);
    f.builds = [];
  }

  it("comes with its last world, and its ships go over to whoever holds the system they are in or bound for", () => {
    const game = newGame({}, 1, "ZOMBIE");
    game.state.phase = "play";
    game.state.day = 1;
    const [gone, taker] = game.state.factions.filter((f) => !f.human) as [Faction, Faction];
    for (const f of [gone, taker]) (f as { human: boolean }).human = true; // kept still for the test
    strip(game, gone);
    gone.builds = [{ classId: "Patrol-Corvette", at: taker.capital, name: "Never Launched", done: 99 }];
    const free = game.state.sector.worlds.find((w) => game.worldState(w.at).owner === null && game.fleetsAt(w.at).length === 0)!.at;
    const before = game.worldState(free).defence;
    const boats = game.newFleet(gone.id, free, "deep", [game.newShip("Dragon-System-Defence-Boat"), game.newShip("Dragon-System-Defence-Boat")]);
    const there = game.newFleet(gone.id, taker.capital, "gg", [game.newShip("Patrol-Corvette")]);
    const jumping = game.newFleet(gone.id, free, "deep", [game.newShip("Patrol-Corvette")]);
    jumping.transit = { from: free, to: taker.capital, depart: 1, arrive: 8 };
    game.worldState(taker.capital).siege = null;
    advanceDay(game);
    expect(gone.alive).toBe(false);
    expect(gone.builds).toEqual([]);
    expect(game.fleetsOf(gone.id)).toEqual([]);
    // In an Empire's system, the Empire has them, in jump or not.
    expect(there.owner).toBe(taker.id);
    expect(jumping.owner).toBe(taker.id);
    // In an independent system, their hulls join the world's defences.
    expect(game.state.fleets).not.toContain(boats);
    expect(game.worldState(free).defence).toBeGreaterThan(before);
    expect(game.state.log.some((e) => e.text.startsWith(`${gone.name} is no more: its last world is lost`) && e.text.includes(`go over to ${taker.name}`))).toBe(true);
  });

  it("with no Empire left at all, ends the game with nobody the winner", () => {
    const game = newGame({}, 0, "NOBODY");
    game.state.phase = "play";
    game.state.day = 1;
    for (const f of game.state.factions) {
      // Kept still for the test: the computer would buy ships at an independent yard.
      (f as { human: boolean }).human = true;
      strip(game, f);
    }
    advanceDay(game);
    expect(game.state.factions.every((f) => !f.alive)).toBe(true);
    expect(game.state.phase).toBe("over");
    expect(game.state.winner).toBeNull();
    expect(game.state.log.some((e) => e.text.startsWith("No Empire is left standing"))).toBe(true);
  });
});

describe("battle reports", () => {
  it("tell a big battle's heaviest fire in full and add up the rest", () => {
    const game = newGame({}, 0, "BIG");
    game.state.phase = "play";
    const [a, b] = game.state.factions;
    declareWar(game, a!.id, b!.id, "to test a big battle");
    const at = game.state.sector.worlds.find((w) => game.worldState(w.at).owner === null && game.fleetsAt(w.at).length === 0)!.at;
    const one = game.newFleet(a!.id, at, "deep", Array.from({ length: 30 }, () => game.newShip("Patrol-Corvette")));
    const other = game.newFleet(b!.id, at, "deep", Array.from({ length: 30 }, () => game.newShip("Gazelle-Close-Escort")));
    for (const f of [one, other]) f.standing = { ...STANDING_PRESETS["Seek and destroy"]! };
    const report = battleAt(game, at, "deep")!;
    const rounds = report.lines.join("\n").split(/^Round \d+:$/m).slice(1);
    expect(rounds.length).toBeGreaterThan(0);
    for (const r of rounds) {
      const lines = r.split("\n");
      expect(lines.filter((l) => l.includes(" → ")).length).toBeLessThanOrEqual(8);
      expect(lines.filter((l) => / takes \d+ damage\.$/.test(l)).length).toBeLessThanOrEqual(8);
    }
    expect(report.lines).toContain("    The rest of the fire, side by side:");
    expect(report.lines.length).toBeLessThan(150);
    // The summary at the top still counts every ship in and lost.
    expect(report.lines[0]).toMatch(/: 30 in, \d+ lost/);
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

describe("Empires from allegiances", () => {
  // A made-up subsector: two separate stretches of the Imperium, a Zhodani
  // stretch, a client state and some non-aligned worlds.
  const line = (at: string, name: string, uwp: string, allegiance: string) => `${at}\t${name}\t${uwp}\t\t\t\t703\t${allegiance}\tG2 V`;
  const rows: string[] = ["Hex\tName\tUWP\tBases\tRemarks\tZone\tPBG\tAllegiance\tStars"];
  for (let r = 1; r <= 6; r++) rows.push(line(`010${r}`, r === 3 ? "Regina" : `Im${r}`, r === 3 ? "A788899-C" : "B555666-9", "ImDd"));
  for (let r = 1; r <= 5; r++) rows.push(line(`060${r}`, r === 2 ? "Efate" : `Ef${r}`, r === 2 ? "A777777-B" : "B555666-9", "ImDd"));
  for (const at of ["0308", "0309", "0310", "0408", "0409"]) rows.push(line(at, `Zh${at}`, "B555666-9", "ZhIN"));
  for (const at of ["0807", "0808", "0809", "0810"]) rows.push(line(at, `Cs${at}`, "C555666-8", "CsIm"));
  for (const at of ["0301", "0302", "0303", "0304"]) rows.push(line(at, `Na${at}`, "C555666-8", "NaHu"));
  const charted = {
    ...parseSec(rows.join("\n"), "Test Reach"),
    polities: [
      { code: "ImDd", name: "Third Imperium, Domain of Deneb", short: "Imperium" },
      { code: "ZhIN", name: "Zhodani Consulate, Iadr Nsobl Province", short: "Consulate" },
      { code: "CsIm", name: "Client state, Third Imperium", short: "NA" },
      { code: "NaHu", name: "Non-Aligned, Human-dominated", short: "NA" },
    ],
  };
  const start = (empiresFrom: "mains" | "allegiance") =>
    createGame({ name: "a", sector: charted, area: ["A"], players: [], options: { ...DEFAULT_OPTIONS, empiresFrom }, designs, seed: "ALLEGIANCE" });

  it("makes each polity's Mains its Empires and leaves the non-aligned independent", () => {
    expect(hasAllegiances(charted)).toBe(true);
    expect(hasAllegiances(sector)).toBe(false);
    const game = start("allegiance");
    const names = game.state.factions.map((f) => `${f.allegiance} ${f.name}`).sort();
    expect(names.slice(1)).toEqual(["ImDd Third Imperium (Efate)", "ImDd Third Imperium (Regina)", "ZhIN Zhodani Consulate"]);
    // A client state is a small state of its own, named as any Main is.
    expect(names[0]).toMatch(/^CsIm Cs0807 \w+$/);
    expect(game.state.factions.find((f) => f.name === "Third Imperium (Regina)")!.capital).toBe("0103");
    for (const at of ["0301", "0302", "0303", "0304"]) expect(game.worldState(at).owner).toBeNull();
    expect(game.state.sector.polities?.length).toBe(4);
    // The allegiance survives a save.
    expect(parseGame(serialise(game)).state.factions.map((f) => f.allegiance).sort()).toEqual(["CsIm", "ImDd", "ImDd", "ZhIN"]);
  });

  it("starts Empires of one polity as friends, and other polities as rivals", () => {
    const game = start("allegiance");
    const id = (name: string) => game.state.factions.find((f) => f.name.startsWith(name))!.id;
    const imperial = relationOf(game, id("Third Imperium (Regina)"), id("Third Imperium (Efate)"))!;
    expect(imperial.war).toBe(false);
    expect(imperial.score).toBeGreaterThanOrEqual(40);
    const client = relationOf(game, id("Third Imperium (Regina)"), id("Cs0807"))!;
    expect(client.score).toBeGreaterThan(relationOf(game, id("Third Imperium (Regina)"), id("Zhodani"))!.score);
  });

  /** Two Mains of four worlds each, five parsecs apart, under the codes given. */
  const pair = (codeA: string, codeB: string, polities: { code: string; name: string; short: string }[]) => {
    const lines = ["Hex\tName\tUWP\tBases\tRemarks\tZone\tPBG\tAllegiance\tStars"];
    for (let r = 1; r <= 4; r++) lines.push(line(`010${r}`, `West${r}`, "B555666-9", codeA));
    for (let r = 1; r <= 4; r++) lines.push(line(`060${r}`, `East${r}`, "B555666-9", codeB));
    const sector = { ...parseSec(lines.join("\n"), "Pair"), polities };
    const game = createGame({ name: "p", sector, area: ["A"], players: [], options: { ...DEFAULT_OPTIONS, empiresFrom: "allegiance" }, designs, seed: "KIN" });
    const [a, b] = game.state.factions as [Faction, Faction];
    return { game, score: relationOf(game, a.id, b.id)!.base };
  };

  it("finds polities kin by their names, not by codes that look alike", () => {
    // The Thoengling Empire and the Thirz Empire are strangers, for all their
    // codes start alike; with no names to go by, the codes are all there is.
    const named = pair("VThE", "VTzE", [
      { code: "VThE", name: "Thoengling Empire", short: "Thoengling" },
      { code: "VTzE", name: "Thirz Empire", short: "Thirz" },
    ]);
    const unnamed = pair("VThE", "VTzE", []);
    const unrelated = pair("VThE", "ZhCo", []);
    expect(unnamed.score - unrelated.score).toBe(70);
    // Two Domains of the Imperium are one family by name.
    const imperial = pair("ImDd", "ImDc", [
      { code: "ImDd", name: "Third Imperium, Domain of Deneb", short: "Imperium" },
      { code: "ImDc", name: "Third Imperium, Domain of Sylea", short: "Imperium" },
    ]);
    expect(imperial.score - named.score).toBe(70);
  });

  it("treats two client states under one code as sharing a patron, not as one polity", () => {
    const polities = [
      { code: "CsIm", name: "Client state, Third Imperium", short: "NA" },
      { code: "CsZh", name: "Client state, Zhodani Consulate", short: "NA" },
    ];
    const clients = pair("CsIm", "CsIm", polities);
    const strangers = pair("CsIm", "CsZh", polities);
    expect(clients.score - strangers.score).toBe(40);
    // Each is a state of its own, named as any Main is.
    expect(new Set(clients.game.state.factions.map((f) => f.name)).size).toBe(2);
  });

  it("names Empires of one polity apart even when their codes differ", () => {
    const { game } = pair("AsT0", "AsT1", [
      { code: "AsT0", name: "Aslan Hierate, Tlaukhu control, Yerlyaruiwo (1)", short: "Aslan" },
      { code: "AsT1", name: "Aslan Hierate, Tlaukhu control, Khaukheairl (2)", short: "Aslan" },
    ]);
    expect(game.state.factions.map((f) => f.name).sort()).toEqual(["Aslan Hierate (East1)", "Aslan Hierate (West1)"]);
  });

  it("refuses to start a game of fewer than two Empires", () => {
    const one = () => createGame({ name: "a", sector: charted, area: ["A"], players: [], options: { ...DEFAULT_OPTIONS, empiresFrom: "allegiance", factionMinWorlds: 6 }, designs, seed: "ONE" });
    expect(one).toThrow(/only one Empire/);
    const none = () => createGame({ name: "a", sector: charted, area: ["P"], players: [], options: { ...DEFAULT_OPTIONS }, designs, seed: "NONE" });
    expect(none).toThrow(/no Empires/);
  });

  it("ignores allegiance when Empires come from Mains", () => {
    const game = start("mains");
    expect(game.state.factions.every((f) => f.allegiance === undefined)).toBe(true);
    // The non-aligned worlds are a Main like any other, and so an Empire.
    expect(game.state.factions).toHaveLength(5);
    expect(game.worldState("0301").owner).not.toBeNull();
  });
});

describe("Mains too big to be one Empire", () => {
  const generated = (seed: string, density: string) =>
    parseSectorFile(JSON.stringify({ level: "sector", version: 1, name: seed, seed, date: "001-1105", density, shifts: { population: 0, tech: 0 }, subsectors: [] }));
  const whole = "ABCDEFGHIJKLMNOP".split("");

  it("leaves the bundled sectors' Mains whole when they are played whole", () => {
    for (const stem of ["Driftwater-Reach", "Spandrel-Verge"]) {
      const s = parseSectorFile(readFileSync(`sectors/${stem}.sector`, "utf8"));
      for (const victoryBy of ["population", "worlds"] as const) {
        expect(factionMains(s, whole, { ...DEFAULT_OPTIONS, victoryBy })).toEqual(mainsIn(s.worlds).filter((m) => m.hexes.length >= DEFAULT_OPTIONS.factionMinWorlds));
      }
    }
  });

  it("splits them so that nobody starts at the victory line", () => {
    for (const [seed, density, area] of [
      ["DELTA", "dense", whole],
      ["CHARLIE", "standard", whole],
      ["HOTEL", "standard", "ABEF".split("")],
    ] as const) {
      const s = generated(seed, density);
      for (const victoryBy of ["population", "worlds"] as const) {
        const options = { ...DEFAULT_OPTIONS, victoryBy };
        const inArea = worldsInArea(s, area);
        const { worth, need } = victoryLine(inArea, options);
        const of = (hexes: readonly string[]) => hexes.reduce((t, at) => t + worth(inArea.find((w) => w.at === at)!), 0);
        // Whole, some Main would have won on the first day.
        const before = Math.max(...mainsIn(inArea).map((m) => of(m.hexes)));
        if (victoryBy === "population") expect(before).toBeGreaterThanOrEqual(need);
        const starts = factionMains(s, area, options);
        expect(starts.some((m) => m.splitFrom !== undefined)).toBe(true);
        for (const m of starts) expect(of(m.hexes)).toBeLessThan(need);
        if (area === whole) for (const m of starts) expect(of(m.hexes)).toBeLessThanOrEqual(need * BIGGEST_START);
      }
    }
  });

  it("starts the pieces of one Main as friends, and says where they came from", () => {
    const s = generated("DELTA", "dense");
    const game = createGame({ name: "d", sector: s, area: whole, players: [], options: { ...DEFAULT_OPTIONS }, designs, seed: "SPLIT" });
    const target = game.victoryTarget();
    for (const f of game.state.factions) expect(game.holding(f.id).people).toBeLessThan(target.need);
    const kin: number[] = [];
    const others: number[] = [];
    const fs = game.state.factions;
    for (let i = 0; i < fs.length; i++) {
      for (let j = i + 1; j < fs.length; j++) {
        const r = relationOf(game, fs[i]!.id, fs[j]!.id)!;
        if (fs[i]!.splitFrom !== undefined && fs[i]!.splitFrom === fs[j]!.splitFrom) {
          expect(r.war).toBe(false);
          kin.push(r.base);
        } else others.push(r.base);
      }
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(kin.length).toBeGreaterThan(0);
    expect(mean(kin)).toBeGreaterThan(mean(others) + 40);
    // The Main a piece came from survives a save.
    expect(parseGame(serialise(game)).state.factions.map((f) => f.splitFrom)).toEqual(fs.map((f) => f.splitFrom));
  });
});

describe("war and peace", () => {
  /** Two computer Empires and a fleet of one in orbit of the other's world. */
  function standoff() {
    // The attacker is a player's, so the computer does not send its fleet elsewhere.
    const game = newGame({}, 1, "PEACE");
    game.state.phase = "play";
    game.state.day = 1;
    const a = game.humans()[0];
    const b = game.state.factions.find((f) => !f.human && game.ownedWorlds(f.id).some((w) => defenceMax(w) > 0));
    const r = relationOf(game, a!.id, b!.id)!;
    r.war = false;
    r.score = 30;
    const at = game.ownedWorlds(b!.id).find((w) => defenceMax(w) > 0)!;
    game.state.fleets = game.state.fleets.filter((f) => f.system !== at.at);
    const fleet = game.newFleet(a!.id, at.at, "main", Array.from({ length: 4 }, () => game.newShip("Broadsword-Mercenary-Cruiser")));
    fleet.standing = { ...STANDING_PRESETS["Seek and destroy"]! };
    return { game, a: a!, b: b!, r, at: at.at, fleet };
  }

  it("keeps Empires at peace from fighting or besieging each other", () => {
    const { game, a, b, at, fleet } = standoff();
    expect(game.hostile(a.id, b.id)).toBe(false);
    const before = game.worldState(at).defence;
    advanceDay(game);
    expect(game.worldState(at).defence).toBe(before);
    expect(game.worldState(at).siege).toBeNull();
    expect(fleet.ships.every((sh) => sh.damage === 0)).toBe(true);
    declareWar(game, a.id, b.id, "for the test");
    expect(game.hostile(a.id, b.id)).toBe(true);
    expect(game.state.log.some((e) => e.kind === "diplomacy" && e.text.includes(`${a.name} declares war on ${b.name}`))).toBe(true);
    advanceDay(game);
    expect(game.worldState(at).defence).toBeLessThan(before);
  });

  it("goes to war when relations sour, and back to peace when they mend", () => {
    const game = newGame({}, 0, "PEACE");
    const [a, b] = game.state.factions as [Faction, Faction];
    const r = relationOf(game, a.id, b.id)!;
    r.war = false;
    r.score = WAR_AT - 1;
    r.cause = "over the test";
    r.causeBy = b.id;
    diplomacy(game);
    expect(r.war).toBe(true);
    expect(game.state.log.some((e) => e.text === `${b.name} declares war on ${a.name}, over the test.`)).toBe(true);
    // No peace while the fighting is fresh, then peace once it has cooled.
    r.score = PEACE_AT + 1;
    r.clash = game.state.day;
    diplomacy(game);
    expect(r.war).toBe(true);
    game.state.day += 14;
    diplomacy(game);
    expect(r.war).toBe(false);
  });

  it("leaves only a player to make peace with a player", () => {
    const game = newGame({}, 1, "PEACE");
    const me = game.humans()[0]!;
    const other = game.state.factions.find((f) => !f.human)!;
    const r = relationOf(game, me.id, other.id)!;
    r.war = true;
    r.score = 90;
    r.clash = -100;
    diplomacy(game);
    expect(r.war).toBe(true);
  });

  /** Every pair at a cool peace that drifts nowhere, so one change shows on its own. */
  function calm(game: Game) {
    for (const r of Object.values(game.state.relations!)) {
      Object.assign(r, { war: false, allied: false, score: 0, base: 0, since: 0 });
      delete r.clash;
    }
  }

  /** Every Empire a player's, so none grows restless or makes offers of its own. */
  function quiet(game: Game, ...except: Faction[]) {
    for (const f of game.state.factions) if (!except.includes(f)) (f as { human: boolean }).human = true;
  }

  it("wearies a renewed war from its own first day, not from a clash in an earlier one", () => {
    const game = newGame({}, 0, "PEACE");
    calm(game);
    quiet(game);
    const [a, b] = game.state.factions as [Faction, Faction];
    const r = relationOf(game, a.id, b.id)!;
    Object.assign(r, { war: true, score: -20, base: -20, since: 133, clash: 50 });
    game.state.day = 140;
    diplomacy(game);
    expect(r.score).toBe(-20);
    game.state.day = 147;
    diplomacy(game);
    expect(r.score).toBe(-15);
  });

  it("makes only a leader's neighbours fear it, and leaves its wars free to end", () => {
    const game = newGame({ victoryBy: "worlds" }, 0, "FEAR");
    calm(game);
    quiet(game);
    const leader = game.state.factions[0]!;
    const held = game.ownedWorlds(leader.id).map((w) => w.at);
    const near = (f: Faction) => game.ownedWorlds(f.id).some((w) => held.some((at) => distanceBetween(w.at, at) <= 4));
    const others = game.state.factions.slice(1);
    const [fighting, neighbour] = others.filter(near) as [Faction, Faction];
    const far = others.find((f) => !near(f))!;
    // Nine tenths of the way to winning.
    game.state.options.victoryShare = game.holding(leader.id).worlds / game.victoryTarget().worlds / 0.9;
    Object.assign(relationOf(game, fighting.id, leader.id)!, { war: true, score: -50, base: -50, since: 0, clash: 7 });
    game.state.day = 7;
    diplomacy(game);
    expect(relationOf(game, neighbour.id, leader.id)!.score).toBeCloseTo(-2.4);
    expect(relationOf(game, far.id, leader.id)!.score).toBe(0);
    expect(relationOf(game, fighting.id, leader.id)!.score).toBe(-50);
  });

  it("grows restless with a neighbour only with nothing it could take, and not with an ally or a new peace", () => {
    const game = newGame({ victoryShare: 1 }, 0, "RESTLESS");
    calm(game);
    const f = game.state.factions[0]!;
    quiet(game, f);
    const own = game.ownedWorlds(f.id);
    const reach = (at: string) => own.some((o) => distanceBetween(o.at, at) <= 4);
    const g = game.state.factions.find((x) => x !== f && game.ownedWorlds(x.id).some((w) => reach(w.at)))!;
    // Every peopled world within reach is its own or its neighbour's, but one independent.
    const around = game.state.sector.worlds.filter((w) => w.uwp.population > 0 && reach(w.at) && game.worldState(w.at).owner !== f.id);
    for (const w of around) game.worldState(w.at).owner = g.id;
    const lone = game.worldState(around.find((w) => w.at !== g.capital)!.at);
    lone.owner = null;
    lone.navy = null;
    game.state.fleets = [];
    game.newFleet(f.id, f.capital, "main", [game.newShip("Patrol-Corvette")]);
    const r = relationOf(game, f.id, g.id)!;
    const week = (score: number) => {
      Object.assign(r, { score, base: score });
      game.state.day += 7;
      diplomacy(game);
      return r.score;
    };
    // An undefended world it could take keeps it busy.
    lone.defence = 0;
    expect(week(0)).toBe(0);
    // One far beyond its navy does not.
    lone.defence = 1e6;
    expect(week(0)).toBeLessThan(0);
    r.allied = true;
    expect(week(50)).toBe(50);
    r.allied = false;
    r.since = game.state.day;
    expect(week(0)).toBe(0);
    r.since = game.state.day - 120;
    expect(week(0)).toBeLessThan(0);
  });

  it("makes an Empire near victory hungry for a weaker neighbour's worlds, two wars of its choosing at a time", () => {
    const game = newGame({ victoryBy: "worlds" }, 0, "AMBITION");
    calm(game);
    const leader = game.state.factions[0]!;
    quiet(game, leader);
    const held = game.ownedWorlds(leader.id).map((w) => w.at);
    const near = (f: Faction) => game.ownedWorlds(f.id).some((w) => held.some((at) => distanceBetween(w.at, at) <= 4));
    const [prey, other, third] = game.state.factions.slice(1).filter(near) as [Faction, Faction, Faction];
    for (const f of [prey, other, third]) for (const w of game.ownedWorlds(f.id)) Object.assign(game.worldState(w.at), { defence: 0, navy: null });
    game.state.fleets = [];
    game.newFleet(leader.id, leader.capital, "main", [game.newShip("Broadsword-Mercenary-Cruiser"), game.newShip("Broadsword-Mercenary-Cruiser")]);
    // Nine tenths of the way to winning.
    game.state.options.victoryShare = game.holding(leader.id).worlds / game.victoryTarget().worlds / 0.9;
    const r = relationOf(game, leader.id, prey.id)!;
    const week = () => {
      Object.assign(r, { score: 0, base: 0 });
      delete r.cause;
      game.state.day += 7;
      diplomacy(game);
      return r.cause;
    };
    expect(week()).toBe("hungry for more worlds");
    expect(r.score).toBeLessThan(-5);
    // One war of its own choosing still leaves room for another, two do not.
    Object.assign(relationOf(game, leader.id, other.id)!, { war: true, declaredBy: leader.id, since: game.state.day });
    expect(week()).toBe("hungry for more worlds");
    Object.assign(relationOf(game, leader.id, third.id)!, { war: true, declaredBy: leader.id, since: game.state.day });
    expect(week()).not.toBe("hungry for more worlds");
    // Unless one of them has nothing left it could take.
    for (const w of game.ownedWorlds(third.id)) game.worldState(w.at).defence = 1e9;
    expect(week()).toBe("hungry for more worlds");
    for (const f of [other, third]) Object.assign(relationOf(game, leader.id, f.id)!, { war: false, since: 0 });
    // Nor with a neighbour stronger than itself.
    game.newFleet(prey.id, prey.capital, "main", [1, 2, 3].map(() => game.newShip("Broadsword-Mercenary-Cruiser")));
    expect(week()).not.toBe("hungry for more worlds");
  });

  it("sours only the victim's friends nearby, and not those already at war with the aggressor", () => {
    const game = newGame({}, 0, "CASCADE");
    const near = (f: Faction, places: readonly string[]) => game.ownedWorlds(f.id).some((w) => places.some((at) => distanceBetween(w.at, at) <= 4));
    const [aggressor, victim] = game.state.factions as [Faction, Faction];
    const others = game.state.factions.slice(2);
    // A world of the victim's with two other Empires near it and one far off.
    const at = game.ownedWorlds(victim.id).find((w) => others.filter((f) => near(f, [w.at])).length >= 2 && others.some((f) => !near(f, [w.at])))!.at;
    const [friend, fighting] = others.filter((f) => near(f, [at])) as [Faction, Faction];
    const far = others.find((f) => !near(f, game.ownedWorlds(victim.id).map((w) => w.at)))!;
    const setUp = () => {
      calm(game);
      for (const f of [friend, fighting, far]) relationOf(game, f.id, victim.id)!.score = 60;
      relationOf(game, fighting.id, aggressor.id)!.war = true;
    };
    const against = (f: Faction) => relationOf(game, f.id, aggressor.id)!.score;
    setUp();
    relationOf(game, aggressor.id, victim.id)!.war = true;
    onCapture(game, at, aggressor.id, victim.id);
    expect([against(friend), against(fighting), against(far)]).toEqual([-10, 0, 0]);
    setUp();
    declareWar(game, aggressor.id, victim.id, "for the test");
    expect([against(friend), against(fighting), against(far)]).toEqual([-10, 0, 0]);
  });

  it("keeps everyone at war in a game saved before relations", () => {
    const game = newGame();
    delete game.state.relations;
    const [a, b] = game.state.factions;
    expect(atWar(game, a!.id, b!.id)).toBe(true);
    expect(game.hostile(a!.id, null)).toBe(false);
  });
});

describe("alliances and offers", () => {
  /** Three computer Empires, the first two allies, both at war with the third. */
  function three() {
    const game = newGame({}, 0, "ALLY");
    game.state.phase = "play";
    game.state.day = 1;
    const [a, b, c] = game.state.factions as [Faction, Faction, Faction];
    const set = (x: Faction, y: Faction, war: boolean, score: number, allies = false) => {
      const r = relationOf(game, x.id, y.id)!;
      r.war = war;
      r.score = score;
      r.allied = allies;
    };
    set(a, b, false, 80, true);
    set(a, c, false, 0);
    set(b, c, true, -60);
    return { game, a, b, c };
  }

  it("lets a player offer peace, which the computer answers the next day", () => {
    const game = newGame({}, 1, "OFFER");
    game.state.phase = "play";
    const me = game.humans()[0]!;
    const other = game.state.factions.find((f) => !f.human)!;
    const r = relationOf(game, me.id, other.id)!;
    r.war = true;
    r.score = 40;
    r.clash = -100;
    expect(makeOffer(game, me.id, other.id, "peace")).toBeNull();
    expect(makeOffer(game, me.id, other.id, "peace")).not.toBeNull();
    diplomacy(game);
    expect(r.war).toBe(true);
    game.state.day++;
    diplomacy(game);
    expect(r.war).toBe(false);
    expect(game.state.offers).toEqual([]);
  });

  it("brings a computer offer to a player's Needs attention, and lets it lapse unanswered", () => {
    const game = newGame({}, 1, "OFFER");
    game.state.phase = "play";
    const me = game.humans()[0]!;
    const other = game.state.factions.find((f) => !f.human)!;
    const r = relationOf(game, me.id, other.id)!;
    r.war = false;
    r.allied = false;
    makeOffer(game, other.id, me.id, "alliance");
    expect(alerts(game, me).some((x) => x.kind === "offer" && x.text.includes("an alliance"))).toBe(true);
    game.state.day += 14;
    diplomacy(game);
    expect(offersTo(game, me.id)).toEqual([]);
    expect(r.allied).toBe(false);
  });

  it("forms alliances between computer Empires that are firm friends", () => {
    const { game, a, c } = three();
    const r = relationOf(game, a.id, c.id)!;
    r.score = 95;
    expect(makeOffer(game, a.id, c.id, "alliance")).toBeNull();
    game.state.day++;
    diplomacy(game);
    expect(r.allied).toBe(true);
    expect(game.state.log.some((e) => e.text === `${a.name} and ${c.name} become allies.`)).toBe(true);
  });

  it("lets allies see what each other sees, and repair at each other's ports", () => {
    const { game, a, b } = three();
    const theirs = game.ownedWorlds(b.id)[0]!.at;
    expect(visibleSystems(game, a.id).has(theirs)).toBe(true);
    expect(game.friendlyPort(a.id, theirs)).toBe(true);
    relationOf(game, a.id, b.id)!.allied = false;
    expect(visibleSystems(game, a.id).has(theirs)).toBe(false);
    expect(game.friendlyPort(a.id, theirs)).toBe(false);
  });

  it("fights beside an ally against its enemy, though at peace with that enemy itself", () => {
    const { game, a, b, c } = three();
    const at = game.ownedWorlds(c.id)[0]!.at;
    game.state.fleets = game.state.fleets.filter((f) => f.system !== at);
    const ship = () => [game.newShip("Broadsword-Mercenary-Cruiser")];
    const mine = game.newFleet(a.id, at, "deep", ship());
    game.newFleet(b.id, at, "deep", ship());
    game.newFleet(c.id, at, "deep", ship());
    for (const f of game.fleetsAt(at, "deep")) f.standing = { ...STANDING_PRESETS["Seek and destroy"]! };
    const report = battleAt(game, at, "deep");
    expect(report).not.toBeNull();
    expect(report!.factions).toContain(a.id);
    expect(report!.lines.some((l) => l.includes(`${mine.ships[0]!.name} (Broadsword`) && l.includes("→"))).toBe(true);
  });

  it("holds off a siege of an ally's world with its fleet in orbit", () => {
    const { game, a, b, c } = three();
    // Kept still for the test: no computer orders move the fleets away.
    for (const f of [a, c]) (f as { human: boolean }).human = true;
    const world = game.ownedWorlds(b.id).find((w) => w.at !== b.capital) ?? game.world(b.capital);
    game.state.fleets = game.state.fleets.filter((f) => f.system !== world.at);
    game.worldState(world.at).defence = 0;
    game.worldState(world.at).navy = null;
    const enemy = game.newFleet(c.id, world.at, "main", [game.newShip("Broadsword-Mercenary-Cruiser")]);
    // Neither fleet picks a fight with the other: the enemy only besieges.
    enemy.standing = { ...STANDING_PRESETS["Seek and destroy"]!, engage: "none" };
    const friend = game.newFleet(a.id, world.at, "main", [game.newShip("Patrol-Corvette")]);
    friend.standing = { ...STANDING_PRESETS["Seek and destroy"]!, engage: "none", besiege: false };
    advanceDay(game);
    expect(game.worldState(world.at).siege).toBeNull();
    // Without the ally there, the siege begins.
    game.state.fleets = game.state.fleets.filter((f) => f !== friend);
    advanceDay(game);
    expect(game.worldState(world.at).siege?.by).toBe(c.id);
  });

  it("keeps a computer Empire to two allies, however many friends it has", () => {
    const game = newGame({}, 0, "ALLY");
    game.state.phase = "play";
    for (const r of Object.values(game.state.relations!)) Object.assign(r, { war: false, allied: false, score: 90, base: 90, since: 0 });
    game.state.day = 7;
    diplomacy(game);
    const offers = game.state.offers ?? [];
    expect(offers.length).toBeGreaterThan(0);
    for (const f of game.state.factions) expect(offers.filter((o) => o.from === f.id || o.to === f.id).length).toBeLessThanOrEqual(2);
    game.state.day = 8;
    diplomacy(game);
    expect(game.state.factions.some((f) => alliesOf(game, f.id).length > 0)).toBe(true);
    for (const f of game.state.factions) expect(alliesOf(game, f.id).length).toBeLessThanOrEqual(2);
  });

  it("withdraws an alliance a player accepts once the computer has all the allies it keeps", () => {
    const game = newGame({}, 1, "ALLY");
    const me = game.humans()[0]!;
    const [other, x, y] = game.state.factions.filter((f) => !f.human) as [Faction, Faction, Faction];
    Object.assign(relationOf(game, me.id, other.id)!, { war: false, allied: false, score: 60 });
    expect(makeOffer(game, other.id, me.id, "alliance")).toBeNull();
    for (const f of [x, y]) Object.assign(relationOf(game, other.id, f.id)!, { war: false, allied: true, score: 80 });
    const why = answerOffer(game, offersTo(game, me.id)[0]!, true);
    expect(why).toBe(`${other.name}'s offer of an alliance to ${me.name} no longer stands: ${other.name} has all the allies it wants.`);
    expect(standing(game, me.id, other.id)).toBe("peace");
    expect(game.state.log.some((e) => e.text === why)).toBe(true);
  });

  it("starts an alliance warm enough not to end the day it is made", () => {
    const game = newGame({}, 1, "ALLY");
    const me = game.humans()[0]!;
    const other = game.state.factions.find((f) => !f.human)!;
    const r = relationOf(game, me.id, other.id)!;
    Object.assign(r, { war: false, allied: false, score: 60 });
    makeOffer(game, other.id, me.id, "alliance");
    // It has cooled while the player thought about it.
    r.score = 5;
    expect(answerOffer(game, offersTo(game, me.id)[0]!, true)).toBeNull();
    diplomacy(game);
    expect(standing(game, me.id, other.id)).toBe("alliance");
    expect(r.score).toBe(30);
  });

  it("forgets offers from an Empire that has fallen", () => {
    const game = newGame({}, 1, "OFFER");
    const me = game.humans()[0]!;
    const other = game.state.factions.find((f) => !f.human)!;
    Object.assign(relationOf(game, me.id, other.id)!, { war: false, allied: false, score: 60 });
    makeOffer(game, other.id, me.id, "alliance");
    other.alive = false;
    expect(offersTo(game, me.id)).toEqual([]);
    expect(offerBetween(game, me.id, other.id)).toBeUndefined();
    expect(alerts(game, me).some((a) => a.kind === "offer")).toBe(false);
    diplomacy(game);
    expect(game.state.offers).toEqual([]);
  });

  it("turns down a player's peace the stronger the computer is", () => {
    const game = newGame({}, 1, "OFFER");
    game.state.phase = "play";
    game.state.day = 1;
    const me = game.humans()[0]!;
    const other = game.state.factions.find((f) => !f.human)!;
    for (const r of Object.values(game.state.relations!)) Object.assign(r, { war: false, allied: false, score: 0 });
    const r = relationOf(game, me.id, other.id)!;
    const ask = (mine: number, theirs: number) => {
      game.state.fleets = [];
      game.newFleet(me.id, me.capital, "main", Array.from({ length: mine }, () => game.newShip("Patrol-Corvette")));
      game.newFleet(other.id, other.capital, "main", Array.from({ length: theirs }, () => game.newShip("Patrol-Corvette")));
      // Enough to take peace from an enemy half as strong again, a little more.
      Object.assign(r, { war: true, score: 25 - 20 * (1 - other.temper.aggression), clash: -100 });
      makeOffer(game, me.id, other.id, "peace");
      game.state.day++;
      diplomacy(game);
      return !r.war;
    };
    expect(ask(3, 5)).toBe(true);
    expect(ask(1, 5)).toBe(false);
  });

  it("shows only an enemy's armed fleets at a player's worlds under news lag, however far the news comes", () => {
    const game = newGame({ newsLag: 1 }, 1, "NEWS");
    const me = game.humans()[0]!;
    const [enemy, friend] = game.state.factions.filter((f) => !f.human) as [Faction, Faction];
    for (const r of Object.values(game.state.relations!)) Object.assign(r, { war: false, allied: false });
    relationOf(game, me.id, enemy.id)!.war = true;
    relationOf(game, me.id, friend.id)!.allied = true;
    // A world of ours three jumps out, whose news is three weeks old when it comes.
    const there = game.state.sector.worlds.find((w) => distanceBetween(w.at, me.capital) === 3)!;
    game.worldState(there.at).owner = me.id;
    expect(game.lag(me.id, there.at)).toBe(21);
    for (const owner of [enemy, friend]) {
      const fleet = game.newFleet(owner.id, owner.capital, "main", [game.newShip("Broadsword-Mercenary-Cruiser")]);
      me.news[fleet.id] = { fleetId: fleet.id, owner: owner.id, system: there.at, loc: "main", day: 0, since: 0, ships: 1, tons: 800, strength: 50 };
    }
    game.state.day = 25;
    expect(alerts(game, me).filter((a) => a.kind === "enemy").map((a) => a.text)).toEqual([`${enemy.name} at ${there.name}: 1 ship`]);
    game.state.day = 29;
    expect(alerts(game, me).some((a) => a.kind === "enemy")).toBe(false);
  });

  it("makes turning on an ally a betrayal everyone notices", () => {
    const { game, a, b, c } = three();
    const before = relationOf(game, c.id, a.id)!.score;
    declareWar(game, a.id, b.id, "for the test");
    expect(standing(game, a.id, b.id)).toBe("war");
    expect(game.state.log.some((e) => e.text === `${a.name} turns on its ally ${b.name}, for the test.`)).toBe(true);
    expect(relationOf(game, c.id, a.id)!.score).toBeLessThan(before);
  });
});

describe("the computer's sieges and yards", () => {
  /** A computer fleet in orbit of a small independent world it could take, with fuel to be had there. */
  function inOrbit(seed: string) {
    const game = newGame({}, 0, seed);
    game.state.phase = "play";
    game.state.day = 10;
    const ai = game.state.factions[0]!;
    const world = game.state.sector.worlds.find(
      (w) => game.worldState(w.at).owner === null && w.uwp.population >= 1 && w.uwp.population <= 4 && "ABC".includes(w.uwp.starport) && game.fleetsAt(w.at).length === 0,
    )!;
    const fleet = game.newFleet(ai.id, world.at, "main", Array.from({ length: 4 }, () => game.newShip("Broadsword-Mercenary-Cruiser")), "Strike");
    fleet.standing = { ...STANDING_PRESETS["Patrol"]! };
    return { game, ai, world, fleet };
  }

  it("records who declared a war", () => {
    const game = newGame({}, 0, "DECLARE");
    const [a, b] = game.state.factions as [Faction, Faction];
    const r = relationOf(game, a.id, b.id)!;
    r.war = false;
    declareWar(game, b.id, a.id, "for the test");
    expect(r.declaredBy).toBe(b.id);
  });

  it("keeps a fleet it has pulled back out of the fight for the day", () => {
    const { game, ai, fleet } = inOrbit("PULLED");
    fleet.fighting = { at: fleet.system, loc: "main", since: 7, last: 9 };
    planAi(game, ai);
    expect(fleet.standing.engage).toBe("none");
  });

  it("leaves alone for a while a world that drove a fleet off", () => {
    const { game, ai, fleet } = inOrbit("DRIVEN");
    fleet.fighting = { at: fleet.system, loc: "main", since: 3, last: 5 };
    planAi(game, ai);
    expect(fleet.standing.besiege).toBe(false);
    // Weeks later it is fair game again.
    game.state.day = 40;
    fleet.order = null;
    planAi(game, ai);
    expect(fleet.standing.besiege).toBe(true);
  });

  it("garrisons a fleet with no fuel at a world of its own with none to be had", () => {
    const game = newGame({}, 0, "STRANDED");
    game.state.phase = "play";
    game.state.day = 10;
    const ai = game.state.factions[0]!;
    const dry = game.state.sector.worlds.find((w) => w.pbg.giants === 0 && w.uwp.hydrographics === 0 && !"ABCD".includes(w.uwp.starport))!;
    game.worldState(dry.at).owner = ai.id;
    game.state.fleets = game.state.fleets.filter((f) => f.system !== dry.at);
    const ship = game.newShip("Patrol-Corvette");
    ship.fuel = 0;
    const fleet = game.newFleet(ai.id, dry.at, "main", [ship], "Stranded");
    planAi(game, ai);
    expect(fleet.order?.kind).toBe("garrison");
  });

  /** Two Empires at peace, the second holding every class A yard, and the first's class B ones. */
  function yards(seed: string, players = 0) {
    const game = newGame({}, players, seed);
    game.state.phase = "play";
    game.state.day = 1;
    const [a, b] = game.state.factions as [Faction, Faction];
    for (const w of game.state.sector.worlds) {
      if (w.uwp.starport === "A" || (w.uwp.starport === "B" && game.worldState(w.at).owner === a.id)) game.worldState(w.at).owner = b.id;
    }
    const r = relationOf(game, a.id, b.id)!;
    r.war = false;
    r.score = 30;
    return { game, a, b, r };
  }

  it("lets an Empire build at the yard of one at peace with it, dearer, and not at one at war", () => {
    const { game, a, b, r } = yards("FRIENDYARD", 1);
    expect(a.human).toBe(true);
    const yard = game.ownedWorlds(b.id).find((w) => w.uwp.starport === "A" && w.uwp.tl >= 12)!;
    a.credits = 10_000;
    expect(orderBuild(game, a, "Patrol-Corvette", yard.at)).toBe("");
    expect(a.credits).toBeCloseTo(10_000 - game.catalogue.get("Patrol-Corvette").cost * 1.2);
    // She is delivered there.
    a.builds[0]!.work = 1;
    game.replanYard(yard.at);
    advanceDay(game);
    expect(game.fleetsAt(yard.at).some((f) => f.owner === a.id)).toBe(true);
    declareWar(game, b.id, a.id, "for the test");
    expect(r.war).toBe(true);
    expect(orderBuild(game, a, "Patrol-Corvette", yard.at)).not.toBe("");
  });

  it("has the computer build at a friendly yard when its own cannot build a warship", () => {
    const { game, a, b } = yards("FRIENDAI");
    a.credits = 5_000;
    a.builds = [];
    planAi(game, a);
    expect(a.builds.length).toBeGreaterThan(0);
    expect(game.worldState(a.builds[0]!.at).owner).toBe(b.id);
  });
});
