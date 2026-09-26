/**
 * Ammunition: missiles, torpedoes and sandcaster canisters.
 * High Guard Update 2022, PDF pages 30, 32-41. ShipSpec 4.9.5.
 *
 * Ordnance is bought by the load, not by the ton, and the book prices it in
 * fixed bundles: twelve missiles to a ton, three torpedoes, twenty canisters.
 * Each launcher comes with a magazine of its own that costs nothing extra; what
 * is here is what a designer buys on top, and what a reload costs.
 */

export interface OrdnanceRule {
  readonly label: string;
  readonly tl: number;
  /** Missiles and torpedoes only. */
  readonly thrust?: number;
  /** As printed. DD is destructive dice. */
  readonly damage: string;
  /** MCr for one bundle of `perBundle`. */
  readonly cost: number;
  readonly traits: readonly string[];
}

/** Twelve missiles to a ton, and the price is per twelve. Page 37. */
export const MISSILES_PER_TON = 12;
/** Three torpedoes to a ton, and the price is per three. Page 39. */
export const TORPEDOES_PER_TON = 3;
/** Twenty canisters to a ton. Page 39. */
export const CANISTERS_PER_TON = 20;

export type Missile =
  | "advanced"
  | "antimatter"
  | "antiTorpedo"
  | "decoy"
  | "fragmentation"
  | "ion"
  | "jumpbreaker"
  | "longRange"
  | "multiWarhead"
  | "nuclear"
  | "ortillery"
  | "shockwave"
  | "standard";

/** Missiles table, page 37. Cost is per twelve. */
export const MISSILES: Readonly<Record<Missile, OrdnanceRule>> = {
  advanced: { label: "Advanced Missile", tl: 14, thrust: 15, damage: "5D", cost: 0.35, traits: ["Smart"] },
  antimatter: { label: "Antimatter Missile", tl: 20, thrust: 15, damage: "2DD", cost: 1, traits: ["Radiation", "Smart"] },
  antiTorpedo: { label: "Anti-Torpedo Missile", tl: 13, thrust: 15, damage: "1D", cost: 0.35, traits: ["Smart"] },
  decoy: { label: "Decoy Missile", tl: 9, thrust: 15, damage: "2D", cost: 0.15, traits: ["Smart"] },
  fragmentation: { label: "Fragmentation Missile", tl: 8, thrust: 15, damage: "3D", cost: 0.2, traits: ["Smart"] },
  ion: { label: "Ion Missile", tl: 12, thrust: 12, damage: "Special", cost: 0.75, traits: ["Ion"] },
  jumpbreaker: { label: "Jumpbreaker Missile", tl: 13, thrust: 10, damage: "--", cost: 1, traits: ["Smart"] },
  longRange: { label: "Long Range Missile", tl: 8, thrust: 15, damage: "3D", cost: 0.5, traits: ["Smart"] },
  multiWarhead: { label: "Multi-Warhead Missile", tl: 8, thrust: 10, damage: "3D", cost: 0.75, traits: ["Smart"] },
  nuclear: { label: "Nuclear Missile", tl: 6, thrust: 10, damage: "1DD", cost: 0.45, traits: ["Radiation", "Smart"] },
  ortillery: { label: "Ortillery Missile", tl: 7, thrust: 6, damage: "1DD", cost: 0.3, traits: ["Orbital Strike"] },
  shockwave: { label: "Shockwave Missile", tl: 7, thrust: 10, damage: "--", cost: 0.2, traits: ["Smart"] },
  standard: { label: "Standard Missile", tl: 7, thrust: 10, damage: "4D", cost: 0.25, traits: ["Smart"] },
};

export type Torpedo =
  | "advanced"
  | "antimatter"
  | "antimatterBombPumped"
  | "antiradiation"
  | "bombPumped"
  | "ion"
  | "multiWarheadAntimatter"
  | "multiWarheadStandard"
  | "multiWarheadNuclear"
  | "nuclear"
  | "ortillery"
  | "plasma"
  | "standard";

