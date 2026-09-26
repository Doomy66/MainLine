/**
 * Step 8, Install Weapons. High Guard Update 2022, PDF pages 27-41. ShipSpec 4.9.
 *
 * Mountings in ascending order of violence: turrets and fixed mounts, barbettes,
 * bays in three sizes, spinal mounts, and point defence batteries. Ammunition is
 * in ordnance.ts and screens in screens.ts.
 */

/** One hardpoint per this many tons of hull. Page 27. ShipSpec 4.9.1. */
export const TONS_PER_HARDPOINT = 100;

/** Firmpoints table, page 27: ships under 100 tons. ShipSpec 4.9.1. */
export function firmpoints(hullTons: number): number {
  if (hullTons >= TONS_PER_HARDPOINT) return 0;
  if (hullTons >= 70) return 3;
  if (hullTons >= 35) return 2;
  return 1;
}

export function hardpoints(hullTons: number): number {
  return Math.floor(hullTons / TONS_PER_HARDPOINT);
}

/** A weapon on a firmpoint needs a quarter less power, rounded up. Page 27. */
export const FIRMPOINT_POWER_FACTOR = 0.75;

export type MountKind = "fixed" | "single" | "double" | "triple";

export interface MountRule {
  readonly label: string;
  /** Undefined where the book prints none. */
  readonly tl?: number;
  readonly power: number;
  readonly tons: number;
  /** MCr. */
  readonly cost: number;
  /** Weapons the mount can carry. */
  readonly weapons: number;
  readonly hardpoints: number;
}

/** Turrets table, page 29. ShipSpec 4.9.2. */
export const MOUNTS: Readonly<Record<MountKind, MountRule>> = {
  fixed: { label: "Fixed Mount", power: 0, tons: 0, cost: 0.1, weapons: 3, hardpoints: 1 },
  single: { label: "Single Turret", tl: 7, power: 1, tons: 1, cost: 0.2, weapons: 1, hardpoints: 1 },
  double: { label: "Double Turret", tl: 8, power: 1, tons: 1, cost: 0.5, weapons: 2, hardpoints: 1 },
  triple: { label: "Triple Turret", tl: 9, power: 1, tons: 1, cost: 1, weapons: 3, hardpoints: 1 },
};

/** Pop-Up Mounting, page 29: applied to any mount. */
export const POP_UP_MOUNTING = { label: "Pop-Up Mounting", tl: 10, power: 0, tons: 1, cost: 1 } as const;

export type WeaponRange = "adjacent" | "close" | "short" | "medium" | "long" | "veryLong" | "distant" | "special";

export type TurretWeapon =
  | "beamLaser"
  | "fusionGun"
  | "laserDrill"
  | "missileRack"
  | "particleBeam"
  | "plasmaGun"
  | "pulseLaser"
  | "railgun"
  | "sandcaster";

export interface TurretWeaponRule {
  readonly label: string;
  readonly tl: number;
  readonly range: WeaponRange;
  readonly power: number;
  /** As printed: dice, or Special. */
  readonly damage: string;
  /** MCr. */
  readonly cost: number;
  readonly traits: readonly string[];
  /** Missile racks in a turret hold this many missiles; four on a firmpoint. Page 29. */
  readonly ammunition?: { turret: number; firmpoint: number };
}

/** Turret Weapons table, page 29. ShipSpec 4.9.3. */
export const TURRET_WEAPONS: Readonly<Record<TurretWeapon, TurretWeaponRule>> = {
  beamLaser: { label: "Beam Laser", tl: 10, range: "medium", power: 4, damage: "1D", cost: 0.5, traits: [] },
  fusionGun: { label: "Fusion Gun", tl: 14, range: "medium", power: 12, damage: "4D", cost: 2, traits: ["Radiation"] },
  laserDrill: { label: "Laser Drill", tl: 8, range: "adjacent", power: 4, damage: "2D", cost: 0.15, traits: ["AP 4"] },
  missileRack: { label: "Missile Rack", tl: 7, range: "special", power: 0, damage: "4D", cost: 0.75, traits: ["Smart"], ammunition: { turret: 12, firmpoint: 4 } },
  particleBeam: { label: "Particle Beam", tl: 12, range: "veryLong", power: 8, damage: "3D", cost: 4, traits: ["Radiation"] },
  plasmaGun: { label: "Plasma Gun", tl: 11, range: "medium", power: 6, damage: "3D", cost: 2.5, traits: [] },
  pulseLaser: { label: "Pulse Laser", tl: 9, range: "long", power: 4, damage: "2D", cost: 1, traits: [] },
  railgun: { label: "Railgun", tl: 10, range: "short", power: 2, damage: "2D", cost: 1, traits: ["AP 4"] },
  sandcaster: { label: "Sandcaster", tl: 9, range: "special", power: 0, damage: "Special", cost: 0.25, traits: [] },
};

