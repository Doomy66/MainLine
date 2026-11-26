/**
 * Starship automation. An optional rule from the *Traveller Companion Update
 * 2024*, page 178, not from High Guard. ShipSpec 4.10.4.
 *
 * Automation is priced as a share of the hull, drives and power plant, and
 * scales the crew the ship needs. It reaches only the jobs that can be shared:
 * a ship that needs one astrogator still needs one, and every craft flown at
 * once still wants its own pilot. The roles it scales are the ones High Guard
 * already lets a large ship cut (`reducible` in crew.ts).
 */

export type AutomationLevel = "crewIntensive" | "low" | "standard" | "enhanced" | "advanced" | "high";

export interface AutomationRule {
  readonly label: string;
  /** Fraction of the hull, drives and power plant's cost, added or taken off. */
  readonly costFraction: number;
  /** What the shareable crew counts are multiplied by. */
  readonly crewFactor: number;
  /** The DM it puts on shipboard tasks, said in a few words, or nothing. */
  readonly effect?: string;
}

export const AUTOMATION: Readonly<Record<AutomationLevel, AutomationRule>> = {
  crewIntensive: { label: "Crew-intensive", costFraction: -0.4, crewFactor: 2, effect: "DM-4 to all shipboard tasks" },
  low: { label: "Low Automation", costFraction: -0.2, crewFactor: 1.4, effect: "DM-1 to all shipboard tasks after a week in space" },
  standard: { label: "Standard Automation", costFraction: 0, crewFactor: 1 },
  enhanced: { label: "Enhanced Automation", costFraction: 0.25, crewFactor: 0.9 },
  advanced: { label: "Advanced Automation", costFraction: 0.5, crewFactor: 0.75, effect: "DM+1 to all shipboard tasks" },
  high: { label: "High Automation", costFraction: 1, crewFactor: 0.6, effect: "DM+2 to all shipboard tasks" },
};

/** The sheet sections whose cost automation is a share of. */
export const AUTOMATED_SECTIONS: readonly string[] = ["Hull", "M-Drive", "R-Drive", "J-Drive", "Power Plant"];

/**
 * Scales the shareable crew as one body and shares the result out among the
 * roles in proportion. ShipSpec 4.10.4.1.
 *
 * The total is scaled and rounded up once, since a fraction of a job still
 * wants a person. Each role gets the whole part of its share, any role the
 * ship needed keeps at least one, and whoever is left over goes to the roles
 * with the largest fractions, the earlier role first on a tie. Scaling role by
 * role instead would leave a ship with three engineers and two gunners exactly
 * as it was until the very highest level.
 */
export function apportionCrew(counts: readonly number[], factor: number): number[] {
  if (factor === 1) return [...counts];
  const shares = counts.map((n) => n * factor);
  const given = shares.map((share, at) => Math.max(Math.floor(share + 1e-9), counts[at]! > 0 ? 1 : 0));
  const total = Math.ceil(shares.reduce((sum, share) => sum + share, 0) - 1e-9);
  let left = total - given.reduce((sum, n) => sum + n, 0);
  const order = shares
    .map((share, at) => ({ at, fraction: share - Math.floor(share + 1e-9) }))
    // A role already lifted to its one person has had its share rounded up.
    .filter((entry) => entry.fraction > 1e-9 && given[entry.at]! < Math.ceil(shares[entry.at]! - 1e-9))
    .sort((a, b) => b.fraction - a.fraction || a.at - b.at);
  for (let i = 0; left > 0 && order.length > 0; i = (i + 1) % order.length, left -= 1) {
    given[order[i]!.at]! += 1;
  }
  return given;
}
