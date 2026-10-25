import { fractionFor } from "./detail";
import type { Uwp } from "../planet";

/**
 * Where the world sits, how fast it turns, and how warm it is. Spec 6.15.
 *
 * These four are one fact rather than four. A world's orbit sets how much light
 * it gets; the light and the air it holds set its temperature; how close in it
 * sits sets how hard tides have worked on its spin, which is what decides both
 * how fast it turns and how far its axis has been pulled upright. So they are
 * derived in that order from a single draw, and every one of them is consistent
 * with the others by construction rather than by luck.
 *
 * The UWP is evidence about the orbit even though it does not state one. A world
 * with oceans and breathable air has to be somewhere its water stays liquid; one
 * whose air is corrosive is a Venus and sits where a Venus can sit. So the draw
 * is made in temperature, where the profile has something to say, and the orbit
 * follows by inverting the temperature model rather than being rolled outright.
 *
 * What is assumed and cannot be read off a UWP: the star. Everything here takes a
 * Sun-like one, because the profile names no star and a mainworld's is usually
 * near enough. A world around an M dwarf at the same temperature would sit ten
 * times closer and be locked; that is the one number here a referee may want to
 * overrule, and 6.15.3 lets them.
 */

/* Constants ---------------------------------------------------------------- */

/**
 * Equilibrium temperature of a black body at 1 AU from the Sun, in kelvin. This
 * is (S/4σ) to the quarter, with S the solar constant.
 */
const EQUILIBRIUM_AT_1AU_K = 278.6;

/** Greenhouse warming at one atmosphere, in kelvin. Earth's is about this. */
const GREENHOUSE_AT_1ATM_K = 33;

/**
 * How greenhouse warming grows with pressure. Fitted across the two cases there
 * are: Earth at 1 atm is 33K warmer than bare, and Mars at 0.006 atm is 5K.
 */
const GREENHOUSE_EXPONENT = 0.37;

/**
 * Extra warming, in kelvin, on a world whose air the profile calls exotic,
 * corrosive or insidious. A runaway greenhouse is a state rather than a scaling:
 * Venus is 500K above bare sunlight on 92 atmospheres, which no reading of the
 * pressure curve above reaches, and the digits that name it are the profile's way
 * of saying a world has gone that way. Set below Venus, since the pressures the
 * cheatsheet allows are nowhere near hers.
 */
const RUNAWAY_K = 150;

/** Reflectance of bare rock, and how much more a wet cloudy world sends back. */
const ALBEDO_ROCK = 0.1;
const ALBEDO_CLOUD = 0.3;

/**
 * Orbits outside this are not worth drawing; the model has nothing to say there.
 * Around a Sun-like star. Both ends scale with the square root of the star's
 * output under orbitLimitsFor, since everything here that turns light into a
 * distance does: twice as far for four times the light.
 */
const ORBIT_LIMITS_AU = { near: 0.05, far: 50 } as const;

/**
 * The Sun, which is what a world with no star of its own is taken to orbit.
 *
 * Every figure in this file was written against it, and every world generated
 * before systems existed is a world around a star nobody named. PlanetSpec
 * 6.15.13: a planet with no luminosity of its own gets this one, and comes out
 * the world it always was.
 */
export const SUN_LUMINOSITY = 1;

/** How far a star's light reaches, relative to the Sun's. */
function reachOf(luminosity: number): number {
  return Math.sqrt(Math.max(luminosity, 0) || SUN_LUMINOSITY);
}

/** The orbits worth drawing around a star of this output. */
export function orbitLimitsFor(luminosity: number): { near: number; far: number } {
  const reach = reachOf(luminosity);
  return { near: ORBIT_LIMITS_AU.near * reach, far: ORBIT_LIMITS_AU.far * reach };
}

