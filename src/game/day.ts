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
import { battleAt, besieging } from "./combat";
import type { Game } from "./game";
import { round, ships } from "./game";
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
  hiresTenders,
  tenderCost,
  NAVY_REPAIR,
  navySize,
  breakawayChance,
  DISORDER_DAYS,
  DISORDER_INCOME,
  TORPEDO_MCR,
  type FuelSource,
} from "./rules";
import type { Build, Faction, Fleet, Loc, Order, Sighting } from "./types";
import type { World } from "../sector/sec";
import { describeHeadcount } from "../sector/uwp";
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
  const perShip = fleet.ships.filter((s) => !game.carried(fleet, s)).map((s) => fuelSources(world, game.cls(s), hostile));
  if (perShip.some((sources) => sources.length === 0)) return null;
  // Places every ship can use, the best first: refined fuel at a starport,
  // then the gas giant, then unrefined at the world.
  const usable = (["main", "gg"] as Loc[]).filter((loc) => perShip.every((sources) => sources.some((src) => src.loc === loc)));
  const refined = (loc: Loc) => perShip.every((sources) => sources.some((src) => src.loc === loc && src.refined));
  const ranked = usable.sort((a, b) => Number(refined(b)) - Number(refined(a)) || (a === "gg" ? -1 : b === "gg" ? 1 : 0));
  // A crew takes on fuel where nobody is waiting to fight it, if it can.
  const quiet = ranked.find((loc) => !game.fleetsAt(fleet.system, loc).some((f) => game.hostile(f.owner, fleet.owner) && game.fleetArmed(f)));
  return quiet ?? ranked[0] ?? null;
}

function notice(game: Game, owner: string, text: string, at?: string, wake = true): void {
  game.log({ to: [owner], kind: "info", text, at, wake, firsthand: [owner] });
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
    if (order.tender === true && game.carriedTons(fleet) > 0) {
      const world = game.world(fleet.system);
      if (fleet.tender !== true && !hiresTenders(world, game.hostile(fleet.owner, game.worldState(fleet.system).owner))) {
        notice(game, fleet.owner, `${fleet.name} cannot hire jump tenders at ${world.name}: only a class A or B starport has them.`, fleet.system);
        fleet.order = null;
        return;
      }
      const parsecs = distanceBetween(fleet.system, next);
      const cost = tenderCost(game.carriedTons(fleet), parsecs);
      const faction = game.faction(fleet.owner);
      if (cost > faction.credits) {
        notice(game, fleet.owner, `${fleet.name} cannot pay the jump tenders: MCr${round(cost, 2)} for the jump, and the treasury has MCr${round(faction.credits, 2)}.`, fleet.system);
        fleet.order = null;
        fleet.tender = false;
        return;
      }
      faction.credits -= cost;
      if (fleet.tender !== true) {
        notice(game, fleet.owner, `${fleet.name} hires jump tenders at ${world.name} for its ships without jump drives.`, fleet.system, false);
      }
      fleet.tender = true;
    }
    depart(game, fleet, next);
    order.route.shift();
    return;
  }
  const parsecs = distanceBetween(fleet.system, next);
  const driveOk = parsecs <= game.fleetJump(fleet);
  const tanksOk = fleet.ships.every((s) => game.carried(fleet, s) || game.cls(s).fuelCapacity + 1e-9 >= jumpFuel(game.cls(s).tons, parsecs));
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
  for (const s of fleet.ships) {
    if (!game.carried(fleet, s)) s.fuel = Math.max(0, s.fuel - jumpFuel(game.cls(s).tons, parsecs));
  }
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
  // The old navy went down fighting; the new owner builds its own, a boat a week.
  const fresh = game.freshNavy(world);
  ws.navy = fresh === null ? null : { classId: fresh!.classId, boats: [] };
  const taker = game.faction(by);
  const alive = game.state.factions.filter((f) => f.alive).map((f) => f.id);
  // Each capital hears of it when a courier gets there.
  announceOwner(game, at, by);
  const lost = prev === null ? "independent" : `held by ${game.faction(prev).name}`;
  const text = `${world.name} (${world.uwpText}), ${lost}, submits to ${taker.name}.`;
  const parties = prev === null ? [by] : [by, prev];
  // Everybody hears of it; only the two sides are woken by it.
  game.log({ to: parties, kind: "capture", text, at, wake: true, firsthand: parties });
  const others = alive.filter((id) => !parties.includes(id));
  if (others.length > 0) game.log({ to: others, kind: "capture", text, at });
  if (prev !== null) {
    const loser = game.faction(prev);
    loser.builds = loser.builds.filter((b) => {
      if (b.at !== at) return true;
      notice(game, prev, `The ${game.catalogue.get(b.classId).name} building at ${world.name} is lost with the yard.`, at);
      return false;
    });
    if (loser.capital === at) fallOfCapital(game, prev, at);
  }
}

