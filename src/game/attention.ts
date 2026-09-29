/**
 * What needs a player's attention: each fleet's state at a glance, and the
 * day's to-do list. Worked out from what the player knows, the same fleets and
 * sightings the map shows.
 */

import type { Game } from "./game";
import { captureDays, slipsAt } from "./rules";
import type { Faction, Fleet } from "./types";
import { LOC_NAMES } from "./types";
import { visibleSystems } from "./visibility";

/** Where a fleet stands: waiting on the player, getting on with something, or at rest at home. */
export type FleetState = "needs" | "busy" | "parked";

export interface FleetStatus {
  readonly state: FleetState;
  /** Why, in a few words. */
  readonly text: string;
  /** For the icon: what it is doing or what is wrong. */
  readonly mark: "jump" | "move" | "siege" | "fight" | "repair" | "fuel" | "hurt" | "hangar" | "idle" | "home" | "admiral";
}

export function fleetStatus(game: Game, f: Fleet): FleetStatus {
  const here = game.worlds.has(f.system) ? game.world(f.system) : undefined;
  const name = here?.name ?? f.system;
  if (f.transit !== null) return { state: "busy", mark: "jump", text: `Jumping to ${game.world(f.transit.to).name}, due day ${f.transit.arrive}` };
  if (f.admiral !== undefined) return { state: "busy", mark: "admiral", text: `Admiral: ${admiralText(game, f)}` };
  const o = f.order;
  if (o !== null) {
    switch (o.kind) {
      case "jump":
        return { state: "busy", mark: "jump", text: o.route.length === 0 ? "Jumping" : `Bound for ${game.world(o.route[o.route.length - 1]!).name}` };
      case "move":
        return { state: "busy", mark: "move", text: `Moving to the ${LOC_NAMES[o.to].toLowerCase()}` };
      case "refuel":
        return { state: "busy", mark: "fuel", text: `Refuelling at ${name}` };
      case "repair":
        return { state: "busy", mark: "repair", text: `Repairing at ${name}` };
      case "garrison":
        return { state: "parked", mark: "home", text: `Garrison of ${name}` };
    }
  }
  const ws = game.worldState(f.system);
  if (ws.owner !== f.owner && f.loc === "main" && f.standing.besiege && game.fleetArmed(f)) {
    if (ws.siege?.by === f.owner) {
      const left = Math.max(0, captureDays(game.world(f.system)) - ws.siege.days);
      return { state: "busy", mark: "siege", text: `Siege of ${name}: submits in ${left} day${left === 1 ? "" : "s"}` };
    }
    return { state: "busy", mark: "fight", text: `Attacking ${name}'s defences` };
  }
  const hull = game.fleetHullShare(f);
  if (hull < 0.6 || f.ships.some((s) => s.crits.jump || s.crits.thrust > 0)) return { state: "needs", mark: "hurt", text: `Damaged: ${Math.round(hull * 100)}% hull, at ${name}` };
  if (game.fleetJump(f) > 0 && game.fleetRange(f) < game.fleetJump(f)) return { state: "needs", mark: "fuel", text: `Short of fuel at ${name}` };
  const hangars = game.hangarSpace(f);
  if (hangars.slots > 0 && hangars.filled < hangars.slots) return { state: "needs", mark: "hangar", text: `Hangars ${hangars.filled} of ${hangars.slots} filled, at ${name}` };
  if (hangars.slots > 0 && game.carriedTons(f) > 0 && !game.tendered(f)) return { state: "needs", mark: "hangar", text: `Craft with no hangar hold it at ${name}` };
  if (ws.owner !== f.owner) return { state: "needs", mark: "idle", text: `Idle at ${name}` };
  return { state: "parked", mark: "home", text: `At ${name}` };
}

/** An admiral's mission, in words. */
export function admiralText(game: Game, f: Fleet): string {
  const a = f.admiral;
  if (a === undefined) return "";
  const base = game.world(a.base).name;
  const style = { bold: ", boldly", steady: "", careful: ", carefully" }[a.style];
  return a.mission === "conquer" ? `taking worlds near ${base}${style}` : `defending the worlds near ${base}`;
}

export interface Alert {
  readonly kind: "siege" | "enemy" | "lost" | "fallen" | "fleets" | "slips";
  readonly text: string;
  readonly at?: string;
  readonly fleet?: string;
  /** Opens the shipyard at this yard. */
  readonly yard?: string;
}

