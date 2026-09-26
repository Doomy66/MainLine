/**
 * A ship class: a design out of the Ship Designer and what the game needs to
 * know about it to move it, fuel it, fight it and pay for it.
 *
 * Nothing is typed in twice. Tonnage, hull points, armour, fuel, crew and price
 * come off `sheet(design)`; drives, weapons, software and sensors come off the
 * design's own choices and the High Guard tables the engine carries.
 */

import { sheet, type Sheet } from "../shipdesign/engine/sheet";
import type { Design, WeaponChoice } from "../shipdesign/engine/design";
import {
  BARBETTES,
  BAY_SIZES,
  BAY_WEAPONS,
  HULL_CONFIGURATIONS,
  MAGAZINES,
  BAY_AMMUNITION,
  POINT_DEFENCE,
  SENSORS,
  SPINAL_WEAPONS,
  TURRET_WEAPONS,
  DAMAGE_MULTIPLES,
} from "../shipdesign/rules/index";

/** One kind of attack a ship makes each combat round. */
export interface Attack {
  readonly label: string;
  /** Dice of damage, before the multiple. */
  readonly dice: number;
  /** High Guard's damage multiple: 1 turret, 3 barbette, 10/20/100 bays, 1,000 spinal. */
  readonly multiple: number;
  /** Armour ignored. Infinity for a meson weapon, which passes through armour altogether. */
  readonly ap: number;
  /** How many of these fire each round. */
  readonly count: number;
  /** Missiles or torpedoes: needs ammunition, can be shot down, and each one hits on its own. */
  readonly ordnance?: "missile" | "torpedo";
  /** Ordnance launched per attack. */
  readonly perSalvo: number;
  /** Bays and spinal mounts are clumsy against small targets. */
  readonly heavy: boolean;
  /** Lasers are what sand scatters. */
  readonly laser: boolean;
  readonly radiation: boolean;
  readonly meson: boolean;
  /** Ion weapons drain power rather than hole the hull, so they do half. */
  readonly ion: boolean;
}

export interface ShipClass {
  /** The file stem, which is how a ship names its class. */
  readonly id: string;
  readonly design: Design;
  readonly sheet: Sheet;
  readonly name: string;
  readonly notes: string;
  readonly tl: number;
  readonly tons: number;
  readonly hull: number;
  readonly armour: number;
  readonly thrust: number;
  readonly jump: number;
  /** Tons of fuel a ship of this class can hold for jumping. */
  readonly fuelCapacity: number;
  /** MCr. */
  readonly cost: number;
  /** MCr a week: maintenance and wages, which the sheet gives by the month. */
  readonly upkeep: number;
  /** Days to build, as the sheet gives it. */
  readonly buildDays: number;
  readonly attacks: readonly Attack[];
  readonly sandcasters: number;
  /** Dice of missiles a point defence battery removes from each salvo. */
  readonly pointDefence: number;
  readonly mesonScreen: number;
  readonly nuclearDamper: number;
  readonly fireControl: number;
  readonly evade: number;
  readonly sensorDm: number;
  readonly crew: number;
  readonly cargo: number;
  /** Skims a gas giant: a streamlined hull, or fuel scoops fitted. */
  readonly canSkim: boolean;
  /** Can set down in an ocean to take on water. */
  readonly canWaterRefuel: boolean;
  readonly fuelProcessor: boolean;
  readonly missiles: number;
  readonly torpedoes: number;
  readonly armed: boolean;
  /**
   * Fighter hangars, from the carried craft the design lists as fighters: how
   * many, and the tonnage each is built for. The fighters' price is in the
   * carrier's, so a carrier comes with them.
   */
  readonly hangars: readonly { readonly label: string; readonly slots: number; readonly tons: number }[];
  /** A rough measure of fighting value, for the AI and the fleet summary. */
  readonly strength: number;
}

/** "3D" to 3. Anything else, including "Special", is none. */
function dice(damage: string): number {
  const m = /^(\d+)D/.exec(damage);
  return m === null ? 0 : Number(m[1]);
}

function apOf(traits: readonly string[]): number {
  for (const t of traits) {
    if (t === "AP") return Infinity;
    const m = /^AP (\d+)$/.exec(t);
    if (m !== null) return Number(m[1]);
  }
  return 0;
}

