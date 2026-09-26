/**
 * The panes down the side of the game screen.
 */

import { ships } from "../game/game";
import { idFor, parseDesign } from "../catalogue/catalogue";
import type { Attack, ShipClass } from "../catalogue/shipclass";
import { locExists } from "../game/day";
import type { Game } from "../game/game";
import { canRefuelAt } from "../game/nav";
import {
  canBuildAt,
  captureDays,
  defenceMax,
  buildDaysFor,
  fuelSources,
  hiresTenders,
  slipsAt,
  income,
  TENDER_JUMP,
  tenderCost,
  jumpFuel,
  repairRate,
  whyNotBuild,
  yardPrice,
} from "../game/rules";
import { chooseFile } from "../game/save";
import { buyStarting, orderBuild, sellStarting } from "../game/turn";
import type { Engage, Fleet, Loc, LogEntry, StandingOrders, TargetPriority } from "../game/types";
import { LOC_NAMES, STANDING_PRESETS } from "../game/types";
import { visibleSystems } from "../game/visibility";
import {
  describeAtmosphere,
  describeGovernment,
  describeHydrographics,
  describePopulation,
  describeSize,
  STARPORTS,
} from "../sector/uwp";
import { distanceBetween } from "../sector/hex";
import { starportRank } from "../sector/mains";
import type { World } from "../sector/sec";
import { h, mcr, meter, pct, tons } from "./dom";
import { emblem, kindIcon, withEmblems } from "./emblems";
import { planning, whereIs, type Ctx } from "./gameview";

const LOCS: Loc[] = ["main", "gg", "belt", "deep"];

/* The system pane -------------------------------------------------------- */