/**
 * A main sequence star's mass from its output, in solar masses. The mass-
 * luminosity relation, which is a power of about 3.5 over most of the sequence.
 *
 * Rough, and wrong for giants and white dwarfs, whose mass has come loose from
 * their brightness. It is used for the length of a year and for how far tides
 * reach, where being out by a third is not worth a second stellar model. The
 * clamp keeps a supergiant from being given the mass of a small galaxy.
 */
export function stellarMassFor(luminosity: number): number {
  return clamp(Math.pow(Math.max(luminosity, 0) || SUN_LUMINOSITY, 1 / 3.5), 0.08, 30);
}

/**
 * Where a world sits when the profile says nothing about it. Log-uniform, because
 * orbits are spaced multiplicatively rather than evenly: each one out is some
 * factor further than the last, which is the pattern Titius and Bode noticed and
 * every system since has roughly kept.
 */
const BARE_ORBIT_AU = { near: 0.15, far: 15 } as const;

/**
 * Distance inside which tides have had their way with a world's spin, in AU for a
 * Sun-like star, and how sharply that falls off. The torque goes as the inverse
 * sixth power of distance, which is why the transition is so abrupt: Mercury and
 * Venus are settled, Earth is barely touched.
 */
const DESPIN_REACH_AU = 0.5;
const DESPIN_FALLOFF = 6;

/** A year at 1 AU around a Sun-like star, in hours. */
const YEAR_AT_1AU_HOURS = 8766;

/**
 * Rotation a world is left with by accretion, before tides slow it. Simulations
 * put newly formed terrestrial planets at a few hours to a few tens of hours, and
 * the solar system's undisturbed rotators all sit between 10 and 25.
 */
const PRIMORDIAL_MEDIAN_HOURS = 18;
const PRIMORDIAL_SPREAD = 0.5;

/**
 * Equator-to-pole temperature difference, in kelvin, on an untilted world whose
 * air is too thin to carry any heat poleward. Spec 5.7.3.
 */
const POLE_CONTRAST_K = 90;

/**
 * The pressure at which air has moved a noticeable share of that heat. Thick air
 * is a conveyor as well as a blanket: Venus runs the same temperature at its poles
 * as at its equator, and an airless world swings the whole way. Set with the figure
 * above so that Earth comes out at about 47K and Venus at a couple.
 */
const HEAT_TRANSPORT_ATM = 2.2;

/**
 * How much hotter the point under the star runs than the world's mean on a
 * locked world with no air at all, as a share of that mean. PlanetSpec 5.7.7.
 *
 * A locked world takes its sunlight on one face for ever, so the flux at the
 * point under the star is four times the world's average rather than the same
 * as it. Temperature goes as the fourth root of flux, so that point sits at the
 * square root of two times the mean, and everything from there to the terminator
 * falls off as the fourth root of the cosine of the angle to the star.
 */
const LOCKED_PEAK = Math.SQRT2;

/**
 * The average of that fall-off over the whole sphere, which is what has to be
 * taken off it for the profile to leave the world's mean alone. Half of the
 * integral of mu to the quarter from nought to one, the night half contributing
 * nothing.
 */
const LOCKED_SHAPE_MEAN = 0.4;

/**
 * The pressure at which air has carried a fair share of a locked world's heat
 * round to its night side. Lower than the figure above, because the day-night
 * difference is what a thick atmosphere works hardest against: a locked world
 * under a bar or two is warm all over, and one under nothing is a furnace facing
 * an icebox.
 */
const LOCKED_TRANSPORT_ATM = 1;

/** Obliquity spreads, in degrees. See 6.12.3 for where the three populations come from. */
const SETTLED_SIGMA_DEG = 1;
const ORDERED_SIGMA_DEG = 20;
const SETTLED_LIMIT_DEG = 5;
/** Of the worlds tides have not settled, the share whose spin still remembers the disc. */
const ORDERED_SHARE = 0.75;

export const MAX_OBLIQUITY_DEG = 180;

/* Helpers ------------------------------------------------------------------ */

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const degrees = (radians: number): number => (radians * 180) / Math.PI;
const radians = (deg: number): number => (deg * Math.PI) / 180;