function attackFrom(
  label: string,
  damage: string,
  traits: readonly string[],
  multiple: number,
  count: number,
  extra: Partial<Attack> = {},
): Attack {
  return {
    label,
    dice: dice(damage),
    multiple,
    ap: apOf(traits),
    count,
    perSalvo: 1,
    heavy: multiple >= 10,
    laser: /laser/i.test(label),
    radiation: traits.includes("Radiation"),
    meson: /meson/i.test(label),
    ion: traits.includes("Ion"),
    ...extra,
  };
}

interface Armament {
  attacks: Attack[];
  sandcasters: number;
  pointDefence: number;
  mesonScreen: number;
  nuclearDamper: number;
  missiles: number;
  torpedoes: number;
}

function armament(weapons: readonly WeaponChoice[], firmpoints: boolean): Armament {
  const out: Armament = {
    attacks: [],
    sandcasters: 0,
    pointDefence: 0,
    mesonScreen: 0,
    nuclearDamper: 0,
    missiles: 0,
    torpedoes: 0,
  };
  // Like weapons on like mounts are one attack line with a count, so a
  // triple turret of pulse lasers reads as three pulse lasers.
  const lines = new Map<string, Attack>();
  const add = (a: Attack) => {
    const key = `${a.label}|${a.multiple}`;
    const held = lines.get(key);
    lines.set(key, held === undefined ? a : { ...held, count: held.count + a.count });
  };
  for (const w of weapons) {
    const quantity = "quantity" in w && w.quantity !== undefined ? w.quantity : 1;
    switch (w.kind) {
      case "turret":
        for (const weapon of w.weapons ?? []) {
          const rule = TURRET_WEAPONS[weapon];
          if (weapon === "sandcaster") {
            out.sandcasters += quantity;
            continue;
          }
          if (weapon === "missileRack") {
            const held = firmpoints ? MAGAZINES.missileRack.firmpoint : MAGAZINES.missileRack.turret;
            out.missiles += held * quantity;
            add(attackFrom(rule.label, rule.damage, rule.traits, 1, quantity, { ordnance: "missile" }));
            continue;
          }
          add(attackFrom(rule.label, rule.damage, rule.traits, DAMAGE_MULTIPLES.turret, quantity));
        }
        break;
      case "barbette": {
        const rule = BARBETTES[w.weapon];
        if (w.weapon === "missile") {
          const m = MAGAZINES.missileBarbette;
          out.missiles += m.perSalvo * m.salvos * quantity;
          add(attackFrom(rule.label, rule.damage, rule.traits, 1, quantity, { ordnance: "missile", perSalvo: m.perSalvo }));
        } else if (w.weapon === "torpedo") {
          out.torpedoes += MAGAZINES.torpedoBarbette.torpedoes * quantity;
          add(attackFrom(rule.label, rule.damage, rule.traits, 1, quantity, { ordnance: "torpedo" }));
        } else {
          add(attackFrom(rule.label, rule.damage, rule.traits, DAMAGE_MULTIPLES.barbette, quantity));
        }
        break;
      }
      case "bay": {
        const rule = BAY_WEAPONS[w.size][w.weapon];
        const size = BAY_SIZES[w.size];
        const label = `${rule.label} (${size.label.toLowerCase()})`;
        if (w.weapon === "missile" || w.weapon === "torpedo") {
          const ammo = BAY_AMMUNITION[w.weapon];
          const perSalvo = ammo[w.size];
          if (w.weapon === "missile") out.missiles += perSalvo * ammo.salvos * quantity;
          else out.torpedoes += perSalvo * ammo.salvos * quantity;
          add(attackFrom(label, rule.damage, rule.traits, 1, quantity, { ordnance: w.weapon, perSalvo, heavy: true }));
        } else if (w.weapon !== "repulsor") {
          add(attackFrom(label, rule.damage, rule.traits, size.damageMultiple, quantity));
        }
        break;
      }
      case "spinal": {
        const rule = SPINAL_WEAPONS[w.weapon];
        const d = `${rule.damageDice * w.multiple}D`;
        add(attackFrom(rule.label, d, rule.traits, DAMAGE_MULTIPLES.spinal, 1, { heavy: true }));
        break;
      }
      case "pointDefence": {
        const rule = POINT_DEFENCE[w.battery][w.type];
        out.pointDefence += dice(rule.intercept.replace("+", "")) * quantity;
        break;
      }
      case "screen":
        if (w.screen === "mesonScreen") out.mesonScreen += quantity;
        else out.nuclearDamper += quantity;
        break;
      case "blackGlobe":
        break;
    }
  }
  out.attacks = [...lines.values()];
  return out;
}

