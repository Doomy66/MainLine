/**
 * Step 13, Finalise Design, and the costs and times from the chapter opening.
 * High Guard Update 2022, PDF pages 9 and 26. ShipSpec 4.13.
 */

/** A standard design pays this share of the total. Page 9. ShipSpec 4.13.2. */
export const STANDARD_DESIGN_FACTOR = 0.9;

/** A new design pays the architect this share of the total on top. Page 9. ShipSpec 4.13.2. */
export const ARCHITECT_FEE = 0.01;

/** Monthly maintenance is the purchase cost divided by this. Page 26. ShipSpec 4.13.3. */
export const MAINTENANCE_DIVISOR = 12_000;

/** One day per MCr at an average yard. Page 9. ShipSpec 4.13.4. */
export const CONSTRUCTION_DAYS_PER_MCR = 1;

/** Construction Time Reduction table, page 9: the share of the time a yard of this TL takes. */
export function constructionTimeFactor(tl: number): number {
  if (tl >= 16) return 0.5;
  if (tl === 15) return 0.6;
  if (tl === 14) return 0.7;
  if (tl === 13) return 0.8;
  if (tl === 12) return 0.9;
  return 1;
}