export function systemPane(ctx: Ctx): HTMLElement {
  const { game, me } = ctx;
  if (ctx.system === null || !game.worlds.has(ctx.system)) {
    return h("div", {}, h("p", { class: "muted" }, "Click a system on the map."));
  }
  const at = ctx.system;
  const w = game.world(at);
  const ws = game.worldState(at);
  const knownOwner = game.knownOwner(me.id, at);
  const owner = knownOwner === null ? null : game.faction(knownOwner);
  const lag = game.lag(me.id, at);
  // Where news takes time, the capital sees only its own fleets live; the rest
  // is what the couriers have brought.
  const sees = lag > 0 ? new Set<string>() : visibleSystems(game, me.id);
  const u = w.uwp;
  const max = defenceMax(w);
  const selected = ctx.fleet === null ? undefined : game.fleetSeenBy(me.id, ctx.fleet);
  const mineHere = selected !== undefined && selected.transit === null && selected.system === at;
  const heard = game.state.options.newsLag > 0 ? me.news : me.intel;

  const locBlocks = LOCS.filter((l) => locExists(game, at, l)).map((loc) => {
    const mine = game.fleetsSeenBy(me.id).filter((f) => f.transit === null && f.system === at && f.loc === loc);
    const others = sees.has(at) ? game.fleetsAt(at, loc).filter((f) => f.owner !== me.id) : [];
    const here = [...mine, ...others];
    const ghosts = sees.has(at) ? [] : Object.values(heard).filter((s) => s.system === at && s.loc === loc && s.left === undefined);
    const rows: HTMLElement[] = [];
    for (const f of here) {
      const who = game.faction(f.owner);
      const since = f.owner === me.id ? undefined : me.intel[f.id]?.since;
      const age = f.owner === me.id ? game.reportAge(me.id, f.id) : 0;
      rows.push(
        h(
          "div",
          { class: f.owner === me.id ? "card pick" : "card", onclick: f.owner === me.id ? () => ctx.selectFleet(f.id) : undefined },
          h("div", { class: "fleet-head" }, emblem(who, game.state.factions), h("span", { class: "name" }, f.owner === me.id ? f.name : who.name), h("span", { class: "spacer" }), h("span", { class: "muted num" }, `${f.ships.length} ships, ${tons(game.fleetTons(f))}`)),
          f.owner === me.id ? null : h("div", { class: "hint" }, summariseClasses(game, f)),
          since === undefined ? null : h("div", { class: "hint" }, since === game.state.day ? "Arrived today." : `Here since day ${since}.`),
          age > 0 ? h("div", { class: "hint warn" }, `As reported ${age} days ago.`) : null,
        ),
      );
    }
    for (const s of ghosts) {
      const who = game.faction(s.owner);
      rows.push(
        h(
          "div",
          { class: "card" },
          h("div", { class: "fleet-head" }, emblem(who, game.state.factions), h("span", {}, who.name), h("span", { class: "spacer" }), h("span", { class: "muted" }, `${ships(s.ships)}, ${tons(s.tons)}`)),
          h("div", { class: "hint" }, `Here since day ${s.since}; last reported on day ${s.day}, ${game.state.day - s.day} days ago.`),
        ),
      );
    }
    return h(
      "div",
      {},
      h("div", { class: "row" }, h("h2", { style: "margin:10px 0 6px" }, LOC_NAMES[loc]), h("span", { class: "spacer" }),
        mineHere && selected.loc !== loc
          ? h("button", { class: "small", onclick: () => ctx.command(selected, { order: { kind: "move", to: loc } }, `${selected.name} to move to the ${LOC_NAMES[loc].toLowerCase()}.`) }, `Send ${selected.name} here`)
          : null),
      rows.length > 0 ? rows : h("div", { class: "hint" }, sees.has(at) ? "Nobody." : lag > 0 ? "No news." : "Out of sight."),
    );
  });

  const yard = w.uwp.starport === "A" || w.uwp.starport === "B" || w.uwp.starport === "C";
  const departed = Object.values(heard).filter((s) => s.system === at && s.left !== undefined);
  return h(
    "div",
    {},
    h("h3", { style: "font-size:18px" }, w.name),
    h("div", { class: "row muted" }, h("span", { class: "num" }, `${at} · ${w.uwpText}`), w.trade.length > 0 ? h("span", {}, w.trade.join(" ")) : null, w.zone === "A" ? h("span", { class: "warn" }, "Amber zone") : null, w.zone === "R" ? h("span", { class: "bad" }, "Red zone") : null),
    h(
      "p",
      {},
      owner === null ? h("span", { class: "muted" }, "Independent") : h("span", {}, emblem(owner, game.state.factions), " ", owner.name, owner.capital === at ? ", capital" : ""),
      lag > 0 && ws.owner !== me.id ? h("span", { class: "hint" }, ` · news from here takes ${lag} days`) : null,
    ),
    h(
      "dl",
      { class: "props" },
      h("dt", {}, "Starport"), h("dd", {}, `${u.starport}: ${STARPORTS[u.starport] ?? ""}`),
      h("dt", {}, "Size"), h("dd", {}, describeSize(u.size)),
      h("dt", {}, "Atmosphere"), h("dd", {}, describeAtmosphere(u.atmosphere)),
      h("dt", {}, "Hydrographics"), h("dd", {}, describeHydrographics(u.hydrographics)),
      h("dt", {}, "Population"), h("dd", {}, describePopulation(u.population)),
      h("dt", {}, "Government"), h("dd", {}, describeGovernment(u.government)),
      h("dt", {}, "Law level"), h("dd", {}, String(u.law)),
      h("dt", {}, "Tech level"), h("dd", {}, String(u.tl)),
      h("dt", {}, "Bases"), h("dd", {}, w.bases === "" ? "None" : w.bases.split("").map((b) => (b === "N" ? "Naval" : b === "S" ? "Scout" : b)).join(", ")),
      h("dt", {}, "Stars"), h("dd", {}, w.stars || "—"),
      h("dt", {}, "Gas giants"), h("dd", {}, String(w.pbg.giants)),
      h("dt", {}, "Belts"), h("dd", {}, String(w.pbg.belts)),
      h("dt", {}, "Worth"), h("dd", {}, `${mcr(income(w), 2)} a week`),
      h("dt", {}, "Defences"), h("dd", {}, max === 0 ? "None" : h("div", {}, `${Math.round(ws.defence)} of ${max}`, meter(ws.defence / max))),
      ws.siege === null || (lag > 0 && ws.siege.by !== me.id && ws.owner !== me.id) ? null : h("dt", { class: "bad" }, "Siege"),
      ws.siege === null || (lag > 0 && ws.siege.by !== me.id && ws.owner !== me.id) ? null : h("dd", { class: "bad" }, `${game.faction(ws.siege.by).name}, day ${ws.siege.days} of ${captureDays(w)}`),
      h("dt", {}, "Distance"), h("dd", {}, `${distanceBetween(me.capital, at)} parsecs from your capital`),
    ),
    ws.owner === me.id && yard && game.state.phase === "play"
      ? h("div", { class: "row", style: "margin-top:8px" }, h("button", { class: "small", onclick: () => { ctx.yard = at; ctx.setTab("yard"); } }, "Shipyard here"))
      : null,
    ws.owner === null && w.uwp.starport === "A" && game.state.phase === "play"
      ? h("div", { class: "row", style: "margin-top:8px" }, h("button", { class: "small", onclick: () => { ctx.yard = at; ctx.setTab("yard"); } }, "Commission here (independent yard)"))
      : null,
    locBlocks,
    departed.length === 0
      ? null
      : h(
          "div",
          {},
          h("h2", { style: "margin:10px 0 6px" }, "Gone"),
          departed.map((s) =>
            h(
              "div",
              { class: "card" },
              h("div", { class: "fleet-head" }, emblem(game.faction(s.owner), game.state.factions), h("span", {}, game.faction(s.owner).name), h("span", { class: "spacer" }), h("span", { class: "muted" }, `${ships(s.ships)}, ${tons(s.tons)}`)),
              h("div", { class: "hint" }, `Here from day ${s.since}, last seen on day ${s.day}, gone by day ${s.left}.`),
            ),
          ),
        ),
  );
}

function summariseClasses(game: Game, f: Fleet): string {
  const counts = new Map<string, number>();
  for (const s of f.ships) counts.set(game.cls(s).name, (counts.get(game.cls(s).name) ?? 0) + 1);
  return [...counts.entries()].map(([n, c]) => (c > 1 ? `${c}× ${n}` : n)).join(", ");
}

/* The fleets pane -------------------------------------------------------- */

function orderText(game: Game, f: Fleet): string {
  const o = f.order;
  if (o === null) return f.transit !== null ? "Jumping" : "No orders";
  switch (o.kind) {
    case "move":
      return `Moving to the ${LOC_NAMES[o.to].toLowerCase()}`;
    case "jump": {
      const carried = o.tender === true || f.tender === true ? ", jump tenders carrying the ships without drives" : "";
      return o.route.length === 0 ? `Jumping${carried}` : `Jumping to ${o.route.map((at) => game.world(at).name).join(" → ")}${carried}`;
    }
    case "refuel":
      return "Refuelling";
    case "repair":
      return "Repairing";
  }
}

function fleetCard(ctx: Ctx, f: Fleet): HTMLElement {
  const { game } = ctx;
  const hull = game.fleetHullShare(f);
  return h(
    "div",
    { class: `card pick${ctx.fleet === f.id ? " chosen" : ""}`, onclick: () => ctx.selectFleet(f.id) },
    h("div", { class: "fleet-head" }, h("span", { class: "name" }, f.name), h("span", { class: "muted" }, `${f.ships.length} ships`), h("span", { class: "spacer" }), h("span", { class: "muted num" }, `J${game.fleetJump(f)} M${game.fleetThrust(f)}`)),
    h("div", { class: "hint" }, whereIs(game, f)),
    h("div", { class: "hint" }, orderText(game, f)),
    game.reportAge(ctx.me.id, f.id) > 0 ? h("div", { class: "hint warn" }, `As reported ${game.reportAge(ctx.me.id, f.id)} days ago`) : null,
    meter(hull),
  );
}