function ratingOf(choice: number | { thrust: number } | { rating: number } | undefined): number {
  if (choice === undefined) return 0;
  if (typeof choice === "number") return choice;
  return "thrust" in choice ? choice.thrust : choice.rating;
}

function softwareLevel(design: Design, name: string): number {
  const held = (design.software ?? []).filter((s) => s.software === name);
  return held.reduce((best, s) => Math.max(best, s.level ?? 1), 0);
}

/** Expected damage of one attack against unarmoured hull, for strength sums. */
function expected(a: Attack): number {
  const perHit = (a.dice * 3.5) * (a.ion ? 0.5 : 1);
  return perHit * a.multiple * a.count * a.perSalvo;
}

export function shipClass(id: string, design: Design): ShipClass {
  const s = sheet(design);
  const config = HULL_CONFIGURATIONS[design.hull.configuration];
  const systems = design.systems ?? [];
  const arms = armament(design.weapons ?? [], s.hardpoints.firmpoints);
  // Ordnance bought beyond what the launchers hold for nothing.
  for (const o of design.ordnance ?? []) {
    if ("missile" in o) arms.missiles += o.count;
    else if ("torpedo" in o) arms.torpedoes += o.count;
  }
  const thrust =
    ratingOf(design.manoeuvre) + (design.highBurnThruster !== undefined ? design.highBurnThruster.thrust : 0);
  const jump = ratingOf(design.jump);
  const attackValue = arms.attacks.reduce((sum, a) => sum + expected(a), 0);
  const upkeepMonth = s.maintenanceCost + s.wageBill;
  return {
    id,
    design,
    sheet: s,
    name: design.name,
    notes: design.notes ?? "",
    tl: design.tl,
    tons: s.hullTons,
    hull: s.hullPoints,
    armour: s.armourProtection,
    thrust,
    jump,
    fuelCapacity: s.fuel.jump + s.fuel.extra,
    cost: s.purchaseCost,
    upkeep: (upkeepMonth * 12) / 52 / 1e6,
    buildDays: s.constructionDays,
    attacks: arms.attacks,
    sandcasters: arms.sandcasters,
    pointDefence: arms.pointDefence,
    mesonScreen: arms.mesonScreen,
    nuclearDamper: arms.nuclearDamper,
    fireControl: softwareLevel(design, "fireControl"),
    evade: softwareLevel(design, "evade"),
    sensorDm: SENSORS[design.sensors ?? "basic"].dm,
    crew: s.crewTotal,
    cargo: s.cargoTons,
    canSkim: config.streamlined === "yes" || systems.some((c) => "fuelScoops" in c),
    canWaterRefuel: config.streamlined !== "no",
    fuelProcessor: systems.some((c) => "perTon" in c && c.perTon === "fuelProcessor"),
    missiles: arms.missiles,
    torpedoes: arms.torpedoes,
    armed: arms.attacks.length > 0,
    hangars: hangarsOf(design),
    // Hull and firepower multiplied, so a glass cannon and a brick both
    // count for less than a ship with both. Square-rooted to keep the scale
    // of a destroyer and a dreadnought within reach of each other.
    strength: Math.round(Math.sqrt((s.hullPoints + s.armourProtection * 10) * Math.max(attackValue, 0.5)) * 10) / 10,
  };
}

/** Carried craft the design calls fighters, grouped by what they are. */
function hangarsOf(design: Design): { label: string; slots: number; tons: number }[] {
  const groups = new Map<string, { label: string; slots: number; tons: number }>();
  for (const c of design.craft ?? []) {
    if (c.kind !== "smallCraft" || !/fighter/i.test(c.label)) continue;
    const held = groups.get(c.label);
    if (held === undefined) groups.set(c.label, { label: c.label, slots: 1, tons: c.tons });
    else held.slots++;
  }
  return [...groups.values()];
}

/** A design the engine refuses outright is not something the game can field. */
export function designErrors(design: Design): string[] {
  return sheet(design)
    .problems.filter((p) => p.severity === "error")
    .map((p) => p.message);
}
