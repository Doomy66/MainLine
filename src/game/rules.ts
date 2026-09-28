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

/**
 * Jump tenders: ships hired to carry craft with no jump drive of their own
 * through jump, as a tender carries battle riders. Only a class A or B starport
 * has them for hire, and they are rated jump-3.
 */
export const TENDER_JUMP = 3;

/**
 * What a tender charges, MCr a ton carried for one jump of so many parsecs:
 * Traveller's freight rates, Cr1000 a ton for a parsec rising to Cr32000 for six.
 */
const FREIGHT_MCR_PER_TON = [0, 0.001, 0.0016, 0.0026, 0.0044, 0.0085, 0.032];

export function tenderCost(tons: number, parsecs: number): number {
  return tons * (FREIGHT_MCR_PER_TON[Math.max(0, Math.min(6, Math.ceil(parsecs)))] ?? 0.032);
}

/** Whether tenders can be hired at a world: a class A or B port that will deal with you. */
export function hiresTenders(world: World, hostileOwner: boolean): boolean {
  return !hostileOwner && (world.uwp.starport === "A" || world.uwp.starport === "B");
}

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
  if (population === 0 || tl < 7) return hasNavalBase(world) ? 300 : 0;
  return Math.round(population * 60 * (1 + tl / 10) + (hasNavalBase(world) ? 300 : 0));
}

/** Armour of the defences: rock, and as much of it as the world can pour. */
export function defenceArmour(world: World): number {
  return Math.min(15, Math.floor(world.uwp.tl * 0.8));
}

/**
 * What the defences shoot with, by tech level. A world gets a battery for every
 * population digit over three, three more for a naval base and one for a scout
 * base. The weapon is the best a world of its TL could mount in the ground.
 * A world is a fortress: it takes a squadron, not a pair of cruisers, to
 * silence one with a billion people on it.
 */
export function defenceAttacks(world: World): Attack[] {
  const { population, tl } = world.uwp;
  const batteries =
    Math.max(0, population - 3) + (hasNavalBase(world) ? 3 : 0) + (hasScoutBase(world) ? 1 : 0);
  if (batteries === 0 || tl < 7) return [];
  const base = { ap: 0, count: batteries, perSalvo: 1, heavy: false, laser: false, radiation: false, meson: false, ion: false, vsShips: 0 };
  if (tl >= 14) return [{ ...base, label: "Meson battery", dice: 5, multiple: 10, ap: Infinity, heavy: true, meson: true }];
  // Barbette-sized at TL12-13: hard to crack, not a wall. The bay-sized meson
  // battery at TL14 and up is the deep-site meson gun of Traveller's setting.
  if (tl >= 12) return [{ ...base, label: "Particle battery", dice: 6, multiple: 3, radiation: true }];
  if (tl >= 11) return [{ ...base, label: "Particle barbette battery", dice: 4, multiple: 3, radiation: true }];
  if (tl >= 9) return [{ ...base, label: "Laser battery", dice: 2, multiple: 1, count: batteries * 3, laser: true }];
  return [{ ...base, label: "Missile battery", dice: 4, multiple: 1, count: batteries * 2, ordnance: "missile" }];
}

/**
 * Fire control of a world's ground batteries. The rules give planets no fire
 * control software, so this is ours, and kept modest: a world's guns are big and
 * buried, not uncannily accurate.
 */
export function defenceFireControl(world: World): number {
  const tl = world.uwp.tl;
  return tl >= 12 ? 2 : tl >= 10 ? 1 : 0;
}

/**
 * How many system defence boats a world keeps: one for every two population
 * digits over three, from population 5, and two more at a naval base. High
 * Guard puts a world's defence in its planetary navy, 200- to 500-ton boats
 * that, carrying no jump drive or fuel, can beat a starship of their size and
 * more (page 4). A world below TL9 has none.
 */
export function navySize(world: World): number {
  const { population, tl } = world.uwp;
  if (population === 0 || tl < 9) return 0;
  return (population >= 5 ? Math.floor((population - 3) / 2) : 0) + (hasNavalBase(world) ? 2 : 0);
}

/** A planetary navy's lost boats are replaced one a week; the damaged mend a fifth a day. */
export const NAVY_REPAIR = 0.2;

/** Days a world must be held, its defences silenced, before it submits. */
export function captureDays(world: World): number {
  if (world.uwp.population === 0) return 1;
  return 2 + Math.ceil(world.uwp.population / 2);
}

/** Days of disorder after a capital falls. */
export const DISORDER_DAYS = 28;

/** Share of its income a faction in disorder still collects. */
export const DISORDER_INCOME = 0.25;

/**
 * The chance a world breaks away when its faction's capital falls: a tenth, and
 * more the further it is from the new capital and the less its law holds it.
 */
export function breakawayChance(world: World, parsecsFromCapital: number): number {
  const lawless = world.uwp.law <= 3 ? 0.1 : 0;
  return Math.min(0.6, 0.1 + 0.03 * parsecsFromCapital + lawless);
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

/**
 * How many people live on a world: the population digit's power of ten times
 * the PBG's population multiplier (one where the sector gives none).
 */
export function people(world: World): number {
  if (world.uwp.population === 0) return 0;
  return Math.max(1, world.pbg.multiplier) * Math.pow(10, world.uwp.population);
}

/**
 * How many ships a yard can have on the slips at once, by starport class.
 * Orders beyond that wait their turn.
 */
export const SLIPS: Readonly<Record<string, number>> = { A: 3, B: 2, C: 1 };

export function slipsAt(world: World): number {
  return SLIPS[world.uwp.starport] ?? 0;
}

/** Ships this big, in tons, take any spare slips at their yard, built in modules on several at once. */
export const MODULAR_TONS = 1000;
/** Beyond this many days on the slips, a ship is built in modules at once. */
export const MODULAR_FROM = 30;
/** How hard modular building shortens the time beyond MODULAR_FROM: time grows as its power. */
export const MODULAR_POWER = 0.4;

/**
 * Days a class takes on the slips, under the game's shipyard speed. The book's
 * day per MCr would keep a capital ship on the slips for years; High Guard lets
 * very large ships be built in modules side by side, cutting the time by up to
 * 90%. So time beyond a month grows only as its 0.4th power: a corvette takes
 * five weeks, a 5,000-ton carrier three months, an Azhanti seven and a half.
 */
export function buildDaysFor(cls: ShipClass, buildSpeed: number): number {
  const days = cls.buildDays * buildSpeed;
  const modular = days <= MODULAR_FROM ? days : MODULAR_FROM * Math.pow(days / MODULAR_FROM, MODULAR_POWER);
  return Math.max(7, Math.ceil(modular));
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
