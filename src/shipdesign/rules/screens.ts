/**
 * Screens, and the black globe generator.
 * High Guard Update 2022, PDF pages 42-43. ShipSpec 4.9.7.
 */

export type Screen = "mesonScreen" | "nuclearDamper";

export interface ScreenRule {
  readonly label: string;
  readonly tl: number;
  readonly power: number;
  readonly tons: number;
  /** MCr. */
  readonly cost: number;
}

/** Screens table, page 42. */
export const SCREENS: Readonly<Record<Screen, ScreenRule>> = {
  mesonScreen: { label: "Meson Screen", tl: 13, power: 30, tons: 10, cost: 20 },
  nuclearDamper: { label: "Nuclear Damper", tl: 12, power: 20, tons: 10, cost: 10 },
};

/**
 * Black globe generator, page 42. Not sold on the open market at any price; the
 * cost is the book's "at least MCr100" and the Referee's word is final.
 */
export const BLACK_GLOBE = {
  label: "Black Globe Generator",
  tl: 15,
  tons: 50,
  cost: 100,
  power: 30,
} as const;

/**
 * Capacitors for a black globe, page 43. A jump drive already provides
 * capacitors worth a fifth of its own tonnage; more can be bought.
 */
export const CAPACITORS = {
  label: "Capacitors",
  /** Of the jump drive's tonnage, free. */
  fromJumpDrive: 0.2,
  /** MCr per extra ton. */
  costPerTon: 3,
  /** Points of damage a ton absorbs. */
  absorbsPerTon: 50,
} as const;
