/**
 * Step 9, Install Optional Systems. High Guard Update 2022, PDF pages 44-64.
 * ShipSpec 4.11.
 *
 * Three shapes of entry cover nearly everything the chapter sells:
 *
 * - **flat**: fixed tonnage and price. A workshop is six tons and MCr0.9.
 * - **perTon**: the designer says how big, and tonnage and price follow. A fuel
 *   processor is Cr50000 and one Power a ton, however many tons are bought.
 * - **perHullTon**: priced against the whole ship and taking no room of its
 *   own, like a holographic hull.
 *
 * Several are sized by a rule rather than by choice, and the helpers at the
 * bottom of this file hold those rules. The options that change the hull, the
 * bridge or a drive rather than adding a component of their own are not here:
 * they live with the thing they change, in hull.ts, bridge.ts and drives.ts.
 */

export interface FlatSystemRule {
  readonly kind: "flat";
  readonly label: string;
  readonly page: number;
  /** The heading it sits under in the chapter, so one list can be grouped. */
  readonly group: string;
  readonly tl?: number;
  readonly tons: number;
  /** MCr. */
  readonly cost: number;
  readonly power?: number;
  /**
   * How many of the thing one entry buys, where the book sells them in sets.
   * Drones come five to an entry, and a sheet says "Probe Drones x10" for two.
   */
  readonly units?: number;
  /** Only ships up to this size may fit one. */
  readonly maxHullTons?: number;
  /** People it holds, where that is the point of it. */
  readonly holds?: number;
  /**
   * Somewhere a person lives for the voyage, so it counts towards having a
   * place for everyone aboard. A brig holds six and a medical bay three, but
   * neither is where a passenger sleeps. ShipSpec 4.12.4.
   */
  readonly accommodation?: boolean;
  /** Cr per month, on top of the ship's own. */
  readonly lifeSupport?: number;
}

export interface PerTonSystemRule {
  readonly kind: "perTon";
  readonly label: string;
  readonly page: number;
  /** The heading it sits under in the chapter, so one list can be grouped. */
  readonly group: string;
  readonly tl?: number;
  /** MCr per ton. */
  readonly costPerTon: number;
  readonly powerPerTon?: number;
  /** Power drawn whatever the size, where the book gives a flat figure. */
  readonly power?: number;
  readonly minTons?: number;
  readonly maxHullFraction?: number;
  /** Tons of it that make one place for a person. ShipSpec 4.12.4. */
  readonly tonsPerBerth?: number;
  /** Cr per ton per month, on top of the ship's own. */
  readonly lifeSupportPerTon?: number;
  /** Tons of machinery per ton of capacity, on top of the capacity itself. */
  readonly overhead?: number;
}

export interface PerHullTonSystemRule {
  readonly kind: "perHullTon";
  readonly label: string;
  readonly page: number;
  /** The heading it sits under in the chapter, so one list can be grouped. */
  readonly group: string;
  readonly tl?: number;
  /** MCr per ton of hull. */
  readonly costPerHullTon: number;
  /** One Power per this many tons of hull. */
  readonly hullTonsPerPower?: number;
}

export type SystemRule = FlatSystemRule | PerTonSystemRule | PerHullTonSystemRule;

export type FlatSystem =
  // Cargo, page 53.
  | "cargoScoop"
  | "cargoNet"
  // Sensors and their fittings, pages 53-57.
  | "sensorStation"
  | "countermeasuresSuite"
  | "militaryCountermeasuresSuite"
  | "lifeScanner"
  | "lifeScannerAnalysisSuite"
  | "mailDistributionArray"
  | "advancedMailDistributionArray"
  | "mineralDetectionSuite"
  | "shallowPenetrationSuite"
  | "improvedSignalProcessing"
  | "enhancedSignalProcessing"
  // Drones, page 55.
  | "probeDrones"
  | "advancedProbeDrones"
  | "miningDrones"
  // External systems, pages 58-59.
  | "breachingTube"
  | "grapplingArm"
  | "heavyGrapplingArm"
  | "dockingClampI"
  | "dockingClampII"
  | "dockingClampIII"
  | "dockingClampIV"
  | "dockingClampV"
  | "forcedLinkageBasic"
  | "forcedLinkageImproved"
  | "forcedLinkageEnhanced"
  | "forcedLinkageAdvanced"
  // Internal systems, pages 59-64.
  | "armoury"
  | "briefingRoom"
  | "brig"
  | "library"
  | "medicalBay"
  | "workshop"
  | "reEntryPod"
  | "reEntryCapsule"
  | "assaultCapsule"
  | "highSurvivabilityCapsule"
  | "loadingBelt"
  | "advancedLoadingBelt"
  // Accommodation beyond the standard stateroom, pages 51-52.
  | "accelerationBench"
  | "accelerationSeat"
  | "highStateroom"
  | "luxuryStateroom"
  // Airlock defences and common-area fittings, pages 60-61.
  | "boobyTrappedAirlockBasic"
  | "boobyTrappedAirlockImproved"
  | "boobyTrappedAirlockEnhanced"
  | "boobyTrappedAirlockAdvanced"
  | "wetBar"
  | "zeroGRoom"
  | "endlessPool";

