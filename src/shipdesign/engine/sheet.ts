/**
 * sheet(design): the design sheet the book would print. ShipSpec 5.
 *
 * Pure, and the only place the rules data is turned into figures. Every clause
 * cited is in ShipSpec.md; every table read is in src/rules.
 */

import {
  ADJUSTABLE_HULLS,
  AEROFIN_HULL_FRACTION,
  ARCHITECT_FEE,
  ARMOUR_TYPES,
  BARBETTES,
  BARBETTE_FIRMPOINTS,
  BARBETTE_FIRMPOINT_EXTRA_TONS,
  BARBETTE_TONS,
  BASIC_SYSTEMS_POWER,
  BAY_SIZES,
  BAY_WEAPONS,
  BLACK_GLOBE,
  CANISTERS,
  CANISTERS_PER_TON,
  CAPACITORS,
  CHEMICAL_FUEL_PER_TON_PER_FORTNIGHT,
  COCKPITS,
  COMMAND_BRIDGE,
  COMMON_AREA,
  CONCEALED_MANOEUVRE_DRIVE,
  CONSTRUCTION_DAYS_PER_MCR,
  CREW_ROLES,
  DERIVED_CREW,
  DETACHABLE_BRIDGE,
  DOCKING_SPACE_FACTOR,
  EMERGENCY_LOW_BERTH,
  EMERGENCY_POWER_FRACTION,
  FIRMPOINT_POWER_FACTOR,
  FLAT_SYSTEMS,
  FUEL_PROCESSOR_TONS_PER_DAY,
  FUEL_SCOOPS,
  FULL_HANGAR_FACTOR,
  GRAV_SCREEN_HULL_TONS_PER_TON,
  HARDENED_SYSTEMS,
  HIGH_BURN_THRUSTER,
  HOLOGRAPHIC_CONTROLS,
  HULL_CONFIGURATIONS,
  HULL_COST_PER_TON,
  HULL_OPTIONS,
  JUMP_CONTROL_SPECIALISATION,
  JUMP_COST_PER_TON,
  JUMP_DRIVES,
  JUMP_DRIVE_EXTRA_TONS,
  JUMP_DRIVE_MIN_TONS,
  JUMP_FUEL_PER_RATING,
  JUMP_POWER_PER_RATING,
  LOW_BERTH,
  MAINTENANCE_DIVISOR,
  MANOEUVRE_COST_PER_TON,
  MANOEUVRE_DRIVES,
  MANOEUVRE_POWER_PER_THRUST,
  MANOEUVRE_POWER_THRUST_0,
  MILITARY_HULL_ARMOUR_FACTOR,
  MILITARY_HULL_MIN_TONS,
  MIN_HULL_TONS,
  MIN_JUMP_HULL_TONS,
  MISSILES,
  MISSILES_PER_TON,
  MODULAR_HULL,
  MOUNTS,
  NON_GRAVITY_BASIC_POWER_FACTOR,
  NON_GRAVITY_MAX_TONS,
  NO_WEAPONS,
  PER_HULL_TON_SYSTEMS,
  PER_TON_SYSTEMS,
  PLANETOID_COST_PER_TON,
  POINT_DEFENCE,
  POINT_DEFENCE_HARDPOINTS,
  POP_UP_MOUNTING,
  POWER_PLANTS,
  POWER_PLANT_FUEL_PER_MONTH,
  PRESSURE_HULL,
  REACTION_COST_PER_TON,
  REACTION_DRIVES,
  REACTION_FUEL_PER_THRUST_HOUR,
  REACTION_FUEL_THRUST_0_PER_HOUR,
  SCREENS,
  SENSORS,
  SMALLER_BRIDGE_COST_FACTOR,
  SMALLER_BRIDGE_DM,
  SOLAR_COATING_AWKWARD_HULL_FACTOR,
  SOLAR_COATING_MAX_HULL_FRACTION,
  SOLAR_SAIL_HULL_FRACTION,
  SOLAR_SYSTEMS,
  SPECIALISED_HULLS,
  SPINAL_MAX_SHARE_OF_HULL,
  SPINAL_TONS_PER_HARDPOINT,
  SPINAL_WEAPONS,
  STANDARD_DESIGN_FACTOR,
  STATEROOM,
  STEALTH_TYPES,
  TONS_PER_FREE_AIRLOCK,
  TONS_PER_HARDPOINT,
  TORPEDOES,
  TORPEDOES_PER_TON,
  TOW_CABLE_HULL_FRACTION,
  TURRET_WEAPONS,
  UNCUSTOMISED,
  WEEKS_PER_MONTH,
  armourTonnageMultiplier,
  bridgeCost,
  cargoCraneTons,
  computerRule,
  constructionTimeFactor,
  crewReductionMultiplier,
  customise,
  detachableBridgeMinimum,
  driveRating,
  firmpoints,
  hardpoints,
  hullPointDivisor,
  ramscoopTons,
  repairDroneTons,
  smallerBridgeTons,
  softwareRule,
  spinalImprovement,
  standardBridgeTons,
} from "../rules/index";
import type { CrewInputs, CrewRole, Customised, PerTonSystem, TraitCategory } from "../rules/index";
import type { Customisation, Design } from "./design";

/** A line of the sheet. ShipSpec 5.2. */
export interface SheetLine {
  readonly section: string;
  readonly label: string;
  /** Omitted where the component takes no space, as the book prints a dash. */
  readonly tons?: number;
  /** MCr. Omitted where the component is free. */
  readonly cost?: number;
  readonly power?: number;
  /** Software only. Power and bandwidth never appear on the same line. */
  readonly bandwidth?: number;
}

export interface PowerEntry {
  readonly label: string;
  readonly power: number;
  /** A jump drive draws its power only when jumping. ShipSpec 4.4.2. */
  readonly whenJumping?: boolean;
}

export interface CrewEntry {
  readonly role: CrewRole;
  readonly label: string;
  readonly count: number;
  /** Cr per month at skill 1. */
  readonly salary: number;
}

export type ProblemSeverity = "error" | "warning" | "note";

export interface Problem {
  readonly severity: ProblemSeverity;
  readonly message: string;
  /** The ShipSpec clause the rule is in. */
  readonly clause: string;
}

export interface Sheet {
  readonly name: string;
  /** The designer's own description, carried through so the sheet can print it. */
  readonly notes: string;
  readonly tl: number;
  readonly lines: readonly SheetLine[];
  readonly hullTons: number;
  /** All of the hull but the unusable part of a planetoid. ShipSpec 4.1.3.1. */
  readonly usableTons: number;
  readonly tonsUsed: number;
  readonly cargoTons: number;
  readonly hullPoints: number;
  readonly armourProtection: number;
  /** MCr before the discount or the architect. */
  readonly totalCost: number;
  /** MCr actually paid. ShipSpec 4.13.2. */
  readonly purchaseCost: number;
  /** Cr per month. ShipSpec 4.13.3. */
  readonly maintenanceCost: number;
  readonly constructionDays: number;
  /** MCr of ammunition, which the ship's price does not include. ShipSpec 4.9.5.1. */
  readonly ordnanceCost: number;
  readonly powerAvailable: number;
  readonly powerRequirements: readonly PowerEntry[];
  readonly fuel: {
    readonly jump: number;
    readonly powerPlant: number;
    readonly reaction: number;
    readonly extra: number;
    readonly total: number;
  };
  readonly crew: readonly CrewEntry[];
  readonly crewTotal: number;
  /** What the ship is meant to carry, which the crew rules read. ShipSpec 4.10.2. */
  readonly passengers: { readonly high: number; readonly middle: number; readonly low: number };
  /** Cr per month at skill 1. */
  readonly wageBill: number;
  readonly airlocks: number;
  readonly hardpoints: { readonly available: number; readonly used: number; readonly firmpoints: boolean };
  readonly software: {
    /** Everything but Jump Control, which is weighed on its own. ShipSpec 4.7.5. */
    readonly bandwidth: number;
    readonly jumpControl: number;
    readonly processing: number;
    /** Processing as Jump Control sees it, so with /bis counted. */
    readonly jumpProcessing: number;
  };
  readonly problems: readonly Problem[];
}

