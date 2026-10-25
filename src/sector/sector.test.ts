import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { distanceBetween, hexDistance, parseHex, subsectorOf } from "./hex";
import { mainsIn, splitMain, type Main } from "./mains";
import { createHash } from "node:crypto";
import { parseSec } from "./sec";
import { parseSectorFile } from "./sectorfile";
import { newSectorDoc } from "../planethex/sector";
import { newSubsectorDoc } from "../planethex/subsector";
import { parseUwp } from "./uwp";

const drift = parseSectorFile(readFileSync("sectors/Driftwater-Reach.sector", "utf8"));

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
    expect(() => parseSectorFile("hello")).toThrow();
    expect(() => parseSectorFile(JSON.stringify({ level: "planet", version: 1 }))).toThrow();
  });

  it("rolls the bundled sectors' worlds exactly as before", () => {
    // Fingerprints of every world the two bundled sectors held when they were
    // shipped as .sec files. A PlanetHex change copied into src/planethex that
    // rolls them differently would change the sectors under everybody's feet,
    // and fails here instead.
    const fingerprint = (stem: string) => {
      const s = parseSectorFile(readFileSync(`sectors/${stem}.sector`, "utf8"));
      return `${s.worlds.length} ${createHash("sha256").update(JSON.stringify(s.worlds)).digest("hex").slice(0, 16)}`;
    };
    expect(fingerprint("Driftwater-Reach")).toBe("456 f44f19ad8c0b0c61");
    expect(fingerprint("Spandrel-Verge")).toBe("403 ef2308b5bb336240");
  });

  it("reads a published sector's worlds, allegiances and names as given", () => {
    const doc = newSectorDoc("TESTSEED", "Somewhere", "none");
    const sub = newSubsectorDoc("SUBSEED", "A", "none", "First Reach");
    sub.overrides = [
      { at: "0101", present: true, name: "Capital", uwp: "A788899-C", bases: "N", zone: "", stars: "G2 V", pbg: "703", allegiance: "ImDd" },
      { at: "0102", present: true, name: "Outpost", uwp: "C540344-8", bases: "", zone: "A", stars: "M2 V", pbg: "100", allegiance: "NaHu" },
    ];
    doc.subsectors = [{ letter: "A", doc: sub }];
    doc.charted = {
      borders: [{ allegiance: "ImDd", hexes: ["0101"], label: "", labelAt: "0101" }],
      routes: [{ from: "0101", to: "0102" }],
      allegiances: [{ code: "ImDd", name: "Third Imperium, Domain of Deneb", short: "Imperium" }],
    };
    const s = parseSectorFile(JSON.stringify(doc));
    expect(s.name).toBe("Somewhere");
    expect(s.worlds.map((w) => `${w.at} ${w.name} ${w.uwpText} ${w.allegiance} ${w.zone}`)).toEqual([
      "0101 Capital A788899-C ImDd ",
      "0102 Outpost C540344-8 NaHu A",
    ]);
    expect(s.worlds[0]!.pbg).toEqual({ multiplier: 7, belts: 0, giants: 3 });
    expect(s.polities).toEqual([{ code: "ImDd", name: "Third Imperium, Domain of Deneb", short: "Imperium" }]);
    expect(s.subsectorNames).toEqual({ A: "First Reach" });
    expect(s.routes).toEqual([{ from: "0101", to: "0102" }]);
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

describe("splitting a Main", () => {
  // A straight run of twelve worlds down one column, its two busiest worlds
  // near either end, and a short run of six apart from it.
  const row = (at: string, name: string, uwp: string) => `${at}\t${name}\t${uwp}\t\t\t\t703\tNaHu\tG2 V`;
  const rows = ["Hex\tName\tUWP\tBases\tRemarks\tZone\tPBG\tAllegiance\tStars"];
  for (let r = 1; r <= 12; r++) {
    const at = `01${String(r).padStart(2, "0")}`;
    rows.push(row(at, `Long${r}`, r === 2 ? "A788899-C" : r === 11 ? "A777777-B" : "C555555-8"));
  }
  for (let r = 1; r <= 6; r++) rows.push(row(`050${r}`, `Short${r}`, "C555555-8"));
  const strip = parseSec(rows.join("\n"), "Strip");
  const worlds = new Map(strip.worlds.map((w) => [w.at, w]));
  const long = mainsIn(strip.worlds).find((m) => m.hexes.length === 12)!;
  const short = mainsIn(strip.worlds).find((m) => m.hexes.length === 6)!;
  const one = () => 1;
  const connected = (m: Main) => {
    const seen = new Set([m.hexes[0]!]);
    const walk = [m.hexes[0]!];
    while (walk.length > 0) {
      const here = walk.pop()!;
      for (const at of m.hexes) {
        if (seen.has(at) || distanceBetween(here, at) !== 1) continue;
        seen.add(at);
        walk.push(at);
      }
    }
    return seen.size === m.hexes.length;
  };

  it("leaves a Main small enough alone", () => {
    expect(splitMain(long, worlds, one, 12, 20, 4)).toBeNull();
  });

  it("cuts a long one into runs a jump-1 ship can cross, around its busiest worlds", () => {
    const pieces = splitMain(long, worlds, one, 5, 10, 4)!;
    expect(pieces.length).toBeGreaterThanOrEqual(3);
    expect(pieces.flatMap((p) => p.hexes).sort()).toEqual([...long.hexes].sort());
    for (const p of pieces) {
      expect(p.hexes.length).toBeLessThanOrEqual(5);
      expect(p.hexes.length).toBeGreaterThanOrEqual(4);
      expect(connected(p)).toBe(true);
      expect(p.splitFrom).toBe(long.capital);
      expect(p.name).toBe(worlds.get(p.capital)!.name);
    }
    expect(pieces.map((p) => p.capital)).toEqual(expect.arrayContaining(["0102", "0111"]));
    // The same every time.
    expect(splitMain(long, worlds, one, 5, 10, 4)).toEqual(pieces);
  });

  it("goes below the smallest Empire only to keep a Main under the victory line", () => {
    // Six worlds, and five win: cut into halves of three.
    const halves = splitMain(short, worlds, one, 2, 5, 4)!;
    expect(halves.map((p) => p.hexes.length)).toEqual([3, 3]);
    expect(halves.every(connected)).toBe(true);
    // Short of the line, a Main that cannot be cut into Empires stays whole.
    expect(splitMain(short, worlds, one, 2, 7, 4)).toBeNull();
  });
});
