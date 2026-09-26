/**
 * The game's own rules: what a world is worth, how hard it is to take, where a
 * ship can buy fuel and be built, and the calendar. The ships' rules are High
 * Guard's and live in the design engine; these are the strategic layer over
 * the top, and each says where it leans on Traveller.
 */

import type { World } from "../sector/sec";
import type { Attack, ShipClass } from "../catalogue/shipclass";
import type { Loc } from "./types";

/** A jump takes a week, as it always has: 148 + 6D hours, called seven days. */
export const JUMP_DAYS = 7;

/** A rough jump on unrefined fuel adds this many dice of days. */
export const ROUGH_JUMP_CHANCE_ON_2D = 4;

/** Fuel for a jump is a tenth of the hull per parsec. High Guard page 19. */
export function jumpFuel(tons: number, parsecs: number): number {
  return 0.1 * tons * parsecs;
}

/** MCr a ton: Cr500 refined, Cr100 unrefined. Core Rulebook, starport fuel. */
export const REFINED_FUEL_MCR = 0.0005;
export const UNREFINED_FUEL_MCR = 0.0001;

/** MCr for one missile or torpedo when reloading: the book's bundle prices. */
export const MISSILE_MCR = 0.25 / 12;
export const TORPEDO_MCR = 0.15 / 3;

/** Combat rounds fought in a day of battle. */
export const ROUNDS_PER_DAY = 3;

/* Calendar ---------------------------------------------------------------- */

export const START_YEAR = 1105;

/** The Imperial date of a game day, day 1 being 001-1105. */
export function imperialDate(day: number): string {
  const n = Math.max(0, day - 1);
  const year = START_YEAR + Math.floor(n / 365);
  const of = (n % 365) + 1;
  return `${String(of).padStart(3, "0")}-${year}`;
}

/** Income and upkeep fall on the last day of each week. */
export function isWeekEnd(day: number): boolean {
  return day > 0 && day % 7 === 0;
}

/* Worlds ------------------------------------------------------------------ */

const PORT_WEALTH: Readonly<Record<string, number>> = { A: 1.2, B: 1.1, C: 1, D: 0.9, E: 0.8, X: 0.6 };

/**
 * MCr a week a world pays its owner.
 *
 * Doubling with each population digit above three, scaled by tech level and
 * starport, and nudged by the trade codes that say a world is rich, industrial
 * or poor. A billion people at TL12 with a class A port pay about MCr35 a week,
 * which buys a Patrol Corvette in five; a mining camp of a thousand pays almost
 * nothing, and is worth holding for its fuel.
 */
export function income(world: World): number {
  const p = world.uwp.population;
  if (p === 0) return 0;
  let value = 0.3 * Math.pow(2, p - 3);
  value *= 0.5 + world.uwp.tl / 12;
  value *= PORT_WEALTH[world.uwp.starport] ?? 1;
  if (world.trade.includes("Ri")) value *= 1.4;
  if (world.trade.includes("In")) value *= 1.3;
  if (world.trade.includes("Ag")) value *= 1.1;
  if (world.trade.includes("Po")) value *= 0.7;
  return Math.round(value * 100) / 100;
}

export function hasNavalBase(world: World): boolean {
  return /N/.test(world.bases);
}

export function hasScoutBase(world: World): boolean {
  return /S/.test(world.bases);
}

/**
 * Hull points of a world's defences: batteries, bunkers and the local system
 * defence boats, all counted as one target. More people and more technology
 * build more of it; a naval base adds a squadron's worth.
 */
export function defenceMax(world: World): number {
  const { population, tl } = world.uwp;
  if (population === 0 || tl < 7) return hasNavalBase(world) ? 200 : 0;
  return Math.round(population * 20 * (1 + tl / 10) + (hasNavalBase(world) ? 200 : 0));
}

/** Armour of the defences: rock, and as much of it as the world can pour. */
export function defenceArmour(world: World): number {
  return Math.min(15, Math.floor(world.uwp.tl * 0.8));
}

/**
 * What the defences shoot with, by tech level. A world gets a battery for every
 * population digit over four, three more for a naval base and one for a scout
 * base. The weapon is the best a world of its TL could mount in the ground.
 */
