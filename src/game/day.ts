/**
 * One day passing: every fleet does what it was told, battles are fought,
 * worlds fall, yards deliver, and at the end of a week the treasuries fill.
 *
 * The order within a day:
 *   1. The computer's factions give their orders.
 *   2. Fleets jumping leave; fleets moving in-system arrive where they were going.
 *   3. Fleets due out of jump space arrive at the jump point.
 *   4. Every place where hostile fleets meet has its battle.
 *   5. Fleets not fighting refuel, repair and reload.
 *   6. Sieges progress, and defences not under fire rebuild.
 *   7. Ships finished in the yards join the fleet.
 *   8. At the end of a week, income in and upkeep out.
 *   9. Every faction sees what it can see.
 *  10. Anyone with nothing left is out, and somebody may have won.
 */

import { distanceBetween } from "../sector/hex";
import { planAi } from "./ai";
import { battleAt } from "./combat";
import type { Game } from "./game";
import { round } from "./game";
import { canRefuelAt } from "./nav";
import {
  CAPTURED_DEFENCE,
  captureDays,
  DEFENCE_REGEN,
  defenceMax,
  fixesCrits,
  fuelSources,
  income,
  isWeekEnd,
  JUMP_DAYS,
  jumpFuel,
  MISSILE_MCR,
  reloads,
  repairRate,
  ROUGH_JUMP_CHANCE_ON_2D,
  TORPEDO_MCR,
  type FuelSource,
} from "./rules";
import type { Fleet, Loc, Order } from "./types";
import { LOC_NAMES } from "./types";
import { visibleSystems } from "./visibility";

/** Whether a system has anywhere to be at a given place. */
export function locExists(game: Game, system: string, loc: Loc): boolean {
  const w = game.world(system);
  if (loc === "gg") return w.pbg.giants > 0;
  if (loc === "belt") return w.pbg.belts > 0;
  return true;
}

/** Where in a system a fleet should go to refuel, or null where it cannot. */
export function refuelLoc(game: Game, fleet: Fleet): Loc | null {
  const world = game.world(fleet.system);
  const hostile = game.hostile(fleet.owner, game.worldState(fleet.system).owner);
  const perShip = fleet.ships.map((s) => fuelSources(world, game.cls(s), hostile));
  if (perShip.some((sources) => sources.length === 0)) return null;
  // One place every ship can use, preferring the best of what the first can.
  for (const loc of ["main", "gg"] as Loc[]) {
    if (perShip.every((sources) => sources.some((src) => src.loc === loc))) {
      // Prefer refined fuel at a starport where there is some.
      const refined = perShip.every((sources) => sources.some((src) => src.loc === loc && src.refined));
      if (loc === "main" && !refined && perShip.every((s) => s.some((src) => src.loc === "gg"))) continue;
      return loc;
    }
  }
  return null;
}

function notice(game: Game, owner: string, text: string, at?: string, wake = true): void {
  game.log({ to: [owner], kind: "info", text, at, wake });
}

/** A fleet on a jump order: go if it can, refuel first if that is all it needs. */
function stepJump(game: Game, fleet: Fleet, order: Extract<Order, { kind: "jump" }>, refuelling: Set<Fleet>): void {
  const next = order.route[0];
  if (next === undefined) {
    fleet.order = null;
    return;
  }
  const check = game.canJump(fleet, next);
  if (check.ok) {
    depart(game, fleet, next);
    order.route.shift();
    return;
  }
  const parsecs = distanceBetween(fleet.system, next);
  const driveOk = parsecs <= game.fleetJump(fleet);
  const tanksOk = fleet.ships.every((s) => game.cls(s).fuelCapacity + 1e-9 >= jumpFuel(game.cls(s).tons, parsecs));
  if (driveOk && tanksOk && canRefuelAt(game, fleet, fleet.system)) {
    const loc = refuelLoc(game, fleet);
    if (loc !== null) {
      fleet.loc = loc;
      refuelling.add(fleet);
      return;
    }
  }
  notice(game, fleet.owner, `${fleet.name} cannot jump to ${game.world(next).name}: ${check.reason}.`, fleet.system);
  fleet.order = null;
}