/** MCr to the credit: MCr0.000001 is Cr1, so six places is exact money. */
function cr(mcr: number): number {
  return Math.round(mcr * 1e6) / 1e6;
}

/** Tons, with float noise cleared. The book does not round tonnage. ShipSpec 9.3. */
function tons(value: number): number {
  return Math.round(value * 1e3) / 1e3;
}

export function sheet(design: Design): Sheet {
  const lines: SheetLine[] = [];
  const problems: Problem[] = [];
  // Power draws, kept apart so the requirements list can be assembled in the
  // order the book's sheets print it. ShipSpec 5.4.
  const systemPowerEntries: PowerEntry[] = [];
  const berthPowerEntries: PowerEntry[] = [];

  const fail = (message: string, clause: string) => problems.push({ severity: "error", message, clause });
  const warn = (message: string, clause: string) => problems.push({ severity: "warning", message, clause });
  const note = (message: string, clause: string) => problems.push({ severity: "note", message, clause });

  const hullTons = design.hull.tons;
  const config = HULL_CONFIGURATIONS[design.hull.configuration];
  const specialised = design.hull.specialised ?? [];
  const isPlanetoid = config.usable !== undefined;
  const usableTons = isPlanetoid ? hullTons * (config.usable ?? 1) : hullTons;

  // Step 1: the hull. ShipSpec 4.1.
  if (hullTons < MIN_HULL_TONS) fail(`A hull is at least ${MIN_HULL_TONS} tons.`, "4.1.1");
  if (design.jump !== undefined && hullTons < MIN_JUMP_HULL_TONS) {
    fail(`A jump drive needs a hull of at least ${MIN_JUMP_HULL_TONS} tons.`, "4.1.1");
  }

  const specialisedCost = specialised.reduce((sum, key) => sum + SPECIALISED_HULLS[key].cost, 0);
  const specialisedHullPoints = specialised.reduce((sum, key) => sum + SPECIALISED_HULLS[key].hullPoints, 0);
  const baseHullCost = hullTons * (isPlanetoid ? PLANETOID_COST_PER_TON : HULL_COST_PER_TON);
  const hullCost = baseHullCost * (1 + config.cost) * (1 + specialisedCost);
  const hullPoints = Math.floor(
    (hullTons / hullPointDivisor(hullTons)) * (1 + config.hullPoints + specialisedHullPoints),
  );

  // Basic ship systems are what the hull itself costs to run, so the figure is
  // worked out here and shown against the hull. ShipSpec 5.2.1.
  const basicPower =
    hullTons * BASIC_SYSTEMS_POWER * (specialised.includes("nonGravity") ? NON_GRAVITY_BASIC_POWER_FACTOR : 1);

  const military = specialised.includes("military");
  if (military && hullTons <= MILITARY_HULL_MIN_TONS) {
    fail(`A military hull needs more than ${MILITARY_HULL_MIN_TONS.toLocaleString()} tons.`, "4.1.4");
  }
  if (specialised.includes("nonGravity") && hullTons > NON_GRAVITY_MAX_TONS) {
    fail(`A non-gravity hull is limited to ${NON_GRAVITY_MAX_TONS.toLocaleString()} tons.`, "4.1.4");
  }

  // Structure options, pages 44-45. Each is a share of the ship and a change to
  // the hull's own price, so both are settled here. ShipSpec 4.1.7.
  let structureTons = 0;
  let structureCost = 0;
  const structureLabels: string[] = [];

  if (design.hull.pressureHull === true) {
    structureTons += hullTons * PRESSURE_HULL.hullFraction;
    structureCost += hullCost * (PRESSURE_HULL.hullCostFactor - 1);
    structureLabels.push(PRESSURE_HULL.label);
  }
  if (design.hull.adjustable !== undefined) {
    const rule = ADJUSTABLE_HULLS[design.hull.adjustable];
    if (design.tl < rule.tl) fail(`${rule.label} is TL${rule.tl}.`, "4.1.7");
    structureTons += hullTons * rule.hullFraction;
    structureCost += baseHullCost * rule.hullCost;
    structureLabels.push(rule.label);
  }
  const modularFraction = design.hull.modularFraction ?? 0;
  if (modularFraction > 0) {
    if (modularFraction > MODULAR_HULL.maxFraction) {
      fail(`At most ${MODULAR_HULL.maxFraction * 100}% of a ship may be modular.`, "4.1.7");
    }
    structureCost += hullCost * modularFraction;
    structureLabels.push(`${MODULAR_HULL.label} ${Math.round(modularFraction * 100)}%`);
  }

  const hullDetail = [
    `${hullTons} tons`,
    config.label,
    ...specialised.map((key) => SPECIALISED_HULLS[key].label),
    ...structureLabels,
  ];
  lines.push({
    section: "Hull",
    label: hullDetail.join(", "),
    ...(structureTons > 0 ? { tons: tons(structureTons) } : {}),
    cost: cr(hullCost + structureCost),
    power: tons(basicPower),
  });

  // Step 1c: hull options. ShipSpec 4.1.6.
  for (const option of design.hull.options ?? []) {
    const rule = HULL_OPTIONS[option];
    if (design.tl < rule.tl) fail(`${rule.label} is TL${rule.tl}.`, "4.1.6");
    lines.push({ section: "Hull Options", label: rule.label, cost: cr(rule.costPerHullTon * hullTons) });
  }
  if (design.hull.stealth !== undefined) {
    const rule = STEALTH_TYPES[design.hull.stealth];
    if (design.tl < rule.tl) fail(`${rule.label} is TL${rule.tl}.`, "4.1.6");
    if ((design.hull.options ?? []).includes("reflec")) {
      fail("Stealth cannot be combined with Reflec.", "4.1.6");
    }
    const stealthTons = hullTons * rule.tonnage;
    lines.push({
      section: "Hull Options",
      label: rule.label,
      ...(stealthTons > 0 ? { tons: tons(stealthTons) } : {}),
      cost: cr(rule.costPerHullTon * hullTons),
    });
  }

  // Step 1b: armour. ShipSpec 4.2.
  let armourProtection = (config.baseProtection ?? 0) + (design.hull.pressureHull === true ? PRESSURE_HULL.protection : 0);
  if (design.armour !== undefined) {
    const rule = ARMOUR_TYPES[design.armour.type];
    if (design.tl < rule.tl) fail(`${rule.label} is TL${rule.tl}.`, "4.2.1");
    const armourTons =
      hullTons *
      rule.tonsPerPoint *
      design.armour.protection *
      (1 + config.armourVolume) *
      armourTonnageMultiplier(hullTons);
    armourProtection += design.armour.protection;
    const maximum = rule.maxProtection(design.tl) * (military ? MILITARY_HULL_ARMOUR_FACTOR : 1);
    if (armourProtection > maximum) {
      fail(`${rule.label} at TL${design.tl} allows Protection ${maximum}, not ${armourProtection}.`, "4.2.2");
    }
    lines.push({
      section: "Armour",
      label: `${rule.label}, Armour: ${armourProtection}`,
      tons: tons(armourTons),
      cost: cr(armourTons * rule.costPerTon),
    });
  } else if (armourProtection > 0) {
    lines.push({ section: "Armour", label: `${config.label}, Armour: ${armourProtection}` });
  }

  // Customising Ships, pages 71-73. A component built off its own Tech Level
  // carries a grade and its traits. ShipSpec 4.15.
  const customisationOf = (
    choice: { customisation?: Customisation } | undefined,
    category: TraitCategory,
    baseTl: number,
    isTurretWeapon = false,
  ): Customised => {
    const chosen = choice?.customisation;
    if (chosen === undefined) return { ...UNCUSTOMISED, tlRequired: baseTl };
    const result = customise(chosen.grade, chosen.traits ?? [], category, baseTl, isTurretWeapon);
    for (const problem of result.problems) fail(problem, "4.15.2");
    for (const effect of result.effects) note(effect, "4.15.2");
    return result;
  };

  // Step 2: drives. ShipSpec 4.3.
  const manoeuvre = typeof design.manoeuvre === "number" ? { thrust: design.manoeuvre } : design.manoeuvre;
  const jump = typeof design.jump === "number" ? { rating: design.jump } : design.jump;
  let driveTons = 0;
  let manoeuvrePower = 0;
  let jumpPower = 0;
  let reactionFuelFactor = 1;
  let jumpFuelFactor = 1;
  let boosterFuelFactor = 1;
  let boosterThrust = 0;

  if (manoeuvre !== undefined) {
    const rule = driveRating(MANOEUVRE_DRIVES, manoeuvre.thrust);
    if (rule === undefined) {
      fail(`There is no manoeuvre drive of Thrust ${manoeuvre.thrust}.`, "4.3.1");
    } else {
      const custom = customisationOf(manoeuvre, "manoeuvre", rule.tl);
      if (design.tl < custom.tlRequired) fail(`Thrust ${rule.rating} here is TL${custom.tlRequired}.`, "4.3.1");
      // Cost follows the original size; tonnage follows the modified one. Page 72.
      const concealed = manoeuvre.concealed === true;
      const base = (manoeuvre.sizedForTons ?? hullTons) * rule.hullFraction;
      const t = base * custom.tonnage * (concealed ? 1 + CONCEALED_MANOEUVRE_DRIVE.tonnage : 1);
      if (concealed) {
        note(
          `Concealed thruster plates halve Thrust ${rule.rating} to ${Math.floor(rule.rating * CONCEALED_MANOEUVRE_DRIVE.thrustFactor)}.`,
          "4.3.6",
        );
      }
      driveTons += t;
      manoeuvrePower =
        (rule.rating === 0
          ? hullTons * MANOEUVRE_POWER_THRUST_0
          : hullTons * MANOEUVRE_POWER_PER_THRUST * rule.rating) * custom.power;
      lines.push({
        power: tons(manoeuvrePower),
        section: "M-Drive",
        label: `${concealed ? `${CONCEALED_MANOEUVRE_DRIVE.label} ` : ""}Thrust ${rule.rating}${manoeuvre.sizedForTons === undefined ? "" : ` (${manoeuvre.sizedForTons} tons)`}${custom.label === "" ? "" : ` (${custom.label})`}`,
        tons: tons(t),
        cost: cr(base * MANOEUVRE_COST_PER_TON * custom.cost * (concealed ? 1 + CONCEALED_MANOEUVRE_DRIVE.cost : 1)),
      });
    }
  }
  if (design.reaction !== undefined) {
    const rule = driveRating(REACTION_DRIVES, design.reaction.thrust);
    if (rule === undefined) {
      fail(`There is no reaction drive of Thrust ${design.reaction.thrust}.`, "4.3.2");
    } else {
      const custom = customisationOf(design.reaction, "reaction", rule.tl);
      if (design.tl < custom.tlRequired) {
        fail(`Reaction Thrust ${rule.rating} here is TL${custom.tlRequired}.`, "4.3.2");
      }
      const base = (design.reaction.sizedForTons ?? hullTons) * rule.hullFraction;
      const t = base * custom.tonnage;
      reactionFuelFactor = custom.fuel;
      driveTons += t;
      lines.push({
        section: "R-Drive",
        label: `Reaction Thrust ${rule.rating}${custom.label === "" ? "" : ` (${custom.label})`}`,
        tons: tons(t),
        cost: cr(base * REACTION_COST_PER_TON * custom.cost),
      });
    }
  }
  if (jump !== undefined) {
    const rule = driveRating(JUMP_DRIVES, jump.rating);
    if (rule === undefined) {
      fail(`There is no jump drive of Jump ${jump.rating}.`, "4.3.3");
    } else {
      const custom = customisationOf(jump, "jump", rule.tl);
      if (design.tl < custom.tlRequired) fail(`Jump ${rule.rating} here is TL${custom.tlRequired}.`, "4.3.3");
      const base = (jump.sizedForTons ?? hullTons) * rule.hullFraction + JUMP_DRIVE_EXTRA_TONS;
      // Size Reduction may take a jump drive below its minimum, and only it. Page 72.
      const shrunk = custom.tonnage < 1;
      const raw = base * custom.tonnage;
      const t = shrunk ? raw : Math.max(raw, JUMP_DRIVE_MIN_TONS);
      if (t > raw) note(`The jump drive is raised to its ${JUMP_DRIVE_MIN_TONS}-ton minimum.`, "6.4");
      jumpFuelFactor = custom.fuel;
      driveTons += t;
      jumpPower = hullTons * JUMP_POWER_PER_RATING * rule.rating * custom.power;
      lines.push({
        power: tons(jumpPower),
        section: "J-Drive",
        label: `Jump ${rule.rating}${jump.sizedForTons === undefined ? "" : ` (${jump.sizedForTons} tons)`}${custom.label === "" ? "" : ` (${custom.label})`}`,
        tons: tons(t),
        cost: cr(base * JUMP_COST_PER_TON * custom.cost),
      });
    }
  }

  if (design.highBurnThruster !== undefined) {
    const booster = design.highBurnThruster;
    const rule = driveRating(REACTION_DRIVES, booster.thrust);
    if (rule === undefined) {
      fail(`There is no reaction drive of Thrust ${booster.thrust}.`, "4.3.6");
    } else {
      const custom = customisationOf(booster, "reaction", rule.tl);
      if (design.tl < custom.tlRequired) fail(`A high-burn thruster of Thrust ${rule.rating} is TL${custom.tlRequired}.`, "4.3.6");
      const base = (booster.sizedForTons ?? hullTons) * rule.hullFraction;
      const t = base * custom.tonnage;
      boosterFuelFactor = custom.fuel;
      boosterThrust = rule.rating;
      driveTons += t;
      note(
        "A high-burn thruster's Thrust adds to the manoeuvre drive's, and the crew feel every g of it.",
        "4.3.6",
      );
      lines.push({
        section: "R-Drive",
        label: `${HIGH_BURN_THRUSTER.label} (Thrust ${rule.rating})`,
        tons: tons(t),
        cost: cr(base * REACTION_COST_PER_TON * custom.cost),
      });
    }
  }

  // Step 3: the power plant. ShipSpec 4.4.
  const plant = POWER_PLANTS[design.powerPlant.type];
  const plantCustom = customisationOf(design.powerPlant, "powerPlant", plant.tl);
  // The declared tonnage is the plant before customisation. Its output follows
  // that figure; the room it takes and the fuel it burns follow the modified
  // one. ShipSpec 4.15.3.
  const plantBaseTons = design.powerPlant.tons;
  const plantTons = plantBaseTons * plantCustom.tonnage;
  if (design.tl < plantCustom.tlRequired) {
    fail(`A ${plant.label} power plant here is TL${plantCustom.tlRequired}.`, "4.4.1");
  }
  const powerAvailable = plantBaseTons * plant.powerPerTon * plantCustom.powerOutput;
  lines.push({
    section: "Power Plant",
    label: `${plant.label}, Power ${tons(powerAvailable)}${plantCustom.label === "" ? "" : ` (${plantCustom.label})`}`,
    tons: tons(plantTons),
    cost: cr(plantBaseTons * plant.costPerTon * plantCustom.cost),
  });
  if (jump !== undefined && !plant.canJump) {
    fail(`A ${plant.label} power plant cannot drive a jump.`, "4.4.2");
  }

  // Step 4: fuel. ShipSpec 4.5.
  // Tankage can be sized for a shorter jump than the drive can make, which is
  // how a drop-tank ship is designed. ShipSpec 4.5.2.1.
  const fuelledJump = jump === undefined ? 0 : (design.fuelForJump ?? jump.rating);
  if (jump !== undefined && fuelledJump > jump.rating) {
    fail(`Fuel for Jump ${fuelledJump} on a Jump ${jump.rating} drive.`, "4.5.2.1");
  }
  const jumpFuel = jump === undefined ? 0 : hullTons * JUMP_FUEL_PER_RATING * fuelledJump * jumpFuelFactor;
  const months = design.powerPlant.weeks / WEEKS_PER_MONTH;
  // Fuel follows the tonnage actually installed, not the figure the output was
  // reckoned from. The Close Escort proves it. ShipSpec 4.15.3.
  const plantFuel =
    design.powerPlant.type === "chemical"
      ? plantTons * CHEMICAL_FUEL_PER_TON_PER_FORTNIGHT * (design.powerPlant.weeks / 2)
      : Math.max(1, Math.ceil(plantTons * POWER_PLANT_FUEL_PER_MONTH)) * months;
  const reactionFuel =
    design.reaction === undefined
      ? 0
      : design.reaction.thrust === 0
        ? REACTION_FUEL_THRUST_0_PER_HOUR * design.reaction.hours * reactionFuelFactor
        : hullTons *
          REACTION_FUEL_PER_THRUST_HOUR *
          design.reaction.thrust *
          design.reaction.hours *
          reactionFuelFactor;
  const boosterFuel =
    design.highBurnThruster === undefined
      ? 0
      : (boosterThrust === 0
          ? REACTION_FUEL_THRUST_0_PER_HOUR * design.highBurnThruster.hours
          : hullTons * REACTION_FUEL_PER_THRUST_HOUR * boosterThrust * design.highBurnThruster.hours) *
        boosterFuelFactor;
  const extraFuel = design.extraFuelTons ?? 0;
  const totalFuel = jumpFuel + plantFuel + reactionFuel + boosterFuel + extraFuel;
  const fuelDetail = [
    jump === undefined ? undefined : `J-${fuelledJump}`,
    `${design.powerPlant.weeks} weeks of operation`,
  ].filter((part): part is string => part !== undefined);
  lines.push({ section: "Fuel Tanks", label: fuelDetail.join(", "), tons: tons(totalFuel) });

  // Step 5: the bridge. ShipSpec 4.6.
  const cockpit = design.bridge.kind === "cockpit" || design.bridge.kind === "dualCockpit";
  let bridgeTons: number;
  let bridgeCostTotal: number;
  let bridgeLabel: string;
  if (cockpit) {
    const rule = COCKPITS[design.bridge.kind as keyof typeof COCKPITS];
    if (hullTons > 50) fail("A cockpit is only for a hull of 50 tons or less.", "4.6.4");
    bridgeTons = rule.tons;
    bridgeCostTotal = rule.cost;
    bridgeLabel = rule.label;
  } else {
    const smaller = design.bridge.kind === "smaller";
    bridgeTons = smaller ? smallerBridgeTons(hullTons) : standardBridgeTons(hullTons);
    bridgeCostTotal = bridgeCost(hullTons) * (smaller ? SMALLER_BRIDGE_COST_FACTOR : 1);
    bridgeLabel = smaller ? "Bridge (smaller)" : "Bridge";
    if (smaller) note(`A smaller bridge is DM${SMALLER_BRIDGE_DM} to ship operations.`, "6.4");
  }
  if (design.bridge.holographic === true) {
    if (design.tl < HOLOGRAPHIC_CONTROLS.tl) fail(`Holographic controls are TL${HOLOGRAPHIC_CONTROLS.tl}.`, "4.6.5");
    bridgeCostTotal *= 1 + HOLOGRAPHIC_CONTROLS.costFactor;
    bridgeLabel += ", holographic";
  }
  if (design.bridge.detachable === true) {
    if (cockpit) fail("A cockpit cannot be made detachable.", "4.6.6");
    bridgeTons = Math.max(bridgeTons * (1 + DETACHABLE_BRIDGE.tonnage), detachableBridgeMinimum(hullTons));
    bridgeCostTotal *= 1 + DETACHABLE_BRIDGE.costFactor;
    bridgeLabel += ", detachable";
  }
  if (design.bridge.command === true) {
    if (hullTons <= COMMAND_BRIDGE.minHullTons) {
      fail(`A command bridge needs more than ${COMMAND_BRIDGE.minHullTons.toLocaleString()} tons.`, "4.6.3");
    }
    bridgeTons += COMMAND_BRIDGE.tons;
    bridgeCostTotal += COMMAND_BRIDGE.cost;
    bridgeLabel += ", command";
  }
  lines.push({ section: "Bridge", label: bridgeLabel, tons: tons(bridgeTons), cost: cr(bridgeCostTotal) });

  // Step 6: the computer. ShipSpec 4.7.
  let processing = 0;
  let jumpProcessing = 0;
  if (design.computer !== undefined) {
    const rule = computerRule(design.computer.processing, design.computer.core === true);
    if (rule === undefined) {
      fail(`There is no computer of Processing ${design.computer.processing}.`, "4.7.1");
    } else {
      if (design.tl < rule.tl) fail(`${rule.label} is TL${rule.tl}.`, "4.7.1");
      const bis = design.computer.bis === true;
      const fib = design.computer.fib === true;
      const factor =
        1 + (bis ? JUMP_CONTROL_SPECIALISATION.costFactor : 0) + (fib ? HARDENED_SYSTEMS.costFactor : 0);
      processing = rule.processing;
      jumpProcessing = rule.processing + (bis ? JUMP_CONTROL_SPECIALISATION.extraJumpProcessing : 0);
      const suffix = `${bis ? JUMP_CONTROL_SPECIALISATION.suffix : ""}${fib ? HARDENED_SYSTEMS.suffix : ""}`;
      // The computer supplies bandwidth where the software spends it, so its
      // Processing goes in the same column and the two can be read against
      // each other. ShipSpec 10.7.
      lines.push({
        section: "Computer",
        label: `${rule.label}${suffix}`,
        cost: cr(rule.cost * factor),
        bandwidth: rule.processing,
      });
    }
  }

  // Step 7: sensors. ShipSpec 4.8.
  const sensorGrade = design.sensors ?? "basic";
  const sensor = SENSORS[sensorGrade];
  if (design.tl < sensor.tl) fail(`${sensor.label} sensors are TL${sensor.tl}.`, "4.8");
  lines.push({
    section: "Sensors",
    label: sensor.label,
    ...(sensor.tons > 0 ? { tons: sensor.tons } : {}),
    ...(sensor.cost > 0 ? { cost: sensor.cost } : {}),
    ...(sensor.power > 0 ? { power: sensor.power } : {}),
  });

  // Step 8: weapons. ShipSpec 4.9.
  const onFirmpoints = hullTons < TONS_PER_HARDPOINT;
  let mountsUsed = 0;
  let weaponPower = 0;
  const armed = { ...NO_WEAPONS } as {
    armedTurrets: number;
    barbettes: number;
    smallBays: number;
    mediumBays: number;
    largeBays: number;
    spinalTons: number;
    screens: number;
  };
  const install = (label: string, t: number, c: number, p: number, points: number, quantity: number) => {
    mountsUsed += points * quantity;
    weaponPower += p * quantity;
    lines.push({
      section: "Weapons",
      label: `${label}${quantity > 1 ? ` x${quantity}` : ""}`,
      ...(t > 0 ? { tons: tons(t * quantity) } : {}),
      cost: cr(c * quantity),
      ...(p > 0 ? { power: p * quantity } : {}),
    });
  };

  for (const choice of design.weapons ?? []) {
    const quantity = "quantity" in choice ? (choice.quantity ?? 1) : 1;

    if (choice.kind === "turret") {
      const rule = MOUNTS[choice.mount];
      const carried = choice.weapons ?? [];
      if (carried.length > rule.weapons) {
        fail(`A ${rule.label.toLowerCase()} carries ${rule.weapons}, not ${carried.length}.`, "4.9.2");
      }
      if (rule.tl !== undefined && design.tl < rule.tl) fail(`A ${rule.label.toLowerCase()} is TL${rule.tl}.`, "4.9.2");
      if (onFirmpoints && choice.mount !== "fixed" && choice.mount !== "single") {
        fail("A firmpoint takes a fixed mount or a single turret, nothing larger.", "4.9.1");
      }
      let mountTons = rule.tons;
      let mountCost = rule.cost;
      // An empty mount draws no power: the Scout carries an empty double turret
      // and its sheet lists none. ShipSpec 4.9.2.
      let mountPower = carried.length > 0 ? rule.power : 0;
      if (choice.popUp === true) {
        if (design.tl < POP_UP_MOUNTING.tl) fail(`A pop-up mounting is TL${POP_UP_MOUNTING.tl}.`, "4.9.2");
        mountTons += POP_UP_MOUNTING.tons;
        mountCost += POP_UP_MOUNTING.cost;
      }
      for (const weapon of carried) {
        const w = TURRET_WEAPONS[weapon];
        if (design.tl < w.tl) fail(`A ${w.label.toLowerCase()} is TL${w.tl}.`, "4.9.3");
        mountCost += w.cost;
        mountPower += w.power;
      }
      // A firmpoint weapon needs a quarter less power, rounded up. Page 27.
      if (onFirmpoints) mountPower = Math.ceil(mountPower * FIRMPOINT_POWER_FACTOR);
      // Repeats collapse, so three pulse lasers read as the book writes them.
      const counts = new Map<string, number>();
      for (const weapon of carried) {
        const label = TURRET_WEAPONS[weapon].label;
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
      const names = [...counts]
        .map(([label, count]) => (count > 1 ? `${label} x${count}` : label))
        .join(", ");
      if (carried.length > 0) armed.armedTurrets += quantity;
      install(
        `${rule.label}${choice.popUp === true ? " (pop-up)" : ""} (${names === "" ? "empty" : names})`,
        mountTons,
        mountCost,
        mountPower,
        rule.hardpoints,
        quantity,
      );
      continue;
    }

    if (choice.kind === "barbette") {
      const rule = BARBETTES[choice.weapon];
      if (design.tl < rule.tl) fail(`A ${rule.label.toLowerCase()} is TL${rule.tl}.`, "4.9.4");
      // A missile or torpedo barbette on a firmpoint wants two more tons. Page 32.
      const extra =
        onFirmpoints && (choice.weapon === "missile" || choice.weapon === "torpedo")
          ? BARBETTE_FIRMPOINT_EXTRA_TONS
          : 0;
      armed.barbettes += quantity;
      install(
        rule.label,
        BARBETTE_TONS + extra,
        rule.cost,
        rule.power,
        onFirmpoints ? BARBETTE_FIRMPOINTS : 1,
        quantity,
      );
      continue;
    }

    if (choice.kind === "bay") {
      const size = BAY_SIZES[choice.size];
      const rule = BAY_WEAPONS[choice.size][choice.weapon];
      if (design.tl < rule.tl) fail(`A ${size.label.toLowerCase()} ${rule.label.toLowerCase()} is TL${rule.tl}.`, "4.9.4");
      if (onFirmpoints) fail("A ship of less than 100 tons has no hardpoint for a bay.", "4.9.1");
      if (choice.size === "small") armed.smallBays += quantity;
      if (choice.size === "medium") armed.mediumBays += quantity;
      if (choice.size === "large") armed.largeBays += quantity;
      install(`${rule.label} (${size.label})`, size.tons, rule.cost, rule.power, size.hardpoints, quantity);
      continue;
    }

    if (choice.kind === "spinal") {
      const rule = SPINAL_WEAPONS[choice.weapon];
      const levels = choice.levelsAboveBase ?? 0;
      if (design.tl < rule.tl + levels) {
        fail(`A ${rule.label.toLowerCase()} built ${levels} above TL${rule.tl} needs TL${rule.tl + levels}.`, "4.9.6");
      }
      const improvement = spinalImprovement(levels);
      const spinalTons = rule.baseSize * choice.multiple * (1 + improvement.tons);
      const spinalCost = rule.cost * choice.multiple * (1 + improvement.cost);
      if (rule.baseSize * choice.multiple > rule.maxSize) {
        fail(`A ${rule.label.toLowerCase()} stops at ${rule.maxSize.toLocaleString()} tons.`, "4.9.6");
      }
      if (spinalTons > hullTons * SPINAL_MAX_SHARE_OF_HULL) {
        fail("A spinal mount cannot exceed half the tonnage of the ship carrying it.", "4.9.6");
      }
      armed.spinalTons += spinalTons;
      install(
        `${rule.label} x${choice.multiple}${levels > 0 ? ` (TL${rule.tl + levels})` : ""}`,
        spinalTons,
        spinalCost,
        rule.power * choice.multiple,
        Math.ceil(spinalTons / SPINAL_TONS_PER_HARDPOINT),
        1,
      );
      continue;
    }

    if (choice.kind === "pointDefence") {
      const rule = POINT_DEFENCE[choice.battery][choice.type];
      if (design.tl < rule.tl) fail(`A ${rule.label.toLowerCase()} is TL${rule.tl}.`, "4.9.8");
      install(rule.label, rule.tons, rule.cost, rule.power, POINT_DEFENCE_HARDPOINTS, quantity);
      continue;
    }

    if (choice.kind === "screen") {
      const rule = SCREENS[choice.screen];
      if (design.tl < rule.tl) fail(`A ${rule.label.toLowerCase()} is TL${rule.tl}.`, "4.9.7");
      // Screens are not on the Hardpoints table, so they cost none. Page 27.
      armed.screens += quantity;
      install(rule.label, rule.tons, rule.cost, rule.power, 0, quantity);
      continue;
    }

    if (design.tl < BLACK_GLOBE.tl) fail(`A ${BLACK_GLOBE.label.toLowerCase()} is TL${BLACK_GLOBE.tl}.`, "4.9.7");
    install(BLACK_GLOBE.label, BLACK_GLOBE.tons, BLACK_GLOBE.cost, BLACK_GLOBE.power, 0, 1);
  }

  // Capacitors for a black globe. A jump drive already provides some. Page 43.
  const extraCapacitors = design.extraCapacitorTons ?? 0;
  if (extraCapacitors > 0) {
    lines.push({
      section: "Weapons",
      label: CAPACITORS.label,
      tons: tons(extraCapacitors),
      cost: cr(extraCapacitors * CAPACITORS.costPerTon),
    });
  }

  // Ordnance beyond what the launchers hold. ShipSpec 4.9.5.
  let ordnanceCost = 0;
  for (const choice of design.ordnance ?? []) {
    const [rule, perTon] =
      "missile" in choice
        ? [MISSILES[choice.missile], MISSILES_PER_TON]
        : "torpedo" in choice
          ? [TORPEDOES[choice.torpedo], TORPEDOES_PER_TON]
          : [CANISTERS[choice.canister], CANISTERS_PER_TON];
    if (design.tl < rule.tl) fail(`${rule.label} is TL${rule.tl}.`, "4.9.5");
    const bundles = choice.count / perTon;
    // Ordnance takes room in the ship and is not part of its price. The book's
    // sheets print the tonnage and leave the cost column empty, and the
    // Destroyer Escort's total only works that way. ShipSpec 4.9.5.1.
    ordnanceCost += bundles * rule.cost;
    lines.push({
      section: "Ammunition",
      label: `${rule.label} x${choice.count}`,
      tons: tons(bundles),
    });
  }

  const pointsAvailable = onFirmpoints ? firmpoints(hullTons) : hardpoints(hullTons);
  if (mountsUsed > pointsAvailable) {
    fail(`${mountsUsed} mounts against ${pointsAvailable} ${onFirmpoints ? "firmpoints" : "hardpoints"}.`, "4.9.1");
  }
  if (design.military !== true && (armed.smallBays + armed.mediumBays + armed.largeBays > 0 || armed.spinalTons > 0)) {
    note("Bay and spinal weapons require military crewing, so they are crewed at military rates.", "4.10.2.3");
  }

  // Step 9, part one: carried craft and their berths. ShipSpec 4.11.3.
  let smallCraft = 0;
  for (const craft of design.craft ?? []) {
    if (craft.kind === "smallCraft") smallCraft += 1;
    if (craft.berth !== "none") {
      const berth = craft.berth === "dockingSpace" ? PER_TON_SYSTEMS.dockingSpace : PER_TON_SYSTEMS.fullHangar;
      const factor = craft.berth === "dockingSpace" ? DOCKING_SPACE_FACTOR : FULL_HANGAR_FACTOR;
      const berthTons = Math.ceil(craft.tons * factor);
      // The book lists a berth beside the craft it holds, under Craft, not
      // among the optional systems. See the Scout's sheet, page 161.
      lines.push({
        section: "Craft",
        label: `${berth.label} (${craft.tons} tons)`,
        tons: berthTons,
        cost: cr(berthTons * berth.costPerTon),
      });
    }
    lines.push({ section: "Craft", label: craft.label, cost: cr(craft.cost) });
  }

  // Systems the rules size themselves, so the designer need not measure them.
  // ShipSpec 4.11.2.
  const sizedByRule = (system: PerTonSystem): number | undefined => {
    switch (system) {
      case "repairDrones":
        return repairDroneTons(hullTons);
      case "ramscoops":
        return ramscoopTons(hullTons);
      case "solarSail":
        return hullTons * SOLAR_SAIL_HULL_FRACTION;
      case "aerofins":
        return hullTons * AEROFIN_HULL_FRACTION;
      case "towCable":
        return hullTons * TOW_CABLE_HULL_FRACTION;
      case "gravScreen":
        return hullTons / GRAV_SCREEN_HULL_TONS_PER_TON;
      case "emergencyPowerSystem":
        return plantTons * EMERGENCY_POWER_FRACTION;
      default:
        return undefined;
    }
  };

  // Step 9, part two: optional systems. ShipSpec 4.11.
  // A cargo crane is sized from the cargo it serves, which is not known until
  // everything else has been counted, so its line is filled in below.
  let craneLine: number | undefined;
  // Places for a person bought among the optional systems: a high or luxury
  // stateroom, barracks, cabin space. ShipSpec 4.12.4.
  let systemBerths = 0;
  for (const choice of design.systems ?? []) {
    if ("fuelScoops" in choice) {
      const free = config.streamlined === "yes";
      lines.push({
        section: "Systems",
        label: FUEL_SCOOPS.label,
        ...(free ? {} : { cost: FUEL_SCOOPS.cost }),
      });
      continue;
    }
    if ("flat" in choice) {
      const rule = FLAT_SYSTEMS[choice.flat];
      const quantity = choice.quantity ?? 1;
      if (rule.tl !== undefined && design.tl < rule.tl) fail(`${rule.label} is TL${rule.tl}.`, "4.11.1");
      const count = (rule.units ?? 1) * quantity;
      const label = rule.units !== undefined || quantity > 1 ? `${rule.label} x${count}` : rule.label;
      if (rule.accommodation === true) systemBerths += (rule.holds ?? 1) * quantity;
      const entryPower = (rule.power ?? 0) * quantity;
      if (entryPower > 0) systemPowerEntries.push({ label: rule.label, power: entryPower });
      lines.push({
        section: "Systems",
        label,
        tons: tons(rule.tons * quantity),
        cost: cr(rule.cost * quantity),
        ...(entryPower > 0 ? { power: entryPower } : {}),
      });
      continue;
    }
    if ("perTon" in choice) {
      const rule = PER_TON_SYSTEMS[choice.perTon];
      if (rule.tl !== undefined && design.tl < rule.tl) fail(`${rule.label} is TL${rule.tl}.`, "4.11.1");
      if (choice.tons === undefined && choice.perTon === "cargoCrane") {
        craneLine = lines.length;
        lines.push({ section: "Systems", label: rule.label, tons: 0, cost: 0 });
        continue;
      }
      const chosen = choice.tons ?? sizedByRule(choice.perTon);
      if (chosen === undefined) {
        fail(`${rule.label} needs a tonnage.`, "4.11.1");
        continue;
      }
      const systemTons = Math.max(chosen, rule.minTons ?? 0);
      if (rule.maxHullFraction !== undefined && systemTons > hullTons * rule.maxHullFraction) {
        fail(`${rule.label} may be at most ${rule.maxHullFraction * 100}% of the hull.`, "4.11.1");
      }
      const entryCost =
        choice.perTon === "emergencyPowerSystem"
          ? plantBaseTons * plant.costPerTon * plantCustom.cost * EMERGENCY_POWER_FRACTION
          : systemTons * rule.costPerTon;
      if (rule.tonsPerBerth !== undefined) systemBerths += Math.floor(systemTons / rule.tonsPerBerth);
      const entryPower = (rule.powerPerTon ?? 0) * systemTons + (rule.power ?? 0);
      if (entryPower > 0) systemPowerEntries.push({ label: rule.label, power: tons(entryPower) });
      const detail =
        choice.perTon === "fuelProcessor" ? ` (${systemTons * FUEL_PROCESSOR_TONS_PER_DAY} tons/day)` : "";
      lines.push({
        section: "Systems",
        label: `${rule.label}${detail}`,
        tons: tons(systemTons),
        cost: cr(entryCost),
        ...(entryPower > 0 ? { power: tons(entryPower) } : {}),
      });
      continue;
    }
    if ("perHullTon" in choice) {
      const rule = PER_HULL_TON_SYSTEMS[choice.perHullTon];
      if (rule.tl !== undefined && design.tl < rule.tl) fail(`${rule.label} is TL${rule.tl}.`, "4.11.1");
      const entryPower =
        rule.hullTonsPerPower === undefined ? 0 : Math.ceil(hullTons / rule.hullTonsPerPower);
      if (entryPower > 0) systemPowerEntries.push({ label: rule.label, power: entryPower });
      lines.push({
        section: "Systems",
        label: rule.label,
        cost: cr(hullTons * rule.costPerHullTon),
        ...(entryPower > 0 ? { power: entryPower } : {}),
      });
      continue;
    }
    if ("solar" in choice) {
      const rule = SOLAR_SYSTEMS[choice.solar];
      if (design.tl < rule.tl) fail(`${rule.label} is TL${rule.tl}.`, "4.11.4");
      const coating = choice.coatingUnits ?? 0;
      const panels = choice.panelUnits ?? 0;
      if (coating > hullTons * SOLAR_COATING_MAX_HULL_FRACTION) {
        fail(`A solar coating covers at most ${SOLAR_COATING_MAX_HULL_FRACTION * 100}% of the hull.`, "4.11.4");
      }
      if (coating > 0 && config.streamlined === "yes") {
        fail("A streamlined hull cannot carry a solar coating; re-entry destroys it.", "4.11.4");
      }
      // A close or dispersed hull hides too much of itself from the star. Page 46.
      const awkward = design.hull.configuration === "closeStructure" || design.hull.configuration === "dispersedStructure";
      const coatingPower =
        coating * rule.coatingPower * (awkward ? SOLAR_COATING_AWKWARD_HULL_FACTOR : 1);
      if (coating > 0) {
        if (coatingPower > 0) systemPowerEntries.push({ label: `${rule.label} Coating`, power: tons(-coatingPower) });
        lines.push({ section: "Systems", label: `${rule.label} Coating x${coating}`, cost: cr(coating * rule.cost) });
      }
      if (panels > 0) {
        if (rule.panelPower > 0) {
          systemPowerEntries.push({ label: `${rule.label} Panels`, power: tons(-panels * rule.panelPower) });
        }
        lines.push({
          section: "Systems",
          label: `${rule.label} Panels x${panels}`,
          tons: tons(panels),
          cost: cr(panels * rule.cost),
        });
      }
      continue;
    }
    const custom = choice.custom;
    if (custom.power !== undefined && custom.power > 0) {
      systemPowerEntries.push({ label: custom.label, power: custom.power });
    }
    lines.push({
      section: "Systems",
      label: custom.label,
      ...(custom.tons !== undefined ? { tons: custom.tons } : {}),
      ...(custom.cost !== undefined ? { cost: custom.cost } : {}),
      ...(custom.power !== undefined ? { power: custom.power } : {}),
    });
  }

  // Step 11: accommodation. ShipSpec 4.12.
  const stateroomCount = design.staterooms ?? 0;
  if (stateroomCount > 0) {
    lines.push({
      section: "Staterooms",
      label: `Standard x${stateroomCount}${design.doubleOccupancy === true ? " (double occupancy)" : ""}`,
      tons: tons(stateroomCount * STATEROOM.tons),
      cost: cr(stateroomCount * STATEROOM.cost),
    });
  }
  const lowBerthCount = design.lowBerths ?? 0;
  let lowBerthPower = 0;
  if (lowBerthCount > 0) {
    lowBerthPower = Math.ceil(lowBerthCount / LOW_BERTH.berthsPerPower);
    lines.push({
      section: "Staterooms",
      label: `Low Berth x${lowBerthCount}`,
      tons: tons(lowBerthCount * LOW_BERTH.tons),
      cost: cr(lowBerthCount * LOW_BERTH.cost),
      power: lowBerthPower,
    });
    berthPowerEntries.push({ label: "Low Berths", power: lowBerthPower });
  }
  const emergencyCount = design.emergencyLowBerths ?? 0;
  if (emergencyCount > 0) {
    const emergencyPower = emergencyCount * EMERGENCY_LOW_BERTH.power;
    lines.push({
      section: "Staterooms",
      label: `Emergency Low Berth x${emergencyCount}`,
      tons: tons(emergencyCount * EMERGENCY_LOW_BERTH.tons),
      cost: cr(emergencyCount * EMERGENCY_LOW_BERTH.cost),
      power: emergencyPower,
    });
    berthPowerEntries.push({ label: "Emergency Low Berths", power: emergencyPower });
  }

  // Software. ShipSpec 4.7.4.
  let bandwidth = 0;
  let jumpControlBandwidth = 0;
  for (const choice of design.software ?? []) {
    const rule = softwareRule(choice.software, choice.level ?? 0);
    if (rule === undefined) {
      fail(`There is no ${choice.software} at level ${choice.level ?? 0}.`, "4.7.4");
      continue;
    }
    if (design.tl < rule.tl) fail(`${rule.label} is TL${rule.tl}.`, "4.7.4");
    if (rule.jumpControl !== undefined) {
      jumpControlBandwidth = Math.max(jumpControlBandwidth, rule.bandwidth);
      if (jump !== undefined && rule.jumpControl < jump.rating) {
        warn(`${rule.label} cannot run a Jump ${jump.rating} drive.`, "6.2");
      }
    } else {
      bandwidth += rule.bandwidth;
    }
    lines.push({
      section: "Software",
      label: rule.label,
      ...(rule.cost > 0 ? { cost: cr(rule.cost) } : {}),
      ...(rule.bandwidth > 0 ? { bandwidth: rule.bandwidth } : {}),
    });
  }
  const computerIsCore = design.computer?.core === true;
  if (!computerIsCore && jumpControlBandwidth > jumpProcessing && design.computer !== undefined) {
    fail(`Jump Control needs ${jumpControlBandwidth} bandwidth against Processing ${jumpProcessing}.`, "4.7.5");
  }
  // Jump Control is weighed against the processing the computer offers it and
  // nothing else, which is what /bis buys and what a core includes. The rest is
  // weighed against the whole, and only warns, because a ship does not jump and
  // fight at once. ShipSpec 4.7.5.
  if (design.computer !== undefined && bandwidth > processing) {
    warn(`Software other than Jump Control totals ${bandwidth} bandwidth against Processing ${processing}.`, "6.2");
  }

  // Common areas. ShipSpec 4.12.3.
  const commonAreaTons = design.commonAreaTons ?? 0;
  if (commonAreaTons > 0) {
    lines.push({
      section: "Common Areas",
      label: "Common Areas",
      tons: tons(commonAreaTons),
      cost: cr(commonAreaTons * COMMON_AREA.costPerTon),
    });
  }
  const suggestedCommonArea = stateroomCount * STATEROOM.tons * COMMON_AREA.suggestedFractionOfStaterooms;
  if (stateroomCount > 0 && commonAreaTons < suggestedCommonArea) {
    note(
      `Common areas are ${tons(commonAreaTons)} tons against the ${tons(suggestedCommonArea)} the book suggests.`,
      "6.4",
    );
  }

  // Step 12: cargo, and the crane that was waiting for it. ShipSpec 4.13.1, 4.11.2.
  let used = lines.reduce((sum, line) => sum + (line.tons ?? 0), 0);
  if (craneLine !== undefined) {
    const rule = PER_TON_SYSTEMS.cargoCrane;
    const craneTons = cargoCraneTons(usableTons - used);
    lines[craneLine] = {
      section: "Systems",
      label: rule.label,
      tons: tons(craneTons),
      cost: cr(craneTons * rule.costPerTon),
    };
    used += craneTons;
    if (cargoCraneTons(usableTons - used) !== craneTons) {
      note("The cargo crane sits on the boundary of a size band.", "4.11.2");
    }
  }
  const tonsUsed = tons(used);
  const cargoTons = tons(usableTons - tonsUsed);
  if (cargoTons < 0) {
    fail(`Components come to ${tonsUsed} tons in a hull of ${tons(usableTons)}.`, "6.1");
  }
  lines.push({ section: "Cargo", label: "Cargo", tons: cargoTons });

  // Step 13: finalise. ShipSpec 4.13.
  const totalCost = cr(lines.reduce((sum, line) => sum + (line.cost ?? 0), 0));
  const purchaseCost = cr(
    design.standardDesign === true ? totalCost * STANDARD_DESIGN_FACTOR : totalCost * (1 + ARCHITECT_FEE),
  );
  const maintenanceCost = Math.ceil((purchaseCost * 1e6) / MAINTENANCE_DIVISOR);
  const constructionDays = Math.ceil(totalCost * CONSTRUCTION_DAYS_PER_MCR * constructionTimeFactor(design.tl));

  // Power requirements, in the order the book's sheets print them. ShipSpec 4.4.2.
  const requirements: PowerEntry[] = [{ label: "Basic Ship Systems", power: tons(basicPower) }];
  if (manoeuvrePower > 0) requirements.push({ label: "Manoeuvre Drive", power: tons(manoeuvrePower) });
  if (jumpPower > 0) requirements.push({ label: "Jump Drive", power: tons(jumpPower), whenJumping: true });
  if (sensor.power > 0) requirements.push({ label: "Sensors", power: sensor.power });
  if (weaponPower > 0) requirements.push({ label: "Weapons", power: weaponPower });
  requirements.push(...systemPowerEntries, ...berthPowerEntries);

  const runningPower = requirements
    .filter((entry) => entry.whenJumping !== true)
    .reduce((sum, entry) => sum + entry.power, 0);
  if (runningPower > powerAvailable) {
    warn(`Systems need ${tons(runningPower)} power against the ${tons(powerAvailable)} the plant makes.`, "6.2");
  } else if (runningPower + jumpPower > powerAvailable) {
    note("The plant cannot run everything and jump at once.", "6.3");
  }

  // Step 10: crew. ShipSpec 4.10.
  const crew: CrewEntry[] = [];
  const passengers = design.passengers ?? { high: 0, middle: 0, low: 0 };
  const isSmallCraft = hullTons <= 100 && jump === undefined;
  const column = design.military === true ? "military" : "commercial";
  if (isSmallCraft) {
    crew.push({ role: "pilot", label: CREW_ROLES.pilot.label, count: 1, salary: CREW_ROLES.pilot.salary });
  } else {
    // A carried craft contributes its own engine room, not its displacement.
    const craftTons = (design.craft ?? []).reduce((sum, entry) => sum + (entry.driveAndPlantTons ?? 0), 0);
    const inputs: CrewInputs = {
      hullTons,
      hasJump: jump !== undefined,
      driveAndPlantTons: driveTons + plantTons + craftTons,
      smallCraft,
      ...armed,
      highPassengers: passengers.high,
      middlePassengers: passengers.middle,
    };
    const reduction = crewReductionMultiplier(hullTons);
    let base = 0;
    for (const role of Object.keys(CREW_ROLES) as CrewRole[]) {
      if (role === "medic" || role === "officer") continue;
      const rule = CREW_ROLES[role];
      const raw = rule[column](inputs);
      const count = rule.reducible ? Math.ceil(raw * reduction) : raw;
      base += count;
      if (count > 0) crew.push({ role, label: rule.label, count, salary: rule.salary });
    }
    const derived = { crew: base, passengers: passengers.high + passengers.middle + passengers.low };
    const medics = DERIVED_CREW.medic[column](derived);
    if (medics > 0) crew.push({ role: "medic", label: CREW_ROLES.medic.label, count: medics, salary: CREW_ROLES.medic.salary });
    const officers = DERIVED_CREW.officer[column](derived);
    if (officers > 0) {
      crew.push({ role: "officer", label: CREW_ROLES.officer.label, count: officers, salary: CREW_ROLES.officer.salary });
    }
  }
  const crewTotal = crew.reduce((sum, entry) => sum + entry.count, 0);
  const wageBill = crew.reduce((sum, entry) => sum + entry.count * entry.salary, 0);

  // Everyone awake needs somewhere of their own: the standard staterooms, and
  // whatever accommodation was bought among the optional systems. ShipSpec 4.12.4.
  const berths =
    stateroomCount * (design.doubleOccupancy === true ? STATEROOM.doubleOccupants : STATEROOM.occupants) +
    systemBerths;
  const awake = crewTotal + passengers.high + passengers.middle;
  if (berths < awake) {
    warn(`${berths} ${berths === 1 ? "berth" : "berths"} for ${awake} people awake aboard.`, "6.2");
  }
  // A low passenger travels frozen, so the berths have to be there for them.
  const lowCapacity = lowBerthCount * LOW_BERTH.occupants + emergencyCount * EMERGENCY_LOW_BERTH.occupants;
  if (passengers.low > lowCapacity) {
    warn(`${lowCapacity} low berths for ${passengers.low} low passengers.`, "6.2");
  }

  const airlocks = cockpit || hullTons < TONS_PER_FREE_AIRLOCK ? 0 : Math.floor(hullTons / TONS_PER_FREE_AIRLOCK);

  return {
    name: design.name,
    notes: design.notes ?? "",
    tl: design.tl,
    lines,
    hullTons,
    usableTons: tons(usableTons),
    tonsUsed,
    cargoTons,
    hullPoints,
    armourProtection,
    totalCost,
    purchaseCost,
    maintenanceCost,
    constructionDays,
    ordnanceCost: cr(ordnanceCost),
    powerAvailable: tons(powerAvailable),
    powerRequirements: requirements,
    fuel: {
      jump: tons(jumpFuel),
      powerPlant: tons(plantFuel),
      reaction: tons(reactionFuel + boosterFuel),
      extra: tons(extraFuel),
      total: tons(totalFuel),
    },
    crew,
    crewTotal,
    passengers,
    wageBill,
    airlocks,
    hardpoints: { available: pointsAvailable, used: mountsUsed, firmpoints: hullTons < 100 },
    software: {
      bandwidth,
      jumpControl: computerIsCore ? 0 : jumpControlBandwidth,
      processing,
      jumpProcessing,
    },
    problems,
  };
}
