/**
 * Step 5, Install Bridge. High Guard Update 2022, PDF page 20, with holographic
 * controls from pages 52-53. ShipSpec 4.6.
 */

export interface BridgeSize {
  /** Largest hull, in tons, this size serves. */
  readonly upToTons: number;
  readonly tons: number;
}

/** Bridges table, page 20. ShipSpec 4.6.1. Beyond the last row see BRIDGE_TONS_PER_EXTRA. */
export const BRIDGE_SIZES: readonly BridgeSize[] = [
  { upToTons: 50, tons: 3 },
  { upToTons: 99, tons: 6 },
  { upToTons: 200, tons: 10 },
  { upToTons: 1_000, tons: 20 },
  { upToTons: 2_000, tons: 40 },
  { upToTons: 100_000, tons: 60 },
];

/** Over 100,000 tons: this many more bridge tons per this many more hull tons or part. */
export const BRIDGE_TONS_PER_EXTRA = { tons: 20, perHullTons: 100_000 } as const;

/** MCr0.5 per 100 tons of hull or part. Page 20. */
export const BRIDGE_COST_PER_100_TONS = 0.5;

/** A smaller bridge is one row up the table at half the cost, DM-1. Page 20. ShipSpec 4.6.2. */
export const SMALLER_BRIDGE_COST_FACTOR = 0.5;
export const SMALLER_BRIDGE_DM = -1;

/** Command bridge, page 20. ShipSpec 4.6.3. */
export const COMMAND_BRIDGE = { tons: 40, cost: 30, minHullTons: 5_000, tacticsDm: 1 } as const;

/** Cockpits, page 20. ShipSpec 4.6.4. */
export const COCKPIT_MAX_HULL_TONS = 50;
export const COCKPITS = {
  cockpit: { label: "Cockpit", tons: 1.5, cost: 0.01 },
  dualCockpit: { label: "Dual Cockpit", tons: 2.5, cost: 0.015 },
} as const;
export type CockpitKind = keyof typeof COCKPITS;

/** Holographic Controls, pages 52-53. ShipSpec 4.6.5. */
export const HOLOGRAPHIC_CONTROLS = { tl: 9, costFactor: 0.25, initiativeDm: 2 } as const;

/** The bridge tons a hull of this size needs, before a smaller-bridge choice. */
export function standardBridgeTons(hullTons: number): number {
  for (const size of BRIDGE_SIZES) {
    if (hullTons <= size.upToTons) return size.tons;
  }
  const last = BRIDGE_SIZES[BRIDGE_SIZES.length - 1];
  const extra = Math.ceil((hullTons - BRIDGE_TONS_PER_EXTRA.perHullTons) / BRIDGE_TONS_PER_EXTRA.perHullTons);
  return (last?.tons ?? 0) + extra * BRIDGE_TONS_PER_EXTRA.tons;
}

/** One row up the Bridges table, or the same figure when already at the smallest. ShipSpec 4.6.2. */
export function smallerBridgeTons(hullTons: number): number {
  const standard = standardBridgeTons(hullTons);
  const at = BRIDGE_SIZES.findIndex((size) => size.tons === standard);
  if (at > 0) return BRIDGE_SIZES[at - 1]?.tons ?? standard;
  if (at === -1) return standard - BRIDGE_TONS_PER_EXTRA.tons;
  return standard;
}

export function bridgeCost(hullTons: number): number {
  return BRIDGE_COST_PER_100_TONS * Math.ceil(hullTons / 100);
}

/**
 * Detachable Bridge, page 52: a bridge that ejects as a lifeboat, with two
 * weeks of life support and Thrust 0. It costs half again and takes a fifth
 * more room, and it has a floor of its own by ship size. ShipSpec 4.6.6.
 */
export const DETACHABLE_BRIDGE = { label: "detachable", costFactor: 0.5, tonnage: 0.2 } as const;

export const DETACHABLE_BRIDGE_MINIMUMS: readonly { readonly upToTons: number; readonly tons: number }[] = [
  { upToTons: 200, tons: 15 },
  { upToTons: 1_000, tons: 30 },
  { upToTons: 2_000, tons: 50 },
];

/** The smallest a detachable bridge may be on a hull of this size. Page 52. */
export function detachableBridgeMinimum(hullTons: number): number {
  for (const row of DETACHABLE_BRIDGE_MINIMUMS) {
    if (hullTons <= row.upToTons) return row.tons;
  }
  return 80;
}