export const FLAT_SYSTEMS: Readonly<Record<FlatSystem, FlatSystemRule>> = {
  cargoScoop: { kind: "flat", label: "Cargo Scoop", page: 53, tons: 2, cost: 0.5, group: "Cargo" },
  cargoNet: { kind: "flat", label: "Cargo Net", page: 53, tons: 5, cost: 1, group: "Cargo" },

  sensorStation: { kind: "flat", label: "Sensor Station", page: 53, tons: 1, cost: 0.5, maxHullTons: 7_500, group: "Bridge" },
  countermeasuresSuite: { kind: "flat", label: "Countermeasures Suite", page: 56, tl: 13, tons: 2, cost: 4, power: 1, group: "Sensors" },
  militaryCountermeasuresSuite: { kind: "flat", label: "Military Countermeasures Suite", page: 56, tl: 15, tons: 15, cost: 28, power: 2, group: "Sensors" },
  lifeScanner: { kind: "flat", label: "Life Scanner", page: 57, tl: 12, tons: 1, cost: 2, power: 1, group: "Sensors" },
  lifeScannerAnalysisSuite: { kind: "flat", label: "Life Scanner Analysis Suite", page: 57, tl: 14, tons: 1, cost: 4, power: 1, group: "Sensors" },
  mailDistributionArray: { kind: "flat", label: "Mail Distribution Array", page: 57, tl: 10, tons: 10, cost: 20, group: "Sensors" },
  advancedMailDistributionArray: { kind: "flat", label: "Mail Distribution Array (TL13)", page: 57, tl: 13, tons: 20, cost: 10, group: "Sensors" },
  mineralDetectionSuite: { kind: "flat", label: "Mineral Detection Suite", page: 57, tl: 12, tons: 1, cost: 5, group: "Sensors" },
  shallowPenetrationSuite: { kind: "flat", label: "Shallow Penetration Suite", page: 57, tl: 10, tons: 10, cost: 5, power: 1, group: "Sensors" },
  improvedSignalProcessing: { kind: "flat", label: "Improved Signal Processing", page: 57, tl: 11, tons: 1, cost: 4, power: 1, group: "Sensors" },
  enhancedSignalProcessing: { kind: "flat", label: "Enhanced Signal Processing", page: 57, tl: 13, tons: 2, cost: 8, power: 2, group: "Sensors" },

  probeDrones: { kind: "flat", label: "Probe Drones", page: 55, tl: 9, tons: 1, cost: 0.5, units: 5, group: "Drones" },
  advancedProbeDrones: { kind: "flat", label: "Advanced Probe Drones", page: 55, tl: 12, tons: 1, cost: 0.8, units: 5, group: "Drones" },
  miningDrones: { kind: "flat", label: "Mining Drones", page: 55, tl: 12, tons: 10, cost: 1, units: 5, group: "Drones" },

  breachingTube: { kind: "flat", label: "Breaching Tube", page: 58, tons: 3, cost: 3, group: "External" },
  grapplingArm: { kind: "flat", label: "Grappling Arm", page: 59, tons: 2, cost: 1, group: "External" },
  heavyGrapplingArm: { kind: "flat", label: "Heavy Grappling Arm", page: 59, tons: 6, cost: 3, group: "External" },
  dockingClampI: { kind: "flat", label: "Docking Clamp (Type I)", page: 58, tons: 1, cost: 0.5, group: "External" },
  dockingClampII: { kind: "flat", label: "Docking Clamp (Type II)", page: 58, tons: 5, cost: 1, group: "External" },
  dockingClampIII: { kind: "flat", label: "Docking Clamp (Type III)", page: 58, tons: 10, cost: 2, group: "External" },
  dockingClampIV: { kind: "flat", label: "Docking Clamp (Type IV)", page: 58, tons: 20, cost: 4, group: "External" },
  dockingClampV: { kind: "flat", label: "Docking Clamp (Type V)", page: 58, tons: 50, cost: 8, group: "External" },
  forcedLinkageBasic: { kind: "flat", label: "Forced Linkage Apparatus (Basic)", page: 58, tl: 7, tons: 2, cost: 0.05, group: "External" },
  forcedLinkageImproved: { kind: "flat", label: "Forced Linkage Apparatus (Improved)", page: 58, tl: 9, tons: 2, cost: 0.075, group: "External" },
  forcedLinkageEnhanced: { kind: "flat", label: "Forced Linkage Apparatus (Enhanced)", page: 58, tl: 12, tons: 2, cost: 0.1, group: "External" },
  forcedLinkageAdvanced: { kind: "flat", label: "Forced Linkage Apparatus (Advanced)", page: 58, tl: 15, tons: 2, cost: 0.5, group: "External" },

  armoury: { kind: "flat", label: "Armoury", page: 59, tons: 1, cost: 0.25, group: "Internal" },
  briefingRoom: { kind: "flat", label: "Briefing Room", page: 60, tons: 4, cost: 0.5, group: "Internal" },
  brig: { kind: "flat", label: "Brig", page: 52, tons: 4, cost: 0.25, holds: 6, lifeSupport: 1_000, group: "Accommodation" },
  library: { kind: "flat", label: "Library", page: 63, tl: 8, tons: 4, cost: 4, group: "Internal" },
  medicalBay: { kind: "flat", label: "Medical Bay", page: 63, tons: 4, cost: 2, power: 1, holds: 3, group: "Internal" },
  workshop: { kind: "flat", label: "Workshop", page: 64, tons: 6, cost: 0.9, group: "Internal" },
  reEntryPod: { kind: "flat", label: "Re-entry Pod", page: 63, tl: 9, tons: 1, cost: 0.15, holds: 2, group: "Internal" },
  reEntryCapsule: { kind: "flat", label: "Re-entry Capsule", page: 63, tl: 8, tons: 0.5, cost: 0.02, holds: 1, group: "Internal" },
  assaultCapsule: { kind: "flat", label: "Assault Capsule", page: 63, tl: 10, tons: 0.5, cost: 0.05, holds: 1, group: "Internal" },
  highSurvivabilityCapsule: { kind: "flat", label: "High Survivability Capsule", page: 63, tl: 14, tons: 0.5, cost: 0.1, holds: 1, group: "Internal" },
  loadingBelt: { kind: "flat", label: "Loading Belt", page: 54, tl: 7, tons: 1, cost: 0.003, power: 1, group: "Cargo" },
  advancedLoadingBelt: { kind: "flat", label: "Loading Belt (TL12)", page: 54, tl: 12, tons: 1, cost: 0.01, power: 1, group: "Cargo" },

  accelerationBench: { kind: "flat", label: "Acceleration Bench", page: 51, tons: 1, cost: 0.01, holds: 4, group: "Accommodation", accommodation: true },
  accelerationSeat: { kind: "flat", label: "Acceleration Seat", page: 51, tons: 0.5, cost: 0.03, holds: 1, group: "Accommodation", accommodation: true },
  highStateroom: { kind: "flat", label: "High Stateroom", page: 52, tons: 6, cost: 0.8, holds: 1, lifeSupport: 3_000, group: "Accommodation", accommodation: true },
  luxuryStateroom: { kind: "flat", label: "Luxury Stateroom", page: 52, tons: 10, cost: 1.5, holds: 1, lifeSupport: 5_000, group: "Accommodation", accommodation: true },

  boobyTrappedAirlockBasic: { kind: "flat", label: "Booby-Trapped Airlock (Basic)", page: 60, tl: 6, tons: 0, cost: 0.1, group: "Internal" },
  boobyTrappedAirlockImproved: { kind: "flat", label: "Booby-Trapped Airlock (Improved)", page: 60, tl: 8, tons: 0, cost: 0.3, group: "Internal" },
  boobyTrappedAirlockEnhanced: { kind: "flat", label: "Booby-Trapped Airlock (Enhanced)", page: 60, tl: 10, tons: 0, cost: 0.5, group: "Internal" },
  boobyTrappedAirlockAdvanced: { kind: "flat", label: "Booby-Trapped Airlock (Advanced)", page: 60, tl: 12, tons: 0, cost: 1, group: "Internal" },
  wetBar: { kind: "flat", label: "Wet Bar", page: 61, tons: 0, cost: 0.002, group: "Common areas" },
  zeroGRoom: { kind: "flat", label: "Zero-G Room", page: 61, tons: 0, cost: 0.05, group: "Common areas" },
  endlessPool: { kind: "flat", label: "Endless Pool", page: 61, tons: 2, cost: 0.05, group: "Common areas" },
};

