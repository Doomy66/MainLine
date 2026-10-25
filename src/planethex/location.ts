/**
 * Where a planet sits in the setting: a sector name and a four digit hex within
 * it, which is Traveller convention. PlanetSpec.md 6.14.
 *
 * This grid is nothing to do with the surface grid of section 2. A sector is a
 * flat 32 by 40 subsector of star systems, one hex per system, and the four digits
 * are a column and a row on it. Nothing here reaches the generator: the location
 * says where the world is, not what it is like.
 */

/** Columns across a sector map. */
export const SECTOR_COLS = 32;
/** Rows down a sector map. */
export const SECTOR_ROWS = 40;

/** Columns and rows per subsector: four across and four down make the sixteen. */
export const SUB_COLS = 8;
export const SUB_ROWS = 10;
/** The sixteen subsectors of a sector, A to P. SubSectorSpec 2.2. */
export const SUBSECTOR_LETTERS = "ABCDEFGHIJKLMNOP";

export interface SectorHex {
  /** 1 to SECTOR_COLS. */
  readonly col: number;
  /** 1 to SECTOR_ROWS. */
  readonly row: number;
}

/**
 * Reads a four digit location, or null if it is not one. Spaces are allowed
 * around and inside it, so "19 10" and " 1910 " both read as column 19, row 10,
 * but the digits themselves have to be a real square on the subsector.
 */
export function parseSectorHex(text: string): SectorHex | null {
  const digits = text.replace(/\s+/g, "");
  if (!/^\d{4}$/.test(digits)) return null;
  const col = Number(digits.slice(0, 2));
  const row = Number(digits.slice(2));
  if (col < 1 || col > SECTOR_COLS) return null;
  if (row < 1 || row > SECTOR_ROWS) return null;
  return { col, row };
}

/** The canonical four digits, so 1,9 writes itself as 0109 rather than 19. */
export function formatSectorHex(hex: SectorHex): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hex.col)}${pad(hex.row)}`;
}

/**
 * The subsector a hex falls in, A to P. Derived rather than stored: the sixteen
 * subsectors are a fixed carve-up of the subsector, so a typed subsector could only
 * ever agree with the hex or be wrong about it.
 */
export function subsectorLetter(hex: SectorHex): string {
  const across = Math.floor((hex.col - 1) / SUB_COLS);
  const down = Math.floor((hex.row - 1) / SUB_ROWS);
  return String.fromCharCode(65 + down * 4 + across);
}

/**
 * The eighty hexes of one subsector, in reading order: across the top row, then
 * the next, as a subsector is read. SubSectorSpec 2.1.1 and 2.2.2.
 *
 * Sector-absolute, so a hex of subsector G is numbered where subsector G is on
 * the sector map rather than from its own corner. 2.2.2.1 gives the reason:
 * the referee who writes down 1914 wants to find 1914 later.
 */
export function subsectorHexes(letter: string): SectorHex[] {
  const at = Math.max(0, SUBSECTOR_LETTERS.indexOf(letter.toUpperCase()));
  const acrossFrom = (at % 4) * SUB_COLS;
  const downFrom = Math.floor(at / 4) * SUB_ROWS;
  const out: SectorHex[] = [];
  for (let row = 1; row <= SUB_ROWS; row++) {
    for (let col = 1; col <= SUB_COLS; col++) {
      out.push({ col: acrossFrom + col, row: downFrom + row });
    }
  }
  return out;
}

export interface PlanetLocation {
  readonly sector: string;
  /** As the user typed it, so a half-finished entry is not thrown away. */
  readonly hex: string;
}

/**
 * The location in one line, for anywhere that wants to state it rather than edit
 * it. Empty when neither field has been filled in, and it says what it has when
 * only one of them has been.
 */
/**
 * How many jumps apart two hexes are. SubSectorSpec 3.9.1.1.
 *
 * The subsector's columns are offset against each other, so a step sideways is also
 * half a step up or down, and counting rows and columns separately gets it
 * wrong. Rows are counted in halves instead: a sideways step pays for half a row
 * of the vertical distance for free, and only what is left over costs a jump.
 */
export function hexDistance(a: SectorHex, b: SectorHex): number {
  const across = Math.abs(b.col - a.col);
  const halves = (hex: SectorHex) => hex.row * 2 + (hex.col % 2 === 0 ? 1 : 0);
  const down = Math.abs(halves(b) - halves(a));
  return down <= across ? across : across + (down - across) / 2;
}

/**
 * The six hexes around one, in the order [hexCorners](hexlayout.ts) gives its
 * edges: south-east, south, south-west, north-west, north, north-east.
 *
 * In that order so an edge and the hex across it share an index, which is what
 * tracing an outline needs: an edge is drawn exactly where the neighbour on the
 * far side of it is not in the same region.
 *
 * No range check. A sector's hexes stop at 32 by 40, but a border drawn around
 * part of one does not: a published polity runs off the edge into the next
 * sector, and the path says so with hexes like 0000. A neighbour outside the
 * sector is a real place; it is simply not a place this map draws.
 */
export function neighboursOf(hex: SectorHex): SectorHex[] {
  // Even columns ride half a hex lower, so which row the diagonal neighbours
  // sit on depends on which kind of column this is. hexDistance's `halves`
  // says the same thing arithmetically.
  const low = hex.col % 2 === 0;
  const up = low ? hex.row : hex.row - 1;
  const down = low ? hex.row + 1 : hex.row;
  return [
    { col: hex.col + 1, row: down },
    { col: hex.col, row: hex.row + 1 },
    { col: hex.col - 1, row: down },
    { col: hex.col - 1, row: up },
    { col: hex.col, row: hex.row - 1 },
    { col: hex.col + 1, row: up },
  ];
}

/**
 * Four digits as a hex, without asking whether the sector has one there.
 *
 * parseSectorHex is the one to use for a world, which must be somewhere on
 * this map. This is for a border path, which may walk outside it.
 */
export function parseAnyHex(text: string): SectorHex | null {
  const digits = text.replace(/\s+/g, "");
  if (!/^\d{4}$/.test(digits)) return null;
  return { col: Number(digits.slice(0, 2)), row: Number(digits.slice(2)) };
}

export function formatLocation(location: PlanetLocation): string {
  const sector = location.sector.trim();
  const hex = parseSectorHex(location.hex);
  if (hex === null) return sector;
  const square = `${formatSectorHex(hex)} (subsector ${subsectorLetter(hex)})`;
  return sector === "" ? square : `${sector} ${square}`;
}

/**
 * Splits an old single-field location into the two fields. Written for the saves
 * this build made before the format was settled, where the field was free text
 * and by convention ended with the hex.
 */
export function splitLegacyLocation(text: string): PlanetLocation {
  const match = /^(.*?)[\s,]*(\d{4})\s*$/.exec(text.trim());
  if (match && parseSectorHex(match[2]!) !== null) {
    return { sector: match[1]!.trim(), hex: match[2]! };
  }
  return { sector: text.trim(), hex: "" };
}
