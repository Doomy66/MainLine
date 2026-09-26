/**
 * Step 11, Install Staterooms, and the airlock rule from step 12.
 * High Guard Update 2022, PDF pages 25-26. ShipSpec 4.12 and 4.14.2.
 */

/** Page 25. ShipSpec 4.12.1. */
export const STATEROOM = { label: "Stateroom", tons: 4, cost: 0.5, occupants: 1, doubleOccupants: 2 } as const;

/** Page 25. ShipSpec 4.12.2. */
export const LOW_BERTH = { label: "Low Berth", tons: 0.5, cost: 0.05, occupants: 1, berthsPerPower: 10 } as const;
export const EMERGENCY_LOW_BERTH = { label: "Emergency Low Berth", tons: 1, cost: 1, occupants: 4, power: 1 } as const;

/** Page 25. ShipSpec 4.12.3. MCr per ton, and the book's suggested share of stateroom tonnage. */
export const COMMON_AREA = { label: "Common Areas", costPerTon: 0.1, suggestedFractionOfStaterooms: 0.25 } as const;

/** One free airlock per full 100 tons; none on small craft or with a cockpit. Page 26. ShipSpec 4.14.2. */
export const TONS_PER_FREE_AIRLOCK = 100;
