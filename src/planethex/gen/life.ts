import { parseUwp } from "../planet";
import type { PlanetDetail } from "./detail";

/**
 * How green a world's land is drawn. Spec 5.6.
 *
 * The height ramp of 5.1 was written for an Earth: green lowlands, grey uplands.
 * Most profiles are not an Earth. A world with a trace of unbreathable air, or
 * with a few percent of water, or one that sits too far out for any of it to be
 * liquid, has nothing growing on it, and drawing it green says the opposite of
 * what its digits say.
 *
 * So the ground cover is derived rather than assumed, from the three things
 * plants need and the profile speaks to: air to work with, water to drink, and a
 * temperature at which that water is liquid. Each is a factor in [0, 1] and they
 * multiply, because any one of them at zero is on its own enough to leave a world
 * bare. The result is read as a blend between the green ramp and an arid one, so
 * a marginal world comes out in the yellows and browns between the two rather
 * than having to be either lush or dead.
 *
 * What this is not: a claim about life. A world can be crawling with things that
 * are not photosynthetic, and a referee's world may be covered in something that
 * is not green at all. This is only what the surface of a Traveller world with
 * that profile most plausibly looks like from orbit.
 */

/**
 * How well each atmosphere digit supports ground cover. The breathable middle of
 * the table is what Earth's plants want; the taints cost little, since what makes
 * air unbreathable to a traveller is rarely what a plant minds. Below thin there
 * is not enough gas to hold water on the surface at all, and the exotic, corrosive
 * and insidious digits describe chemistries plants have no purchase on.
 */
const ATMOSPHERE_COVER: readonly number[] = [
  0, // 0 None
  0, // 1 Trace
  0.15, // 2 Very thin, tainted
  0.15, // 3 Very thin
  0.7, // 4 Thin, tainted
  0.75, // 5 Thin
  1, // 6 Standard
  0.9, // 7 Standard, tainted
  0.85, // 8 Dense
  0.8, // 9 Dense, tainted
  0.15, // A Exotic
  0, // B Corrosive
  0, // C Insidious
  0.45, // D Very dense
  0.2, // E Low
  0.3, // F Unusual
];

/**
 * Surface water, as a percentage, between which cover goes from none to full. A
 * desert world keeps some green where its water is, but not enough of it to see
 * from orbit; past a quarter of the surface wet, the land is watered everywhere.
 */
const DRY_PCT = 3;
const WET_PCT = 25;

/**
 * The mean surface temperatures cover survives between, in kelvin. Wider than the
 * freezing and boiling points, because a mean is not an everywhere: a world at
 * 250K still thaws at its equator, and one at 330K keeps its poles.
 */
const FROZEN_K = 245;
const COLD_K = 275;
const HOT_K = 310;
const SCORCHED_K = 340;

/**
 * The greenness of a world's land, from 0 for bare rock and sand to 1 for an
 * Earth. An unreadable UWP gives a middling world rather than a lush one, since
 * nothing then says it has anything growing on it.
 */
export const DEFAULT_VERDANCY = 0.5;

export function verdancyFor(uwp: string, detail: PlanetDetail): number {
  const cover = coverFactorsFor(uwp, detail);
  if (cover === null) return DEFAULT_VERDANCY;
  return cover.air * cover.water * warmthAt(detail.meanTempK);
}

/**
 * The two factors a world carries everywhere, held apart from the third because
 * the third is not the same everywhere. The verdancy above reads the warmth at the
 * world's mean, which is the one figure a single colour for the whole planet can
 * use. The visible view of 5.7 reads it latitude by latitude off the same pair.
 */
export interface CoverFactors {
  readonly air: number;
  readonly water: number;
}

/** Air and water, or null where the UWP cannot be read. */
export function coverFactorsFor(uwp: string, detail: PlanetDetail): CoverFactors | null {
  const profile = parseUwp(uwp);
  if (profile === null) return null;
  const digit = Math.min(Math.max(Math.trunc(profile.atmosphere), 0), ATMOSPHERE_COVER.length - 1);
  return {
    air: ATMOSPHERE_COVER[digit]!,
    water: ramp(detail.hydrographicsPct ?? 0, DRY_PCT, WET_PCT),
  };
}

/** The warmth factor at a temperature: 1 where cover is comfortable, 0 either side. */
export function warmthAt(tempK: number): number {
  return Math.min(ramp(tempK, FROZEN_K, COLD_K), ramp(tempK, SCORCHED_K, HOT_K));
}

/** Zero at the `none` end, one at the `full` end, linear between. Either order. */
function ramp(value: number, none: number, full: number): number {
  if (none === full) return value >= full ? 1 : 0;
  const t = (value - none) / (full - none);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