function depart(game: Game, fleet: Fleet, to: string): void {
  const parsecs = distanceBetween(fleet.system, to);
  for (const s of fleet.ships) s.fuel = Math.max(0, s.fuel - jumpFuel(game.cls(s).tons, parsecs));
  let days = JUMP_DAYS;
  const rough = fleet.ships.some((s) => s.unrefined && !game.cls(s).fuelProcessor);
  if (rough && game.rng.twoD() <= ROUGH_JUMP_CHANCE_ON_2D) {
    const extra = game.rng.d6();
    days += extra;
    notice(game, fleet.owner, `${fleet.name} makes a rough jump on unrefined fuel and will be ${extra} days late.`, to, false);
  }
  for (const s of fleet.ships) if (s.fuel === 0) s.unrefined = false;
  fleet.transit = { from: fleet.system, to, depart: game.state.day, arrive: game.state.day + days };
  fleet.loc = "deep";
}

/** Fill a fleet's tanks from what is on offer where it is. */
function refuel(game: Game, fleet: Fleet): void {
  const world = game.world(fleet.system);
  const faction = game.faction(fleet.owner);
  const hostile = game.hostile(fleet.owner, game.worldState(fleet.system).owner);
  let spent = 0;
  let taken = 0;
  for (const s of fleet.ships) {
    const c = game.cls(s);
    const want = c.fuelCapacity - s.fuel;
    if (want <= 0.01) continue;
    const sources = fuelSources(world, c, hostile).filter((src: FuelSource) => src.loc === fleet.loc);
    const src = sources[0];
    if (src === undefined) continue;
    const affordable = src.price === 0 ? want : Math.min(want, faction.credits / src.price);
    if (affordable <= 0) continue;
    s.fuel += affordable;
    faction.credits -= affordable * src.price;
    spent += affordable * src.price;
    taken += affordable;
    if (!src.refined && !c.fuelProcessor) s.unrefined = true;
    else if (src.refined && s.fuel >= c.fuelCapacity - 0.01 && !s.unrefined) s.unrefined = false;
  }
  if (fleet.order?.kind === "refuel") {
    fleet.order = null;
    notice(
      game,
      fleet.owner,
      `${fleet.name} takes on ${round(taken, 0)} tons of fuel at ${world.name}${spent > 0 ? ` for MCr${round(spent, 2)}` : ""}.`,
      fleet.system,
      false,
    );
  }
}

/** Repairs, and reloads, at a starport the fleet's owner holds. */
function dockyard(game: Game, fleet: Fleet): void {
  const world = game.world(fleet.system);
  const port = world.uwp.starport;
  const faction = game.faction(fleet.owner);
  const rate = repairRate(port);
  for (const s of fleet.ships) {
    const c = game.cls(s);
    if (rate > 0 && s.damage > 0) s.damage = Math.max(0, s.damage - Math.ceil(rate * c.hull));
    if (fixesCrits(port)) {
      s.crits = { sensors: 0, thrust: 0, weapons: 0, armour: 0, jump: false, crew: 0, computer: 0 };
    }
    if (reloads(port)) {
      const missiles = Math.max(0, c.missiles - s.missiles);
      const torpedoes = Math.max(0, c.torpedoes - s.torpedoes);
      const cost = missiles * MISSILE_MCR + torpedoes * TORPEDO_MCR;
      if (cost > 0 && faction.credits >= cost) {
        faction.credits -= cost;
        s.missiles += missiles;
        s.torpedoes += torpedoes;
      }
    }
  }
  if (fleet.order?.kind === "repair") {
    const whole = fleet.ships.every((s) => s.damage === 0 && !s.crits.jump && s.crits.thrust === 0 && s.crits.weapons === 0);
    if (whole) {
      fleet.order = null;
      notice(game, fleet.owner, `${fleet.name} is repaired at ${world.name}.`, fleet.system, false);
    }
  }
}

