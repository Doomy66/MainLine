/**
 * Reading a sector file: the T5 tab separated format PlanetHex writes beside a
 * saved sector, one system per line under a header row.
 *
 * The header decides which column is which, so a file from TravellerMap or
 * any other tool that writes the same columns reads too. Lines starting with
 * # are comments; PlanetHex puts the sector's name in the first of them.
 */

import { parseHex, type Hex } from "./hex";
import { parseUwp, type Uwp } from "./uwp";

export interface World {
  /** Sector-absolute four digits. */
  readonly at: string;
  readonly hex: Hex;
  readonly name: string;
  readonly uwpText: string;
  readonly uwp: Uwp;
  /** N naval, S scout, and whatever else the Bases column holds. */
  readonly bases: string;
  readonly trade: readonly string[];
  /** "", "A" amber or "R" red. */
  readonly zone: string;
  /** Population multiplier, planetoid belts, gas giants. */
  readonly pbg: { readonly multiplier: number; readonly belts: number; readonly giants: number };
  readonly stars: string;
}

export interface SectorData {
  readonly name: string;
  readonly worlds: readonly World[];
}

export function parseSec(text: string, fallbackName = "Unnamed sector"): SectorData {
  const lines = text.split(/\r?\n/);
  let name = "";
  let header: string[] | null = null;
  const worlds: World[] = [];
  for (const line of lines) {
    if (line.trim() === "") continue;
    if (line.startsWith("#")) {
      // PlanetHex: "# Driftwater Reach, exported from PlanetHex".
      const m = /^#\s*(.+?),\s*exported from/i.exec(line);
      if (m !== null && name === "") name = m[1]!;
      continue;
    }
    const cells = line.split("\t");
    if (header === null) {
      header = cells.map((c) => c.trim().toLowerCase());
      continue;
    }
    const columns = header;
    const get = (column: string) => {
      const at = columns.indexOf(column);
      return at < 0 ? "" : (cells[at] ?? "").trim();
    };
    const hex = parseHex(get("hex"));
    if (hex === null) continue;
    const pbg = get("pbg").padEnd(3, "0");
    worlds.push({
      at: get("hex"),
      hex,
      name: get("name") || `Hex ${get("hex")}`,
      uwpText: get("uwp").toUpperCase(),
      uwp: parseUwp(get("uwp")),
      bases: get("bases"),
      trade: get("remarks").split(/\s+/).filter((c) => c !== ""),
      zone: get("zone"),
      pbg: { multiplier: Number(pbg[0]) || 0, belts: Number(pbg[1]) || 0, giants: Number(pbg[2]) || 0 },
      stars: get("stars"),
    });
  }
  if (header === null) throw new Error("That file has no header row, so it is not a sector file.");
  if (!header.includes("hex") || !header.includes("uwp")) {
    throw new Error("That file has no Hex or UWP column, so it is not a sector file.");
  }
  if (worlds.length === 0) throw new Error("That sector file holds no systems.");
  worlds.sort((a, b) => a.at.localeCompare(b.at));
  return { name: name || fallbackName, worlds };
}