export function fleetPane(ctx: Ctx): HTMLElement {
  const { game, me } = ctx;
  const mine = game.fleetsSeenBy(me.id).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  // With nothing picked, the first fleet is: an empty pane is no use to anyone.
  if ((ctx.fleet === null || game.fleetSeenBy(me.id, ctx.fleet) === undefined) && mine.length > 0) ctx.fleet = mine[0]!.id;
  const selected = ctx.fleet === null ? undefined : game.fleetSeenBy(me.id, ctx.fleet);
  const detail = selected !== undefined ? fleetDetail(ctx, selected) : h("p", { class: "muted" }, mine.length === 0 ? "You have no fleets. Build some at a shipyard." : "Pick a fleet.");
  return h("div", {}, detail, h("h2", {}, `Your fleets (${mine.length})`), mine.map((f) => fleetCard(ctx, f)));
}

function fleetDetail(ctx: Ctx, f: Fleet): HTMLElement {
  const { game, me } = ctx;
  const inJump = f.transit !== null;
  const here = f.system;
  const fogged = game.fogged(me.id);
  const age = game.reportAge(me.id, f.id);
  // Splitting and merging need the ships in front of you: at your capital, or
  // anywhere when you can see your fleets as they are.
  const inHand = !fogged || (age === 0 && game.lag(me.id, here) === 0);
  const others = inJump || !inHand ? [] : game.fleetsAt(here, f.loc).filter((x) => x.id !== f.id && x.owner === f.owner);
  const set = (order: Fleet["order"], text: string) => ctx.command(f, { order }, text);
  const posted = me.orders.filter((c) => c.fleetId === f.id);
  // Ships with no jump drive, and whether tenders can be had for them here.
  const aboard = game.hangared(f);
  const riders = f.ships.filter((s) => game.cls(s).jump === 0 && !aboard.has(s.id));
  const hangars = game.hangarSpace(f);
  const riderTons = game.carriedTons(f);
  const tenderHere = hiresTenders(game.world(here), game.hostile(f.owner, game.worldState(here).owner)) || f.tender === true;
  if (riders.length === 0 || (!tenderHere && f.tender !== true)) ctx.tender = false;
  const plan = planning(ctx, f);
  const world = game.world(here);
  const hostile = game.hostile(f.owner, game.worldState(here).owner);
  const fuelHere = f.ships.every((s) => fuelSources(world, game.cls(s), hostile).length > 0);
  const repairHere = game.worldState(here).owner === f.owner && repairRate(world.uwp.starport) > 0;

  const moveButtons = LOCS.filter((l) => locExists(game, here, l)).map((l) =>
    h("button", { class: f.loc === l ? "small on" : "small", disabled: inJump || f.loc === l, onclick: () => set({ kind: "move", to: l }, `${f.name} will move to the ${LOC_NAMES[l].toLowerCase()}.`) }, LOC_NAMES[l].replace("Main world orbit", "Orbit")),
  );

  const shipRows = f.ships.map((s) => {
    const c = game.cls(s);
    const crits = [
      s.crits.jump ? "J-drive" : "",
      s.crits.thrust > 0 ? `M-${s.crits.thrust}` : "",
      s.crits.weapons > 0 ? `W-${s.crits.weapons}` : "",
      s.crits.armour > 0 ? `A-${s.crits.armour}` : "",
      s.crits.sensors > 0 ? `S-${s.crits.sensors}` : "",
      s.crits.crew > 0 ? `Crew-${s.crits.crew}` : "",
      s.crits.computer > 0 ? `C-${s.crits.computer}` : "",
    ].filter((x) => x !== "");
    const tick = h("input", {
      type: "checkbox",
      checked: ctx.ships.has(s.id),
      onchange: (e: Event) => {
        if ((e.target as HTMLInputElement).checked) ctx.ships.add(s.id);
        else ctx.ships.delete(s.id);
        ctx.refresh();
      },
    });
    return h(
      "tr",
      { class: ctx.ships.has(s.id) ? "sel" : "" },
      h("td", {}, tick),
      h("td", {}, h("span", { class: "goto", style: "cursor:pointer", onclick: () => showSheet(c) }, s.name), h("div", { class: "hint" }, c.name)),
      h("td", { style: "min-width:70px" }, `${game.hullLeft(s)}/${c.hull}`, meter(game.hullLeft(s) / c.hull)),
      h("td", { style: "min-width:60px" }, `${Math.round(s.fuel)}/${Math.round(c.fuelCapacity)}${s.unrefined ? "u" : ""}`, meter(c.fuelCapacity === 0 ? 0 : s.fuel / c.fuelCapacity, "fuel")),
      h("td", { class: "num" }, c.missiles + c.torpedoes > 0 ? `${s.missiles + s.torpedoes}/${c.missiles + c.torpedoes}` : "—"),
      h("td", { class: crits.length > 0 ? "bad" : "muted" }, crits.join(" ") || "—"),
    );
  });

  return h(
    "div",
    {},
    h(
      "div",
      { class: "row" },
      h("input", {
        type: "text",
        value: f.name,
        style: "font-weight:600;flex:1",
        onchange: (e: Event) => {
          const name = (e.target as HTMLInputElement).value.trim() || f.name;
          f.name = name;
          const real = game.fleet(f.id);
          if (real !== undefined) real.name = name;
          ctx.refresh();
        },
      }),
      h("span", { class: "muted num" }, `J${game.fleetJump(plan)} · M${game.fleetThrust(f)} · range ${game.fleetRange(plan)} pc${f.tender === true ? " · tenders" : ""}`),
    ),
    h("p", { class: "hint" }, `${whereIs(game, f)}. ${orderText(game, f)}. Strength ${Math.round(game.fleetStrength(f))}, ${tons(game.fleetTons(f))}.`),
    fogged ? h("p", { class: age > 0 ? "hint warn" : "hint" }, age > 0 ? `This is ${f.name} as reported on day ${game.state.day - age}, ${age} days ago. Orders take about ${game.lag(me.id, f.transit?.to ?? here)} days to reach it.` : `${f.name} is within sight of your capital: its news is today's.`) : null,
    posted.length > 0 ? h("div", {}, posted.map((c) => h("div", { class: "hint" }, `In the post: ${c.text} Sent day ${c.sent}, arriving about day ${c.arrives}.`))) : null,
    hangars.slots > 0
      ? h(
          "p",
          { class: hangars.filled < hangars.slots ? "hint warn" : "hint" },
          `Hangars: ${hangars.filled} of ${hangars.slots} fighters aboard. Fighters in the hangars jump with their carrier and need no tenders.${hangars.filled < hangars.slots ? " Replace lost ones at a yard that builds small craft, then merge them into this fleet." : ""}`,
        )
      : null,
    h(
      "div",
      { class: "orders" },
      h("div", { class: "row" }, moveButtons),
      h(
        "div",
        { class: "row" },
        h(
          "button",
          {
            class: ctx.choosingJump ? "on" : "",
            disabled: inJump || game.fleetJump(plan) === 0,
            title: game.fleetJump(plan) === 0 ? "A ship in this fleet has no working jump drive: hire tenders for it, or split it off" : "Then click a system on the map",
            onclick: () => {
              ctx.choosingJump = !ctx.choosingJump;
              ctx.refresh();
            },
          },
          "Jump…",
        ),
        h("button", { disabled: inJump || !fuelHere, title: fuelHere ? "" : "Not every ship can refuel here", onclick: () => set({ kind: "refuel" }, `${f.name} will refuel.`) }, "Refuel"),
        h("button", { disabled: inJump || !repairHere, title: repairHere ? "" : "Needs a class A–D starport you hold", onclick: () => set({ kind: "repair" }, `${f.name} will put in for repairs.`) }, "Repair"),
        h("button", { disabled: f.order === null || inJump, onclick: () => set(null, `${f.name}'s orders are cancelled.`) }, "Cancel"),
      ),
      riders.length === 0 || inJump
        ? null
        : h(
            "label",
            { class: "row", style: "color:var(--text);font-size:12px;flex-wrap:nowrap;align-items:flex-start" },
            h("input", {
              type: "checkbox",
              checked: ctx.tender,
              disabled: !tenderHere,
              onchange: (e: Event) => {
                ctx.tender = (e.target as HTMLInputElement).checked;
                ctx.refresh();
              },
            }),
            h(
              "span",
              {},
              `Hire jump tenders for the ${riders.length === 1 ? "ship" : `${riders.length} ships`} without jump drives (${tons(riderTons)}). Tenders jump-${TENDER_JUMP}; ${mcr(tenderCost(riderTons, 1), 2)} a jump of one parsec, ${mcr(tenderCost(riderTons, 2), 2)} for two, ${mcr(tenderCost(riderTons, 3), 2)} for three.`,
              tenderHere ? "" : h("span", { class: "warn" }, " Only a class A or B starport that will deal with you has them."),
            ),
          ),
      inJump || game.fleetRange(plan) >= Math.min(1, game.fleetJump(plan)) || canRefuelAt(game, plan, here)
        ? null
        : h("p", { class: "warn" }, "Not enough fuel to jump, and nowhere here to refuel."),
    ),
    standingOrders(ctx, f),
    h("h2", {}, "Ships"),
    h("table", { class: "ships" }, h("tr", {}, h("th", {}), h("th", {}, "Ship"), h("th", {}, "Hull"), h("th", {}, "Fuel"), h("th", {}, "Ord."), h("th", {}, "Damage")), shipRows),
    h(
      "div",
      { class: "row", style: "margin-top:8px" },
      h(
        "button",
        {
          class: "small",
          disabled: inJump || !inHand || ctx.ships.size === 0 || ctx.ships.size === f.ships.length,
          title: inHand ? "" : "Only at your capital, under full fog of war",
          onclick: () => {
            const real = game.fleet(f.id);
            const made = real === undefined ? null : game.splitFleet(real, [...ctx.ships]);
            if (made !== null && real !== undefined) {
              if (fogged) {
                me.reports[real.id] = game.reportOf(real);
                me.reports[made.id] = game.reportOf(made);
              }
              ctx.say(`${made.name} formed with ${made.ships.length} ships.`);
              ctx.selectFleet(made.id);
            }
          },
        },
        "Split ticked into new fleet",
      ),
      others.length > 0
        ? h(
            "select",
            {
              onchange: (e: Event) => {
                const other = game.fleet((e.target as HTMLSelectElement).value);
                const real = game.fleet(f.id);
                if (other !== undefined && real !== undefined && game.mergeFleets(real, other)) {
                  if (fogged) {
                    delete me.reports[other.id];
                    me.reports[real.id] = game.reportOf(real);
                  }
                  ctx.say(`${other.name} joins ${f.name}.`);
                  ctx.refresh();
                }
              },
            },
            h("option", { value: "" }, "Merge in…"),
            others.map((o) => h("option", { value: o.id }, `${o.name} (${o.ships.length})`)),
          )
        : null,
    ),
  );
}