/** Tell every capital a world has changed hands, when a courier would get there. */
function announceOwner(game: Game, at: string, owner: string | null): void {
  for (const f of game.state.factions) {
    const lag = game.lag(f.id, at);
    if (lag === 0) f.known[at] = owner;
    else f.inbox.push({ arrives: game.state.day + lag, kind: "owner", at, owner });
  }
}

/**
 * A capital falls. Government moves to the next world, the faction is thrown
 * into disorder for some weeks, and worlds that were held by the old capital's
 * authority and not much else take their chance to go their own way.
 */
function fallOfCapital(game: Game, factionId: string, lostAt: string): void {
  const loser = game.faction(factionId);
  const next = game
    .ownedWorlds(factionId)
    .sort((a, b) => b.uwp.population - a.uwp.population || b.uwp.tl - a.uwp.tl)[0];
  if (next === undefined) return;
  loser.capital = next.at;
  loser.disorderUntil = game.state.day + DISORDER_DAYS;
  const everyone = game.state.factions.filter((f) => f.alive).map((f) => f.id);
  game.log({
    to: [factionId],
    kind: "lost",
    text: `${game.world(lostAt).name} has fallen and with it the government. ${loser.name} rules now from ${next.name}, in disorder: for ${DISORDER_DAYS} days income is cut to a quarter and the yards stand idle.`,
    at: next.at,
    wake: true,
    firsthand: [factionId],
  });
  const gone: string[] = [];
  for (const w of game.ownedWorlds(factionId)) {
    if (w.at === next.at) continue;
    if (game.rng.next() >= breakawayChance(w, distanceBetween(w.at, next.at))) continue;
    const ws = game.worldState(w.at);
    ws.owner = null;
    ws.siege = null;
    gone.push(w.name);
    announceOwner(game, w.at, null);
    loser.builds = loser.builds.filter((b) => b.at !== w.at);
    game.log({
      to: everyone,
      kind: "capture",
      text: `${w.name} (${w.uwpText}) breaks away from ${loser.name} and declares itself independent.`,
      at: w.at,
      wake: false,
      firsthand: [factionId],
    });
  }
  if (gone.length > 0) {
    game.log({
      to: [factionId],
      kind: "lost",
      text: `${gone.length} world${gone.length === 1 ? "" : "s"} broke away in the confusion: ${gone.join(", ")}.`,
      at: next.at,
      wake: true,
      firsthand: [factionId],
    });
  }
}

/** A planetary navy left in peace mends its boats, and replaces one lost a week. */
function mendNavy(game: Game, world: World): void {
  const ws = game.worldState(world.at);
  const navy = ws.navy;
  if (navy === null || navy === undefined || !game.catalogue.has(navy.classId)) return;
  const cls = game.catalogue.get(navy.classId);
  navy.boats = navy.boats.map((d) => Math.max(0, d - Math.ceil(cls.hull * NAVY_REPAIR)));
  if (isWeekEnd(game.state.day) && navy.boats.length < navySize(world)) navy.boats.push(0);
}

