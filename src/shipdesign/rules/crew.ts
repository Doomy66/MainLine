/**
 * Step 10, Determine Crew. High Guard Update 2022, PDF pages 23-24. ShipSpec 4.10.
 *
 * The table's "1 per N" rules are functions of the figures they read, so the
 * rounding lives here with the rule and not in the engine. ShipSpec 4.10.2.1.
 */

export type CrewRole =
  | "captain"
  | "pilot"
  | "astrogator"
  | "engineer"
  | "maintenance"
  | "gunner"
  | "steward"
  | "administrator"
  | "sensorOperator"
  | "medic"
  | "officer";

/** What the crew rules read off a design. */
export interface CrewInputs {
  readonly hullTons: number;
  readonly hasJump: boolean;
  /** Tons of manoeuvre, reaction and jump drives and power plant, ship and carried craft. */
  readonly driveAndPlantTons: number;
  readonly smallCraft: number;
  /** Turrets with at least one weapon. ShipSpec 4.10.2.2. */
  readonly armedTurrets: number;
  readonly barbettes: number;
  readonly smallBays: number;
  readonly mediumBays: number;
  readonly largeBays: number;
  /** Tons of spinal mount weaponry. */
  readonly spinalTons: number;
  readonly screens: number;
  readonly highPassengers: number;
  readonly middlePassengers: number;
}

/** Nothing armed at all, to spread over in a caller that only cares about a few. */
export const NO_WEAPONS = {
  armedTurrets: 0,
  barbettes: 0,
  smallBays: 0,
  mediumBays: 0,
  largeBays: 0,
  spinalTons: 0,
  screens: 0,
} as const;

/** A spinal mount wants a gunner per this much of itself. Page 24. */
export const SPINAL_TONS_PER_GUNNER = 100;

export const TONS_PER_ENGINEER = 35;

/**
 * Engineers, page 24: "1 per 35 tons of drives and power plant". Taken
 * literally that rounds up, and the book's own ships say otherwise. The figure
 * is rounded to the nearest whole engineer, with one as the floor for any ship
 * that has an engine room at all. ShipSpec 4.10.2.1.
 *
 * Six of the book's ships, and only this rule fits all six:
 *
 * | Ship | Drives and plant | Engineers |
 * |---|---|---|
 * | Scout/Courier | 16 | 1 |
 * | Free Trader | 17 | 1 |
 * | Far Trader | 22 | 1 |
 * | Patrol Corvette | 71 | 2 |
 * | Close Escort | 128.75 | 4 |
 * | Destroyer Escort | 229 | 7 |
 *
 * Rounding up gives the Corvette three and the book gives it two. Rounding
 * down gives the Destroyer Escort six and the book gives it seven. Rounding
 * down without the floor leaves the Scout with none at all.
 */
export function engineers(driveAndPlantTons: number): number {
  return Math.max(1, Math.round(driveAndPlantTons / TONS_PER_ENGINEER));
}

export interface CrewRoleRule {
  readonly label: string;
  readonly skill: string;
  /** Cr per month at skill 1. */
  readonly salary: number;
  readonly commercial: (inputs: CrewInputs) => number;
  readonly military: (inputs: CrewInputs) => number;
  /** Page 23: only these roles are reduced on large ships. */
  readonly reducible: boolean;
}

/** Roles worked out from the others: officers and medics. Page 23. */
export interface DerivedCrewInputs {
  /** Everyone except officers and medics, after any large-ship reduction. */
  readonly crew: number;
  readonly passengers: number;
}

/** Ships of 100 tons or less with no jump drive have a single pilot. Page 23. ShipSpec 4.10.1. */
export const SMALL_CRAFT_MAX_TONS = 100;