function standingOrders(ctx: Ctx, f: Fleet): HTMLElement {
  const o = f.standing;
  const change = (patch: Partial<StandingOrders>) => {
    const standing = { ...f.standing, ...patch };
    // Shown at once on the fleet as the player sees it, whether or not it has
    // reached the fleet itself yet.
    f.standing = standing;
    ctx.command(f, { standing }, `New standing orders for ${f.name}.`);
  };
  const preset = Object.entries(STANDING_PRESETS).find(([, p]) => JSON.stringify(p) === JSON.stringify(o))?.[0] ?? "";
  return h(
    "div",
    {},
    h("h2", {}, "Standing orders"),
    h(
      "div",
      { class: "standing" },
      h("label", {}, "Preset"),
      h(
        "select",
        { onchange: (e: Event) => { const p = STANDING_PRESETS[(e.target as HTMLSelectElement).value]; if (p !== undefined) change({ ...p }); } },
        h("option", { value: "", selected: preset === "" }, "Custom"),
        Object.keys(STANDING_PRESETS).map((k) => h("option", { value: k, selected: k === preset }, k)),
      ),
      h("label", {}, "Engage"),
      h(
        "select",
        { onchange: (e: Event) => change({ engage: (e.target as HTMLSelectElement).value as Engage }) },
        h("option", { value: "any", selected: o.engage === "any" }, "Any enemy it meets"),
        h("option", { value: "weaker", selected: o.engage === "weaker" }, "Only fleets it outguns"),
        h("option", { value: "none", selected: o.engage === "none" }, "Only if attacked"),
      ),
      h("label", {}, "Target first"),
      h(
        "select",
        { onchange: (e: Event) => change({ target: (e.target as HTMLSelectElement).value as TargetPriority }) },
        (
          [
            ["warships", "Warships"],
            ["largest", "The largest"],
            ["smallest", "The smallest"],
            ["damaged", "The most damaged"],
            ["unarmed", "Unarmed ships"],
          ] as const
        ).map(([v, l]) => h("option", { value: v, selected: o.target === v }, l)),
      ),
      h("label", {}, "Besiege"),
      h("label", { class: "row" }, h("input", { type: "checkbox", checked: o.besiege, onchange: (e: Event) => change({ besiege: (e.target as HTMLInputElement).checked }) }), "Attack the defences of worlds we do not hold, and hold them until they submit"),
      h("label", {}, "Intercept"),
      h("label", { class: "row" }, h("input", { type: "checkbox", checked: o.intercept, onchange: (e: Event) => change({ intercept: (e.target as HTMLInputElement).checked }) }), "Go after enemies it would engage elsewhere in the system"),
      h("label", {}, "Evade"),
      h("label", { class: "row" }, h("input", { type: "checkbox", checked: o.evade, onchange: (e: Event) => change({ evade: (e.target as HTMLInputElement).checked }) }), "Try to break off whenever attacked"),
      h("label", {}, `Withdraw at ${pct(o.withdrawAt)} hull`),
      h("input", { type: "range", min: 0, max: 100, step: 5, value: Math.round(o.withdrawAt * 100), onchange: (e: Event) => change({ withdrawAt: Number((e.target as HTMLInputElement).value) / 100 }) }),
    ),
  );
}