/**
 * Damage Multiples, page 30. A hit's damage is rolled, armour taken off, and
 * the remainder multiplied by this. Missiles and torpedoes are exempt.
 */
export const DAMAGE_MULTIPLES = {
  turret: 1,
  barbette: 3,
  smallBay: 10,
  mediumBay: 20,
  largeBay: 100,
  spinal: 1_000,
} as const;

/** Most barbettes consume this much inside the hull. Page 30. */
export const BARBETTE_TONS = 5;
/** A barbette uses three firmpoints, and a missile or torpedo one takes two more tons. Pages 27, 32. */
export const BARBETTE_FIRMPOINTS = 3;
export const BARBETTE_FIRMPOINT_EXTRA_TONS = 2;

export type BarbetteWeapon =
  | "beamLaser"
  | "fusion"
  | "ionCannon"
  | "missile"
  | "particle"
  | "plasma"
  | "pulseLaser"
  | "railgun"
  | "torpedo";

export interface BarbetteRule {
  readonly label: string;
  readonly tl: number;
  readonly range: WeaponRange;
  readonly power: number;
  readonly damage: string;
  /** MCr. */
  readonly cost: number;
  readonly traits: readonly string[];
}

/** Barbettes table, page 31. All consume BARBETTE_TONS and one hardpoint. */
export const BARBETTES: Readonly<Record<BarbetteWeapon, BarbetteRule>> = {
  beamLaser: { label: "Beam Laser Barbette", tl: 10, range: "medium", power: 12, damage: "2D", cost: 3, traits: [] },
  fusion: { label: "Fusion Barbette", tl: 12, range: "medium", power: 20, damage: "5D", cost: 4, traits: ["AP 3", "Radiation"] },
  ionCannon: { label: "Ion Cannon", tl: 12, range: "medium", power: 10, damage: "7D", cost: 6, traits: ["Ion"] },
  missile: { label: "Missile Barbette", tl: 7, range: "special", power: 0, damage: "4D", cost: 4, traits: ["Smart"] },
  particle: { label: "Particle Barbette", tl: 11, range: "veryLong", power: 15, damage: "4D", cost: 8, traits: ["Radiation"] },
  plasma: { label: "Plasma Barbette", tl: 11, range: "medium", power: 12, damage: "4D", cost: 5, traits: ["AP 2"] },
  pulseLaser: { label: "Pulse Laser Barbette", tl: 9, range: "long", power: 12, damage: "3D", cost: 6, traits: [] },
  railgun: { label: "Railgun Barbette", tl: 10, range: "medium", power: 5, damage: "3D", cost: 2, traits: ["AP 5"] },
  torpedo: { label: "Torpedo Barbette", tl: 7, range: "special", power: 2, damage: "6D", cost: 3, traits: ["Smart"] },
};

export type BaySize = "small" | "medium" | "large";

export interface BaySizeRule {
  readonly label: string;
  readonly tons: number;
  readonly hardpoints: number;
  readonly crew: number;
  readonly damageMultiple: number;
}

/** Bay Weapons table, page 32. The bay's size sets its tonnage, not the weapon in it. */
export const BAY_SIZES: Readonly<Record<BaySize, BaySizeRule>> = {
  small: { label: "Small Bay", tons: 50, hardpoints: 1, crew: 1, damageMultiple: 10 },
  medium: { label: "Medium Bay", tons: 100, hardpoints: 1, crew: 2, damageMultiple: 20 },
  large: { label: "Large Bay", tons: 500, hardpoints: 5, crew: 4, damageMultiple: 100 },
};