/** Torpedoes table, page 40. Cost is per three. */
export const TORPEDOES: Readonly<Record<Torpedo, OrdnanceRule>> = {
  advanced: { label: "Advanced Torpedo", tl: 14, thrust: 15, damage: "7D", cost: 0.45, traits: ["Smart"] },
  antimatter: { label: "Antimatter Torpedo", tl: 20, thrust: 10, damage: "3DD", cost: 0.9, traits: ["Radiation", "Smart"] },
  antimatterBombPumped: { label: "Antimatter Bomb-Pumped Torpedo", tl: 21, thrust: 10, damage: "8D", cost: 0.8, traits: ["AP 10", "Radiation", "Smart"] },
  antiradiation: { label: "Antiradiation Torpedo", tl: 12, thrust: 10, damage: "6D", cost: 0.3, traits: ["Smart"] },
  bombPumped: { label: "Bomb-Pumped Torpedo", tl: 9, thrust: 10, damage: "4D", cost: 0.25, traits: ["Smart"] },
  ion: { label: "Ion Torpedo", tl: 9, thrust: 10, damage: "Special", cost: 0.23, traits: ["Smart"] },
  multiWarheadAntimatter: { label: "Multi-Warhead Antimatter Torpedo", tl: 21, thrust: 10, damage: "1DD", cost: 2, traits: ["Radiation", "Smart"] },
  multiWarheadStandard: { label: "Multi-Warhead Standard Torpedo", tl: 8, thrust: 10, damage: "4D", cost: 0.4, traits: ["Smart"] },
  multiWarheadNuclear: { label: "Multi-Warhead Nuclear Torpedo", tl: 8, thrust: 10, damage: "6D", cost: 0.6, traits: ["Radiation", "Smart"] },
  nuclear: { label: "Nuclear Torpedo", tl: 7, thrust: 10, damage: "2DD", cost: 0.225, traits: ["Radiation", "Smart"] },
  ortillery: { label: "Ortillery Torpedo", tl: 8, thrust: 6, damage: "3DD", cost: 1, traits: ["Orbital Strike"] },
  plasma: { label: "Plasma Torpedo", tl: 12, thrust: 10, damage: "1DD", cost: 0.65, traits: ["AP 10", "Smart"] },
  standard: { label: "Standard Torpedo", tl: 7, thrust: 10, damage: "6D", cost: 0.15, traits: ["Smart"] },
};

export type Canister = "antiPersonnel" | "chaff" | "pebble" | "sand" | "sandcutter";

/** Canisters table, page 39. Cost is per twenty. */
export const CANISTERS: Readonly<Record<Canister, OrdnanceRule>> = {
  antiPersonnel: { label: "Anti-Personnel Canister", tl: 8, damage: "3D", cost: 0.04, traits: [] },
  chaff: { label: "Chaff Canister", tl: 8, damage: "--", cost: 0.03, traits: [] },
  pebble: { label: "Pebble Canister", tl: 7, damage: "1DD", cost: 0.025, traits: [] },
  sand: { label: "Sand Canister", tl: 7, damage: "Special", cost: 0.025, traits: [] },
  sandcutter: { label: "Sandcutter Canister", tl: 8, damage: "Special", cost: 0.035, traits: [] },
};

/**
 * What a launcher holds for nothing, and what a reload costs where the book
 * prices one. Pages 29-35. A turret holding twelve missiles and a bay holding
 * twelve salvos are both "free with the mount"; only extra stock is bought.
 */
export const MAGAZINES = {
  /** Missile rack: twelve in a turret, four on a firmpoint. Page 29. */
  missileRack: { turret: 12, firmpoint: 4 },
  /** Sandcaster: twenty canisters in a turret, four on a firmpoint. Page 30. */
  sandcaster: { turret: 20, firmpoint: 4, refill: 0.025, firmpointRefill: 0.005 },
  /** Railgun turret: twelve attacks, then a one-ton canister. Page 30. */
  railgunTurret: { attacks: 12, tonsPerReload: 1, costPerReload: 0.005 },
  /** Railgun barbette: twelve attacks, then a two-ton canister. Page 32. */
  railgunBarbette: { attacks: 12, tonsPerReload: 2, costPerReload: 0.01 },
  /** Missile barbette: five a salvo, five salvos. Page 32. */
  missileBarbette: { perSalvo: 5, salvos: 5 },
  /** Torpedo barbette: three torpedoes. Page 32. */
  torpedoBarbette: { torpedoes: 3 },
  /** Point defence gauss battery: twelve rounds, then a one-ton canister. Page 41. */
  gaussBattery: { rounds: 12, tonsPerReload: 1, costPerReload: 0.03 },
  /** Railgun spinal mount: five rounds, then twenty tons each. Page 37. */
  railgunSpinal: { rounds: 5, tonsPerReload: 20, costPerReload: 0.2 },
  /** Mass driver spinal mount: fifty tons and Cr500000 an attack. Page 36. */
  massDriverSpinal: { tonsPerAttack: 50, costPerAttack: 0.5 },
} as const;

/** Mass Driver Ammunition, page 33, and Railgun Ammunition, page 35, by bay size. */
export const BAY_AMMUNITION = {
  massDriver: {
    attacks: 6,
    small: { tons: 2, cost: 0.02 },
    medium: { tons: 4, cost: 0.04 },
    large: { tons: 20, cost: 0.2 },
  },
  railgun: {
    attacks: 12,
    small: { tons: 1, cost: 0.015 },
    medium: { tons: 2, cost: 0.03 },
    large: { tons: 5, cost: 0.075 },
  },
  /** Missile bay: missiles a salvo, twelve salvos held. Page 34. */
  missile: { salvos: 12, small: 12, medium: 24, large: 120 },
  /** Torpedo bay: torpedoes a salvo, twelve salvos held. Page 35. */
  torpedo: { salvos: 12, small: 3, medium: 6, large: 30 },
} as const;
