/**
 * A star system: the stars, the orbits around them, and what sits in those
 * orbits. SystemSpec sections 3 to 5.
 *
 * The direction everything here runs in is SystemSpec 1.6. The main world's
 * profile is read and never written: it is `rollUwp` of its own seed, which is
 * what the subsector above already drew and what a user clicking a hex has to find.
 * The star and its orbits are rolled in their own right, and the world is then
 * placed in the best orbit they turn out to offer and told where it ended up.
 *
 * The other worlds of SystemSpec section 6 are satellite.ts, which is where the
 * seam of 6.6 is: their physical digits are their own seed's and their social
 * digits are the main world's.
 */

import { parseUwp, rollUwp, seedFrom, type Uwp } from "../planet";
import { holdsWorld, moonSeed, moonUwp, orbitWorldSeed, satelliteUwp } from "./satellite";
import { settlementNames } from "./settle";
import { pbgFor, type Pbg } from "./trade";
import { planetDetail } from "./detail";
import { valueFor } from "./rng";
import { diameterKm, starsFor, systemLuminosity, type Stars } from "./star";
import { orbitalPeriodHours, stellarMassFor } from "./climate";
import { basesFor, zoneFor } from "./base";
import { jumpShadowKm, kmToAu } from "./jump";

/**
 * The orbits, in sunlight-equivalent AU: where they would be around the Sun.
 * SystemSpec 3.2.
 *
 * The solar system's own spacing, which is the pattern climate.ts already
 * describes - each orbit out is a multiple of the last rather than a step
 * further, so the inner ones are crowded and the outer ones are not.
 *
 * Sunlight-equivalent and not AU, because the ladder moves with the star. See
 * `orbitsFor`.
 */
const ORBIT_SUN_AU = [0.2, 0.4, 0.7, 1.0, 1.6, 2.8, 5.2, 10, 20, 30, 40, 52] as const;

/**
 * The sunlight-equivalent band a world can hold liquid water in. SystemSpec 3.2.
 *
 * Kopparapu's optimistic limits, which is recent Venus at 0.75 and early Mars at
 * about 1.8: both of those are places we know held liquid water, which is a
 * better pair of bounds than a bare rock's freezing point. It puts two of the
 * orbits above in the zone, which is the "orbit or two" of 3.2.
 */
const HABITABLE_BAND = { near: 0.75, far: 1.84 } as const;

/**
 * How close a rocky world can get to a star before tides pull it apart, in AU
 * per cube root of a solar mass. SystemSpec 3.1.
 *
 * The Roche limit, 2.44 times the star's radius times the cube root of the ratio
 * of their densities. Write the star's density out as its mass over its volume
 * and the radius cancels, which leaves a distance that depends on the star's
 * mass alone: 2.44 times the cube root of three M over four pi times the density
 * of rock. For the Sun that is 0.0072 AU.
 *
 * It is the one distance here that does not move with the light, and it is why
 * the ladder needs a floor at all. A white dwarf puts out a ten-thousandth of
 * the Sun's light, so its scaled innermost orbit lands at a five-hundredth of an
 * AU - and a rocky world there is the debris disc we actually see around white
 * dwarfs rather than a planet.
 */
const ROCHE_PER_CUBE_ROOT_MASS_AU = 0.0072;

/**
 * How far out a system of planets reaches at all, in AU, whatever the star.
 * SystemSpec 3.1.
 *
 * A protoplanetary disc is a few hundred AU across and its size is set by the
 * angular momentum of the cloud core it fell out of rather than by the star's
 * light, so this one does not scale either. Without it a supergiant's innermost
 * orbit lands two hundred AU out and its outermost most of a light year, which
 * is not a planetary system - and the light a supergiant puts out is not what
 * stops it being one.
 */
const DISC_REACHES_AU = 100;

/**
 * How many orbits a disc left behind, at the least and the most. SystemSpec 3.1.
 *
 * Real counts run from one to eight or more and follow the mass of the disc,
 * which follows the mass of the star loosely and with enormous scatter. So the
 * star leans on a draw here rather than deciding it. The floor is set so that
 * every system has the habitable orbit of 3.2, whether or not anything is in it.
 */