export type BayWeapon =
  | "fusionGun"
  | "ionCannon"
  | "massDriver"
  | "mesonGun"
  | "missile"
  | "orbitalStrikeMassDriver"
  | "orbitalStrikeMissile"
  | "particleBeam"
  | "railgun"
  | "repulsor"
  | "torpedo";

export interface BayWeaponRule {
  readonly label: string;
  readonly tl: number;
  readonly range: WeaponRange;
  readonly power: number;
  readonly damage: string;
  /** MCr. On top of nothing: the bay's tonnage is the bay's, the cost is this. */
  readonly cost: number;
  readonly traits: readonly string[];
}

/** Small Bay Weapons table, page 33. */
export const SMALL_BAY_WEAPONS: Readonly<Record<BayWeapon, BayWeaponRule>> = {
  fusionGun: { label: "Fusion Gun Bay", tl: 12, range: "medium", power: 50, damage: "6D", cost: 8, traits: ["AP 6", "Radiation"] },
  ionCannon: { label: "Ion Cannon Bay", tl: 12, range: "medium", power: 20, damage: "6D", cost: 15, traits: ["Ion"] },
  massDriver: { label: "Mass Driver Bay", tl: 8, range: "short", power: 15, damage: "3D", cost: 40, traits: ["Orbital Bombardment"] },
  mesonGun: { label: "Meson Gun Bay", tl: 11, range: "long", power: 20, damage: "5D", cost: 50, traits: ["AP", "Radiation"] },
  missile: { label: "Missile Bay", tl: 7, range: "special", power: 5, damage: "4D", cost: 12, traits: ["Smart"] },
  orbitalStrikeMassDriver: { label: "Orbital Strike Mass Driver Bay", tl: 10, range: "short", power: 35, damage: "7D", cost: 25, traits: ["Orbital Strike"] },
  orbitalStrikeMissile: { label: "Orbital Strike Missile Bay", tl: 10, range: "medium", power: 5, damage: "3D", cost: 16, traits: ["Orbital Strike"] },
  particleBeam: { label: "Particle Beam Bay", tl: 11, range: "veryLong", power: 30, damage: "6D", cost: 20, traits: ["Radiation"] },
  railgun: { label: "Railgun Bay", tl: 10, range: "short", power: 10, damage: "3D", cost: 30, traits: ["AP 10"] },
  repulsor: { label: "Repulsor Bay", tl: 15, range: "short", power: 50, damage: "Special", cost: 30, traits: [] },
  torpedo: { label: "Torpedo Bay", tl: 7, range: "special", power: 2, damage: "6D", cost: 3, traits: ["Smart"] },
};

/** Medium Bay Weapons table, page 34. */
export const MEDIUM_BAY_WEAPONS: Readonly<Record<BayWeapon, BayWeaponRule>> = {
  fusionGun: { label: "Fusion Gun Bay", tl: 12, range: "medium", power: 80, damage: "7D", cost: 14, traits: ["AP 6", "Radiation"] },
  ionCannon: { label: "Ion Cannon Bay", tl: 12, range: "medium", power: 30, damage: "8D", cost: 25, traits: ["Ion"] },
  massDriver: { label: "Mass Driver Bay", tl: 8, range: "short", power: 25, damage: "4D", cost: 60, traits: ["Orbital Bombardment"] },
  mesonGun: { label: "Meson Gun Bay", tl: 12, range: "long", power: 30, damage: "6D", cost: 60, traits: ["AP", "Radiation"] },
  missile: { label: "Missile Bay", tl: 7, range: "special", power: 10, damage: "4D", cost: 20, traits: ["Smart"] },
  orbitalStrikeMassDriver: { label: "Orbital Strike Mass Driver Bay", tl: 10, range: "short", power: 50, damage: "10D", cost: 35, traits: ["Orbital Strike"] },
  orbitalStrikeMissile: { label: "Orbital Strike Missile Bay", tl: 10, range: "medium", power: 15, damage: "5D", cost: 20, traits: ["Orbital Strike"] },
  particleBeam: { label: "Particle Beam Bay", tl: 12, range: "veryLong", power: 50, damage: "8D", cost: 40, traits: ["Radiation"] },
  railgun: { label: "Railgun Bay", tl: 10, range: "short", power: 15, damage: "5D", cost: 50, traits: ["AP 10"] },
  repulsor: { label: "Repulsor Bay", tl: 14, range: "short", power: 100, damage: "Special", cost: 60, traits: [] },
  torpedo: { label: "Torpedo Bay", tl: 7, range: "special", power: 5, damage: "6D", cost: 6, traits: ["Smart"] },
};

