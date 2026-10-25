import { parseUwp, type Uwp } from "../planet";
import type { PlanetDetail } from "./detail";
import {
  isTidallyLocked,
  lockedContrastK,
  seasonalTiltDeg,
  temperatureAtStar,
} from "./climate";

/**
 * Polar ice. Spec 5.4.
 *
 * Any world with water has some ice at its poles. How far it reaches is a matter
 * of how much sunlight the poles get and how well the air holds heat, both of
 * which the profile speaks to.
 *
 * Axial tilt is the main lever. A world with no tilt has poles that never see the
 * sun climb, so its caps are broad and stable. Raise the tilt and the poles get a
 * summer; past about 54 degrees they take more sunlight over a year than the
 * equator does, and nothing permanent survives.
 *
 * It is the seasonal tilt of 6.12.3 that counts, not the obliquity outright. A
 * world past 90 degrees is turning backwards rather than lying further over, and
 * its poles swing by however far its axis is from the plane of its orbit either
 * way. So the caps of a world at 157 degrees match those of one at 23.
 *
 * Mean surface temperature is the second, and it is read outright now rather than
 * stood in for. Pressure used to do that job, on the grounds that thick air is a
 * greenhouse and nothing else on the sheet bore on how warm a world kept itself.
 * The world settings of 6.15 carry a temperature, worked out from the orbit and
 * the air together, so the proxy has nothing left to do: the greenhouse is already
 * inside the figure this reads.
 *
 * A locked world is a different picture and gets a different one. It has no
 * tilt worth the name and its two poles sit on the terminator, so neither lever
 * above is saying anything about it. What it has instead is a hemisphere that
 * never sees the sun, and the ice goes there: one cap, centred on the point
 * furthest from the star, reaching as far back towards the terminator as that
 * side's temperature allows. Spec 5.4.7. Under the substellar convention of the
 * biome model that is the southern cap, and the northern one never forms.
 *
 * The Ice-Capped trade code sets a floor rather than a gate. When the profile says
 * a world is ice-capped it has caps at least that broad whatever the two levers
 * above work out to, because at that point the profile is stating the answer
 * outright rather than leaving it to be inferred.
 */

/** The most ice a world gets, in degrees from the pole, before anything reduces it. */
const MAX_REACH_DEG = 45;

/**
 * The most a locked world's night cap reaches, in degrees from the point away
 * from its star. Ninety, which is the terminator: sunlight stops there, and ice
 * that reached past it would be ice in the sun.
 */
const LOCKED_MAX_REACH_DEG = 90;

/** Tilt at which annual polar sunlight overtakes the equator and no cap holds. */
const TILT_LIMIT_DEG = 54;

/**
 * The mean surface temperatures between which the caps go from full extent to
 * none. Not the freezing point: a world's poles run far colder than its mean, so
 * ice holds well above it. Set so that Earth's 287K keeps the caps at full extent
 * and nothing much past 320K keeps any.
 */
const COLD_MEAN_K = 290;
const WARM_MEAN_K = 320;

/** How far an ice-capped world's caps reach at the least. */
const ICE_CAPPED_FLOOR_DEG = 40;

export interface IceCaps {
  /** Latitude poleward of which there is ice, in degrees. */
  readonly edgeDeg: number;
  /** The same edge as a height on the unit sphere, which is what cells carry. */
  readonly edgeY: number;
  /**
   * Where the ice is: at both poles on a turning world, and on the dark side
   * alone on a locked one, which under the substellar convention is the south.
   */
  readonly side: "poles" | "night";
}

/**
 * The Ice-Capped trade code: cold and dry, with most of the surface liquid frozen.
 * Atmosphere 0 or 1, and something to freeze.
 */
export function isIceCapped(profile: Uwp): boolean {
  return profile.atmosphere <= 1 && profile.hydrographics >= 1;
}

export function iceCapsFor(uwp: string, detail: PlanetDetail): IceCaps | null {
  const profile = parseUwp(uwp);
  if (profile === null) return null;

  const water = clamp01((detail.hydrographicsPct ?? 0) / 100);
  if (water <= 0) return null;

  const locked = isTidallyLocked(
    detail.rotationHours,
    detail.orbitAu,
    detail.climate.luminosity,
  );
  const side = locked ? "night" : "poles";

  // Calibration: 23 degrees of tilt at Earth's mean temperature reaches latitude
  // 64, which puts about a tenth of the surface under ice. A locked world reads
  // the temperature of its own dark side instead of its mean, because that is
  // the figure the ice there is answering to and it can be a hundred kelvin
  // below the mean the world is quoted at.
  const sunless = locked
    ? 1
    : 1 - clamp01(seasonalTiltDeg(detail.axialTiltDeg) / TILT_LIMIT_DEG);
  const against = locked
    ? temperatureAtStar(
        detail.meanTempK,
        lockedContrastK(detail.meanTempK, detail.pressureAtm ?? 0),
        -1,
      )
    : detail.meanTempK;
  const cold = clamp01((WARM_MEAN_K - against) / (WARM_MEAN_K - COLD_MEAN_K));
  let reach = (locked ? LOCKED_MAX_REACH_DEG : MAX_REACH_DEG) * sunless * cold;

  if (isIceCapped(profile)) reach = Math.max(reach, ICE_CAPPED_FLOOR_DEG);

  // The caps cannot cover more of the surface than the world has water to make
  // them from. Two caps reaching to latitude L cover 1 - sin L of the sphere and
  // one covers half of that, so the water fraction fixes how far down they can
  // come. This bounds the floor above as well: a profile can say a world is
  // ice-capped, but not that it has more ice than water.
  const spare = clamp01(locked ? 1 - 2 * water : 1 - water);
  const ceiling = 90 - degrees(Math.asin(spare));
  reach = Math.min(reach, ceiling);

  if (reach <= 0) return null;
  const edgeDeg = 90 - reach;
  return { edgeDeg, edgeY: Math.sin(radians(edgeDeg)), side };
}

/**
 * Whether a point is under ice, from its height on the unit sphere. Both poles
 * carry a cap on a turning world, so the test is on distance from the equator
 * rather than on sign; a locked world carries one, and the sign is the whole
 * question.
 */
export function isIced(caps: IceCaps | null, y: number): boolean {
  if (caps === null) return false;
  return caps.side === "night" ? y <= -caps.edgeY : Math.abs(y) >= caps.edgeY;
}

/** Fraction of the surface under ice, which is what the water ceiling bounds. */
export function icedFraction(caps: IceCaps | null): number {
  if (caps === null) return 0;
  const both = 1 - Math.sin(radians(caps.edgeDeg));
  return caps.side === "night" ? both / 2 : both;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const degrees = (rad: number): number => (rad * 180) / Math.PI;
const radians = (deg: number): number => (deg * Math.PI) / 180;
