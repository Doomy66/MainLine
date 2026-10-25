import { parseUwp, type Uwp } from "../planet";
import { valueFor } from "./rng";

/**
 * The trade classifications a UWP earns, and the population multiplier, belts and
 * gas giants that travel beside it. Spec 6.16.
 *
 * These are read off the digits rather than rolled: a world either meets a
 * classification's conditions or it does not, and the same profile always earns
 * the same list. That is what makes them safe to write into an export, where the
 * reader has the UWP in front of them and would notice the two disagreeing.
 *
 * PBG is the one part of a sector line PlanetHex has nothing to say about. No
 * belt, gas giant, or population multiplier is anywhere in the surface, so rather
 * than write zeroes and call them data, the three are drawn from the seed the way
 * everything else about a world is. The same seed brings the same figures, and
 * anyone who wants different ones can type over them where they land.
 */

export interface TradeCode {
  readonly code: string;
  readonly label: string;
}

/**
 * One classification: its two letter code, its name, and the test a profile has
 * to pass. Written as a predicate each rather than as a table of ranges, because
 * several of them read a digit only when another digit allows it.
 */
interface Classification extends TradeCode {
  readonly holds: (w: Uwp) => boolean;
}

const between = (value: number, low: number, high: number): boolean =>
  value >= low && value <= high;

const CLASSIFICATIONS: readonly Classification[] = [
  {
    code: "Ag",
    label: "Agricultural",
    holds: (w) =>
      between(w.atmosphere, 4, 9) && between(w.hydrographics, 4, 8) && between(w.population, 5, 7),
  },
  {
    code: "As",
    label: "Asteroid",
    holds: (w) => w.size === 0 && w.atmosphere === 0 && w.hydrographics === 0,
  },
  {
    code: "Ba",
    label: "Barren",
    holds: (w) => w.population === 0 && w.government === 0 && w.law === 0,
  },
  {
    code: "De",
    label: "Desert",
    holds: (w) => between(w.atmosphere, 2, 9) && w.hydrographics === 0,
  },
  {
    code: "Fl",
    label: "Fluid oceans",
    holds: (w) => w.atmosphere >= 10 && w.hydrographics >= 1,
  },
  {
    code: "Ga",
    label: "Garden",
    holds: (w) =>
      between(w.size, 6, 8) &&
      (w.atmosphere === 5 || w.atmosphere === 6 || w.atmosphere === 8) &&
      between(w.hydrographics, 5, 7),
  },
  { code: "Hi", label: "High population", holds: (w) => w.population >= 9 },
  { code: "Ht", label: "High technology", holds: (w) => w.tech >= 12 },
  {
    code: "IC",
    label: "Ice-capped",
    holds: (w) => between(w.atmosphere, 0, 1) && w.hydrographics >= 1,
  },
  {
    code: "In",
    label: "Industrial",
    holds: (w) => [0, 1, 2, 4, 7, 9].includes(w.atmosphere) && w.population >= 9,
  },
  { code: "Lo", label: "Low population", holds: (w) => between(w.population, 1, 3) },
  { code: "Lt", label: "Low technology", holds: (w) => w.population >= 1 && w.tech <= 5 },
  {
    code: "Na",
    label: "Non-agricultural",
    holds: (w) =>
      between(w.atmosphere, 0, 3) && between(w.hydrographics, 0, 3) && w.population >= 6,
  },
  { code: "NI", label: "Non-industrial", holds: (w) => between(w.population, 4, 6) },
  {
    code: "Po",
    label: "Poor",
    holds: (w) => between(w.atmosphere, 2, 5) && between(w.hydrographics, 0, 3),
  },
  {
    code: "Ri",
    label: "Rich",
    holds: (w) =>
      (w.atmosphere === 6 || w.atmosphere === 8) &&
      between(w.population, 6, 8) &&
      between(w.government, 4, 9),
  },
  { code: "Va", label: "Vacuum", holds: (w) => w.atmosphere === 0 },
  { code: "Wa", label: "Water world", holds: (w) => w.hydrographics === 10 },
];

/** Every classification the profile earns, in the order above. */
export function tradeCodes(uwp: string): TradeCode[] {
  const parsed = parseUwp(uwp);
  if (parsed === null) return [];
  return CLASSIFICATIONS.filter((c) => c.holds(parsed)).map(({ code, label }) => ({ code, label }));
}

/** Population multiplier, planetoid belts, and gas giants. */
export interface Pbg {
  readonly multiplier: number;
  readonly belts: number;
  readonly gasGiants: number;
}

/**
 * The PBG figures for a world. Drawn from the seed, as the comment at the head of
 * this file explains, and clamped to the ranges a sector line can hold in one
 * digit each.
 *
 * A world with nobody on it has a multiplier of zero, since the multiplier
 * multiplies the population digit and a tenth of nobody is still nobody.
 *
 * A world whose size digit is zero is itself an asteroid belt, so the system it
 * is in has at least one: the belt count cannot be zero where the main world is
 * one of them. SystemSpec 4.3.1.
 */
export function pbgFor(seed: string, uwp: string): Pbg {
  const parsed = parseUwp(uwp);
  const die = (index: number, sides: number) =>
    Math.floor(valueFor(`${seed}:pbg`, index) * sides);
  const belts = die(1, 4);
  return {
    multiplier: parsed === null || parsed.population === 0 ? 0 : die(0, 9) + 1,
    belts: parsed?.size === 0 ? Math.max(1, belts) : belts,
    gasGiants: die(2, 6),
  };
}

/** PBG as the three digits a sector line carries. */
export function formatPbg(pbg: Pbg): string {
  return `${pbg.multiplier}${pbg.belts}${pbg.gasGiants}`;
}

/**
 * The three digits read back off the column, or undefined where they are not
 * three digits.
 *
 * Half a figure is not applied, for the same reason half a UWP is not: the
 * referee is mid-typing, and a system should not lose its gas giants to a
 * keystroke.
 */
export function parsePbg(written: string | undefined): Pbg | undefined {
  if (written === undefined) return undefined;
  const digits = written.trim();
  if (!/^[0-9A-F]{3}$/i.test(digits)) return undefined;
  const value = (at: number) => parseInt(digits[at]!, 16);
  return { multiplier: value(0), belts: value(1), gasGiants: value(2) };
}
