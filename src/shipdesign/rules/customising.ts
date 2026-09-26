/**
 * Customising Ships: building a component above or below its own Tech Level,
 * and the Advantages and Disadvantages that come with doing so.
 * High Guard Update 2022, PDF pages 71-73. ShipSpec 4.15.
 *
 * Three rules govern the arithmetic and each is easy to get wrong:
 *
 * - Everything is **additive**. Two +10% alterations make +20%, not +21%.
 * - A modified **price is computed on the original size**, not the modified one
 *   (page 72). The Close Escort's manoeuvre drive is the worked example: 21
 *   tons grown to 26.25 by Increased Size, but priced as 21.
 * - A power plant's **output** likewise follows the original size, while its
 *   **fuel** follows the size actually installed. The same ship proves both:
 *   38 tons of plant makes Power 570 at 47.5 tons installed, and burns fuel as
 *   47.5 tons of plant.
 */

/** Prototype/Advanced table, page 71. ShipSpec 4.15.1. */
export type CustomisationGrade =
  | "earlyPrototype"
  | "prototype"
  | "budget"
  | "advanced"
  | "veryAdvanced"
  | "highTechnology";

export interface GradeRule {
  readonly label: string;
  /** Added to the component's own minimum Tech Level. */
  readonly tl: number;
  /** Added to tonnage. */
  readonly tonnage: number;
  /** Added to cost. */
  readonly cost: number;
  /** Slots of Advantage, or of Disadvantage where `kind` says so. */
  readonly slots: number;
  readonly kind: "advantage" | "disadvantage";
}

export const GRADES: Readonly<Record<CustomisationGrade, GradeRule>> = {
  earlyPrototype: { label: "Early Prototype", tl: -2, tonnage: 1, cost: 10, slots: 2, kind: "disadvantage" },
  prototype: { label: "Prototype", tl: -1, tonnage: 0, cost: 5, slots: 1, kind: "disadvantage" },
  budget: { label: "Budget", tl: 0, tonnage: 0, cost: -0.25, slots: 1, kind: "disadvantage" },
  advanced: { label: "Advanced", tl: 1, tonnage: 0, cost: 0.1, slots: 1, kind: "advantage" },
  veryAdvanced: { label: "Very Advanced", tl: 2, tonnage: 0, cost: 0.25, slots: 2, kind: "advantage" },
  highTechnology: { label: "High Technology", tl: 3, tonnage: 0, cost: 0.5, slots: 3, kind: "advantage" },
};

export type TraitCategory = "manoeuvre" | "reaction" | "jump" | "powerPlant" | "weapon";

export interface TraitRule {
  readonly label: string;
  readonly category: TraitCategory;
  readonly kind: "advantage" | "disadvantage";
  /** Slots consumed. Most want one; a few want two. */
  readonly slots: number;
  /** Added to tonnage. */
  readonly tonnage?: number;
  /** Added to the Power the component consumes. */
  readonly power?: number;
  /** Added to the Power a plant produces. */
  readonly powerOutput?: number;
  /** Added to the fuel the component burns. */
  readonly fuel?: number;
  /** A turret weapon is too small to take this one. Page 73. */
  readonly notTurretWeapons?: boolean;
  /** What it does, where the effect is not a number the sheet carries. */
  readonly effect?: string;
}

export type Trait =
  | "decreasedFuel"
  | "earlyJump"
  | "jumpEnergyEfficient"
  | "jumpSizeReduction"
  | "stealthJump"
  | "jumpEnergyInefficient"
  | "lateJump"
  | "jumpIncreasedSize"
  | "manoeuvreEnergyEfficient"
  | "manoeuvreSizeReduction"
  | "manoeuvreEnergyInefficient"
  | "limitedRange"
  | "manoeuvreIncreasedSize"
  | "orbitalRange"
  | "fuelEfficient"
  | "fuelInefficient"
  | "increasedPower"
  | "plantSizeReduction"
  | "plantEnergyInefficient"
  | "plantIncreasedSize"
  | "accurate"
  | "easyToRepair"
  | "weaponEnergyEfficient"
  | "highYield"
  | "veryHighYield"
  | "intenseFocus"
  | "longRange"
  | "resilient"
  | "weaponSizeReduction"
  | "weaponEnergyInefficient"
  | "inaccurate"
  | "weaponIncreasedSize";

