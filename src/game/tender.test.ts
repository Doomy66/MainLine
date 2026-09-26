import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bundledDesigns } from "../catalogue/catalogue";
import { parseSec } from "../sector/sec";
import { distanceBetween } from "../sector/hex";
import { advanceDay } from "./day";
import { routeTo } from "./nav";
import { tenderCost, TENDER_JUMP } from "./rules";
import { createGame, DEFAULT_OPTIONS } from "./setup";

const sector = parseSec(readFileSync("sectors/Driftwater-Reach.sec", "utf8"));

function setup() {
  const probe = createGame({ name: "t", sector, area: "ABCDEFGHIJKLMNOP".split(""), players: [], options: { ...DEFAULT_OPTIONS, newsLag: 0 }, designs: bundledDesigns(), seed: "TENDER" });
  const capital = probe.state.factions[0]!.capital;
  const game = createGame({ name: "t", sector, area: "ABCDEFGHIJKLMNOP".split(""), players: [{ name: "P", capital }], options: { ...DEFAULT_OPTIONS, newsLag: 0 }, designs: bundledDesigns(), seed: "TENDER" });
  game.state.phase = "play";
  game.state.day = 1;
  return { game, me: game.humans()[0]! };
}

describe("jump tenders", () => {
  it("carry ships with no jump drive, for a fee, and leave at the end of the route", () => {
    const { game, me } = setup();
    const port = game.state.sector.worlds.find((w) => w.uwp.starport === "A" && game.state.sector.worlds.some((x) => distanceBetween(w.at, x.at) === 2))!.at;
    game.worldState(port).owner = me.id;
    const fleet = game.newFleet(me.id, port, "main", [game.newShip("Dragon-System-Defence-Boat"), game.newShip("Patrol-Corvette")]);
    expect(game.fleetJump(fleet)).toBe(0);
    const planned = { ...fleet, tender: true };
    expect(game.fleetJump(planned)).toBe(Math.min(TENDER_JUMP, 3));
    const to = game.state.sector.worlds.find((w) => distanceBetween(port, w.at) === 2)!.at;
    const route = routeTo(game, planned, to)!;
    expect(route).not.toBeNull();
    fleet.order = { kind: "jump", route: [...route], tender: true };
    const before = me.credits;
    advanceDay(game);
    expect(fleet.transit).not.toBeNull();
    expect(fleet.tender).toBe(true);
    const first = distanceBetween(port, route[0]!);
    expect(before - me.credits).toBeCloseTo(tenderCost(400, first));
    // The boat itself burns no fuel; the corvette does.
    expect(fleet.ships[0]!.fuel).toBe(game.cls(fleet.ships[0]!).fuelCapacity);
    for (let i = 0; i < 30 && (fleet.order !== null || fleet.transit !== null); i++) advanceDay(game);
    expect(fleet.system).toBe(to);
    expect(fleet.tender).toBe(false);
  });

  it("cannot be hired where there is no class A or B starport", () => {
    const { game, me } = setup();
    const poor = game.state.sector.worlds.find(
      (w) => ["C", "D", "E", "X"].includes(w.uwp.starport) && game.state.sector.worlds.some((x) => x.at !== w.at && distanceBetween(w.at, x.at) <= 3),
    )!.at;
    const fleet = game.newFleet(me.id, poor, "deep", [game.newShip("Dragon-System-Defence-Boat")]);
    const to = game.state.sector.worlds.find((w) => w.at !== poor && distanceBetween(poor, w.at) <= 3)!.at;
    fleet.order = { kind: "jump", route: [to], tender: true };
    advanceDay(game);
    expect(fleet.transit).toBeNull();
    expect(fleet.order).toBeNull();
    expect(game.logFor(me.id).some((e) => /cannot hire jump tenders/.test(e.text))).toBe(true);
  });
});