/* Day zero: the first fleet ---------------------------------------------- */

export function setupPane(ctx: Ctx): HTMLElement {
  const { game, me } = ctx;
  const home = game.fleetsOf(me.id).flatMap((f) => f.ships);
  const spent = home.reduce((s, sh) => s + game.cls(sh).cost, 0);
  return h(
    "div",
    {},
    h("h3", {}, "Commission your first fleet"),
    h(
      "p",
      { class: "hint" },
      `The treasury holds ${mcr(me.credits)}. Anything in the catalogue can be bought for the first fleet, whatever your worlds' tech level; it will be waiting at ${game.world(me.capital).name}. After this, ships are built at your own yards. A Main is every world a jump-1 ship can reach, so to take anyone else's worlds you will need jump-2 or better. Keep something back for fuel and reloads.`,
    ),
    h("h2", {}, `Bought: ${home.length} ships, ${mcr(spent)}`),
    home.length === 0
      ? h("p", { class: "muted" }, "Nothing yet.")
      : h(
          "table",
          { class: "catalogue" },
          home.map((s) => h("tr", {}, h("td", {}, s.name), h("td", {}, game.cls(s).name), h("td", { class: "r num" }, mcr(game.cls(s).cost)), h("td", {}, h("button", { class: "small", onclick: () => { sellStarting(game, me, s.id); ctx.refresh(); } }, "Return")))),
        ),
    h("h2", {}, "Catalogue"),
    catalogueTable(ctx, (cls) => {
      const affordable = cls.cost <= me.credits + 1e-9;
      return h(
        "button",
        {
          class: "small",
          disabled: !affordable,
          onclick: () => {
            const why = buyStarting(game, me, cls.id);
            ctx.say(why === "" ? `A ${cls.name} joins the Home Fleet.` : why, why !== "");
            ctx.refresh();
          },
        },
        "Buy",
      );
    }),
  );
}

/* The shipyard ----------------------------------------------------------- */

function weaponsSummary(attacks: readonly Attack[]): string {
  if (attacks.length === 0) return "Unarmed";
  return attacks
    .map((a) => `${a.count > 1 ? `${a.count}× ` : ""}${a.label}`)
    .join(", ");
}

