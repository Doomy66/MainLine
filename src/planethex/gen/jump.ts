/**
 * Jump shadows. SystemSpec section 4.8.
 *
 * A ship cannot jump too close to a mass, so every body in a system has a
 * sphere around it that a jump cannot be made from. It is the one piece of
 * astrography that decides how a system is actually travelled: how long it
 * takes to leave, where a ship arriving must come out, and why the gas giant
 * everybody refuels at is also the one they then have to crawl away from.
 *
 * A hundred diameters is the Traveller figure, and it is a diameter rather than
 * a mass, so the biggest shadows belong to the biggest bodies rather than the
 * heaviest: a bloated red giant casts a far longer one than a white dwarf of the
 * same mass.
 */

/** How many of a body's own diameters the shadow reaches out. */
export const SHADOW_DIAMETERS = 100;

export const AU_KM = 149_597_870.7;

/** The shadow of a body, in km from its centre. */
export function jumpShadowKm(diameterKm: number): number {
  return diameterKm * SHADOW_DIAMETERS;
}

export function kmToAu(km: number): number {
  return km / AU_KM;
}

/**
 * How long a ship under one gravity takes to cross a distance from a standing
 * start, in hours. Not a round trip and not a stop at the far end: to jump, a
 * ship has to be outside the shadow, not at rest outside it.
 */
export function hoursAt1g(km: number): number {
  const metres = km * 1000;
  const seconds = Math.sqrt((2 * metres) / 9.80665);
  return seconds / 3600;
}

/** A distance in km, said the way a referee would say it. */
export function kmLabel(km: number): string {
  if (km >= AU_KM / 10) return `${kmToAu(km).toFixed(2)} AU`;
  if (km >= 1e6) return `${(km / 1e6).toFixed(1)}M km`;
  return `${Math.round(km).toLocaleString("en-GB")} km`;
}

/** A crossing time, said in the units that suit its length. */
export function crossingLabel(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} minutes at 1g`;
  if (hours < 48) return `${hours.toFixed(1)} hours at 1g`;
  return `${(hours / 24).toFixed(1)} days at 1g`;
}