function sieges(game: Game): void {
  const day = game.state.day;
  for (const world of game.state.sector.worlds) {
    const ws = game.worldState(world.at);
    const max = defenceMax(world);
    const here = game.fleetsAt(world.at, "main");
    const besiegers = here.filter(
      (f) => f.standing.besiege && besieging(f) && f.owner !== ws.owner && game.fleetArmed(f),
    );
    const defended = here.some((f) => f.owner === ws.owner && game.fleetArmed(f));
    if (besiegers.length === 0 || defended) {
      ws.siege = null;
      // Defences rebuild only when nobody is sitting in orbit shooting at them.
      if (ws.fought !== day && ws.defence < max) {
        ws.defence = Math.min(max, ws.defence + Math.ceil(max * DEFENCE_REGEN));
      }
      if (ws.fought !== day) mendNavy(game, world);
      continue;
    }
    // Still shooting back, or boats still in orbit: the siege has not begun.
    if (ws.defence > 0 || (ws.navy?.boats.length ?? 0) > 0) {
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
    } else if (ws.siege.days === 1 || ws.siege.days === need - 1) {
      const to = [by, ...(ws.owner === null ? [] : [ws.owner])];
      game.log({
        to,
        kind: "info",
        text:
          ws.siege.days === 1
            ? `${world.name}'s defences are silenced and ${game.faction(by).name} holds its orbit. It submits in ${need} days if the siege holds.`
            : `${world.name} will submit to ${game.faction(by).name} tomorrow unless the siege is broken.`,
        at: world.at,
        wake: true,
        firsthand: to,
      });
    }
  }
}

/**
 * A world's garrisons are one fleet: any that joined today go into the one
 * already there. A garrison is part of its world, and goes with it: on a world
 * that is no longer its faction's, it stands down and is gone.
 */
function garrisons(game: Game): void {
  const held = new Map<string, Fleet>();
  for (const fleet of [...game.state.fleets]) {
    if (fleet.transit !== null || fleet.order?.kind !== "garrison") continue;
    if (game.worldState(fleet.system).owner !== fleet.owner) {
      game.state.fleets = game.state.fleets.filter((f) => f !== fleet);
      notice(game, fleet.owner, `The garrison of ${game.world(fleet.system).name}, ${ships(fleet.ships.length)}, stands down with the world lost.`, fleet.system);
      continue;
    }
    const key = `${fleet.owner}|${fleet.system}`;
    const first = held.get(key);
    if (first === undefined) {
      held.set(key, fleet);
      fleet.name = `${game.world(fleet.system).name} Garrison`;
    } else {
      game.mergeFleets(first, fleet);
    }
  }
}

function yards(game: Game): void {
  const day = game.state.day;
  // A day's work on every slip; a faction in disorder keeps its slips, but
  // nothing on them moves.
  const at = new Set(game.state.factions.flatMap((f) => f.builds.map((b) => b.at)));
  for (const yard of at) game.workYard(yard, day);
  for (const faction of game.state.factions) {
    const finished = (b: Build) => (b.worked ?? 0) >= (b.work ?? 0);
    const due = faction.builds.filter(finished);
    faction.builds = faction.builds.filter((b) => !finished(b));
    for (const b of due) {
      // A yard that has changed hands since the order keeps the ship.
      const owner = game.worldState(b.at).owner;
      if (owner !== faction.id && owner !== null) continue;
      const built = game.commission(b.classId, b.name);
      const ship = built[0]!;
      const waiting = game
        .fleetsAt(b.at, "main")
        .find((f) => f.owner === faction.id && f.order === null && f.name.endsWith("Yard"));
      if (waiting !== undefined) waiting.ships.push(...built);
      else game.newFleet(faction.id, b.at, "main", built, `${game.world(b.at).name} Yard`);
      game.log({
        to: [faction.id],
        kind: "build",
        text: `The ${game.cls(ship).name} ${ship.name} is commissioned at ${game.world(b.at).name}${built.length > 1 ? `, with ${built.length - 1} fighters aboard` : ""}.`,
        at: b.at,
        wake: true,
        firsthand: [faction.id],
      });
    }
  }
  for (const yard of at) game.replanYard(yard);
}

