/**
 * A whole subsector as a sector file. SubSectorSpec 6.1.
 *
 * This is the export the level exists to make possible. A referee who has drawn
 * eighty worlds wants them on a sector map beside everybody else's, and every
 * tool that draws sector maps reads these columns.
 *
 * One line per system, in hex order, under the header the format is identified
 * by. The three columns a single planet had to leave blank - bases, zone and
 * stars - are filled from what the subsector knows.
 */

import { newPlanet, type Planet } from "../../planet";
import {
  starsOf,
  pbgOf,
  UNALIGNED,
  type SubsectorWorld,
  type Subsector,
} from "../../gen/subsector";
import type { Sector } from "../../gen/sector";
import { describeSource, type ChartedSource } from "../../source";
import { sectorHeader, worldLine } from "./sec";

/** The planet a subsector world stands for, which is what the line is written from. */
function planetOf(world: SubsectorWorld): Planet {
  return {
    ...newPlanet(world.seed),
    name: world.name,
    hex: world.at,
    uwp: world.uwp,
  };
}

/** The subsector as a sector file. */
export function subsectorFile(subsector: Subsector, sector = "", source?: ChartedSource): string {
  const lines = subsector.worlds.map((world) =>
    worldLine(planetOf(world), {
      name: world.name,
      bases: world.bases,
      zone: world.zone,
      stars: starsOf(world),
      pbg: pbgOf(world),
      allegiance: world.allegiance,
    }),
  );
  return `${subsectorNotes(subsector, sector, source)}${sectorHeader()}${lines.join("")}`;
}

/**
 * A whole sector as a sector file. SectorSpec 6.1.
 *
 * The export the sector level exists to make possible, and the one every tool
 * that draws sector maps is waiting for: 1,280 hexes under one header, in hex
 * order, rather than sixteen files to be stitched together by hand.
 */
export function sectorFile(sector: Sector, name = "", source?: ChartedSource): string {
  const inhabited = sector.worlds.filter((world) => world.profile.population > 0).length;
  const notes = [
    `# ${name === "" ? "Sector" : name}, exported from PlanetHex`,
    `# Seed: ${sector.seed}`,
    `# Density: ${sector.density}`,
    `# ${sector.worlds.length} systems across sixteen subsectors, ${inhabited} of them inhabited`,
    allegianceNote(sector.worlds),
    ...creditLines(source),
    "",
  ].join("\n");
  const lines = sector.worlds.map((world) =>
    worldLine(planetOf(world), {
      name: world.name,
      bases: world.bases,
      zone: world.zone,
      stars: starsOf(world),
      pbg: pbgOf(world),
      allegiance: world.allegiance,
    }),
  );
  return `${notes}${sectorHeader()}${lines.join("")}`;
}

/**
 * The header comment a sector file usually carries, so the lines under it can be
 * read by somebody who did not export them. SubSectorSpec 6.1 and the planet
 * spec 6.18's own notes.
 */
export function subsectorNotes(subsector: Subsector, sector = "", source?: ChartedSource): string {
  const inhabited = subsector.worlds.filter((world) => world.profile.population > 0).length;
  return [
    `# Subsector ${subsector.letter}${sector === "" ? "" : ` of ${sector}`}, exported from PlanetHex`,
    `# Seed: ${subsector.seed}`,
    `# Density: ${subsector.density}`,
    `# ${subsector.worlds.length} systems, ${inhabited} of them inhabited`,
    allegianceNote(subsector.worlds),
    ...creditLines(source),
    "",
  ].join("\n");
}

/**
 * Who the worlds belong to, where they are not ours. AppSpec 8.4.
 *
 * A sector file is the one export written to be read by somebody else's tool,
 * so it is where published data would leave this machine with nothing on it
 * to say whose it is. The credit travels with the file, and so does the line
 * about what it may be used for.
 */
function creditLines(source?: ChartedSource): string[] {
  if (source === undefined) return [];
  return [
    `# Worlds from ${describeSource(source)}.`,
    "# Traveller is owned by Mongoose Publishing, copyright 1977-2025. This data is",
    "# reproduced for personal, non-commercial use under their Fair Use Policy and",
    "# is not to be republished.",
  ];
}

/**
 * What the Allegiance column is going to say, in one line.
 *
 * It used to say "Na throughout" and be right about it, because nothing
 * generated here claims anything. A subsector can now hold worlds that came
 * with an allegiance of their own, and a header that still said Na would be
 * describing a file it no longer matches.
 */
function allegianceNote(worlds: readonly SubsectorWorld[]): string {
  const held = [...new Set(worlds.map((world) => world.allegiance))].sort();
  const claimed = held.filter((one) => one !== UNALIGNED && one !== "");
  if (claimed.length === 0) {
    return "# Allegiance is Na throughout: nothing here has claimed anything.";
  }
  return `# Allegiance: ${claimed.join(", ")}${held.includes(UNALIGNED) ? ", and Na where nobody has claimed anything" : ""}.`;
}