/** Advantages and Disadvantages, pages 72-73. */
export const TRAITS: Readonly<Record<Trait, TraitRule>> = {
  // Jump drive, page 72.
  decreasedFuel: { label: "Decreased Fuel", category: "jump", kind: "advantage", slots: 1, fuel: -0.05 },
  earlyJump: { label: "Early Jump", category: "jump", kind: "advantage", slots: 1, effect: "Jumps at 90 diameters rather than 100." },
  jumpEnergyEfficient: { label: "Energy Efficient", category: "jump", kind: "advantage", slots: 1, power: -0.25 },
  jumpSizeReduction: { label: "Size Reduction", category: "jump", kind: "advantage", slots: 1, tonnage: -0.1, effect: "May take the drive below its ten-ton minimum." },
  stealthJump: { label: "Stealth Jump", category: "jump", kind: "advantage", slots: 2, effect: "Emergence from jump is not detected automatically." },
  jumpEnergyInefficient: { label: "Energy Inefficient", category: "jump", kind: "disadvantage", slots: 1, power: 0.3 },
  lateJump: { label: "Late Jump", category: "jump", kind: "disadvantage", slots: 1, effect: "Jumps at 150 diameters rather than 100." },
  jumpIncreasedSize: { label: "Increased Size", category: "jump", kind: "disadvantage", slots: 1, tonnage: 0.25 },

  // Manoeuvre drive, page 72.
  manoeuvreEnergyEfficient: { label: "Energy Efficient", category: "manoeuvre", kind: "advantage", slots: 1, power: -0.25 },
  manoeuvreSizeReduction: { label: "Size Reduction", category: "manoeuvre", kind: "advantage", slots: 1, tonnage: -0.1 },
  manoeuvreEnergyInefficient: { label: "Energy Inefficient", category: "manoeuvre", kind: "disadvantage", slots: 1, power: 0.3 },
  limitedRange: { label: "Limited Range", category: "manoeuvre", kind: "disadvantage", slots: 1, effect: "Works only within the 100-diameter limit." },
  manoeuvreIncreasedSize: { label: "Increased Size", category: "manoeuvre", kind: "disadvantage", slots: 1, tonnage: 0.25 },
  orbitalRange: { label: "Orbital Range", category: "manoeuvre", kind: "disadvantage", slots: 2, effect: "Works only within 1,250km of a planetary body." },

  // Reaction drive, page 72.
  fuelEfficient: { label: "Fuel Efficient", category: "reaction", kind: "advantage", slots: 1, fuel: -0.2 },
  fuelInefficient: { label: "Fuel Inefficient", category: "reaction", kind: "disadvantage", slots: 1, fuel: 0.25 },

  // Power plant, page 72.
  increasedPower: { label: "Increased Power", category: "powerPlant", kind: "advantage", slots: 2, powerOutput: 0.1 },
  plantSizeReduction: { label: "Size Reduction", category: "powerPlant", kind: "advantage", slots: 1, tonnage: -0.1 },
  plantEnergyInefficient: { label: "Energy Inefficient", category: "powerPlant", kind: "disadvantage", slots: 1, powerOutput: -0.25 },
  plantIncreasedSize: { label: "Increased Size", category: "powerPlant", kind: "disadvantage", slots: 1, tonnage: 0.25 },

  // Weapons and screens, pages 72-73.
  accurate: { label: "Accurate", category: "weapon", kind: "advantage", slots: 2, effect: "DM+1 to attack rolls." },
  easyToRepair: { label: "Easy to Repair", category: "weapon", kind: "advantage", slots: 1, effect: "DM+1 to repair it." },
  weaponEnergyEfficient: { label: "Energy Efficient", category: "weapon", kind: "advantage", slots: 1, power: -0.25 },
  highYield: { label: "High Yield", category: "weapon", kind: "advantage", slots: 1, effect: "Damage dice showing 1 count as 2. Not for missiles or torpedoes." },
  veryHighYield: { label: "Very High Yield", category: "weapon", kind: "advantage", slots: 2, effect: "Damage dice showing 1 or 2 count as 3. Not for missiles or torpedoes." },
  intenseFocus: { label: "Intense Focus", category: "weapon", kind: "advantage", slots: 2, effect: "AP+2. Lasers and particle weapons only." },
  longRange: { label: "Long Range", category: "weapon", kind: "advantage", slots: 2, effect: "One range band further, to a maximum of Very Long. Once only." },
  resilient: { label: "Resilient", category: "weapon", kind: "advantage", slots: 1, effect: "Critical hits upon it are one Severity lower." },
  weaponSizeReduction: { label: "Size Reduction", category: "weapon", kind: "advantage", slots: 1, tonnage: -0.1, notTurretWeapons: true },
  weaponEnergyInefficient: { label: "Energy Inefficient", category: "weapon", kind: "disadvantage", slots: 1, power: 0.3, notTurretWeapons: true },
  inaccurate: { label: "Inaccurate", category: "weapon", kind: "disadvantage", slots: 1, effect: "DM-1 to attack rolls." },
  weaponIncreasedSize: { label: "Increased Size", category: "weapon", kind: "disadvantage", slots: 1, tonnage: 0.2 },
};