function catalogueTable(ctx: Ctx, action: (cls: ShipClass) => HTMLElement, price: (cls: ShipClass) => number = (c) => c.cost, note: (cls: ShipClass) => string = () => ""): HTMLElement {
  const classes = ctx.game.catalogue.all();
  return h(
    "table",
    { class: "catalogue" },
    h("tr", {}, h("th", {}, "Class"), h("th", { class: "r" }, "Tons"), h("th", {}, "TL/M/J"), h("th", { class: "r" }, "Hull"), h("th", { class: "r" }, "Price"), h("th", {})),
    classes.map((c) => {
      const why = note(c);
      return h(
        "tr",
        { class: why === "" ? "" : "nope", title: why },
        h(
          "td",
          {},
          h("span", { class: "goto", style: "cursor:pointer", onclick: () => showSheet(c) }, c.name),
          h("div", { class: "hint" }, weaponsSummary(c.attacks)),
          why === "" ? null : h("div", { class: "hint warn" }, why),
        ),
        h("td", { class: "r num" }, c.tons.toLocaleString()),
        h("td", { class: "num" }, `${c.tl}/${c.thrust}/${c.jump}`),
        h("td", { class: "r num" }, `${c.hull}${c.armour > 0 ? `/${c.armour}` : ""}`),
        h("td", { class: "r num" }, mcr(price(c))),
        h("td", {}, action(c)),
      );
    }),
  );
}

export function shipyardPane(ctx: Ctx): HTMLElement {
  const { game, me } = ctx;
  // Best yards first: by starport class, then by tech level, highest first.
  const byYard = (a: World, b: World) =>
    starportRank(a.uwp.starport) - starportRank(b.uwp.starport) || b.uwp.tl - a.uwp.tl || a.name.localeCompare(b.name);
  const own = game.ownedWorlds(me.id).filter((w) => ["A", "B", "C"].includes(w.uwp.starport)).sort(byYard);
  const independent = game.state.sector.worlds
    .filter((w) => w.uwp.starport === "A" && game.worldState(w.at).owner === null)
    .sort(byYard);
  const yards = [...own, ...independent];
  if (ctx.yard === null || !yards.some((w) => w.at === ctx.yard)) ctx.yard = own.find((w) => w.uwp.starport === "A")?.at ?? yards[0]?.at ?? null;
  const yard = ctx.yard === null ? undefined : game.world(ctx.yard);
  const isOwn = yard !== undefined && game.worldState(yard.at).owner === me.id;

  const picker = h(
    "select",
    { onchange: (e: Event) => { ctx.yard = (e.target as HTMLSelectElement).value; ctx.refresh(); } },
    own.length > 0 ? h("optgroup", { label: "Your yards" }, own.map((w) => h("option", { value: w.at, selected: w.at === ctx.yard }, `${w.name} (${w.uwp.starport}, TL${w.uwp.tl})`))) : null,
    independent.length > 0 ? h("optgroup", { label: "Independent yards, 20% dearer" }, independent.map((w) => h("option", { value: w.at, selected: w.at === ctx.yard }, `${w.name} (TL${w.uwp.tl}, ${distanceBetween(me.capital, w.at)} pc)`))) : null,
  );

  const today = game.state.day;
  const queue = me.builds.map((b) =>
    h(
      "tr",
      {},
      h("td", {}, b.name),
      h("td", {}, game.catalogue.get(b.classId).name),
      h("td", {}, game.world(b.at).name),
      h("td", { class: "r num" }, (b.start ?? today) > today ? `waits to day ${b.start}` : "on the slips"),
      h("td", { class: "r num" }, `day ${b.done}`),
    ),
  );
  const slipLine = (() => {
    if (yard === undefined) return null;
    const total = slipsAt(yard);
    const onSlips = game.buildsAt(yard.at).filter((b) => (b.start ?? today) <= today && b.done > today).length;
    const waiting = game.buildsAt(yard.at).filter((b) => (b.start ?? today) > today).length;
    const next = game.scheduleAt(yard.at, 0).start;
    return h(
      "p",
      { class: "hint" },
      `${total} slip${total === 1 ? "" : "s"}, ${onSlips} in use${waiting > 0 ? `, ${waiting} waiting` : ""}. ${next > today ? `The next slip comes free on day ${next}.` : "A slip is free now."}`,
    );
  })();

  return h(
    "div",
    {},
    h("h3", {}, "Shipyard"),
    h("p", { class: "hint" }, "A class A yard builds starships, class B spacecraft without a jump drive, class C small craft under 100 tons; none above its world's tech level. Independent class A yards build for anyone at a markup. New ships join a Yard fleet in orbit."),
    yards.length === 0 ? h("p", { class: "warn" }, "No yard will build for you.") : h("div", { class: "row" }, picker, h("span", { class: "credits" }, mcr(me.credits))),
    h(
      "div",
      { class: "row", style: "margin-top:6px" },
      h(
        "button",
        {
          class: "small",
          title: "Add a design saved by the Traveller Ship Designer to this game's catalogue",
          onclick: async () => {
            const file = await chooseFile(".ship,.json");
            if (file === null) return;
            try {
              const design = parseDesign(file.text);
              const id = idFor(design.name, new Set(Object.keys(game.state.designs)));
              game.state.designs[id] = design;
              game.catalogue.add(id, design);
              ctx.say(`${design.name} added to the catalogue.`);
            } catch (error) {
              ctx.say(error instanceof Error ? error.message : String(error), true);
            }
            ctx.refresh();
          },
        },
        "Import a .ship design…",
      ),
      h("a", { href: "https://doomy66.github.io/Traveller-Ship-Design/", target: "_blank", rel: "noopener", class: "hint" }, "Design one in the Ship Designer"),
    ),
    queue.length > 0 ? h("div", {}, h("h2", {}, "Building"), h("table", {}, queue)) : null,
    slipLine,
    yard === undefined
      ? null
      : h(
          "div",
          {},
          h("h2", {}, `${yard.name} yard`),
          catalogueTable(
            ctx,
            (cls) => {
              const ok = canBuildAt(yard, cls) && yardPrice(cls, isOwn) <= me.credits + 1e-9;
              return h(
                "button",
                {
                  class: "small",
                  disabled: !ok,
                  onclick: () => {
                    const why = orderBuild(game, me, cls.id, yard.at);
                    ctx.say(why === "" ? `The ${cls.name} is laid down at ${yard.name}.` : why, why !== "");
                    ctx.refresh();
                  },
                },
                (() => {
                  const days = buildDaysFor(cls, game.state.options.buildSpeed);
                  const when = game.scheduleAt(yard.at, days);
                  return when.start > game.state.day ? `Queue · day ${when.done}` : `Build · ${days}d`;
                })(),
              );
            },
            (cls) => yardPrice(cls, isOwn),
            (cls) => {
              if (!canBuildAt(yard, cls)) return whyNotBuild(yard, cls);
              return yardPrice(cls, isOwn) > me.credits ? "More than the treasury holds" : "";
            },
          ),
        ),
  );
}

