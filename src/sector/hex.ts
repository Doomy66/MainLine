/**
 * Sector hexes: where a system is, how far apart two are, and where each one is
 * drawn. The numbering, the distance rule and the drawing arithmetic are the
 * same as PlanetHex's (src/location.ts and src/hexlayout.ts there), so a hex
 * read off a PlanetHex map is the same hex here.
 *
 * Flat columns of hexes, column 01 on the left, even columns sitting half a hex
 * lower than odd ones, row 01 at the top. Thirty-two columns and forty rows.
 */

export const SECTOR_COLS = 32;
export const SECTOR_ROWS = 40;
export const SUB_COLS = 8;
export const SUB_ROWS = 10;
export const SUBSECTOR_LETTERS = "ABCDEFGHIJKLMNOP";

export interface Hex {
  readonly col: number;
  readonly row: number;
}

/** "0304" to column 3, row 4, or null where it is not a sector hex. */
export function parseHex(text: string): Hex | null {
  const match = /^(\d{2})(\d{2})$/.exec(text.trim());
  if (match === null) return null;
  const col = Number(match[1]);
  const row = Number(match[2]);
  if (col < 1 || col > SECTOR_COLS || row < 1 || row > SECTOR_ROWS) return null;
  return { col, row };
}

export function formatHex(hex: Hex): string {
  return `${String(hex.col).padStart(2, "0")}${String(hex.row).padStart(2, "0")}`;
}

/** Which of the sixteen subsectors a hex is in, A to P. */
export function subsectorOf(hex: Hex): string {
  const across = Math.floor((hex.col - 1) / SUB_COLS);
  const down = Math.floor((hex.row - 1) / SUB_ROWS);
  return SUBSECTOR_LETTERS[down * 4 + across]!;
}

/**
 * Parsecs between two hexes: the number of jumps of one a ship needs.
 *
 * The columns are offset, so a step sideways is also half a step up or down.
 * Rows are counted in halves: a sideways step pays for half a row of the
 * vertical distance for free, and only what is left over costs a parsec.
 */
export function hexDistance(a: Hex, b: Hex): number {
  const across = Math.abs(b.col - a.col);
  const halves = (hex: Hex) => hex.row * 2 + (hex.col % 2 === 0 ? 1 : 0);
  const down = Math.abs(halves(b) - halves(a));
  return down <= across ? across : across + (down - across) / 2;
}

/** Distance between two hexes given by their four digits. */
export function distanceBetween(a: string, b: string): number {
  const from = parseHex(a);
  const to = parseHex(b);
  if (from === null || to === null) return Infinity;
  return hexDistance(from, to);
}

/* Drawing ---------------------------------------------------------------- */

/** A flat-topped hex HEX_WIDE across, corner to corner. */
export const HEX_WIDE = 100;
export const HEX_HIGH = (HEX_WIDE * Math.sqrt(3)) / 2;
export const COLUMN_STEP = HEX_WIDE * 0.75;
export const PAD = HEX_WIDE * 0.45;

/** A world's dot, sized by population as PlanetHex sizes it. */
export function dotFor(population: number): number {
  const at = Math.min(1, Math.max(0, population / 12));
  return 6 + at * 6;
}

/** The middle of a hex in drawing units. */
export function centreOf(col: number, row: number): { x: number; y: number } {
  const x = PAD + (col - 1) * COLUMN_STEP + HEX_WIDE / 2;
  const drop = col % 2 === 0 ? HEX_HIGH / 2 : 0;
  return { x, y: PAD + (row - 1) * HEX_HIGH + HEX_HIGH / 2 + drop };
}

/** The middle of a hex given by its four digits. */
export function centreAt(at: string): { x: number; y: number } {
  const hex = parseHex(at);
  return hex === null ? { x: 0, y: 0 } : centreOf(hex.col, hex.row);
}

/** The six corners of a flat-topped hex about a centre, as an SVG points list. */
export function hexPoints(x: number, y: number, scale = 1): string {
  const wide = (HEX_WIDE / 2) * scale;
  const quarter = (HEX_WIDE / 4) * scale;
  const high = (HEX_HIGH / 2) * scale;
  return [
    `${x + wide},${y}`,
    `${x + quarter},${y + high}`,
    `${x - quarter},${y + high}`,
    `${x - wide},${y}`,
    `${x - quarter},${y - high}`,
    `${x + quarter},${y - high}`,
  ].join(" ");
}

/** The whole sector's size in drawing units. */
export function sectorSize(): { width: number; height: number } {
  return {
    width: PAD * 2 + (SECTOR_COLS - 1) * COLUMN_STEP + HEX_WIDE,
    height: PAD * 2 + SECTOR_ROWS * HEX_HIGH + HEX_HIGH / 2,
  };
}