const DISC_ORBITS = { fewest: 5, most: ORBIT_SUN_AU.length } as const;

/**
 * What makes a world one that wants the habitable zone: water to keep liquid,
 * and air worth the name to keep it under. SystemSpec 5.2.
 */
function wantsTheZone(profile: Uwp | null): boolean {
  if (profile === null) return false;
  return profile.hydrographics >= 1 && profile.atmosphere >= 2 && profile.atmosphere <= 9;
}

/**
 * Where ices survive planet formation, in sunlight-equivalent AU. Gas giants
 * form outside it and not inside it, which is why the solar system's are where
 * they are.
 */
const SNOW_LINE = 2.7;

/**
 * A moon of a gas giant. SystemSpec 4.6.1: a world like any other, with its own
 * seed and its own surface, so one with people on it opens like anywhere else.
 */
export interface Moon {
  /** Its place in the giant's own family, from 1 outwards. */
  readonly index: number;
  readonly seed: string;
  readonly uwp: string;
}

export type OrbitContent =
  | { readonly kind: "empty" }
  /**
   * A belt, and where people live in one, the world that belt is. SystemSpec
   * 4.3: a profile whose size digit is zero is not a small world, it is an
   * asteroid belt, so the orbit holds a belt and the belt holds the profile.
   */
  | {
      readonly kind: "belt";
      readonly main?: boolean;
      readonly seed?: string;
      readonly uwp?: string;
    }
  /**
   * A gas giant, and how big it is. SystemSpec 4.2.3: large is a Jupiter, small
   * is a Neptune, and the difference is worth holding because it is what its
   * jump shadow is measured from - the giant everybody refuels at is the one
   * they then have to crawl away from.
   */
  | {
      readonly kind: "giant";
      readonly large: boolean;
      readonly diameterKm: number;
      readonly moons: readonly Moon[];
    }
  | { readonly kind: "world"; readonly main: boolean; readonly seed: string; readonly uwp: string };

export interface Orbit {
  /** Its number, counting outward from the primary and starting at zero. */
  readonly index: number;
  /** Where it is, in AU. */
  readonly au: number;
/**
   * The distance from the Sun that would give a world in this orbit the same
   * light. Not what a world takes away with it - that is the true distance in
   * `au`, with the star's output beside it - but what the habitable zone and the
   * snow line are worked out on, since both are questions about light.
   */
  readonly sunEquivalentAu: number;
  /** Whether liquid water is possible here. */
  readonly habitable: boolean;
  readonly content: OrbitContent;
}

export interface MainWorld {
  readonly seed: string;
  readonly uwp: string;
  /** Which orbit it ended up in, which is an index into the system's orbits. */
  readonly orbitIndex: number;
  /** Where it is, in AU, and what goes into its orbit setting. SystemSpec 5.2.2. */
  readonly au: number;
  /**
   * The output of what it orbits, which goes into its luminosity setting: both
   * stars of a close pair, or the primary alone. Without it the orbit above
   * means nothing, since the same distance is a furnace around one star and a
   * cinder around another.
   */
  readonly luminosity: number;
}

