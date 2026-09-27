/**
 * What each catalogue class is for, as the shipyard sorts them. The designs'
 * own `military` flag says which crew column High Guard reads, not whether a
 * ship is any use in a fight (the Patrol Corvette is crewed as a civilian), so
 * the shipyard's grouping is kept here.
 */

import type { ShipClass } from "./shipclass";

export type Role = "combat" | "civilian";

/** Traders, liners, scouts, survey and utility craft: of little use in a war. */
const CIVILIAN: ReadonlySet<string> = new Set([
  "Free-Trader",
  "Far-Trader",
  "Subsidised-Merchant",
  "Subsidised-Liner",
  "Leviathan-Merchant-Cruiser",
  "Yacht",
  "Safari-Ship",
  "Seeker-Mining-Ship",
  "Laboratory-Ship",
  "Scout-Courier",
  "Donosev-Survey-Scout",
  "Express-Boat",
  "Hydrogen-Fleet-Tanker",
  "Ships-Boat",
  "Modular-Cutter",
]);

/**
 * A class's role. A bundled class is sorted by the list above; a design
 * imported during a game goes with its weapons: unarmed, or not military and
 * barely armed, it is civilian.
 */
export function roleOf(cls: ShipClass): Role {
  if (CIVILIAN.has(cls.id)) return "civilian";
  if (cls.design.military === true) return "combat";
  if (!cls.armed) return "civilian";
  return cls.strength < cls.tons * 0.1 ? "civilian" : "combat";
}