export type PerTonSystem =
  // Structure and power, pages 44-45.
  | "armouredBulkhead"
  | "module"
  | "emergencyPowerSystem"
  | "highEfficiencyBatteries"
  | "advancedHighEfficiencyBatteries"
  // Drives and sails, page 49.
  | "solarSail"
  // Fuel, pages 49-51.
  | "collapsibleFuelTank"
  | "dropTankMount"
  | "dropTank"
  | "fuelCargoContainer"
  | "fuelProcessor"
  | "fuelTankCompartment"
  | "metalHydrideStorage"
  | "mountableTank"
  | "ramscoops"
  // Accommodation, pages 51-52.
  | "barracks"
  | "cabinSpace"
  | "multiEnvironmentSpace"
  | "stable"
  // Cargo, pages 53-54.
  | "cargoCrane"
  | "externalCargoMount"
  | "interplanetaryJumpNet"
  | "interstellarJumpNet"
  // Sensors, pages 55-57.
  | "repairDrones"
  | "deepPenetrationScanners"
  | "extensionNet"
  // External, pages 57-59.
  | "aerofins"
  | "towCable"
  // Internal, pages 59-64.
  | "additionalAirlock"
  | "biosphere"
  | "concealedCompartment"
  | "constructionDeck"
  | "dockingSpace"
  | "fullHangar"
  | "gravScreen"
  | "laboratory"
  | "launchTube"
  | "recoveryDeck"
  | "studio"
  | "trainingFacilities"
  | "unrepSystem"
  | "vault"
  // Common area fittings, pages 60-61.
  | "brewery"
  | "gourmetKitchen"
  | "hotTub"
  | "swimmingPool"
  | "theatre"
  | "advancedTheatre";