function economy(game: Game): void {
  for (const faction of game.state.factions) {
    if (!faction.alive) continue;
    const worlds = game.ownedWorlds(faction.id);
    const disorder = (faction.disorderUntil ?? 0) > game.state.day;
    const inc = worlds.reduce((s, w) => s + income(w), 0) * (disorder ? DISORDER_INCOME : 1);
    const upkeep = game.fleetsOf(faction.id).reduce((s, f) => s + f.ships.reduce((t, sh) => t + game.cls(sh).upkeep, 0), 0);
    faction.credits += inc - upkeep;
    game.log({
      to: [faction.id],
      kind: "economy",
      text: `Week's end: MCr${round(inc, 1)} in from ${worlds.length} worlds${disorder ? ", cut by the disorder" : ""}, MCr${round(upkeep, 2)} out on the fleet. Treasury MCr${round(faction.credits, 1)}.`,
    });
  }
}

/** A fleet as another faction sees it today. */
function sightingOf(game: Game, fleet: Fleet, before: Sighting | undefined): Sighting {
  const day = game.state.day;
  const stayed = before !== undefined && before.system === fleet.system && before.left === undefined;
  return {
    fleetId: fleet.id,
    owner: fleet.owner,
    system: fleet.system,
    loc: fleet.loc,
    day,
    since: stayed ? before.since : day,
    ships: fleet.ships.length,
    tons: game.fleetTons(fleet),
    strength: Math.round(game.fleetStrength(fleet)),
  };
}

/** Send a sighting home: at once where the capital can see it, by courier otherwise. */
function sendHome(game: Game, faction: Faction, sighting: Sighting): void {
  const lag = game.lag(faction.id, sighting.system);
  if (lag === 0) faction.news[sighting.fleetId] = sighting;
  else faction.inbox.push({ arrives: game.state.day + lag, kind: "sighting", sighting });
}