/** Large Bay Weapons table, page 34. */
export const LARGE_BAY_WEAPONS: Readonly<Record<BayWeapon, BayWeaponRule>> = {
  fusionGun: { label: "Fusion Gun Bay", tl: 12, range: "long", power: 100, damage: "10D", cost: 25, traits: ["AP 8", "Radiation"] },
  ionCannon: { label: "Ion Cannon Bay", tl: 12, range: "long", power: 40, damage: "10D", cost: 40, traits: ["Ion"] },
  massDriver: { label: "Mass Driver Bay", tl: 8, range: "medium", power: 35, damage: "6D", cost: 80, traits: ["Orbital Bombardment"] },
  mesonGun: { label: "Meson Gun Bay", tl: 13, range: "long", power: 120, damage: "6D", cost: 250, traits: ["AP", "Radiation"] },
  missile: { label: "Missile Bay", tl: 7, range: "special", power: 20, damage: "4D", cost: 25, traits: ["Smart"] },
  orbitalStrikeMassDriver: { label: "Orbital Strike Mass Driver Bay", tl: 10, range: "short", power: 75, damage: "12D", cost: 50, traits: ["Orbital Strike"] },
  orbitalStrikeMissile: { label: "Orbital Strike Missile Bay", tl: 10, range: "medium", power: 25, damage: "8D", cost: 24, traits: ["Orbital Strike"] },
  particleBeam: { label: "Particle Beam Bay", tl: 13, range: "distant", power: 80, damage: "10D", cost: 60, traits: ["Radiation"] },
  railgun: { label: "Railgun Bay", tl: 10, range: "medium", power: 25, damage: "6D", cost: 70, traits: ["AP 10"] },
  repulsor: { label: "Repulsor Bay", tl: 13, range: "short", power: 200, damage: "Special", cost: 90, traits: [] },
  torpedo: { label: "Torpedo Bay", tl: 7, range: "special", power: 10, damage: "6D", cost: 10, traits: ["Smart"] },
};

export const BAY_WEAPONS: Readonly<Record<BaySize, Readonly<Record<BayWeapon, BayWeaponRule>>>> = {
  small: SMALL_BAY_WEAPONS,
  medium: MEDIUM_BAY_WEAPONS,
  large: LARGE_BAY_WEAPONS,
};

/** Bay weapons are clumsy against small targets. Page 33. */
export const BAY_SMALL_TARGET_DM = [
  { targetTonsUpTo: 100, dm: -4 },
  { targetTonsUpTo: 2_000, dm: -2 },
] as const;

export type SpinalWeapon = "massDriver" | "meson" | "particle" | "railgun";

export interface SpinalRule {
  readonly label: string;
  readonly tl: number;
  readonly range: WeaponRange;
  /** Tons for one multiple, and the minimum size at the lowest TL. */
  readonly baseSize: number;
  /** Power per multiple. */
  readonly power: number;
  /** Damage dice per multiple. */
  readonly damageDice: number;
  /** MCr per multiple. */
  readonly cost: number;
  readonly maxSize: number;
  readonly traits: readonly string[];
}

/** Spinal Mount Weapons table, page 36. Everything scales by multiples of the base size. */
export const SPINAL_WEAPONS: Readonly<Record<SpinalWeapon, SpinalRule>> = {
  massDriver: { label: "Mass Driver Spinal Mount", tl: 10, range: "short", baseSize: 5_000, power: 250, damageDice: 4, cost: 1_500, maxSize: 100_000, traits: ["AP 15", "Orbital Bombardment"] },
  meson: { label: "Meson Spinal Mount", tl: 12, range: "long", baseSize: 7_500, power: 1_000, damageDice: 6, cost: 2_000, maxSize: 75_000, traits: ["AP", "Radiation"] },
  particle: { label: "Particle Spinal Mount", tl: 11, range: "veryLong", baseSize: 3_500, power: 1_000, damageDice: 8, cost: 1_000, maxSize: 28_000, traits: ["Radiation"] },
  railgun: { label: "Railgun Spinal Mount", tl: 10, range: "medium", baseSize: 3_500, power: 500, damageDice: 4, cost: 500, maxSize: 21_000, traits: ["AP 20"] },
};

