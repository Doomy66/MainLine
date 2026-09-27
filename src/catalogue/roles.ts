/**
 * What each catalogue class is for, as the shipyard sorts them. The designs'
 * own `military` flag says which crew column High Guard reads, not whether a
 * ship is any use in a fight (the Patrol Corvette is crewed as a civilian), so
 * the shipyard's grouping is kept here.
 */

import type { ShipClass } from "./shipclass";

/**
 * - warship: a starship built to fight.
 * - defence: no jump drive; system defence boats and fighters, which need a
 *   tender or a carrier to go anywhere.
 * - capital: 5,000 tons and up, High Guard's capital ships.
 * - civilian: traders, liners, scouts and utility craft.
 */
export type Role = "warship" | "defence" | "capital" | "civilian";

/** High Guard's line between a starship and a capital ship, in tons. */
export const CAPITAL_TONS = 5000;

/** Traders, liners, scouts, survey, utility and special operations craft: of little use in a war of fleets. */
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
  "FOO3",
]);

/**
 * A class's role. A bundled civilian is on the list above; anything else,
 * bundled or imported, goes by its armament, then its size and its drive:
 * unarmed, or not military and barely armed, it is civilian.
 */
export function roleOf(cls: ShipClass): Role {
  if (CIVILIAN.has(cls.id)) return "civilian";
  const fights = cls.design.military === true || (cls.armed && cls.strength >= cls.tons * 0.1);
  if (!fights) return "civilian";
  if (cls.tons >= CAPITAL_TONS) return "capital";
  if (cls.jump === 0) return "defence";
  return "warship";
}