/** What every faction sees, what it remembers of what it saw, and what it hears. */
function intel(game: Game, lost: ReadonlyMap<string, { owner: string; system: string }>): void {
  const day = game.state.day;
  const live = new Map(game.state.fleets.map((f) => [f.id, f]));
  for (const faction of game.state.factions) {
    if (!faction.alive) continue;
    // The couriers come in.
    const arrived = faction.inbox.filter((d) => d.arrives <= day);
    faction.inbox = faction.inbox.filter((d) => d.arrives > day);
    for (const d of arrived) {
      switch (d.kind) {
        case "owner":
          faction.known[d.at] = d.owner;
          break;
        case "sighting":
          if ((faction.news[d.sighting.fleetId]?.day ?? -1) <= d.sighting.day) faction.news[d.sighting.fleetId] = d.sighting;
          break;
        case "fleet":
          if ((faction.reports[d.report.fleet.id]?.day ?? -1) <= d.report.day) faction.reports[d.report.fleet.id] = d.report;
          break;
        case "fleetLost":
          delete faction.reports[d.fleetId];
          break;
      }
    }

    const sees = visibleSystems(game, faction.id);
    const owned = new Set(game.ownedWorlds(faction.id).map((w) => w.at));
    for (const fleet of game.state.fleets) {
      if (fleet.owner === faction.id || fleet.transit !== null || !sees.has(fleet.system)) continue;
      const before = faction.intel[fleet.id];
      const sighting = sightingOf(game, fleet, before);
      faction.intel[fleet.id] = sighting;
      const arrivedHere = sighting.since === day;
      // A courier goes when something changes, and weekly besides.
      if (arrivedHere || before?.loc !== fleet.loc || day % 7 === 0 || game.lag(faction.id, fleet.system) === 0) {
        sendHome(game, faction, sighting);
      }
      if (arrivedHere && owned.has(fleet.system)) {
        game.log({
          to: [faction.id],
          kind: "sighting",
          text: `${game.faction(fleet.owner).name} ${fleet.ships.length === 1 ? "ship arrives" : "ships arrive"} at ${game.world(fleet.system).name}: ${ships(fleet.ships.length)}, ${Math.round(game.fleetTons(fleet)).toLocaleString()} tons, at the ${LOC_NAMES[fleet.loc].toLowerCase()}.`,
          at: fleet.system,
          wake: true,
          firsthand: [faction.id],
        });
      }
    }

    // Fleets that were here and are not now: gone, as far as anyone can tell.
    for (const [id, s] of Object.entries(faction.intel)) {
      if (s.left !== undefined) {
        if (day - s.left > 30) delete faction.intel[id];
        continue;
      }
      const now = live.get(id);
      const stillHere = now !== undefined && now.transit === null && now.system === s.system;
      if (sees.has(s.system) && !stillHere && s.day < day) {
        const gone: Sighting = { ...s, left: day };
        faction.intel[id] = gone;
        sendHome(game, faction, gone);
        if (owned.has(s.system)) {
          game.log({
            to: [faction.id],
            kind: "sighting",
            text: `The ${game.faction(s.owner).name} ships at ${game.world(s.system).name} ${s.ships === 1 ? "has" : "have"} gone: ${ships(s.ships)}, there from day ${s.since} and last seen on day ${s.day}.`,
            at: s.system,
            firsthand: [faction.id],
          });
        }
      } else if (day - s.day > 60) {
        delete faction.intel[id];
      }
    }
    for (const [id, s] of Object.entries(faction.news)) {
      if (day - (s.left ?? s.day) > 60) delete faction.news[id];
    }

    // Under full fog, a player's own fleets report home by courier.
    if (game.fogged(faction.id)) {
      for (const fleet of game.fleetsOf(faction.id)) {
        let from: string | null = null;
        if (fleet.transit === null) from = fleet.system;
        else if (fleet.transit.depart === day) from = fleet.transit.from;
        if (from === null) continue;
        const lag = game.lag(faction.id, from);
        const report = game.reportOf(fleet);
        if (lag === 0) faction.reports[fleet.id] = report;
        else faction.inbox.push({ arrives: day + lag, kind: "fleet", report });
      }
      for (const [id, gone] of lost) {
        if (gone.owner !== faction.id) continue;
        const lag = game.lag(faction.id, gone.system);
        if (lag === 0) delete faction.reports[id];
        else faction.inbox.push({ arrives: day + lag, kind: "fleetLost", fleetId: id });
      }
    }
  }
}

/** Orders sent by courier that reach their fleets today. */
function deliverOrders(game: Game): void {
  const day = game.state.day;
  for (const faction of game.state.factions) {
    if (faction.orders.length === 0) continue;
    const due = faction.orders.filter((c) => c.arrives <= day);
    faction.orders = faction.orders.filter((c) => c.arrives > day);
    for (const c of due) {
      const fleet = game.fleet(c.fleetId);
      // A fleet that is no more gets no orders; the capital will hear why in time.
      if (fleet !== undefined) game.applyCommand(fleet, c);
    }
  }
}