export const PER_TON_SYSTEMS: Readonly<Record<PerTonSystem, PerTonSystemRule>> = {
  /** Sized at ARMOURED_BULKHEAD_FRACTION of whatever it protects. */
  armouredBulkhead: { kind: "perTon", label: "Armoured Bulkhead", page: 44, costPerTon: 0.2, group: "Structure" },
  module: { kind: "perTon", label: "Module", page: 45, costPerTon: 0.025, group: "Structure" },
  /** Sized and priced at a tenth of the power plant. */
  emergencyPowerSystem: { kind: "perTon", label: "Emergency Power System", page: 45, costPerTon: 0, group: "Power" },
  highEfficiencyBatteries: { kind: "perTon", label: "High-Efficiency Batteries", page: 45, tl: 10, costPerTon: 0.1, group: "Power" },
  advancedHighEfficiencyBatteries: { kind: "perTon", label: "High-Efficiency Batteries (TL12)", page: 45, tl: 12, costPerTon: 0.2, group: "Power" },

  solarSail: { kind: "perTon", label: "Solar Sail", page: 49, costPerTon: 0.2, group: "Drives" },

  collapsibleFuelTank: { kind: "perTon", label: "Collapsible Fuel Tank", page: 49, costPerTon: 0.0005, group: "Fuel" },
  /** Sized at DROP_TANK_MOUNT_FRACTION of the tank it carries. */
  dropTankMount: { kind: "perTon", label: "Drop Tanks Mount", page: 49, costPerTon: 0.5, group: "Fuel" },
  /** The tank itself hangs outside and takes none of the hull. */
  dropTank: { kind: "perTon", label: "Drop Tank", page: 49, costPerTon: 0.025, group: "Fuel" },
  fuelCargoContainer: { kind: "perTon", label: "Fuel/Cargo Container", page: 50, costPerTon: 0.005, overhead: 0.05, group: "Fuel" },
  fuelProcessor: { kind: "perTon", label: "Fuel Processor", page: 50, costPerTon: 0.05, powerPerTon: 1, group: "Fuel" },
  /** Its tonnage comes out of the fuel tankage, not the hull. */
  fuelTankCompartment: { kind: "perTon", label: "Fuel Tank Compartment", page: 50, costPerTon: 0.004, group: "Fuel" },
  metalHydrideStorage: { kind: "perTon", label: "Metal Hydride Storage", page: 51, tl: 9, costPerTon: 0.2, group: "Fuel" },
  mountableTank: { kind: "perTon", label: "Mountable Tank", page: 51, costPerTon: 0.001, group: "Fuel" },
  ramscoops: { kind: "perTon", label: "Ramscoops", page: 51, costPerTon: 0.25, minTons: 10, group: "Fuel" },

  barracks: { kind: "perTon", label: "Barracks", page: 51, costPerTon: 0.05, lifeSupportPerTon: 500, tonsPerBerth: 1, group: "Accommodation" },
  cabinSpace: { kind: "perTon", label: "Cabin Space", page: 52, costPerTon: 0.05, lifeSupportPerTon: 250, tonsPerBerth: 1.5, group: "Accommodation" },
  multiEnvironmentSpace: { kind: "perTon", label: "Multi-Environment Space", page: 52, costPerTon: 0.5, powerPerTon: 1, overhead: 0.05, group: "Accommodation" },
  stable: { kind: "perTon", label: "Stable", page: 64, costPerTon: 0.0025, minTons: 10, lifeSupportPerTon: 250, group: "Accommodation" },

  /** Sized by cargoCraneTons. */
  cargoCrane: { kind: "perTon", label: "Cargo Crane", page: 53, costPerTon: 1, group: "Cargo" },
  /** The cargo hangs outside and takes none of the hull. */
  externalCargoMount: { kind: "perTon", label: "External Cargo Mount", page: 53, costPerTon: 0.001, group: "Cargo" },
  interplanetaryJumpNet: { kind: "perTon", label: "Interplanetary Jump Net", page: 54, tl: 8, costPerTon: 0.1, group: "Cargo" },
  interstellarJumpNet: { kind: "perTon", label: "Interstellar Jump Net", page: 54, tl: 10, costPerTon: 0.3, group: "Cargo" },

  /** Sized at REPAIR_DRONES_HULL_FRACTION of the hull, minimum 1. */
  repairDrones: { kind: "perTon", label: "Repair Drones", page: 55, tl: 10, costPerTon: 0.2, minTons: 1, group: "Drones" },
  deepPenetrationScanners: { kind: "perTon", label: "Deep Penetration Scanners", page: 56, tl: 13, costPerTon: 1, power: 1, group: "Sensors" },
  extensionNet: { kind: "perTon", label: "Extension Net", page: 56, tl: 10, costPerTon: 1, minTons: 1, group: "Sensors" },

  aerofins: { kind: "perTon", label: "Aerofins", page: 57, costPerTon: 0.1, group: "External" },
  towCable: { kind: "perTon", label: "Tow Cable", page: 59, costPerTon: 0.005, group: "External" },

  additionalAirlock: { kind: "perTon", label: "Additional Airlock", page: 59, costPerTon: 0.1, minTons: 2, group: "Internal" },
  biosphere: { kind: "perTon", label: "Biosphere", page: 60, costPerTon: 0.2, power: 1, group: "Internal" },
  concealedCompartment: { kind: "perTon", label: "Concealed Compartment", page: 62, costPerTon: 0.02, maxHullFraction: 0.05, group: "Internal" },
  constructionDeck: { kind: "perTon", label: "Construction Deck", page: 62, costPerTon: 0.5, powerPerTon: 1, group: "Internal" },
  /** Sized at DOCKING_SPACE_FACTOR of the craft, rounded up. */
  dockingSpace: { kind: "perTon", label: "Docking Space", page: 62, costPerTon: 0.25, group: "Internal" },
  /** Sized at FULL_HANGAR_FACTOR of the craft, rounded up. */
  fullHangar: { kind: "perTon", label: "Full Hangar", page: 62, costPerTon: 0.2, group: "Internal" },
  gravScreen: { kind: "perTon", label: "Grav Screen", page: 62, tl: 12, costPerTon: 1, powerPerTon: 2, group: "Internal" },
  laboratory: { kind: "perTon", label: "Laboratories", page: 62, costPerTon: 0.25, group: "Internal" },
  /** Sized at LAUNCH_FACILITY_FACTOR of the largest craft it serves. */
  launchTube: { kind: "perTon", label: "Launch Tube", page: 62, tl: 9, costPerTon: 0.5, powerPerTon: 1, group: "Internal" },
  recoveryDeck: { kind: "perTon", label: "Recovery Deck", page: 64, costPerTon: 0.5, powerPerTon: 1, group: "Internal" },
  studio: { kind: "perTon", label: "Studio", page: 64, costPerTon: 0.1, group: "Internal" },
  trainingFacilities: { kind: "perTon", label: "Training Facilities", page: 64, costPerTon: 0.2, group: "Internal" },
  unrepSystem: { kind: "perTon", label: "UNREP System", page: 64, costPerTon: 0.5, powerPerTon: 1, group: "Internal" },
  vault: { kind: "perTon", label: "Vault", page: 64, costPerTon: 0.5, minTons: 4, group: "Internal" },

  brewery: { kind: "perTon", label: "Brewery or Distillery", page: 60, tl: 10, costPerTon: 0.1, minTons: 0.5, group: "Common areas" },
  gourmetKitchen: { kind: "perTon", label: "Gourmet Kitchen", page: 60, costPerTon: 0.2, group: "Common areas" },
  hotTub: { kind: "perTon", label: "Hot Tub", page: 61, costPerTon: 0.012, group: "Common areas" },
  swimmingPool: { kind: "perTon", label: "Swimming Pool", page: 61, costPerTon: 0.02, minTons: 4, group: "Common areas" },
  theatre: { kind: "perTon", label: "Theatre", page: 61, costPerTon: 0.1, minTons: 8, group: "Common areas" },
  advancedTheatre: { kind: "perTon", label: "Advanced Theatre", page: 61, costPerTon: 0.2, minTons: 8, group: "Common areas" },
};