function capture(game: Game, at: string, by: string): void {
  const ws = game.worldState(at);
  const world = game.world(at);
  const prev = ws.owner;
  ws.owner = by;
  ws.siege = null;
  ws.defence = Math.round(defenceMax(world) * CAPTURED_DEFENCE);
  const taker = game.faction(by);
  const alive = game.state.factions.filter((f) => f.alive).map((f) => f.id);
  const lost = prev === null ? "independent" : `held by ${game.faction(prev).name}`;
  game.log({
    to: alive,
    kind: "capture",
    text: `${world.name} (${world.uwpText}), ${lost}, submits to ${taker.name}.`,
    at,
    wake: true,
  });
  if (prev !== null) {
    const loser = game.faction(prev);
    loser.builds = loser.builds.filter((b) => {
      if (b.at !== at) return true;
      notice(game, prev, `The ${game.catalogue.get(b.classId).name} building at ${world.name} is lost with the yard.`, at);
      return false;
    });
    if (loser.capital === at) {
      const next = game
        .ownedWorlds(prev)
        .sort((a, b) => b.uwp.population - a.uwp.population || b.uwp.tl - a.uwp.tl)[0];
      if (next !== undefined) {
        loser.capital = next.at;
        notice(game, prev, `The capital falls. ${loser.name} now rules from ${next.name}.`, next.at);
      }
    }
  }
}