export interface StarSystem {
  readonly seed: string;
  readonly stars: Stars;
  readonly orbits: readonly Orbit[];
  readonly mainWorld: MainWorld;
  /**
   * When this is, in days from the epoch of [src/traveller.ts](../traveller.ts).
   * SystemSpec 3.5: it is the one thing about a system that is not its seed, and
   * all it decides is where round its orbit each body has got to.
   *
   * Zero at the epoch, and zero is what a system generated without being told
   * gets, so nothing that does not care about the date has to say anything.
   */
  readonly atDay: number;
  /** Population multiplier, belts and gas giants, read rather than rolled. */
  readonly pbg: Pbg;
  /**
   * The bases, as the Bases column writes them, and which orbit they are in.
   * SystemSpec 4.7: a base is somewhere, and the somewhere is the main world -
   * a naval base is a station in its orbit and a scout way station is a field on
   * it. Derived from the main world's seed the same way the subsector derives it, so
   * the two agree without either being told.
   */
  readonly bases: { readonly letter: string; readonly orbitIndex: number };
  /**
   * The travel zone, as the Zone column writes it: "A" for amber, "" for green.
   * Derived from the main world's profile the way the subsector derives it, for the
   * reason the bases are - what both levels can work out, neither owns. Nothing
   * here ever writes a red: that is the referee's, under SubSectorSpec 3.6.4.
   */
  readonly zone: string;
  /**
   * How many of those belts and gas giants the orbits had room for.
   *
   * The same as the figures above in all but the extreme systems. A star whose
   * orbits have been swept away, or which reaches nowhere, can have fewer orbits
   * than the subsector's counts ask for, and there is nowhere to put the rest: the
   * counts were drawn from a seed under the planet spec 6.16.2 without anything
   * knowing what star they would have to fit around. Placing what fits and
   * saying so beats stacking two gas giants in one orbit.
   */
  readonly placed: { readonly belts: number; readonly gasGiants: number };
}

/**
 * How big a gas giant is. SystemSpec 4.2.3.
 *
 * Two kinds, because the sky has two kinds: the Jupiters, which are mostly
 * hydrogen and enormous, and the Neptunes, which are ices and a third of the
 * width. A spread inside each, since no two are the same size.
 */
function giantSize(seed: string, index: number): { large: boolean; diameterKm: number } {
  const large = valueFor(`${seed}:giant-size`, index) < 0.5;
  const spread = valueFor(`${seed}:giant-span`, index);
  const diameterKm = large ? 110_000 + spread * 55_000 : 42_000 + spread * 30_000;
  return { large, diameterKm: Math.round(diameterKm) };
}

/** The seed of a system's main world. SystemSpec 5.1. */
export function mainWorldSeed(systemSeed: string): string {
  return seedFrom(systemSeed, "world");
}

/**
 * Where a star's orbits are. SystemSpec 3.1.
 *
 * The whole ladder scales with the square root of the star's output, because
 * every distance that means anything thermally does. The light falling on a
 * world is the star's output over the square of the distance, so the place where
 * water melts, where dust stops surviving, and where a world freezes solid all
 * sit at their sunlight-equivalent distance times the root of the luminosity.
 * That is the inverse square law rather than a choice, and climate.ts has always
 * placed a planet's own orbit that way; this is the same arithmetic one level up.
 *
 * It is what the sky looks like. TRAPPIST-1 puts out a two-thousandth of the
 * Sun's light and holds seven planets between 0.011 and 0.062 AU - sunlight
 * equivalents of half an AU to two and a half, which is Venus out to the belt.
 * A ladder fixed in AU cannot draw that system: its innermost orbit would be a
 * sunlight-equivalent nine AU out, past Saturn, and every world around every
 * dim star comes out a frozen rock.
 *
 * A big hot star having nothing close in then needs no rule of its own. The
 * innermost orbit of a star sixty times the Sun's output is one and a half AU,
 * which is where the sweeping and scattering of 3.1 would have left it anyway.
 */
