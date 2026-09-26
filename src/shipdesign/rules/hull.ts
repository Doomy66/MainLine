/**
 * Step 1, Create a Hull, and step 2, Install Armour.
 * High Guard Update 2022, PDF pages 11-15. ShipSpec 4.1 and 4.2.
 *
 * Costs are MCr throughout src/rules. Percentages are fractions: 0.2 is 20%.
 */

/** Cr50000 per ton of hull. Page 11. ShipSpec 4.1.2. */
export const HULL_COST_PER_TON = 0.05;
/** Cr4000 per ton of planetoid. Page 11. ShipSpec 4.1.3.1. */
export const PLANETOID_COST_PER_TON = 0.004;
/** Page 11. ShipSpec 4.1.1. */
export const MIN_HULL_TONS = 5;
export const MIN_JUMP_HULL_TONS = 100;
/** Page 13. ShipSpec 4.1.4. */
export const MILITARY_HULL_MIN_TONS = 5_000;
export const NON_GRAVITY_MAX_TONS = 500_000;

export type Streamlined = "yes" | "partial" | "no";

export type HullConfiguration =
  | "standard"
  | "streamlined"
  | "sphere"
  | "closeStructure"
  | "dispersedStructure"
  | "planetoid"
  | "bufferedPlanetoid";

export interface HullConfigurationRule {
  readonly label: string;
  readonly streamlined: Streamlined;
  /** Added to armour tonnage. ShipSpec 4.2.3. */
  readonly armourVolume: number;
  /** Added to hull points. ShipSpec 4.1.2. */
  readonly hullPoints: number;
  /** Added to hull cost. Planetoids are priced per ton of rock instead. */
  readonly cost: number;
  /** Planetoids only: the fraction of the rock that is usable. ShipSpec 4.1.3.1. */
  readonly usable?: number;
  /** Planetoids only: the armour Protection the rock gives for nothing. Page 13. */
  readonly baseProtection?: number;
}

/** Hull Configuration table, page 12. ShipSpec 4.1.3. */
export const HULL_CONFIGURATIONS: Readonly<Record<HullConfiguration, HullConfigurationRule>> = {
  standard: { label: "Standard", streamlined: "partial", armourVolume: 0, hullPoints: 0, cost: 0 },
  streamlined: { label: "Streamlined", streamlined: "yes", armourVolume: 0.2, hullPoints: 0, cost: 0.2 },
  sphere: { label: "Sphere", streamlined: "partial", armourVolume: -0.1, hullPoints: 0, cost: 0.1 },
  closeStructure: { label: "Close Structure", streamlined: "partial", armourVolume: 0.5, hullPoints: 0, cost: -0.2 },
  dispersedStructure: { label: "Dispersed Structure", streamlined: "no", armourVolume: 1, hullPoints: -0.1, cost: -0.5 },
  planetoid: { label: "Planetoid", streamlined: "no", armourVolume: 0, hullPoints: 0.25, cost: 0, usable: 0.8, baseProtection: 2 },
  bufferedPlanetoid: { label: "Buffered Planetoid", streamlined: "no", armourVolume: 0, hullPoints: 0.5, cost: 0, usable: 0.65, baseProtection: 4 },
};

/** Tons of hull per Hull point. Page 11, Massive Ships. ShipSpec 4.1.2. */
export function hullPointDivisor(tons: number): number {
  if (tons >= 100_000) return 1.5;
  if (tons >= 25_000) return 2;
  return 2.5;
}

export type SpecialisedHull = "reinforced" | "light" | "military" | "nonGravity";

export interface SpecialisedHullRule {
  readonly label: string;
  /** Added to hull cost, after the configuration. ShipSpec 4.1.4. */
  readonly cost: number;
  /** Added to hull points. */
  readonly hullPoints: number;
}

/** Specialised Hull Types, page 13. ShipSpec 4.1.4. */
export const SPECIALISED_HULLS: Readonly<Record<SpecialisedHull, SpecialisedHullRule>> = {
  reinforced: { label: "Reinforced Hull", cost: 0.5, hullPoints: 0.1 },
  light: { label: "Light Hull", cost: -0.25, hullPoints: -0.1 },
  military: { label: "Military Hull", cost: 0.25, hullPoints: 0 },
  nonGravity: { label: "Non-Gravity Hull", cost: -0.5, hullPoints: 0 },
};

/** A non-gravity hull halves basic ship systems power. Page 13. ShipSpec 4.1.4. */
export const NON_GRAVITY_BASIC_POWER_FACTOR = 0.5;
/** A military hull doubles the armour maximum. Page 13. ShipSpec 4.2.2. */
export const MILITARY_HULL_ARMOUR_FACTOR = 2;

export type HullOption = "heatShielding" | "radiationShielding" | "reflec";

