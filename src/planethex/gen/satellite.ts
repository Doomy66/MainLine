/**
 * The worlds of a system that are not its main world. SystemSpec section 6.
 *
 * Two halves, and the split is the whole point. A world's **physical** digits are
 * `rollUwp` of its own seed, bent by where it sits: no liquid water out past the
 * ice, no air worth the name in close. Its **social** digits are not rolled at
 * all. A world in a system was settled from that system's main world, so its
 * people, its government, its law and its technology come from there.
 *
 * SystemSpec 6.4.1 is what this file exists to prevent. Traveller's world rules
 * assume the world being rolled is the reason anybody came to the system, and
 * applied to the next orbit out they produce a second capital with its own
 * interstellar port and a billion people on it.
 */

import { formatUwp, parseUwp, rollUwp, seedFrom, type Uwp } from "../planet";
import { valueFor } from "./rng";

/**
 * Where a world can hold liquid water, in sunlight-equivalent AU, and how far
 * either side of that the two bendings of 6.3 take hold.
 *
 * Wider than the habitable band the system marks, on purpose. A world a little
 * outside the zone still has ice it could melt and air it could keep; these are
 * the distances at which the question stops being open.
 */
const NO_WATER_BEYOND = 3;
const NO_AIR_WITHIN = 0.4;

/** A world with less than this has no gravity well worth the name. */
const AIRLESS_SIZE = 2;

/** How often an orbit with nothing else in it holds a world at all. */
const WORLD_SHARE = 0.45;

/**
 * How far below the main world's population a settled second world sits, before
 * anything else is taken off. A colony is a town where the capital is a country.
 */
const POPULATION_DROP = 7;

/** How far the rest of a system can fall behind its main world's technology. */
const TECH_LAG = 2;

/** Starport by population: what the traffic a world sees can support. */
function starportFor(population: number): string {
  if (population === 0) return "X";
  if (population >= 8) return "C";
  if (population >= 5) return "D";
  return "E";
}

/** The seed of the world in one orbit. Its own, so it opens on its own. */
export function orbitWorldSeed(systemSeed: string, orbitIndex: number): string {
  return seedFrom(systemSeed, `orbit-${orbitIndex}`);
}

/** The seed of one moon of the gas giant in an orbit. Its own, for the same reason. */
export function moonSeed(systemSeed: string, orbitIndex: number, moon: number): string {
  return seedFrom(systemSeed, `orbit-${orbitIndex}`, `moon-${moon}`);
}

/**
 * How large a moon can be. A moon is held by a planet rather than by a star, and
 * the ones the solar system has top out around Mars: big enough to walk on, and
 * nowhere near big enough to be a world in its own right.
 */
const MOON_SIZE_LIMIT = 5;

/**
 * The profile of a moon of a gas giant. SystemSpec 4.6.1.
 *
 * The same two halves as any other world of a system, under 6.3 and 6.4, with
 * its size held down: it is a moon, and a moon the size of an Earth would be a
 * world that had been mislabelled. Everything else follows the rules that put
 * people on any other world, which is what lets a gas giant's moon be somewhere
 * anybody lives.
 */
export function moonUwp(seed: string, sunEquivalentAu: number, main: Uwp | null): string {
  const held = parseUwp(satelliteUwp(seed, sunEquivalentAu, main));
  if (held === null) return "X000000-0";
  if (held.size <= MOON_SIZE_LIMIT) return formatUwp(held);
  // Too big for a moon: brought down to what a moon can be, and its air and
  // water brought down with it, since both are held by the gravity it no longer
  // has. The digits below are the same rules satelliteUwp applied, reapplied.
  const size = MOON_SIZE_LIMIT;
  const atmosphere = size <= AIRLESS_SIZE ? 0 : Math.min(held.atmosphere, 9);
  return formatUwp({
    ...held,
    size,
    atmosphere,
    hydrographics: atmosphere === 0 ? 0 : held.hydrographics,
  });
}

function draw(seed: string, stream: string, index: number): number {
  return valueFor(`${seed}:satellite:${stream}`, index);
}

/** Whether an orbit with nothing else in it holds a world. SystemSpec 4.4. */
export function holdsWorld(systemSeed: string, orbitIndex: number): boolean {
  return draw(systemSeed, "present", orbitIndex) < WORLD_SHARE;
}

/**
 * The profile of a world that is not its system's main world.
 *
 * `main` is the main world's profile, which is where everything social comes
 * from. `sunEquivalentAu` is how much light falls on this one, which is what
 * bends the physical digits.
 */
export function satelliteUwp(
  seed: string,
  sunEquivalentAu: number,
  main: Uwp | null,
): string {
  const rolled = parseUwp(rollUwp(seed));
  // A seed that will not roll a readable profile is not a world this can place.
  if (rolled === null) return "X000000-0";

  const size = rolled.size;
  // Out past the ice there is no liquid water, whatever the roll said: the digit
  // would be describing a glacier and calling it an ocean. SystemSpec 6.3.
  const frozen = sunEquivalentAu > NO_WATER_BEYOND;
  // In close, the air has long since been boiled and blown off, and a small
  // world has no hold on it in the first place.
  const scorched = sunEquivalentAu < NO_AIR_WITHIN;
  const atmosphere = scorched || size <= AIRLESS_SIZE ? 0 : rolled.atmosphere;
  const hydrographics = frozen || scorched || atmosphere === 0 ? 0 : rolled.hydrographics;

  const population = settledPopulation(seed, main, atmosphere, hydrographics);
  if (population === 0) {
    // Nobody there: no government, no law, no industry, and no port. The same
    // rule the planet spec 6.7.2 applies to an empty world.
    return formatUwp({
      starport: "X",
      size,
      atmosphere,
      hydrographics,
      population: 0,
      government: 0,
      law: 0,
      tech: 0,
    });
  }
  return formatUwp({
    starport: starportFor(population),
    size,
    atmosphere,
    hydrographics,
    population,
    // The same polity as the world that settled it, and much the same law. A
    // colony is not a country of its own, which is the point of 6.4.
    government: main?.government ?? 0,
    law: clamp(
      (main?.law ?? 0) + Math.floor(draw(seed, "law", 0) * 3) - 1,
      0,
      main?.law ?? 0,
    ),
    // At home in the main world's technology or a little behind it, never ahead:
    // whatever is out here was carried out here.
    tech: clamp(
      (main?.tech ?? 0) - Math.floor(draw(seed, "tech", 0) * (TECH_LAG + 1)),
      0,
      main?.tech ?? 0,
    ),
  });
}

/**
 * How many people live on a world that is not the main world.
 *
 * Most of them are nobody. A system's people are where its main world is, and
 * SystemSpec 6.5 wants a busy system to read as the exception: an orbit with a
 * mining camp on it is worth noticing, and it is not worth noticing if every
 * rock has one.
 */
function settledPopulation(
  seed: string,
  main: Uwp | null,
  atmosphere: number,
  hydrographics: number,
): number {
  const home = main?.population ?? 0;
  // A world nobody could reach from is a world nobody settled from.
  if (home === 0) return 0;
  const drop = POPULATION_DROP + Math.floor(draw(seed, "population", 0) * 4);
  // Somewhere worth staying holds more than a bare rock does. Air to breathe and
  // water to drink is the difference between a colony and a camp.
  const livable = atmosphere >= 4 && atmosphere <= 9 && hydrographics >= 1 ? 1 : 0;
  return clamp(home - drop + livable, 0, Math.max(0, home - 1));
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