export type PerHullTonSystem = "holographicHull";

export const PER_HULL_TON_SYSTEMS: Readonly<Record<PerHullTonSystem, PerHullTonSystemRule>> = {
  holographicHull: { kind: "perHullTon", label: "Holographic Hull", page: 59, tl: 10, costPerHullTon: 0.1, hullTonsPerPower: 2, group: "External" },
};

/** Fuel Scoops, page 50: free on a streamlined hull, otherwise this, and no tons. */
export const FUEL_SCOOPS = { label: "Fuel Scoops", page: 50, cost: 1 } as const;

/** Page 50. */
export const FUEL_PROCESSOR_TONS_PER_DAY = 20;

/** Page 62. */
export const DOCKING_SPACE_FACTOR = 1.1;
export const FULL_HANGAR_FACTOR = 2;
/** A launch tube or recovery deck is ten times the craft it serves. Pages 62, 64. */
export const LAUNCH_FACILITY_FACTOR = 10;

/** Page 55. */
export const REPAIR_DRONES_HULL_FRACTION = 0.01;
/** Page 44: a tenth of whatever it protects. */
export const ARMOURED_BULKHEAD_FRACTION = 0.1;
/** Page 49: the mount is a fraction of the tank it holds. */
export const DROP_TANK_MOUNT_FRACTION = 0.004;
/** Page 45: a tenth of the power plant, in tonnage and in price. */
export const EMERGENCY_POWER_FRACTION = 0.1;
/** Page 49: a twentieth of the hull. */
export const SOLAR_SAIL_HULL_FRACTION = 0.05;
/** Page 57: a twentieth of the hull. */
export const AEROFIN_HULL_FRACTION = 0.05;
/** Page 59: a hundredth of the hull. */
export const TOW_CABLE_HULL_FRACTION = 0.01;
/** Page 62: a ton per two hundred of hull. */
export const GRAV_SCREEN_HULL_TONS_PER_TON = 200;
/** Page 54: a ton per hundred tons of cargo carried. */
export const JUMP_NET_CARGO_TONS_PER_TON = 100;
/** Page 51: a hundredth of the hull plus five, never under ten. */
export const RAMSCOOP = { hullFraction: 0.01, extraTons: 5, minTons: 10, tonsPerWeek: 5 } as const;
/** Page 49: an empty collapsible tank still takes this much of its full size. */
export const COLLAPSIBLE_TANK_EMPTY_FRACTION = 0.01;
/** Page 51: hydride tankage takes twice the room ordinary tankage would. */
export const METAL_HYDRIDE_TONNAGE_FACTOR = 2;
/** Page 52: 1.5 tons of cabin space carries one passenger, as `tonsPerBerth` says. */
export const CABIN_SPACE_TONS_PER_PASSENGER = 1.5;
/** Page 51: a ton of barracks carries one, as `tonsPerBerth` says. */
export const BARRACKS_TONS_PER_PASSENGER = 1;
/** Page 60: a ton of armoury per this many crew, or this many marines. */
export const ARMOURY_PER_CREW = 25;
export const ARMOURY_PER_MARINES = 5;
/** Page 62: four tons of laboratory to a scientist. */
export const LABORATORY_TONS_PER_SCIENTIST = 4;
/** Page 63: four tons of medical bay treats three. */
export const MEDICAL_BAY_TONS = 4;
/** Page 64: two tons of training facility to a trainee. */
export const TRAINING_TONS_PER_TRAINEE = 2;
/** Page 60: a ton of biosphere feeds two passengers for nothing. */
export const BIOSPHERE_PASSENGERS_PER_TON = 2;
/** Page 54: a capital ship eats a Supply Unit per hundred tons a day, 100 to a ton. */
export const SUPPLY = { unitsPerHullTonPerDay: 0.01, unitsPerTon: 100, standardDays: 100 } as const;

