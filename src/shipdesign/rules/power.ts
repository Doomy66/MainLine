/**
 * Step 3, Install Power Plant, and step 4, Install Fuel Tanks.
 * High Guard Update 2022, PDF pages 18-19. ShipSpec 4.4 and 4.5.
 */

export type PowerPlantType = "fission" | "chemical" | "fusion8" | "fusion12" | "fusion15" | "antimatter";

export interface PowerPlantRule {
  readonly label: string;
  readonly tl: number;
  readonly powerPerTon: number;
  /** MCr per ton. */
  readonly costPerTon: number;
  /** Only fusion and antimatter can drive a jump. Page 18. */
  readonly canJump: boolean;
}

/** Power Plant table, page 18. ShipSpec 4.4.1. */
export const POWER_PLANTS: Readonly<Record<PowerPlantType, PowerPlantRule>> = {
  fission: { label: "Fission", tl: 6, powerPerTon: 8, costPerTon: 0.4, canJump: false },
  chemical: { label: "Chemical", tl: 7, powerPerTon: 5, costPerTon: 0.25, canJump: false },
  fusion8: { label: "Fusion (TL8)", tl: 8, powerPerTon: 10, costPerTon: 0.5, canJump: true },
  fusion12: { label: "Fusion (TL12)", tl: 12, powerPerTon: 15, costPerTon: 1, canJump: true },
  fusion15: { label: "Fusion (TL15)", tl: 15, powerPerTon: 20, costPerTon: 2, canJump: true },
  antimatter: { label: "Antimatter", tl: 20, powerPerTon: 100, costPerTon: 10, canJump: true },
};

/** Power Requirements, page 18. ShipSpec 4.4.2. Fractions of hull tonnage. */
export const BASIC_SYSTEMS_POWER = 0.2;
export const MANOEUVRE_POWER_PER_THRUST = 0.1;
/** A thrust 0 drive needs a quarter of the thrust 1 figure. */
export const MANOEUVRE_POWER_THRUST_0 = 0.1 * 0.25;
export const JUMP_POWER_PER_RATING = 0.1;

/** Fuel, page 19. ShipSpec 4.5. */
export const JUMP_FUEL_PER_RATING = 0.1;
/** Reaction drives burn this fraction of the hull per thrust per hour. */
export const REACTION_FUEL_PER_THRUST_HOUR = 0.025;
/** A thrust 0 reaction drive burns this many tons per hour, regardless of hull. */
export const REACTION_FUEL_THRUST_0_PER_HOUR = 0.25;
/** Fraction of power plant tonnage per month, rounded up to a ton, minimum 1. */
export const POWER_PLANT_FUEL_PER_MONTH = 0.1;
/** Chemical plants: tons of fuel per ton of plant per two weeks. */
export const CHEMICAL_FUEL_PER_TON_PER_FORTNIGHT = 10;
export const WEEKS_PER_MONTH = 4;