export function orbitsFor(luminosity: number): readonly { index: number; au: number; sunEquivalentAu: number; habitable: boolean }[] {
  const reach = Math.sqrt(Math.max(luminosity, 0) || 1);
  return ORBIT_SUN_AU.map((sunEquivalentAu, index) => ({
    index,
    au: sunEquivalentAu * reach,
    sunEquivalentAu,
    habitable:
      sunEquivalentAu >= HABITABLE_BAND.near && sunEquivalentAu <= HABITABLE_BAND.far,
  }));
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * How many of them this system actually has. SystemSpec 3.1.
 *
 * The one thing about a system that does not follow from the star's light. Now
 * that the ladder above moves with the star, filtering it by what the star
 * sweeps or lights would cut the same orbits off every star and say nothing, so
 * how far out a system reaches is drawn - leaning on the star's mass, because a
 * heavier star forms from a heavier core and keeps a bigger disc, and leaning
 * only, because the scatter in the real counts swamps the trend.
 */
export function discOrbitsFor(
  seed: string,
  luminosity: number,
): readonly { index: number; au: number; sunEquivalentAu: number; habitable: boolean }[] {
  const mass = stellarMassFor(luminosity);
  const roche = ROCHE_PER_CUBE_ROOT_MASS_AU * Math.cbrt(mass);
  const room = orbitsFor(luminosity).filter(
    (orbit) => orbit.au >= roche && orbit.au <= DISC_REACHES_AU,
  );
  // The subsector above has put a world in this hex, so there has to be somewhere
  // for it to go even around a star with no room for one. The innermost orbit
  // stands, and the world in it is somewhere nobody should be.
  if (room.length === 0) return orbitsFor(luminosity).slice(0, 1);
  // A tenth of a solar mass leans towards the fewest, ten of them to the most.
  const lean = clamp01((Math.log10(mass) + 1) / 2);
  const share = clamp01((lean + valueFor(`${seed}:disc`, 0)) / 2);
  const held = Math.round(
    DISC_ORBITS.fewest + share * (DISC_ORBITS.most - DISC_ORBITS.fewest),
  );
  return room.slice(0, Math.max(1, held));
}

/**
 * The orbit the profile points to, around this star. SystemSpec 5.2.1.
 *
 * The planet spec 6.15 already derives an orbital distance from a profile and a
 * star, and this asks it rather than working out a second opinion about where a
 * world of that description belongs. One derivation, read in two places.
 */
function wantedAu(seed: string, uwp: string, luminosity: number): number {
  return planetDetail(seed, uwp, { luminosity }).orbitAu;
}

/** The orbit nearest a wanted distance, measured the way orbits are spaced. */
function nearestOrbit<T extends { au: number }>(orbits: readonly T[], wanted: number): T {
  let best = orbits[0]!;
  let bestGap = Infinity;
  for (const orbit of orbits) {
    // Compared as a ratio rather than a difference: the gap from 0.7 to 1.0 is
    // the same step as the gap from 20 to 30, and a difference would put every
    // world in the outermost orbit it could reach.
    const gap = Math.abs(Math.log(orbit.au / wanted));
    if (gap < bestGap) {
      best = orbit;
      bestGap = gap;
    }
  }
  return best;
}

/** An ordering of indexes fixed by the seed, so a choice among several is stable. */
function shuffled(seed: string, stream: string, of: readonly number[]): number[] {
  return [...of]
    .map((value, index) => ({ value, at: valueFor(`${seed}:system:${stream}`, index) }))
    .sort((a, b) => a.at - b.at)
    .map(({ value }) => value);
}

/**
 * A whole system from its seed.
 *
 * The order is SystemSpec 3.3: roll the star, lay out its orbits, find the
 * habitable zone, then fill the orbits. The main world goes in first because
 * section 5 decides where it belongs and section 4 works around it.
 *
 * The date comes in as days from the epoch and touches none of that. What is in
 * the system is the seed's alone, under 1.2; where round its orbit each of it
 * has got to is 3.5, and that is the only thing `atDay` decides.
 */
export function generateSystem(
  seed: string,
  given?: Stars,
  atDay = 0,
  givenPbg?: Pbg,
  givenUwp?: string,
): StarSystem {
  // The stars the seed rolls, unless the referee has said otherwise. A different
  // star is a different system: it lights different orbits, so everything from
  // the habitable zone outwards is laid out again rather than patched.
  const stars = given ?? starsFor(seed);
  // What the orbits are lit by, which is both stars where the companion is
  // inside them all and the primary alone where it is outside them all.
  const luminosity = systemLuminosity(stars);
  const laid = discOrbitsFor(seed, luminosity);
  const worldSeed = mainWorldSeed(seed);
  // The profile the level above says is here, where it has said. It has to be
  // known now rather than laid over the finished system, because the main
  // world's profile decides three things about the layout: whether the orbit
  // holds a belt or a world, how far out it wants to be, and whether it
  // belongs in the habitable zone. A world built from one profile and then
  // relabelled with another is a system that disagrees with itself - a size 0
  // main world drawn as a world, with the subsector above calling it an
  // asteroid belt, which is what it is.
  const uwp = givenUwp !== undefined && parseUwp(givenUwp) !== null ? givenUwp : rollUwp(worldSeed);
  // The figures the seed rolls, unless the level above has them. Unlike the
  // profile, which is laid over the finished system, this has to be known
  // before the orbits are filled: it says how many belts and gas giants there
  // are to place, and a world that arrives with three gas giants should have
  // three to refuel at rather than whatever its seed felt like.
  const pbg = givenPbg ?? pbgFor(worldSeed, uwp);

  // A world with water and breathable air goes in the habitable zone where the
  // star has one, and takes the orbit nearest what its profile asks for within
  // it. SystemSpec 5.2: the zone is drawn on the diagram, and a world of that
  // description sitting one slot outside the band reads as a mistake whatever
  // the arithmetic behind it was.
  const wanted = wantedAu(worldSeed, uwp, luminosity);
  const zone = laid.filter((orbit) => orbit.habitable);
  const home =
    wantsTheZone(parseUwp(uwp)) && zone.length > 0
      ? nearestOrbit(zone, wanted)
      : nearestOrbit(laid, wanted);
  const content = new Map<number, OrbitContent>();
  // A main world whose size digit is zero is a belt, and the orbit it went into
  // holds that belt rather than a world and a belt separately. SystemSpec 4.3.
  content.set(
    home.index,
    parseUwp(uwp)?.size === 0
      ? { kind: "belt", main: true, seed: worldSeed, uwp }
      : { kind: "world", main: true, seed: worldSeed, uwp },
  );

  // The counts are the subsector's, under SystemSpec 1.6.3, and this level places
  // exactly that many rather than rolling its own opinion of how many there are.
  const free = laid.filter((orbit) => orbit.index !== home.index);
  const outer = free.filter((orbit) => orbit.sunEquivalentAu >= SNOW_LINE).map((o) => o.index);
  const inner = free.filter((orbit) => orbit.sunEquivalentAu < SNOW_LINE).map((o) => o.index);

  // Gas giants form outside the snow line, so they take the outer orbits and
  // fall back on the inner ones only where a small star has none to give.
  const homeProfileForMoons = parseUwp(uwp);
  for (const index of [...shuffled(seed, "giants", outer), ...shuffled(seed, "giants-in", inner)]) {
    if (countOf(content, "giant") >= pbg.gasGiants) break;
    const at = laid.find((orbit) => orbit.index === index)!;
    content.set(index, {
      kind: "giant",
      ...giantSize(seed, index),
      moons: moonsFor(seed, index, at.sunEquivalentAu, homeProfileForMoons),
    });
  }
  // A belt is where a world would have formed and did not, which is any orbit
  // still empty. SystemSpec 4.2.
  for (const index of shuffled(seed, "belts", [...inner, ...outer])) {
    if (countOf(content, "belt") >= pbg.belts) break;
    if (content.has(index)) continue;
    content.set(index, { kind: "belt" });
  }

  // Everything still empty may hold a world of its own. SystemSpec 4.4 and 6.1:
  // the orbits the subsector's figures did not claim are where the rest of a system
  // is, and most of what is there is rock nobody has been to.
  const homeProfile = parseUwp(uwp);
  for (const orbit of laid) {
    if (content.has(orbit.index)) continue;
    if (!holdsWorld(seed, orbit.index)) continue;
    const worldSeed = orbitWorldSeed(seed, orbit.index);
    content.set(orbit.index, {
      kind: "world",
      main: false,
      seed: worldSeed,
      uwp: satelliteUwp(worldSeed, orbit.sunEquivalentAu, homeProfile),
    });
  }

  const orbits = laid.map((orbit) => ({
    ...orbit,
    content: content.get(orbit.index) ?? { kind: "empty" as const },
  }));

  return {
    seed,
    stars,
    orbits,
    atDay,
    pbg,
    bases: { letter: basesFor(worldSeed, parseUwp(uwp)!), orbitIndex: home.index },
    zone: zoneFor(worldSeed, parseUwp(uwp)!),
    placed: { belts: countOf(content, "belt"), gasGiants: countOf(content, "giant") },
    mainWorld: {
      seed: worldSeed,
      uwp,
      orbitIndex: home.index,
      au: home.au,
      luminosity,
    },
  };
}

/**
 * What a system writes into a world it hands over. SystemSpec 1.6.2 and 5.2.2.
 *
 * These are the nullable settings of the planet spec 6.15, where null means the
 * rolled value stands and a value means somebody has overruled it. They travel
 * with the world in its own save, so a world lifted out of its system and opened
 * on its own is still the world that system made. SystemSpec 6.6.3.
 */
export function worldSettings(
  system: StarSystem,
  orbitIndex: number = system.mainWorld.orbitIndex,
): { orbitAu: number; luminosity: number } {
  const orbit = system.orbits.find((held) => held.index === orbitIndex);
  return {
    orbitAu: orbit?.au ?? system.mainWorld.au,
    luminosity: system.mainWorld.luminosity,
  };
}

/**
 * Every world in a system, the main one first. SystemSpec 6.2: each is a planet
 * of the planet spec, with its own seed and its own surface, and each opens the
 * same way.
 */
export function worldsOf(system: StarSystem): readonly {
  orbitIndex: number;
  au: number;
  main: boolean;
  seed: string;
  uwp: string;
}[] {
  return system.orbits
    .filter((orbit) => orbit.content.kind === "world")
    .map((orbit) => {
      const held = orbit.content as { main: boolean; seed: string; uwp: string };
      return { orbitIndex: orbit.index, au: orbit.au, ...held };
    })
    .sort((a, b) => Number(b.main) - Number(a.main) || a.orbitIndex - b.orbitIndex);
}

/**
 * The world an orbit holds, planet or belt, or null where it holds neither.
 *
 * A belt is usually nobody's, and then it has no profile and nothing to open.
 * Where the belt is the main world it carries one, and everything that reads a
 * profile off an orbit has to find it there too - otherwise the same body is a
 * world to the subsector above and a rock to the system. SystemSpec 4.3.2.
 */
export function worldIn(
  content: OrbitContent,
): { main: boolean; seed: string; uwp: string } | null {
  if (content.kind === "world") {
    return { main: content.main, seed: content.seed, uwp: content.uwp };
  }
  if (content.kind === "belt" && content.seed !== undefined && content.uwp !== undefined) {
    return { main: content.main === true, seed: content.seed, uwp: content.uwp };
  }
  return null;
}

/**
 * How long a body in an orbit takes to go round, in days. SystemSpec 3.5.2.
 *
 * One function rather than two, because the panel states this as a body's year
 * and the model turns the body at it, and a diagram going round at a speed the
 * panel beside it disagrees with is two systems. The light is the light the
 * orbits were laid out against, which is both stars where the companion is
 * inside them all.
 */
export function periodDaysOf(system: StarSystem, orbitAu: number): number {
  return orbitalPeriodHours(orbitAu, system.mainWorld.luminosity) / 24;
}

/**
 * Where a body sits round its orbit, in radians. SystemSpec 3.5.
 *
 * The seed fixes where everything was at the epoch, and the date turns each
 * body on from there by however much of its own year has gone by. So the seed
 * still decides the arrangement - two worlds at similar distances are a short
 * hop or a long haul apart because of it - and the date decides which
 * arrangement, out of the ones that seed ever has.
 *
 * Prograde, all of them, because a disc goes round the way it fell in.
 */
export function angleOf(system: StarSystem, orbitIndex: number): number {
  const seeded = valueFor(`${system.seed}:where`, orbitIndex) * Math.PI * 2;
  if (system.atDay === 0) return seeded;
  const orbit = system.orbits.find((held) => held.index === orbitIndex);
  if (orbit === undefined) return seeded;
  return seeded + (system.atDay / periodDaysOf(system, orbit.au)) * Math.PI * 2;
}

/** Where a body is, in AU, with the star at the origin. */
export function positionAu(system: StarSystem, orbitIndex: number): { x: number; y: number } {
  const orbit = system.orbits.find((held) => held.index === orbitIndex);
  if (orbit === undefined) return { x: 0, y: 0 };
  const angle = angleOf(system, orbitIndex);
  return { x: Math.cos(angle) * orbit.au, y: Math.sin(angle) * orbit.au };
}

/**
 * How far out the primary's jump shadow reaches, in AU. SystemSpec 4.8.
 *
 * Both stars of a close pair sit inside it together, near enough: a companion
 * riding beside the primary is well within a hundred diameters of it, and a
 * shadow drawn round each would be one shadow drawn twice.
 */
export function starShadowAu(system: StarSystem): number {
  return kmToAu(jumpShadowKm(diameterKm(system.stars.primary)));
}

/** The moons of the gas giant in an orbit, or none where there is no giant. */
export function moonsOf(system: StarSystem, orbitIndex: number): readonly Moon[] {
  const orbit = system.orbits.find((held) => held.index === orbitIndex);
  return orbit !== undefined && orbit.content.kind === "giant" ? orbit.content.moons : [];
}

/**
 * Which slot a body is in, counting outward from one. SystemSpec 7.2.
 *
 * The orbit's own number rather than a count of the bodies in front of it, so a
 * designation says where a body is and not how many things happen to lie inside
 * it. Two consequences, both of them wanted: the numbers skip where an orbit is
 * empty, which is how a real catalogue of a system reads, and a body's name
 * cannot change because something was added or taken away nearer the star.
 *
 * Planets and belts share the numbering, since they share the slots: one orbit
 * holds one thing, so a belt and a planet can never collide on a number.
 */
export function ordinalOf(
  system: StarSystem,
  orbitIndex: number,
): { kind: "planet" | "belt" | "none"; n: number } {
  const orbit = system.orbits.find((held) => held.index === orbitIndex);
  if (orbit === undefined) return { kind: "none", n: 0 };
  const kind = orbit.content.kind;
  // Slots are numbered from zero inside the generator and from one everywhere a
  // person reads them: nothing is anybody's nought planet.
  const n = orbit.index + 1;
  if (kind === "world" || kind === "giant") return { kind: "planet", n };
  if (kind === "belt") return { kind: "belt", n };
  return { kind: "none", n: 0 };
}

/**
 * What a planet of a system is called, before anybody names it. SystemSpec 7.2:
 * the system's name, a hyphen, and which planet it is, which is also the stem
 * every file of that world is saved under at the app spec 4.2.1.
 */
export function worldName(systemName: string, planet: number): string {
  return `${systemName}-${planet}`;
}

/**
 * The names of the places in a system that anybody lives on. SystemSpec 7.3.
 *
 * People name where they live, and a numbered rock is a rock nobody stayed on.
 * So every inhabited body gets a name of its own, and everything else keeps the
 * number that says where it is and nothing more.
 *
 * Drawn in one go from the naming machinery of the planet spec 6.24.6, which
 * picks one flavour and then makes as many names as are asked for without
 * repeating itself. One system, one way of naming things, and no two places in
 * it called the same.
 *
 * Not everywhere people live has one. A place is named by the people who stayed
 * there, and a few dozen of them working a rock have rarely bothered: it was
 * Corrise-8b when they landed and nobody ever called it anything else. So the
 * bigger the population the likelier the name, and an outpost usually keeps its
 * designation. SystemSpec 7.3.4.
 *
 * The first name drawn is the system's, which is its main world's under 7.1:
 * a system is named for the world people mean when they say its name, whether
 * or not the main world is the only inhabited one.
 */
export interface SystemNames {
  /** The system's name, which is its main world's. */
  readonly system: string;
  /** The name of the world in an orbit, where anybody lives there. */
  readonly worlds: ReadonlyMap<number, string>;
  /** The name of a moon, keyed by its orbit and its own number. */
  readonly moons: ReadonlyMap<string, string>;
}

/** How a moon is keyed in SystemNames. */
export function moonKey(orbitIndex: number, moon: number): string {
  return `${orbitIndex}:${moon}`;
}

export function namesOf(system: StarSystem, given?: string): SystemNames {
  const worlds = new Map<number, string>();
  const moons = new Map<string, string>();

  // Everywhere anybody lives, outward, and whether the people there ever gave
  // the place a name of its own.
  const main = system.mainWorld.orbitIndex;
  const named: { orbit: number; moon: number | null }[] = [];
  for (const orbit of system.orbits) {
    const content = orbit.content;
    // The main world always has a name: it is the reason anybody came to the
    // system, and the system is called after it. SystemSpec 7.3.4.1.
    if (orbit.index === main) continue;
    const held = worldIn(content);
    if (held !== null && wasNamed(system.seed, held.uwp, orbit.index, null)) {
      named.push({ orbit: orbit.index, moon: null });
    }
    if (content.kind !== "giant") continue;
    for (const moon of content.moons) {
      if (wasNamed(system.seed, moon.uwp, orbit.index, moon.index)) {
        named.push({ orbit: orbit.index, moon: moon.index });
      }
    }
  }

  // One more name than there are named places: the first is the system's, and
  // the main world's. A subsector above can hand that one down, since the subsector is
  // what named the world in the first place - SubSectorSpec 3.4 - and a world
  // must not be called two things depending on which level is looking at it.
  const drawn = settlementNames(`${system.seed}:names`, named.length + 1);
  const name = given !== undefined && given.trim() !== "" ? given.trim() : (drawn[0] ?? system.seed);
  worlds.set(main, name);
  named.forEach((place, at) => {
    const held = drawn[at + 1] ?? `${name}-${at + 1}`;
    if (place.moon === null) worlds.set(place.orbit, held);
    else moons.set(moonKey(place.orbit, place.moon), held);
  });
  return { system: name, worlds, moons };
}

/**
 * How likely a place with people on it is to have a name of its own rather than
 * the designation it was given before anybody went there. SystemSpec 7.3.4.
 *
 * A world with millions on it has been called something for centuries. A mining
 * crew of forty has a contract number and a shift rota, and the subsector said
 * Corrise-8b.
 */
const NAMED_AT_ALL = 0.15;
const NAMED_PER_DIGIT = 0.1;
const NAMED_AT_MOST = 0.95;

function wasNamed(seed: string, uwp: string, orbitIndex: number, moon: number | null): boolean {
  const profile = parseUwp(uwp);
  if (profile === null || profile.population === 0) return false;
  const chance = Math.min(
    NAMED_AT_MOST,
    NAMED_AT_ALL + NAMED_PER_DIGIT * profile.population,
  );
  const stream = moon === null ? "named" : `named-moon-${moon}`;
  return valueFor(`${seed}:${stream}`, orbitIndex) < chance;
}

/** What a belt is called. Belts are counted apart from planets. SystemSpec 7.4. */
export function beltName(systemName: string, belt: number): string {
  return `${systemName} Belt-${belt}`;
}

function countOf(content: Map<number, OrbitContent>, kind: OrbitContent["kind"]): number {
  let count = 0;
  for (const held of content.values()) if (held.kind === kind) count++;
  return count;
}

/**
 * The moons of the gas giant in one orbit. SystemSpec 4.6.
 *
 * Each is a world of its own rather than a tally, because a gas giant's moon is
 * one of the places people live: it has the gravity, it has the ices, and it is
 * a fuel stop with a view of the primary. 4.5.1.
 */
function moonsFor(
  seed: string,
  index: number,
  sunEquivalentAu: number,
  main: Uwp | null,
): readonly Moon[] {
  const count = Math.floor(valueFor(`${seed}:system:moons`, index) * 12) + 1;
  return Array.from({ length: count }, (_, at) => {
    const moon = at + 1;
    const held = moonSeed(seed, index, moon);
    return { index: moon, seed: held, uwp: moonUwp(held, sunEquivalentAu, main) };
  });
}