/**
 * Spinal Mounts Improvement table, page 36: building one above its own Tech
 * Level shrinks it and puts the price up. The table stops at three levels.
 */
export const SPINAL_IMPROVEMENTS: readonly { readonly levels: number; readonly tons: number; readonly cost: number }[] = [
  { levels: 1, tons: -0.1, cost: 0.1 },
  { levels: 2, tons: -0.15, cost: 0.2 },
  { levels: 3, tons: -0.2, cost: 0.3 },
];

/** A spinal mount uses a hardpoint per this much of itself, rounded up. Page 35. */
export const SPINAL_TONS_PER_HARDPOINT = 100;
/** And can be no more than this share of the ship carrying it. Page 35. */
export const SPINAL_MAX_SHARE_OF_HULL = 0.5;

/** The improvement for building this many Tech Levels above the weapon's own. */
export function spinalImprovement(levelsAbove: number): { tons: number; cost: number } {
  const capped = Math.min(Math.max(levelsAbove, 0), SPINAL_IMPROVEMENTS.length);
  if (capped === 0) return { tons: 0, cost: 0 };
  const row = SPINAL_IMPROVEMENTS[capped - 1];
  return { tons: row?.tons ?? 0, cost: row?.cost ?? 0 };
}

export type PointDefenceKind = "laser" | "gauss";
export type PointDefenceType = "typeI" | "typeII" | "typeIII";

export interface PointDefenceRule {
  readonly label: string;
  readonly tl: number;
  /** Dice of missiles removed from a salvo. */
  readonly intercept: string;
  readonly power: number;
  readonly tons: number;
  /** MCr. */
  readonly cost: number;
}

/** Point Defence Laser Batteries, page 41. One hardpoint each. */
export const POINT_DEFENCE_LASERS: Readonly<Record<PointDefenceType, PointDefenceRule>> = {
  typeI: { label: "Point Defence Laser Battery Type I", tl: 10, intercept: "+2D", power: 10, tons: 20, cost: 5 },
  typeII: { label: "Point Defence Laser Battery Type II", tl: 12, intercept: "+4D", power: 20, tons: 20, cost: 10 },
  typeIII: { label: "Point Defence Laser Battery Type III", tl: 14, intercept: "+6D", power: 30, tons: 20, cost: 20 },
};

/** Point Defence Gauss Batteries, page 41. Less power, but they need ammunition. */
export const POINT_DEFENCE_GAUSS: Readonly<Record<PointDefenceType, PointDefenceRule>> = {
  typeI: { label: "Point Defence Gauss Battery Type I", tl: 10, intercept: "+2D", power: 5, tons: 20, cost: 3 },
  typeII: { label: "Point Defence Gauss Battery Type II", tl: 12, intercept: "+4D", power: 15, tons: 20, cost: 6 },
  typeIII: { label: "Point Defence Gauss Battery Type III", tl: 14, intercept: "+6D", power: 25, tons: 20, cost: 10 },
};

export const POINT_DEFENCE: Readonly<Record<PointDefenceKind, Readonly<Record<PointDefenceType, PointDefenceRule>>>> = {
  laser: POINT_DEFENCE_LASERS,
  gauss: POINT_DEFENCE_GAUSS,
};

export const POINT_DEFENCE_HARDPOINTS = 1;

/**
 * Smaller Weapons, page 41: Ground scale weaponry bolted on. Under 250 kg it
 * takes a quarter ton and no hardpoint; heavier, it takes its own mass with a
 * one-ton floor. Either way it draws no power.
 */
export const SMALLER_WEAPONS = {
  lightTons: 0.25,
  /** Fixed mount on a ship under 50 tons. */
  fixedMountCost: 0.005,
  /** Pop-up turret on anything larger. */
  popUpTurretCost: 0.05,
  fixedMountMaxHullTons: 50,
  heavyMinTons: 1,
} as const;