/** What a customisation does to a component, once the traits are added up. */
export interface Customised {
  readonly label: string;
  readonly tlRequired: number;
  /** Multiplies the base tonnage. */
  readonly tonnage: number;
  /** Multiplies the cost, which is reckoned on the ORIGINAL tonnage. */
  readonly cost: number;
  /** Multiplies the Power consumed. */
  readonly power: number;
  /** Multiplies the Power a plant produces. */
  readonly powerOutput: number;
  /** Multiplies the fuel burnt. */
  readonly fuel: number;
  readonly effects: readonly string[];
  readonly problems: readonly string[];
}

export const UNCUSTOMISED: Customised = {
  label: "",
  tlRequired: 0,
  tonnage: 1,
  cost: 1,
  power: 1,
  powerOutput: 1,
  fuel: 1,
  effects: [],
  problems: [],
};

/**
 * Work out what a grade and its traits do to a component of `baseTl`.
 * Everything is additive, per page 72.
 */
export function customise(
  grade: CustomisationGrade,
  traits: readonly Trait[],
  category: TraitCategory,
  baseTl: number,
  isTurretWeapon = false,
): Customised {
  const rule = GRADES[grade];
  const problems: string[] = [];
  const effects: string[] = [];
  let tonnage = rule.tonnage;
  let power = 0;
  let powerOutput = 0;
  let fuel = 0;
  let slots = 0;

  for (const name of traits) {
    const trait = TRAITS[name];
    if (trait.category !== category) {
      problems.push(`${trait.label} is a ${trait.category} trait and cannot go on a ${category} component.`);
      continue;
    }
    if (trait.kind !== rule.kind) {
      const article = trait.kind === "advantage" ? "an" : "a";
      problems.push(`${rule.label} grants ${rule.kind}s, and ${trait.label} is ${article} ${trait.kind}.`);
      continue;
    }
    if (trait.notTurretWeapons === true && isTurretWeapon) {
      problems.push(`${trait.label} cannot be applied to a turret weapon.`);
      continue;
    }
    slots += trait.slots;
    tonnage += trait.tonnage ?? 0;
    power += trait.power ?? 0;
    powerOutput += trait.powerOutput ?? 0;
    fuel += trait.fuel ?? 0;
    if (trait.effect !== undefined) effects.push(`${trait.label}: ${trait.effect}`);
  }

  if (slots !== rule.slots) {
    problems.push(
      `${rule.label} allows ${rule.slots} ${rule.kind}${rule.slots === 1 ? "" : "s"}, and ${slots} ${slots === 1 ? "was" : "were"} taken.`,
    );
  }

  const names = traits.map((name) => TRAITS[name].label);
  return {
    label: names.length > 0 ? `${rule.label} (${names.join(", ")})` : rule.label,
    tlRequired: baseTl + rule.tl,
    tonnage: 1 + tonnage,
    cost: 1 + rule.cost,
    power: 1 + power,
    powerOutput: 1 + powerOutput,
    fuel: 1 + fuel,
    effects,
    problems,
  };
}

/**
 * Refitting Ships, page 73. A refit is priced against the system going in, or
 * against the system coming out when nothing replaces it, and takes a share of
 * the time the whole ship would take to build.
 */
export const REFIT = {
  /** Power plant, manoeuvre drive, jump drive, spinal mounts, launch facilities. */
  major: { removeFactor: 0.5, replaceFactor: 1.5, timeFactor: 0.25 },
  /** Anything else: weapon mounts, staterooms and the rest. */
  minor: { removeFactor: 0.1, replaceFactor: 1.1, timeFactor: 0.1 },
  /** Any refit needs Class B; a jump drive needs Class A. */
  minimumStarport: "B",
  jumpDriveStarport: "A",
} as const;

export type RefitKind = keyof Pick<typeof REFIT, "major" | "minor">;

/** What a refit costs, in MCr. `newCost` omitted means the system is only removed. */
export function refitCost(kind: RefitKind, oldCost: number, newCost?: number): number {
  const rule = REFIT[kind];
  return newCost === undefined ? oldCost * rule.removeFactor : newCost * rule.replaceFactor;
}
