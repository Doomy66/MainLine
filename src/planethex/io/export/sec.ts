import { formatPbg, pbgFor, tradeCodes } from "../../gen/trade";
import { parseSectorHex } from "../../location";
import { starports } from "../../poi";
import type { Planet } from "../../planet";

/**
 * The world as a line of a sector file. Spec 6.18.
 *
 * This is the one export that is not about the map. A referee who has drawn a
 * world here usually wants it to appear on the sector map beside the others, and
 * every tool that draws sector maps - TravellerMap first among them - reads the
 * same tab separated columns. So a save can write the single line that world
 * would be, ready to be pasted into a sector file among its neighbours.
 *
 * The header row is written with it, because the column format is identified by
 * its header rather than by position: a file without one is guessed at, and a
 * file with one is read.
 *
 * Bases, travel zone and stars were the format's own placeholder while PlanetHex
 * modelled a world and nothing around it. A subsector knows all three under
 * SubSectorSpec 3.5 to 3.7, so the line takes them where they are offered and
 * leaves them blank where they are not. Allegiance is Na, non-aligned, which is
 * what an unclaimed world is. PBG is rolled from the seed, and trade.ts says why.
 */

/** The columns, in the order the format lists them. */
const COLUMNS = ["Hex", "Name", "UWP", "Bases", "Remarks", "Zone", "PBG", "Allegiance", "Stars"];

/** Where a world with no hex of its own is put, so the line is still a line. */
const NO_HEX = "0000";

/**
 * What a level above a planet knows about it that the planet does not.
 * SubSectorSpec 6.1.1: the line keeps its shape and takes these where they are
 * offered rather than assuming them blank.
 */
export interface SectorLineExtras {
  /** The world's name, where something above it has named it. */
  readonly name?: string;
  readonly bases?: string;
  readonly zone?: string;
  readonly stars?: string;
  readonly pbg?: string;
  readonly allegiance?: string;
}

export function sectorLine(planet: Planet, extras: SectorLineExtras = {}): string {
  return `${sectorHeader()}${worldLine(planet, extras)}`;
}

/** The header row the format is identified by, on its own. */
export function sectorHeader(): string {
  return `${COLUMNS.join("\t")}\n`;
}

/** One world as one line, with no header. What a whole subsector is made of. */
export function worldLine(planet: Planet, extras: SectorLineExtras = {}): string {
  const codes = tradeCodes(planet.uwp).map((code) => code.code);
  const fields = [
    parseSectorHex(planet.hex) === null ? NO_HEX : planet.hex.trim(),
    // A tab separated file cannot hold a tab, and a world named across two lines
    // is not a world this format can carry either.
    flatten(extras.name ?? planet.name) || "Unnamed",
    planet.uwp.trim().toUpperCase(),
    extras.bases ?? "",
    codes.join(" "),
    extras.zone ?? "",
    extras.pbg ?? formatPbg(pbgFor(planet.seed, planet.uwp)),
    extras.allegiance ?? "Na",
    extras.stars ?? "",
  ];
  return `${fields.join("\t")}\n`;
}

/**
 * The same world as the header comment a sector file usually carries, so the
 * line that follows it can be read by somebody who did not export it. Kept apart
 * from the line itself: a paste into an existing file wants the line alone.
 */
export function sectorNotes(planet: Planet): string {
  const codes = tradeCodes(planet.uwp);
  const ports = starports(planet.pois);
  const lines = [
    `# ${planet.name || "Unnamed"}, exported from PlanetHex`,
    `# Sector: ${planet.sector || "unrecorded"}`,
    `# Seed: ${planet.seed}`,
  ];
  if (codes.length > 0) {
    lines.push(`# Trade codes: ${codes.map((c) => `${c.code} ${c.label}`).join(", ")}`);
  }
  if (ports.length > 0) {
    lines.push(`# Ports on the surface: ${ports.map((p) => p.name).join(", ")}`);
  }
  lines.push(
    "# Bases, zone and stars are blank: PlanetHex models the world, not the system.",
    "# PBG is rolled from the seed, since nothing in the surface says otherwise.",
  );
  return `${lines.join("\n")}\n`;
}

/** Free text as one line of it, since the format is one record per line. */
function flatten(text: string): string {
  return text.replace(/[\t\r\n]+/g, " ").trim();
}