/* The empire ------------------------------------------------------------- */

export function empirePane(ctx: Ctx): HTMLElement {
  const { game, me } = ctx;
  const worlds = game.ownedWorlds(me.id).sort((a, b) => income(b) - income(a));
  const inc = worlds.reduce((s, w) => s + income(w), 0);
  const upkeep = game.fleetsOf(me.id).reduce((s, f) => s + f.ships.reduce((t, sh) => t + game.cls(sh).upkeep, 0), 0);
  const populated = game.state.sector.worlds.filter((w) => w.uwp.population > 0).length;
  const need = Math.ceil(populated * game.state.options.victoryShare);
  const standings = game.state.factions
    .map((f) => ({ f, worlds: game.ownedWorlds(f.id).filter((w) => w.uwp.population > 0).length }))
    .sort((a, b) => b.worlds - a.worlds);
  return h(
    "div",
    {},
    h("h3", {}, me.name),
    h("p", { class: "hint" }, `${me.playerName}, ruling the ${me.main} Main from ${game.world(me.capital).name}.`),
    h(
      "dl",
      { class: "props" },
      h("dt", {}, "Treasury"), h("dd", {}, mcr(me.credits)),
      (me.disorderUntil ?? 0) > game.state.day ? h("dt", { class: "bad" }, "Disorder") : null,
      (me.disorderUntil ?? 0) > game.state.day ? h("dd", { class: "bad" }, `Until day ${me.disorderUntil}: income a quarter, yards idle`) : null,
      h("dt", {}, "Income"), h("dd", {}, `${mcr(inc)} a week`),
      h("dt", {}, "Upkeep"), h("dd", {}, `${mcr(upkeep, 2)} a week`),
      h("dt", {}, "Fleet"), h("dd", {}, `${game.fleetsOf(me.id).reduce((n, f) => n + f.ships.length, 0)} ships in ${game.fleetsOf(me.id).length} fleets`),
      h("dt", {}, "To win"), h("dd", {}, `Hold ${need} of the ${populated} peopled worlds`),
    ),
    fogSettings(ctx),
    h("h2", {}, "Standings"),
    h(
      "table",
      {},
      h("tr", {}, h("th", {}, "Faction"), h("th", { class: "r" }, "Peopled worlds"), h("th", {})),
      standings.slice(0, 40).map(({ f, worlds: n }) =>
        h("tr", {}, h("td", { style: f.alive ? "" : "text-decoration:line-through;opacity:.5" }, emblem(f, game.state.factions), " ", f.name, f.human ? h("span", { class: "muted" }, ` (${f.playerName})`) : null), h("td", { class: "r num" }, n), h("td", {}, h("button", { class: "small", onclick: () => ctx.selectSystem(f.capital, true) }, "Capital"))),
      ),
    ),
    h("h2", {}, `Your worlds (${worlds.length})`),
    h(
      "table",
      {},
      h("tr", {}, h("th", {}, "World"), h("th", {}, "UWP"), h("th", { class: "r" }, "MCr/wk"), h("th", {}, "Defences")),
      worlds.map((w) => {
        const ws = game.worldState(w.at);
        const max = defenceMax(w);
        return h(
          "tr",
          { style: "cursor:pointer", onclick: () => ctx.selectSystem(w.at, true) },
          h("td", {}, w.name, ws.siege !== null ? h("span", { class: "bad" }, " under siege") : null),
          h("td", { class: "num" }, w.uwpText),
          h("td", { class: "r num" }, income(w).toFixed(2)),
          h("td", {}, max === 0 ? "—" : meter(ws.defence / max)),
        );
      }),
    ),
  );
}

/** How fast news travels, and full fog of war: changeable at any time. */
function fogSettings(ctx: Ctx): HTMLElement {
  const { game } = ctx;
  const o = game.state.options;
  return h(
    "div",
    {},
    h("h2", {}, "Fog of war"),
    h(
      "div",
      { class: "standing" },
      h("label", {}, "News travels"),
      h(
        "select",
        {
          onchange: (e: Event) => {
            game.setFog(Number((e.target as HTMLSelectElement).value), o.fullFog);
            ctx.say(o.newsLag === 0 ? "News now arrives instantly." : `News now travels a week per jump-${o.newsLag}.`);
            ctx.refresh();
          },
        },
        (
          [
            [0, "Instantly"],
            [4, "By express boat: a week per jump-4"],
            [2, "By courier: a week per jump-2"],
            [1, "By trader: a week per parsec"],
          ] as const
        ).map(([v, label]) => h("option", { value: v, selected: o.newsLag === v }, label)),
      ),
      h("label", {}, "Full fog"),
      h(
        "label",
        { class: "row" },
        h("input", {
          type: "checkbox",
          checked: o.fullFog,
          disabled: o.newsLag === 0,
          onchange: (e: Event) => {
            game.setFog(o.newsLag, (e.target as HTMLInputElement).checked);
            ctx.say(o.fullFog ? "Full fog: your own fleets now report by courier, and orders go the same way." : "Full fog off: you see your own fleets as they are.");
            ctx.refresh();
          },
        }),
        "Your own fleets report by courier too, and your orders take as long to reach them",
      ),
    ),
    h("p", { class: "hint" }, "These apply to every player, and can be changed at any time."),
  );
}

