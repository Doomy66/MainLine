/**
 * Step 2, Install Drives. High Guard Update 2022, PDF pages 16-17. ShipSpec 4.3.
 */

export interface DriveRating {
  /** Thrust, or jump number. */
  readonly rating: number;
  /** Fraction of hull tonnage the drive consumes. */
  readonly hullFraction: number;
  readonly tl: number;
}

/** MCr per ton. Page 17. */
export const MANOEUVRE_COST_PER_TON = 2;
export const REACTION_COST_PER_TON = 0.2;
export const JUMP_COST_PER_TON = 1.5;

/** A jump drive is its percentage plus this, and never less than the minimum. Page 17. ShipSpec 4.3.3. */
export const JUMP_DRIVE_EXTRA_TONS = 5;
export const JUMP_DRIVE_MIN_TONS = 10;

/** Thrust Potential table, manoeuvre drive rows, page 17. ShipSpec 4.3.1. */
export const MANOEUVRE_DRIVES: readonly DriveRating[] = [
  { rating: 0, hullFraction: 0.005, tl: 9 },
  { rating: 1, hullFraction: 0.01, tl: 9 },
  { rating: 2, hullFraction: 0.02, tl: 10 },
  { rating: 3, hullFraction: 0.03, tl: 10 },
  { rating: 4, hullFraction: 0.04, tl: 11 },
  { rating: 5, hullFraction: 0.05, tl: 11 },
  { rating: 6, hullFraction: 0.06, tl: 12 },
  { rating: 7, hullFraction: 0.07, tl: 13 },
  { rating: 8, hullFraction: 0.08, tl: 14 },
  { rating: 9, hullFraction: 0.09, tl: 15 },
  { rating: 10, hullFraction: 0.1, tl: 16 },
  { rating: 11, hullFraction: 0.11, tl: 17 },
];

/** Thrust Potential table, reaction drive rows, page 17. ShipSpec 4.3.2. */
export const REACTION_DRIVES: readonly DriveRating[] = [
  { rating: 0, hullFraction: 0.01, tl: 7 },
  { rating: 1, hullFraction: 0.02, tl: 7 },
  { rating: 2, hullFraction: 0.04, tl: 7 },
  { rating: 3, hullFraction: 0.06, tl: 7 },
  { rating: 4, hullFraction: 0.08, tl: 8 },
  { rating: 5, hullFraction: 0.1, tl: 8 },
  { rating: 6, hullFraction: 0.12, tl: 8 },
  { rating: 7, hullFraction: 0.14, tl: 9 },
  { rating: 8, hullFraction: 0.16, tl: 9 },
  { rating: 9, hullFraction: 0.18, tl: 9 },
  { rating: 10, hullFraction: 0.2, tl: 10 },
  { rating: 11, hullFraction: 0.22, tl: 10 },
  { rating: 12, hullFraction: 0.24, tl: 10 },
  { rating: 13, hullFraction: 0.26, tl: 11 },
  { rating: 14, hullFraction: 0.28, tl: 11 },
  { rating: 15, hullFraction: 0.3, tl: 11 },
  { rating: 16, hullFraction: 0.32, tl: 12 },
];

/** Jump Potential table, page 17. ShipSpec 4.3.3. */
export const JUMP_DRIVES: readonly DriveRating[] = [
  { rating: 1, hullFraction: 0.025, tl: 9 },
  { rating: 2, hullFraction: 0.05, tl: 11 },
  { rating: 3, hullFraction: 0.075, tl: 12 },
  { rating: 4, hullFraction: 0.1, tl: 13 },
  { rating: 5, hullFraction: 0.125, tl: 14 },
  { rating: 6, hullFraction: 0.15, tl: 15 },
  { rating: 7, hullFraction: 0.175, tl: 16 },
  { rating: 8, hullFraction: 0.2, tl: 17 },
  { rating: 9, hullFraction: 0.225, tl: 18 },
];

export function driveRating(table: readonly DriveRating[], rating: number): DriveRating | undefined {
  return table.find((row) => row.rating === rating);
}

/**
 * Concealed Manoeuvre Drive, page 46: thruster plates hidden behind bulkheads
 * for stealth's sake. A quarter more tonnage and price, and the drive's Thrust
 * is halved, rounding down. ShipSpec 4.3.6.
 */
export const CONCEALED_MANOEUVRE_DRIVE = {
  label: "Concealed",
  tonnage: 0.25,
  cost: 0.25,
  thrustFactor: 0.5,
} as const;

/**
 * High-Burn Thruster, page 46: a reaction drive fitted as a booster, whose
 * Thrust adds to the manoeuvre drive's. It is priced and sized as an ordinary
 * reaction drive; what differs is that its thrust is cumulative and its crew
 * feel every g of it, since a manoeuvre drive compensates only for its own.
 */
export const HIGH_BURN_THRUSTER = { label: "High-Burn Thruster", page: 46 } as const;
