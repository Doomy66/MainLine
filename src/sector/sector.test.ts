import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { distanceBetween, hexDistance, parseHex, subsectorOf } from "./hex";
import { mainsIn } from "./mains";
import { parseSec } from "./sec";
import { parseUwp } from "./uwp";

const drift = parseSec(readFileSync("sectors/Driftwater-Reach.sec", "utf8"));

describe("hexes", () => {
  it("reads sector hexes and refuses others", () => {
    expect(parseHex("0101")).toEqual({ col: 1, row: 1 });
    expect(parseHex("3240")).toEqual({ col: 32, row: 40 });
    expect(parseHex("3301")).toBeNull();
    expect(parseHex("0000")).toBeNull();
  });

  it("measures parsecs across offset columns as PlanetHex does", () => {
    // Even columns ride half a hex lower: 0101 and 0201 touch, as do 0102 and 0201.
    expect(distanceBetween("0101", "0201")).toBe(1);
    expect(distanceBetween("0102", "0201")).toBe(1);
    expect(distanceBetween("0101", "0103")).toBe(2);
    expect(distanceBetween("0101", "0501")).toBe(4);
    expect(hexDistance({ col: 1, row: 1 }, { col: 1, row: 1 })).toBe(0);
  });

  it("names subsectors A to P", () => {
    expect(subsectorOf({ col: 1, row: 1 })).toBe("A");
    expect(subsectorOf({ col: 32, row: 40 })).toBe("P");
    expect(subsectorOf({ col: 9, row: 11 })).toBe("F");
  });
});

describe("UWPs", () => {
  it("reads extended hex", () => {
    const u = parseUwp("A788A99-C");
    expect(u).toMatchObject({ starport: "A", size: 7, atmosphere: 8, hydrographics: 8, population: 10, government: 9, law: 9, tl: 12 });
  });
});

describe("a PlanetHex sector file", () => {
  it("reads every system with its name from the header comment", () => {
    expect(drift.name).toBe("Driftwater Reach");
    expect(drift.worlds.length).toBeGreaterThan(400);
    const w = drift.worlds[0]!;
    expect(w.at).toMatch(/^\d{4}$/);
    expect(w.uwpText).toMatch(/^[A-EX][0-9A-Z]{6}-[0-9A-Z]$/);
  });

  it("refuses something that is not one", () => {
    expect(() => parseSec("hello\nworld")).toThrow();
    expect(() => parseSec("")).toThrow();
  });

  it("finds Mains: every world on one is a jump from another on it", () => {
    const mains = mainsIn(drift.worlds);
    expect(mains.length).toBeGreaterThan(10);
    const byHex = new Map(drift.worlds.map((w) => [w.at, w]));
    for (const m of mains) {
      expect(m.hexes.length).toBeGreaterThanOrEqual(3);
      expect(m.hexes).toContain(m.capital);
      for (const at of m.hexes) {
        expect(m.hexes.some((other) => other !== at && distanceBetween(at, other) === 1)).toBe(true);
      }
      // The capital is the most populous world on it.
      const top = Math.max(...m.hexes.map((at) => byHex.get(at)!.uwp.population));
      expect(byHex.get(m.capital)!.uwp.population).toBe(top);
    }
  });
});