/** Cargo Crane, page 53: 2.5 tons plus 0.5 per 150 tons of cargo or part. ShipSpec 4.11.2. */
export function cargoCraneTons(cargoTons: number): number {
  return 2.5 + 0.5 * Math.ceil(Math.max(cargoTons, 0) / 150);
}

export function dockingSpaceTons(craftTons: number): number {
  return Math.ceil(craftTons * DOCKING_SPACE_FACTOR);
}

export function fullHangarTons(craftTons: number): number {
  return Math.ceil(craftTons * FULL_HANGAR_FACTOR);
}

export function repairDroneTons(hullTons: number): number {
  return Math.max(PER_TON_SYSTEMS.repairDrones.minTons ?? 1, hullTons * REPAIR_DRONES_HULL_FRACTION);
}

export function ramscoopTons(hullTons: number): number {
  return Math.max(RAMSCOOP.minTons, hullTons * RAMSCOOP.hullFraction + RAMSCOOP.extraTons);
}

/**
 * Solar Energy Systems, page 46. A coating's Units are the percentage of the
 * hull covered, to a limit of 40, and take no room. A panel's Units are tons.
 */
export interface SolarRule {
  readonly label: string;
  readonly tl: number;
  /** Power per unit of coating. Zero below TL10, which has no coating at all. */
  readonly coatingPower: number;
  readonly panelPower: number;
  /** MCr per unit. */
  readonly cost: number;
}

export type SolarGrade = "basic" | "improved" | "enhanced" | "advanced";

export const SOLAR_SYSTEMS: Readonly<Record<SolarGrade, SolarRule>> = {
  basic: { label: "Basic Solar", tl: 6, coatingPower: 0, panelPower: 0.25, cost: 0.1 },
  improved: { label: "Improved Solar", tl: 8, coatingPower: 0, panelPower: 0.5, cost: 0.2 },
  enhanced: { label: "Enhanced Solar", tl: 10, coatingPower: 0.1, panelPower: 1, cost: 0.3 },
  advanced: { label: "Advanced Solar", tl: 12, coatingPower: 0.2, panelPower: 2, cost: 0.4 },
};

/** A coating covers at most this share of the hull. Page 45. */
export const SOLAR_COATING_MAX_HULL_FRACTION = 0.4;
/** A coating on a close or dispersed hull yields half as much. Page 46. */
export const SOLAR_COATING_AWKWARD_HULL_FACTOR = 0.5;