/* Reports ---------------------------------------------------------------- */

export function reportsPane(ctx: Ctx, goto: (at: string) => void): HTMLElement {
  const { game, me } = ctx;
  const entries = game.logFor(me.id, 300);
  const byDay = new Map<number, LogEntry[]>();
  for (const e of entries) {
    const list = byDay.get(e.day) ?? [];
    list.push(e);
    byDay.set(e.day, list);
  }
  const newIndex = ctx.newFrom;
  return h(
    "div",
    {},
    [...byDay.entries()].map(([day, list]) =>
      h(
        "div",
        {},
        h("h2", {}, day === 0 ? "Before the first day" : `Day ${day}`),
        list.map((e) => {
          const isNew = e.day > newIndex;
          return h(
            "div",
            { class: `log-entry ${e.kind}${isNew ? " new" : ""}${game.concerns(e, me.id) ? "" : " others"}` },
            h(
              "div",
              { class: "log-line" },
              kindIcon(e.kind),
              h("span", {}, e.at !== undefined ? h("span", { class: "goto", onclick: () => goto(e.at!) }, withEmblems(e.text, game.state.factions)) : withEmblems(e.text, game.state.factions)),
            ),
            e.happened !== undefined ? h("div", { class: "hint" }, `News of day ${e.happened}, ${e.day - e.happened} days on the way.`) : null,
            e.detail !== undefined && e.detail.length > 0 ? h("details", {}, h("summary", { class: "hint" }, "Details"), h("pre", {}, e.detail.join("\n"))) : null,
          );
        }),
      ),
    ),
  );
}

/* A ship's design sheet --------------------------------------------------- */

export function showSheet(cls: ShipClass): void {
  const s = cls.sheet;
  const close = () => box.remove();
  const box = h(
    "div",
    { class: "modal", onclick: (e: Event) => { if (e.target === box) close(); } },
    h(
      "div",
      { class: "modal-box" },
      h("div", { class: "row" }, h("h3", { style: "font-size:18px" }, cls.name), h("span", { class: "spacer" }), h("button", { class: "small", onclick: close }, "Close")),
      h("p", { class: "hint" }, cls.notes),
      h(
        "dl",
        { class: "props" },
        h("dt", {}, "Hull"), h("dd", {}, `${cls.tons.toLocaleString()} tons, ${cls.hull} hull points, armour ${cls.armour}, TL${cls.tl}`),
        h("dt", {}, "Drives"), h("dd", {}, `Thrust ${cls.thrust}, jump-${cls.jump}; ${Math.round(cls.fuelCapacity)} tons of jump fuel (${cls.jump > 0 ? `${Math.round(jumpFuel(cls.tons, 1))} a parsec` : "no jump drive"})`),
        h("dt", {}, "Fuel"), h("dd", {}, `${cls.canSkim ? "Skims gas giants" : "Cannot skim"}; ${cls.canWaterRefuel ? "can take on water" : "cannot land for water"}${cls.fuelProcessor ? "; refines its own fuel" : ""}`),
        h("dt", {}, "Weapons"), h("dd", {}, weaponsSummary(cls.attacks)),
        h("dt", {}, "Defence"), h("dd", {}, [cls.sandcasters > 0 ? `${cls.sandcasters} sandcasters` : "", cls.pointDefence > 0 ? `point defence ${cls.pointDefence}D` : "", cls.mesonScreen > 0 ? "meson screen" : "", cls.nuclearDamper > 0 ? "nuclear damper" : ""].filter((x) => x !== "").join(", ") || "None"),
        h("dt", {}, "Fire control"), h("dd", {}, `Fire Control/${cls.fireControl}, Evade/${cls.evade}, sensors DM ${cls.sensorDm >= 0 ? "+" : ""}${cls.sensorDm}`),
        h("dt", {}, "Ordnance"), h("dd", {}, `${cls.missiles} missiles, ${cls.torpedoes} torpedoes`),
        cls.hangars.length > 0 ? h("dt", {}, "Hangars") : null,
        cls.hangars.length > 0 ? h("dd", {}, cls.hangars.map((hg) => `${hg.slots} × ${hg.label} (${hg.tons} t), which come with her`).join("; ")) : null,
        h("dt", {}, "Crew"), h("dd", {}, `${cls.crew}; cargo ${s.cargoTons} tons`),
        h("dt", {}, "Price"), h("dd", {}, `${mcr(cls.cost, 3)}; upkeep ${mcr(cls.upkeep, 3)} a week; built in ${cls.buildDays} days by the book`),
        h("dt", {}, "Strength"), h("dd", {}, String(cls.strength)),
      ),
      h("h2", {}, "Design sheet, from the Ship Designer engine"),
      h(
        "table",
        { class: "sheet" },
        h("tr", {}, h("th", {}, "Section"), h("th", {}, "Component"), h("th", { class: "r" }, "Tons"), h("th", { class: "r" }, "MCr"), h("th", { class: "r" }, "Power")),
        s.lines.map((l) => h("tr", {}, h("td", { class: "muted" }, l.section), h("td", {}, l.label), h("td", { class: "r num" }, l.tons ?? "—"), h("td", { class: "r num" }, l.cost === undefined ? "—" : l.cost.toFixed(3)), h("td", { class: "r num" }, l.power ?? ""))),
      ),
    ),
  );
  document.body.append(box);
}