export function defenceAttacks(world: World): Attack[] {
  const { population, tl } = world.uwp;
  const batteries =
    Math.max(0, population - 4) + (hasNavalBase(world) ? 3 : 0) + (hasScoutBase(world) ? 1 : 0);
  if (batteries === 0 || tl < 7) return [];
  const base = { ap: 0, count: batteries, perSalvo: 1, heavy: false, laser: false, radiation: false, meson: false, ion: false };
  if (tl >= 14) return [{ ...base, label: "Meson battery", dice: 5, multiple: 10, ap: Infinity, heavy: true, meson: true }];
  if (tl >= 12) return [{ ...base, label: "Particle beam battery", dice: 6, multiple: 10, heavy: true, radiation: true }];
  if (tl >= 11) return [{ ...base, label: "Particle barbette battery", dice: 4, multiple: 3, radiation: true }];
  if (tl >= 9) return [{ ...base, label: "Laser battery", dice: 2, multiple: 1, count: batteries * 3, laser: true }];
  return [{ ...base, label: "Missile battery", dice: 4, multiple: 1, count: batteries * 2, ordnance: "missile" }];
}

/** Days a world must be held, its defences silenced, before it submits. */
export function captureDays(world: World): number {
  if (world.uwp.population === 0) return 1;
  return 2 + Math.ceil(world.uwp.population / 2);
}

/** Defences rebuild a tenth of their strength a day when nobody is shooting at them. */
export const DEFENCE_REGEN = 0.1;

/** A captured world's defences start at a quarter. */
export const CAPTURED_DEFENCE = 0.25;

/* Fuel -------------------------------------------------------------------- */

export interface FuelSource {
  readonly loc: Loc;
  readonly refined: boolean;
  /** MCr a ton. */
  readonly price: number;
  readonly label: string;
}

/**
 * Where a ship of a class can fill its tanks in a system, best first. Starports
 * sell to anyone who is not at war with the world's owner; gas giants and oceans
 * are free to a ship built to use them.
 */
export function fuelSources(world: World, cls: ShipClass, hostileOwner: boolean): FuelSource[] {
  const out: FuelSource[] = [];
  const port = world.uwp.starport;
  if (!hostileOwner && (port === "A" || port === "B")) {
    out.push({ loc: "main", refined: true, price: REFINED_FUEL_MCR, label: `refined fuel at the class ${port} starport` });
  }
  if (world.pbg.giants > 0 && cls.canSkim) {
    out.push({ loc: "gg", refined: false, price: 0, label: "skimmed from the gas giant" });
  }
  if (world.uwp.hydrographics > 0 && cls.canWaterRefuel && !hostileOwner) {
    out.push({ loc: "main", refined: false, price: 0, label: "water taken from the oceans" });
  }
  if (!hostileOwner && (port === "C" || port === "D")) {
    out.push({ loc: "main", refined: false, price: UNREFINED_FUEL_MCR, label: `unrefined fuel at the class ${port} starport` });
  }
  return out;
}

/* Shipyards and repairs ---------------------------------------------------- */

/**
 * Whether a world's yard can build a class. Class A builds starships, class B
 * spacecraft without a jump drive, class C small craft under a hundred tons,
 * and nothing is built above the world's own tech level.
 */
export function canBuildAt(world: World, cls: ShipClass): boolean {
  if (cls.tl > world.uwp.tl) return false;
  switch (world.uwp.starport) {
    case "A":
      return true;
    case "B":
      return cls.jump === 0;
    case "C":
      return cls.tons < 100;
    default:
      return false;
  }
}

/** Why a world cannot build a class, for the shipyard to say. */
export function whyNotBuild(world: World, cls: ShipClass): string {
  if (cls.tl > world.uwp.tl) return `needs TL${cls.tl}; ${world.name} is TL${world.uwp.tl}`;
  switch (world.uwp.starport) {
    case "A":
      return "";
    case "B":
      return cls.jump === 0 ? "" : "a class B yard builds nothing with a jump drive";
    case "C":
      return cls.tons < 100 ? "" : "a class C yard builds small craft only";
    default:
      return `a class ${world.uwp.starport} starport has no shipyard`;
  }
}

/**
 * An independent world's yard builds for anyone, at a markup. A faction with no
 * yard of its own is not locked out of the game, only made to pay for it.
 */
export const FOREIGN_YARD_MARKUP = 1.2;

/** What a class costs at a yard, to a faction that does or does not own it. */
export function yardPrice(cls: ShipClass, own: boolean): number {
  return own ? cls.cost : cls.cost * FOREIGN_YARD_MARKUP;
}

/** Share of a ship's hull repaired in a day at an owned starport, by class. */
export function repairRate(port: string): number {
  return { A: 0.2, B: 0.2, C: 0.1, D: 0.05 }[port] ?? 0;
}

/** Whether a port can put right a critical hit, rather than patch the hull. */
export function fixesCrits(port: string): boolean {
  return port === "A" || port === "B" || port === "C";
}

/** Whether a port can reload missiles and torpedoes. */
export function reloads(port: string): boolean {
  return port === "A" || port === "B" || port === "C";
}