function sieges(game: Game, battled: ReadonlySet<string>): void {
  const day = game.state.day;
  for (const world of game.state.sector.worlds) {
    const ws = game.worldState(world.at);
    const max = defenceMax(world);
    if (ws.fought !== day && ws.defence < max) {
      ws.defence = Math.min(max, ws.defence + Math.ceil(max * DEFENCE_REGEN));
    }
    const here = game.fleetsAt(world.at, "main");
    const besiegers = here.filter(
      (f) => f.standing.besiege && f.owner !== ws.owner && game.fleetArmed(f),
    );
    const defended = here.some((f) => f.owner === ws.owner && game.fleetArmed(f));
    if (besiegers.length === 0 || ws.defence > 0 || defended) {
      ws.siege = null;
      continue;
    }
    // More than one besieger: whoever brought the most.
    const byFaction = new Map<string, number>();
    for (const f of besiegers) byFaction.set(f.owner, (byFaction.get(f.owner) ?? 0) + game.fleetStrength(f));
    const by = [...byFaction.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    ws.siege = ws.siege?.by === by ? { by, days: ws.siege.days + 1 } : { by, days: 1 };
    const need = captureDays(world);
    if (ws.siege.days >= need) {
      capture(game, world.at, by);
    } else if (!battled.has(`${world.at}|main`) || ws.siege.days === 1) {
      const to = [by, ...(ws.owner === null ? [] : [ws.owner])];
      game.log({
        to,
        kind: "info",
        text: `${world.name} is under siege by ${game.faction(by).name}: day ${ws.siege.days} of ${need}.`,
        at: world.at,
        wake: ws.siege.days === 1,
      });
    }
  }
}

function yards(game: Game): void {
  const day = game.state.day;
  for (const faction of game.state.factions) {
    const due = faction.builds.filter((b) => b.done <= day);
    faction.builds = faction.builds.filter((b) => b.done > day);
    for (const b of due) {
      // A yard that has changed hands since the order keeps the ship.
      const owner = game.worldState(b.at).owner;
      if (owner !== faction.id && owner !== null) continue;
      const ship = game.newShip(b.classId, b.name);
      const waiting = game
        .fleetsAt(b.at, "main")
        .find((f) => f.owner === faction.id && f.order === null && f.name.endsWith("Yard"));
      if (waiting !== undefined) waiting.ships.push(ship);
      else game.newFleet(faction.id, b.at, "main", [ship], `${game.world(b.at).name} Yard`);
      game.log({
        to: [faction.id],
        kind: "build",
        text: `The ${game.cls(ship).name} ${ship.name} is commissioned at ${game.world(b.at).name}.`,
        at: b.at,
        wake: true,
      });
    }
  }
}

function economy(game: Game): void {
  for (const faction of game.state.factions) {
    if (!faction.alive) continue;
    const worlds = game.ownedWorlds(faction.id);
    const inc = worlds.reduce((s, w) => s + income(w), 0);
    const upkeep = game.fleetsOf(faction.id).reduce((s, f) => s + f.ships.reduce((t, sh) => t + game.cls(sh).upkeep, 0), 0);
    faction.credits += inc - upkeep;
    game.log({
      to: [faction.id],
      kind: "economy",
      text: `Week's end: MCr${round(inc, 1)} in from ${worlds.length} worlds, MCr${round(upkeep, 2)} out on the fleet. Treasury MCr${round(faction.credits, 1)}.`,
    });
  }
}

/** What every faction sees, and what it remembers of what it saw. */
function intel(game: Game): void {
  const day = game.state.day;
  const live = new Set(game.state.fleets.map((f) => f.id));
  for (const faction of game.state.factions) {
    if (!faction.alive) continue;
    const sees = visibleSystems(game, faction.id);
    const owned = new Set(game.ownedWorlds(faction.id).map((w) => w.at));
    for (const fleet of game.state.fleets) {
      if (fleet.owner === faction.id || fleet.transit !== null || !sees.has(fleet.system)) continue;
      const before = faction.intel[fleet.id];
      faction.intel[fleet.id] = {
        fleetId: fleet.id,
        owner: fleet.owner,
        system: fleet.system,
        loc: fleet.loc,
        day,
        ships: fleet.ships.length,
        tons: game.fleetTons(fleet),
        strength: Math.round(game.fleetStrength(fleet)),
      };
      const fresh = before === undefined || before.system !== fleet.system || before.day < day - 1;
      if (fresh && owned.has(fleet.system)) {
        game.log({
          to: [faction.id],
          kind: "sighting",
          text: `${game.faction(fleet.owner).name} ships sighted at ${game.world(fleet.system).name}: ${fleet.ships.length} ships, ${Math.round(game.fleetTons(fleet)).toLocaleString()} tons, ${LOC_NAMES[fleet.loc].toLowerCase()}.`,
          at: fleet.system,
          wake: true,
        });
      }
    }
    for (const [id, s] of Object.entries(faction.intel)) {
      const gone = !live.has(id) && sees.has(s.system);
      if (gone || day - s.day > 60) delete faction.intel[id];
      else if (sees.has(s.system) && s.day < day) delete faction.intel[id];
    }
  }
}

function endings(game: Game): void {
  const s = game.state;
  for (const f of s.factions) {
    if (!f.alive) continue;
    const worlds = game.ownedWorlds(f.id).length;
    const ships = game.fleetsOf(f.id).reduce((n, fl) => n + fl.ships.length, 0);
    if (worlds === 0 && ships === 0 && f.builds.length === 0) {
      f.alive = false;
      game.log({
        to: s.factions.map((x) => x.id),
        kind: "lost",
        text: `${f.name} is no more: no worlds, no ships.`,
        wake: true,
      });
    }
  }
  const populated = s.sector.worlds.filter((w) => w.uwp.population > 0);
  const alive = s.factions.filter((f) => f.alive);
  for (const f of alive) {
    const held = populated.filter((w) => s.worlds[w.at]!.owner === f.id).length;
    if (held >= Math.ceil(populated.length * s.options.victoryShare) || alive.length === 1) {
      s.winner = f.id;
      s.phase = "over";
      game.log({
        to: s.factions.map((x) => x.id),
        kind: "info",
        text: `${f.name} holds ${held} of the ${populated.length} peopled worlds and has won.`,
        wake: true,
      });
      return;
    }
  }
  if (game.humans().length > 0 && game.humans().every((h) => !h.alive)) {
    s.phase = "over";
    game.log({ to: s.factions.map((x) => x.id), kind: "info", text: "Every player has been defeated.", wake: true });
  }
}

/**
 * Standing orders to intercept: an idle fleet goes after an enemy fleet it can
 * see elsewhere in the same system, if it is one its orders say to engage.
 */
function intercepts(game: Game): void {
  for (const fleet of game.state.fleets) {
    const orders = fleet.standing;
    if (!orders.intercept || orders.engage === "none" || fleet.order !== null || fleet.transit !== null) continue;
    if (!game.fleetArmed(fleet)) continue;
    const mine = game.fleetStrength(fleet);
    const quarry = game
      .fleetsAt(fleet.system)
      .filter((f) => f.loc !== fleet.loc && game.hostile(fleet.owner, f.owner))
      .filter((f) => orders.engage === "any" || mine > game.fleetStrength(f) * 1.25)
      .sort((a, b) => game.fleetStrength(b) - game.fleetStrength(a))[0];
    if (quarry === undefined) continue;
    fleet.loc = quarry.loc;
    notice(game, fleet.owner, `${fleet.name} moves to intercept ${game.faction(quarry.owner).name} ships at the ${LOC_NAMES[quarry.loc].toLowerCase()}.`, fleet.system, false);
  }
}

export function advanceDay(game: Game): void {
  const s = game.state;
  if (s.phase === "over") return;
  s.day++;
  const day = s.day;

  for (const f of s.factions) if (!f.human && f.alive) planAi(game, f);

  const refuelling = new Set<Fleet>();
  for (const fleet of [...s.fleets]) {
    if (fleet.transit !== null || fleet.order === null) continue;
    const order = fleet.order;
    switch (order.kind) {
      case "move":
        if (locExists(game, fleet.system, order.to)) fleet.loc = order.to;
        fleet.order = null;
        break;
      case "jump":
        stepJump(game, fleet, order, refuelling);
        break;
      case "refuel": {
        const loc = refuelLoc(game, fleet);
        if (loc === null) {
          notice(game, fleet.owner, `${fleet.name} has nowhere to refuel at ${game.world(fleet.system).name}.`, fleet.system);
          fleet.order = null;
        } else {
          fleet.loc = loc;
          refuelling.add(fleet);
        }
        break;
      }
      case "repair": {
        const world = game.world(fleet.system);
        if (game.worldState(fleet.system).owner !== fleet.owner || repairRate(world.uwp.starport) === 0) {
          notice(game, fleet.owner, `${fleet.name} cannot repair at ${world.name}: it needs a class A to D starport you hold.`, fleet.system);
          fleet.order = null;
        } else {
          fleet.loc = "main";
        }
        break;
      }
    }
  }

  for (const fleet of s.fleets) {
    if (fleet.transit === null || fleet.transit.arrive > day) continue;
    fleet.system = fleet.transit.to;
    fleet.loc = "deep";
    fleet.transit = null;
    const done = fleet.order?.kind !== "jump" || fleet.order.route.length === 0;
    if (done && fleet.order?.kind === "jump") fleet.order = null;
    notice(game, fleet.owner, `${fleet.name} arrives at ${game.world(fleet.system).name}${done ? "" : " and prepares for the next jump"}.`, fleet.system, done);
  }

  intercepts(game);

  const places = new Set<string>();
  for (const fleet of s.fleets) if (fleet.transit === null && fleet.ships.length > 0) places.add(`${fleet.system}|${fleet.loc}`);
  const battled = new Set<string>();
  for (const place of places) {
    const [system, loc] = place.split("|") as [string, Loc];
    const report = battleAt(game, system, loc);
    if (report === null) continue;
    battled.add(place);
    game.log({ to: report.factions, kind: "combat", text: report.headline, at: system, detail: report.lines, wake: true });
  }
  game.removeEmptyFleets();

  for (const fleet of s.fleets) {
    if (fleet.transit !== null || battled.has(`${fleet.system}|${fleet.loc}`)) continue;
    if (refuelling.has(fleet)) refuel(game, fleet);
    if (fleet.loc === "main" && game.worldState(fleet.system).owner === fleet.owner) dockyard(game, fleet);
  }

  sieges(game, battled);
  yards(game);
  if (isWeekEnd(day)) economy(game);
  intel(game);
  endings(game);
  for (const f of s.factions) f.ready = false;
}