/** Crew Requirements table, page 24. */
export const CREW_ROLES: Readonly<Record<CrewRole, CrewRoleRule>> = {
  captain: {
    label: "Captain", skill: "--", salary: 10_000, reducible: false,
    commercial: () => 0,
    military: () => 1,
  },
  pilot: {
    label: "Pilot", skill: "Pilot", salary: 6_000, reducible: false,
    commercial: (i) => 1 + i.smallCraft,
    military: (i) => 3 + i.smallCraft,
  },
  astrogator: {
    label: "Astrogator", skill: "Astrogation", salary: 5_000, reducible: false,
    commercial: (i) => (i.hasJump ? 1 : 0),
    military: (i) => (i.hasJump ? 1 : 0),
  },
  engineer: {
    label: "Engineer", skill: "Engineer", salary: 4_000, reducible: true,
    commercial: (i) => engineers(i.driveAndPlantTons),
    military: (i) => engineers(i.driveAndPlantTons),
  },
  maintenance: {
    label: "Maintenance", skill: "Mechanic", salary: 1_000, reducible: true,
    commercial: (i) => Math.floor(i.hullTons / 1_000),
    military: (i) => Math.floor(i.hullTons / 500),
  },
  gunner: {
    label: "Gunner", skill: "Gunner", salary: 2_000, reducible: true,
    // Commercial: one per turret, barbette and screen. The book adds that bay
    // and spinal weapons require military crewing, so those are counted at the
    // military rate whoever owns the ship, and the engine says so. ShipSpec 4.10.2.3.
    commercial: (i) =>
      i.armedTurrets +
      i.barbettes +
      i.screens +
      i.smallBays +
      2 * i.mediumBays +
      4 * i.largeBays +
      Math.floor(i.spinalTons / SPINAL_TONS_PER_GUNNER),
    military: (i) =>
      2 * (i.armedTurrets + i.barbettes + i.mediumBays + i.screens) +
      i.smallBays +
      4 * i.largeBays +
      Math.floor(i.spinalTons / SPINAL_TONS_PER_GUNNER),
  },
  steward: {
    label: "Steward", skill: "Steward", salary: 2_000, reducible: false,
    commercial: (i) => Math.ceil(i.highPassengers / 10) + Math.ceil(i.middlePassengers / 100),
    military: (i) => Math.ceil(i.highPassengers / 10) + Math.ceil(i.middlePassengers / 100),
  },
  administrator: {
    label: "Administrator", skill: "Admin", salary: 1_500, reducible: true,
    commercial: (i) => Math.floor(i.hullTons / 2_000),
    military: (i) => Math.floor(i.hullTons / 1_000),
  },
  sensorOperator: {
    label: "Sensor Operator", skill: "Electronics (sensors)", salary: 4_000, reducible: true,
    commercial: (i) => Math.floor(i.hullTons / 7_500),
    military: (i) => 3 * Math.floor(i.hullTons / 7_500),
  },
  medic: {
    label: "Medic", skill: "Medic", salary: 4_000, reducible: false,
    commercial: () => 0,
    military: () => 0,
  },
  officer: {
    label: "Officer", skill: "Leadership or Persuade", salary: 5_000, reducible: false,
    commercial: () => 0,
    military: () => 0,
  },
};

/** Medics and officers read the rest of the crew. Page 24. */
export const DERIVED_CREW = {
  medic: {
    commercial: (d: DerivedCrewInputs) => Math.floor((d.crew + d.passengers) / 120),
    military: (d: DerivedCrewInputs) => Math.floor(d.crew / 120),
  },
  officer: {
    commercial: (d: DerivedCrewInputs) => Math.floor(d.crew / 20),
    military: (d: DerivedCrewInputs) => Math.floor(d.crew / 10),
  },
} as const;

/** Salary rises by half for every skill level above 1. Page 23. */
export const SALARY_PER_SKILL_LEVEL_ABOVE_1 = 0.5;

/** Crew Reduction table, page 23. ShipSpec 4.10.3. The multiplier for a hull, or 1. */
export function crewReductionMultiplier(hullTons: number): number {
  if (hullTons >= 100_000) return 0.33;
  if (hullTons >= 50_000) return 0.5;
  if (hullTons >= 20_000) return 0.67;
  if (hullTons > 5_000) return 0.75;
  return 1;
}