function endings(game: Game): void {
  const s = game.state;
  // A player's high-water mark, for the end of the game.
  for (const f of game.humans()) {
    const worlds = game.holding(f.id).worlds;
    if (f.peak === undefined || worlds > f.peak.worlds) f.peak = { worlds, day: s.day };
  }
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
      });
    }
  }
  const target = game.victoryTarget();
  const alive = s.factions.filter((f) => f.alive);
  for (const f of alive) {
    const held = game.holding(f.id);
    const enough = target.by === "population" ? held.people >= target.need : held.worlds >= target.need;
    if (enough || alive.length === 1) {
      s.winner = f.id;
      s.phase = "over";
      game.log({
        to: s.factions.map((x) => x.id),
        kind: "info",
        text:
          target.by === "population"
            ? `${f.name} rules ${describeHeadcount(held.people)} of the sector's ${describeHeadcount(target.people)} people and has won.`
            : `${f.name} holds ${held.worlds} of the ${target.worlds} peopled worlds and has won.`,
        wake: true,
        firsthand: s.factions.map((x) => x.id),
      });
      return;
    }
  }
  if (game.humans().length > 0 && game.humans().every((h) => !h.alive)) {
    s.phase = "over";
    game.log({ to: s.factions.map((x) => x.id), kind: "info", text: "Every player has been defeated.", wake: true, firsthand: s.factions.map((x) => x.id) });
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

  deliverOrders(game);
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
      case "garrison":
        fleet.loc = "main";
        break;
    }
  }
  garrisons(game);

  for (const fleet of s.fleets) {
    if (fleet.transit === null || fleet.transit.arrive > day) continue;
    fleet.system = fleet.transit.to;
    fleet.loc = "deep";
    fleet.transit = null;
    const done = fleet.order?.kind !== "jump" || fleet.order.route.length === 0;
    if (done && fleet.order?.kind === "jump") fleet.order = null;
    if (done && fleet.tender === true) {
      fleet.tender = false;
      notice(game, fleet.owner, `The jump tenders carrying ${fleet.name}'s ships set them down at ${game.world(fleet.system).name} and leave.`, fleet.system, false);
    }
    game.log({
      to: [fleet.owner],
      kind: "arrival",
      text: `${fleet.name} arrives at ${game.world(fleet.system).name}${done ? "" : " and prepares for the next jump"}.`,
      at: fleet.system,
      wake: done,
      firsthand: [fleet.owner],
    });
  }

  intercepts(game);

  const present = new Map(s.fleets.map((f) => [f.id, { owner: f.owner, system: f.system }]));
  const places = new Set<string>();
  for (const fleet of s.fleets) if (fleet.transit === null && fleet.ships.length > 0) places.add(`${fleet.system}|${fleet.loc}`);
  const battled = new Set<string>();
  for (const place of places) {
    const [system, loc] = place.split("|") as [string, Loc];
    const report = battleAt(game, system, loc);
    if (report === null) continue;
    battled.add(place);
    game.log({ to: report.factions, kind: "combat", text: report.headline, at: system, detail: report.lines, wake: true, firsthand: report.factions });
  }
  game.removeEmptyFleets();
  // How long each computer fleet has been fighting where it is.
  for (const fleet of s.fleets) {
    if (fleet.transit !== null || game.faction(fleet.owner).human) continue;
    if (!battled.has(`${fleet.system}|${fleet.loc}`)) continue;
    const was = fleet.fighting;
    const running = was !== undefined && was.at === fleet.system && was.loc === fleet.loc && was.last === day - 1;
    fleet.fighting = { at: fleet.system, loc: fleet.loc, since: running ? was.since : day, last: day };
  }
  const lost = new Map<string, { owner: string; system: string }>();
  const survivors = new Set(s.fleets.map((f) => f.id));
  for (const [id, was] of present) if (!survivors.has(id)) lost.set(id, was);

  for (const fleet of s.fleets) {
    if (fleet.transit !== null || battled.has(`${fleet.system}|${fleet.loc}`)) continue;
    if (refuelling.has(fleet)) refuel(game, fleet);
    if (fleet.loc === "main" && game.worldState(fleet.system).owner === fleet.owner) dockyard(game, fleet);
  }

  sieges(game);
  yards(game);
  if (isWeekEnd(day)) economy(game);
  intel(game, lost);
  endings(game);
  for (const f of s.factions) f.ready = false;
}