export interface HullOptionRule {
  readonly label: string;
  readonly tl: number;
  /** MCr per ton of hull. */
  readonly costPerHullTon: number;
}

/** Install Hull Options, pages 14-15. ShipSpec 4.1.6. */
export const HULL_OPTIONS: Readonly<Record<HullOption, HullOptionRule>> = {
  heatShielding: { label: "Heat Shielding", tl: 6, costPerHullTon: 0.1 },
  radiationShielding: { label: "Radiation Shielding", tl: 7, costPerHullTon: 0.025 },
  reflec: { label: "Reflec", tl: 10, costPerHullTon: 0.1 },
};

export type StealthType = "basic" | "improved" | "enhanced" | "advanced";

export interface StealthRule {
  readonly label: string;
  readonly tl: number;
  /** MCr per ton of hull. */
  readonly costPerHullTon: number;
  /** DM to Electronics (sensors) checks to detect the ship. */
  readonly dm: number;
  /** Fraction of the hull consumed. */
  readonly tonnage: number;
}

/** Stealth Types table, page 15. ShipSpec 4.1.6. */
export const STEALTH_TYPES: Readonly<Record<StealthType, StealthRule>> = {
  basic: { label: "Basic Stealth", tl: 8, costPerHullTon: 0.04, dm: -2, tonnage: 0.02 },
  improved: { label: "Improved Stealth", tl: 10, costPerHullTon: 0.1, dm: -2, tonnage: 0 },
  enhanced: { label: "Enhanced Stealth", tl: 12, costPerHullTon: 0.5, dm: -4, tonnage: 0 },
  advanced: { label: "Advanced Stealth", tl: 14, costPerHullTon: 1, dm: -6, tonnage: 0 },
};

export type ArmourType = "titaniumSteel" | "crystaliron" | "bondedSuperdense" | "molecularBonded";

export interface ArmourRule {
  readonly label: string;
  readonly tl: number;
  /** Fraction of hull tonnage per point of Protection. */
  readonly tonsPerPoint: number;
  /** MCr per ton of armour. */
  readonly costPerTon: number;
  /** Maximum Protection at a given design TL, before a military hull doubles it. */
  readonly maxProtection: (tl: number) => number;
}

/** Hull Armour table, page 13. ShipSpec 4.2.1. */
export const ARMOUR_TYPES: Readonly<Record<ArmourType, ArmourRule>> = {
  titaniumSteel: { label: "Titanium Steel", tl: 7, tonsPerPoint: 0.025, costPerTon: 0.05, maxProtection: (tl) => Math.min(tl, 9) },
  crystaliron: { label: "Crystaliron", tl: 10, tonsPerPoint: 0.0125, costPerTon: 0.2, maxProtection: (tl) => Math.min(tl, 13) },
  bondedSuperdense: { label: "Bonded Superdense", tl: 14, tonsPerPoint: 0.008, costPerTon: 0.5, maxProtection: (tl) => tl },
  molecularBonded: { label: "Molecular Bonded", tl: 16, tonsPerPoint: 0.005, costPerTon: 1.5, maxProtection: (tl) => tl + 4 },
};

/** Armour Tonnage table, page 14: small hulls pay more for the framework. ShipSpec 4.2.3. */
export function armourTonnageMultiplier(hullTons: number): number {
  if (hullTons >= 100) return 1;
  if (hullTons >= 26) return 2;
  if (hullTons >= 16) return 3;
  return 4;
}

/**
 * Structure options from Spacecraft Options, pages 44-45. These change the hull
 * itself rather than adding a component, so they live here with it.
 * ShipSpec 4.1.7.
 */

/**
 * Adjustable Hull, page 44: bands and strips that let the ship take the outline
 * of any other of the same tonnage and configuration. Every weapon on such a
 * ship gets a pop-up mounting for nothing.
 */
export const ADJUSTABLE_HULLS = {
  tl12: { label: "Adjustable Hull", tl: 12, hullFraction: 0.05, hullCost: 0.1 },
  tl15: { label: "Adjustable Hull (TL15)", tl: 15, hullFraction: 0.01, hullCost: 1 },
} as const;
export type AdjustableHull = keyof typeof ADJUSTABLE_HULLS;

/**
 * Pressure Hull, page 44: built for the deeps of a gas giant. A quarter of the
 * ship, ten times the hull price, and Protection 4 that comes with it.
 */
export const PRESSURE_HULL = {
  label: "Pressure Hull",
  hullFraction: 0.25,
  hullCostFactor: 10,
  protection: 4,
} as const;

/**
 * Modular Hull, page 45: a share of the ship that can be swapped out. The hull
 * costs that share more, so a ship a third modular pays a third again.
 */
export const MODULAR_HULL = { label: "Modular Hull", maxFraction: 0.75 } as const;