/** Inverse Rayleigh CDF. The mode is sigma and the median about 1.18 of it. */
function rayleigh(sigma: number, fraction: number): number {
  return sigma * Math.sqrt(-2 * Math.log(1 - fraction));
}

/** Inverse log-normal CDF, by way of a rational approximation to the normal one. */
function logNormal(median: number, spread: number, fraction: number): number {
  return median * Math.exp(spread * normalQuantile(clamp(fraction, 1e-6, 1 - 1e-6)));
}

/** Acklam's approximation to the inverse normal CDF. Good to about 1e-9. */
function normalQuantile(p: number): number {
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969,
    138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887,
    66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184,
    -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const low = 0.02425;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  if (p > 1 - low) return -normalQuantile(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
    (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
}

/* The model ---------------------------------------------------------------- */

/**
 * How much sunlight the world sends straight back. Bare rock reflects about a
 * tenth; water is darker still, but the clouds over it are far brighter, and the
 * clouds win. Calibrated so that Earth's oceans and one atmosphere give 0.31.
 */
export function albedoFor(hydrographicsPct: number, pressureAtm: number): number {
  return ALBEDO_ROCK + ALBEDO_CLOUD * cloudFractionFor(hydrographicsPct, pressureAtm);
}

/**
 * How much of a world is under cloud, 0 to 1. Water to lift and air to lift it
 * into: either at nothing leaves a world with a clear sky, and neither on its own
 * is worth anything.
 *
 * Held apart from the albedo above because 5.10 draws it. The sky a world is
 * under and the sunlight it sends back are one fact, and reading them off one
 * number is what stops the globe showing an overcast world the temperature model
 * has treated as clear.
 */
export function cloudFractionFor(hydrographicsPct: number, pressureAtm: number): number {
  return clamp01(hydrographicsPct / 100) * clamp01(pressureAtm);
}

/** How much warmer the air keeps the surface than bare sunlight would, in kelvin. */
export function greenhouseFor(pressureAtm: number, atmosphere: number): number {
  if (pressureAtm <= 0) return 0;
  const runaway = atmosphere >= 10 && atmosphere <= 12 ? RUNAWAY_K : 0;
  return GREENHOUSE_AT_1ATM_K * Math.pow(pressureAtm, GREENHOUSE_EXPONENT) + runaway;
}

/**
 * Mean surface temperature at a given orbit, in kelvin.
 *
 * The light a world gets is the star's output over the square of the distance,
 * and the temperature that leaves goes as the fourth root of it, so a star ten
 * thousand times the Sun's output warms a world as much from a hundred times
 * further out.
 */
export function temperatureAt(
  orbitAu: number,
  albedo: number,
  greenhouseK: number,
  luminosity = SUN_LUMINOSITY,
): number {
  const bare =
    (EQUILIBRIUM_AT_1AU_K * Math.pow(1 - albedo, 0.25) * Math.pow(reachOf(luminosity), 0.5)) /
    Math.sqrt(orbitAu);
  return bare + greenhouseK;
}

/**
 * The orbit that would give a world this temperature. The inverse of the above,
 * which is what makes the two fields of 6.15.2 two views of one number: editing
 * either leaves the other agreeing with it.
 */
export function orbitForTemperature(
  meanTempK: number,
  albedo: number,
  greenhouseK: number,
  luminosity = SUN_LUMINOSITY,
): number {
  const bare = meanTempK - greenhouseK;
  // Air alone cannot hold a world above the greenhouse figure with no sun on it,
  // so a temperature at or under that is only reachable out at the far limit.
  const limits = orbitLimitsFor(luminosity);
  if (bare <= 0) return limits.far;
  const root =
    (EQUILIBRIUM_AT_1AU_K * Math.pow(1 - albedo, 0.25) * Math.pow(reachOf(luminosity), 0.5)) / bare;
  return clamp(root * root, limits.near, limits.far);
}

/**
 * The temperature the profile points to, in kelvin, or null where it points to
 * nothing. Three readings of the digits:
 *
 * - Air the profile calls exotic, corrosive or insidious has run away, and those
 *   worlds are hot.
 * - Surface water under air worth the name has to be liquid, or the digit is
 *   describing ice and the hydrographics figure would be a lie.
 * - Water under no air to speak of is the Ice-Capped world of 5.4.3: frozen.
 *
 * A world with no surface water is the case the profile cannot speak to. A bare
 * rock is as much at home scorched as frozen, so nothing is inferred and the
 * orbit is drawn outright instead.
 */
export function targetTemperatureK(seed: string, profile: Uwp | null): number | null {
  if (profile === null) return null;
  const fraction = fractionFor(seed, "orbit");
  if (profile.atmosphere >= 10 && profile.atmosphere <= 12) return lerp(320, 700, fraction);
  if (profile.hydrographics >= 1) {
    // Water and air means liquid water: a mean anywhere from a world that is
    // mostly ice with open equatorial sea to one hot enough to be uncomfortable.
    return profile.atmosphere >= 2 ? lerp(268, 308, fraction) : lerp(180, 273, fraction);
  }
  return null;
}

/**
 * Where a world sits when nothing about it says. Log-uniform over the range, and
 * the range moves out with the star: a bare rock around a bright star is where
 * one around the Sun would be, times the reach of its light.
 */
export function bareOrbitAu(seed: string, luminosity = SUN_LUMINOSITY): number {
  const fraction = fractionFor(seed, "orbit");
  return (
    BARE_ORBIT_AU.near *
    Math.pow(BARE_ORBIT_AU.far / BARE_ORBIT_AU.near, fraction) *
    reachOf(luminosity)
  );
}

/**
 * How thoroughly tides have worked on a world's spin, from 0 for untouched to 1
 * for locked. The sixth power is the tidal torque's own falloff, and it is what
 * makes this a near step rather than a slope: everything inside half an AU is
 * settled and everything past three quarters of one is essentially free.
 */
export function despinFor(orbitAu: number, luminosity = SUN_LUMINOSITY): number {
  // Tides are the star's mass, not its light, so the reach moves with the cube
  // root of the mass rather than with the brightness. It is why the worlds in a
  // red dwarf's habitable zone are locked: warm there means very close in.
  const reach = DESPIN_REACH_AU * Math.pow(stellarMassFor(luminosity), 1 / 3);
  return clamp01(Math.pow(reach / orbitAu, DESPIN_FALLOFF));
}

/** How long a year lasts at this orbit, in hours. Kepler's third, with the mass. */
export function orbitalPeriodHours(orbitAu: number, luminosity = SUN_LUMINOSITY): number {
  return (Math.pow(orbitAu, 1.5) * YEAR_AT_1AU_HOURS) / Math.sqrt(stellarMassFor(luminosity));
}

/**
 * Obliquity, 0 to 180 degrees. Spec 6.12.3: three populations, with the settled
 * share now set by how far in the world sits rather than fixed, so the worlds
 * whose axes tides have pulled upright are the same worlds whose spin they slowed.
 */
export function obliquityFor(seed: string, despin: number): number {
  const population = fractionFor(seed, "axial-tilt:population");
  const fraction = fractionFor(seed, "axial-tilt");
  if (population < despin) {
    return Math.min(SETTLED_LIMIT_DEG, rayleigh(SETTLED_SIGMA_DEG, fraction));
  }
  if (population < despin + (1 - despin) * ORDERED_SHARE) {
    return Math.min(90, rayleigh(ORDERED_SIGMA_DEG, fraction));
  }
  // Isotropic: uniform in the cosine, so every direction is equally likely and
  // half of these worlds turn backwards.
  return degrees(Math.acos(1 - 2 * fraction));
}

/**
 * Rotation period in hours. A world starts fast and tides slow it towards its own
 * year; how far along that road it is, is the despin figure. The blend is made in
 * the logarithm because the two ends are three orders of magnitude apart and a
 * straight average between them would mean nothing.
 */
export function rotationHoursFor(
  seed: string,
  orbitAu: number,
  despin: number,
  luminosity = SUN_LUMINOSITY,
): number {
  const primordial = logNormal(
    PRIMORDIAL_MEDIAN_HOURS,
    PRIMORDIAL_SPREAD,
    fractionFor(seed, "rotation"),
  );
  const locked = orbitalPeriodHours(orbitAu, luminosity);
  return Math.exp(lerp(Math.log(primordial), Math.log(locked), despin));
}

/**
 * The seasonal tilt. A world past 90 degrees is turning backwards rather than
 * lying further over, and its poles swing by however far the axis is from the
 * plane of the orbit either way: 157 degrees gives the seasons of 23.
 */
export function seasonalTiltDeg(obliquityDeg: number): number {
  return Math.min(obliquityDeg, MAX_OBLIQUITY_DEG - obliquityDeg);
}

/** Whether the world turns against its orbit. */
export function isRetrograde(obliquityDeg: number): boolean {
  return obliquityDeg > 90;
}

/** Whether tides have brought the world's day and year into step. */
export function isTidallyLocked(
  rotationHours: number,
  orbitAu: number,
  luminosity = SUN_LUMINOSITY,
): boolean {
  return rotationHours >= orbitalPeriodHours(orbitAu, luminosity) * 0.95;
}

/**
 * How much colder a world's poles run than its equator, in kelvin. Spec 5.7.3.
 *
 * Two things decide it. The first is the tilt, and it is the same fact the ice
 * caps of 5.4 are built on. Sunlight averaged over a year varies with latitude as
 * the second Legendre polynomial, and the size of that term goes as one minus
 * three halves of the square of the sine of the lean: full at no tilt, gone at
 * 54.7 degrees, and negative past it. So a world lying on its side takes more
 * sunlight at its poles than at its equator over a year, and the sign here says
 * so. That is the same 54 degrees 5.4.2 puts the last permanent ice cap at,
 * because it is the same fact about sunlight.
 *
 * The second is the air. Sunlight sets the contrast and winds spend the year
 * rubbing it out, so the figure is divided down by the pressure. Calibrated to
 * Earth: 23 degrees of tilt at one atmosphere gives about 47K, which puts the
 * equator near 30C and the poles near -17C on a world whose mean is 14C.
 */
export function latitudeContrastK(seasonalTiltDeg: number, pressureAtm: number): number {
  const lean = Math.sin(radians(seasonalTiltDeg));
  const gradient = 1 - 1.5 * lean * lean;
  return (POLE_CONTRAST_K * gradient) / (1 + Math.max(0, pressureAtm) / HEAT_TRANSPORT_ATM);
}

/**
 * How much hotter the point under the star runs than the world's mean, in
 * kelvin. PlanetSpec 5.7.7, and the locked world's answer to latitudeContrastK.
 *
 * It scales with the mean rather than being a fixed number of degrees, because
 * the fall-off from the substellar point is a ratio: a world twice as warm has
 * twice the spread across it. Air rubs it out the way it rubs out the pole to
 * equator contrast, and harder, since moving heat round to a face that never
 * sees the sun is the one job a thick atmosphere is unambiguously good at.
 */
export function lockedContrastK(meanTempK: number, pressureAtm: number): number {
  const bare = ((LOCKED_PEAK - 1) * meanTempK) / (1 - LOCKED_SHAPE_MEAN);
  return bare / (1 + Math.max(0, pressureAtm) / LOCKED_TRANSPORT_ATM);
}

/**
 * The mean temperature at one angle from the star, in kelvin. PlanetSpec 5.7.7.
 *
 * `cosStar` is the cosine of the angle between the place and the point under the
 * star: one directly under it, nought on the terminator, minus one at the far
 * side. The shape is the fourth root of the sunlight falling there, which is
 * nought over the whole night half, and it is written so that its average over
 * the sphere is nought - so a locked world's mean is still the number 6.15
 * worked out, spread very differently over the surface.
 *
 * Nothing here is symmetric, which is the point. A turning world is warm in a
 * belt and cold at two ends; a locked one is scorched at one point, frozen over
 * a whole hemisphere, and habitable only in a ring between them.
 */
export function temperatureAtStar(
  meanTempK: number,
  contrastK: number,
  cosStar: number,
): number {
  const lit = Math.max(clamp(cosStar, -1, 1), 0);
  return meanTempK + contrastK * (Math.pow(lit, 0.25) - LOCKED_SHAPE_MEAN);
}

/**
 * The mean temperature at one latitude, in kelvin, from the world's own mean and
 * the contrast above. The shape is the second Legendre polynomial, which is what
 * annual sunlight actually varies as, and it is written so that its average over
 * the sphere is zero: warming a latitude here cools another, and the world's mean
 * stays the number 6.15 worked out.
 */
export function temperatureAtLatitude(
  meanTempK: number,
  contrastK: number,
  sinLat: number,
): number {
  const s = clamp(sinLat, -1, 1);
  return meanTempK + contrastK * ((1 - 3 * s * s) / 3);
}

/* Assembly ----------------------------------------------------------------- */

/** What the user may have overruled. Absent or null means the rolled value stands. */
export interface ClimateOverrides {
  /**
   * The output of the star the world orbits, relative to the Sun. Null for a
   * world whose star nobody has named, which is taken to be a Sun. PlanetSpec
   * 6.15.13.
   */
  readonly luminosity?: number | null;
  readonly orbitAu?: number | null;
  readonly obliquityDeg?: number | null;
  readonly rotationHours?: number | null;
}

export interface Climate {
  /** The star's output, as it was read: what every figure below was worked out on. */
  readonly luminosity: number;
  readonly orbitAu: number;
  readonly meanTempK: number;
  readonly obliquityDeg: number;
  readonly rotationHours: number;
  readonly albedo: number;
  readonly greenhouseK: number;
  /** How far tides have worked the spin over, 0 to 1. Not shown; drives the two above. */
  readonly despin: number;
}

/**
 * The whole chain, in the one order it can be worked out in: temperature to
 * orbit, orbit to despin, despin to spin and tilt, and the orbit back to the
 * temperature it actually implies once a referee has moved it.
 */
export function climateFor(
  seed: string,
  profile: Uwp | null,
  pressureAtm: number,
  hydrographicsPct: number,
  overrides: ClimateOverrides = {},
): Climate {
  const albedo = albedoFor(hydrographicsPct, pressureAtm);
  const greenhouseK = greenhouseFor(pressureAtm, profile?.atmosphere ?? 0);
  const luminosity = overrides.luminosity ?? SUN_LUMINOSITY;

  const target = targetTemperatureK(seed, profile);
  const rolled =
    target === null
      ? bareOrbitAu(seed, luminosity)
      : orbitForTemperature(target, albedo, greenhouseK, luminosity);
  const limits = orbitLimitsFor(luminosity);
  const orbitAu = clamp(overrides.orbitAu ?? rolled, limits.near, limits.far);

  const despin = despinFor(orbitAu, luminosity);
  return {
    luminosity,
    orbitAu,
    // Read off the orbit rather than kept from the draw, so an edited orbit
    // carries its temperature with it instead of contradicting it.
    meanTempK: temperatureAt(orbitAu, albedo, greenhouseK, luminosity),
    obliquityDeg: clamp(
      overrides.obliquityDeg ?? obliquityFor(seed, despin),
      0,
      MAX_OBLIQUITY_DEG,
    ),
    rotationHours: Math.max(
      0.1,
      overrides.rotationHours ?? rotationHoursFor(seed, orbitAu, despin, luminosity),
    ),
    albedo,
    greenhouseK,
    despin,
  };
}
