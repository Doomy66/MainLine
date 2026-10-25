/**
 * Reading a PlanetHex `.sector` document, which is how a sector comes to
 * Mainline.
 *
 * A generated sector's document is little more than a seed: PlanetHex rolls
 * its worlds from it each time it opens one, and so does Mainline, with the
 * copy of PlanetHex's generator in src/planethex. A published sector's
 * document lists its worlds, and the same generator lays them out. Either way
 * PlanetHex's own sector file export then writes the worlds as the `.sec` it
 * would save beside the document, and that is read as any `.sec` is, so a
 * sector reads the same whichever of the two files it came from.
 *
 * What the `.sec` cannot carry comes from the document itself: the polities'
 * names, the subsectors' names and the express routes. The published borders
 * are left behind, since in a game the borders are wherever the Empires are.
 */

import { parseSectorDoc, sectorOf } from "../planethex/sector";
import { sectorFile } from "../planethex/io/export/subsector";
import { parseSec, type SectorData } from "./sec";

export const SECTOR_EXTENSION = ".sector";

export function parseSectorFile(text: string, fallbackName = "Unnamed sector"): SectorData {
  const doc = parseSectorDoc(text);
  const name = doc.name.trim() === "" || doc.name === "Unnamed" ? fallbackName : doc.name.trim();
  const sector = sectorOf(doc);
  const read = parseSec(sectorFile(sector, name, doc.source), name);
  const subsectorNames: Record<string, string> = {};
  for (const held of doc.subsectors) {
    const called = held.doc.name.trim();
    if (called !== "") subsectorNames[held.letter.toUpperCase()] = called;
  }
  return {
    ...read,
    polities: (doc.charted?.allegiances ?? []).map((p) => ({ code: p.code, name: p.name, short: p.short })),
    subsectorNames,
    routes: sector.routes.filter((r) => r.kind === "xboat").map((r) => ({ from: r.from, to: r.to })),
  };
}