/** The day's to-do list for a player, most urgent first. */
export function alerts(game: Game, me: Faction): Alert[] {
  const out: Alert[] = [];
  const day = game.state.day;
  const lagged = game.state.options.newsLag > 0;

  // Worlds of ours under siege.
  for (const w of game.ownedWorlds(me.id)) {
    const s = game.worldState(w.at).siege;
    if (s === null || s.by === me.id) continue;
    const left = Math.max(0, captureDays(w) - s.days);
    out.push({ kind: "siege", at: w.at, text: `${w.name} is under siege by ${game.faction(s.by).name}: it submits in ${left} day${left === 1 ? "" : "s"}` });
  }

  // Enemy fleets at our worlds, as far as we know.
  const held = new Set(game.ownedWorlds(me.id).map((w) => w.at));
  const threat = new Map<string, { ships: number; who: Set<string> }>();
  if (lagged) {
    for (const s of Object.values(me.news)) {
      if (s.left !== undefined || !held.has(s.system) || day - s.day > 7) continue;
      const t = threat.get(s.system) ?? { ships: 0, who: new Set<string>() };
      t.ships += s.ships;
      t.who.add(game.faction(s.owner).name);
      threat.set(s.system, t);
    }
  } else {
    const sees = visibleSystems(game, me.id);
    for (const f of game.state.fleets) {
      if (f.transit !== null || !held.has(f.system) || !sees.has(f.system) || !game.hostile(me.id, f.owner) || !game.fleetArmed(f)) continue;
      const t = threat.get(f.system) ?? { ships: 0, who: new Set<string>() };
      t.ships += f.ships.length;
      t.who.add(game.faction(f.owner).name);
      threat.set(f.system, t);
    }
  }
  for (const [at, t] of threat) {
    if (out.some((a) => a.kind === "siege" && a.at === at)) continue;
    out.push({ kind: "enemy", at, text: `${[...t.who].join(" and ")} at ${game.world(at).name}: ${t.ships} ship${t.ships === 1 ? "" : "s"}` });
  }

  // Today's losses: worlds that fell, and battles that cost us ships.
  for (const e of game.logFor(me.id, 200)) {
    if (e.day !== day) continue;
    if (e.kind === "capture" && e.at !== undefined && e.happened === undefined && game.worldState(e.at).owner !== me.id && e.about?.includes(me.id) === true && !e.text.includes(`submits to ${me.name}`)) {
      out.push({ kind: "fallen", at: e.at, text: e.text });
    }
    if (e.kind === "combat" && e.at !== undefined) {
      const mine = (e.detail ?? [])
        .slice(0, Math.max(0, (e.detail ?? []).findIndex((l) => l.startsWith("Round"))))
        .filter((l) => l.startsWith(`${me.name} `))
        .reduce((n, l) => n + Number(/(\d+) lost/.exec(l)?.[1] ?? 0), 0);
      if (mine > 0) out.push({ kind: "lost", at: e.at, text: `Lost ${mine} ship${mine === 1 ? "" : "s"} at ${game.world(e.at).name}` });
    }
  }

  // Fleets waiting on orders.
  const waiting = game.fleetsSeenBy(me.id).filter((f) => f.order?.kind !== "garrison" && fleetStatus(game, f).state === "needs");
  if (waiting.length > 0) {
    out.push({ kind: "fleets", fleet: waiting[0]!.id, text: waiting.length === 1 ? `${waiting[0]!.name} needs orders` : `${waiting.length} fleets need orders` });
  }

  // Class A yards with slips standing empty, when there is money to fill them.
  const free = game
    .ownedWorlds(me.id)
    .filter((w) => w.uwp.starport === "A")
    .map((w) => ({ w, free: slipsAt(w) - [...game.slipsTomorrow(w.at).values()].reduce((n, s) => n + s, 0) }))
    .filter((x) => x.free > 0)
    .sort((a, b) => b.w.uwp.tl - a.w.uwp.tl);
  if (free.length > 0 && me.credits >= 100) {
    out.push({
      kind: "slips",
      yard: free[0]!.w.at,
      text: `Free slips at class A yards: ${free.slice(0, 4).map((x) => `${x.w.name} ${x.free}`).join(", ")}${free.length > 4 ? `, and ${free.length - 4} more` : ""}`,
    });
  }
  return out;
}
