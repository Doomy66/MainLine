/**
 * The panes down the side of the game screen.
 */

import { ships } from "../game/game";
import { idFor, parseDesign } from "../catalogue/catalogue";
import { roleOf, type Role } from "../catalogue/roles";
import type { Attack, ShipClass } from "../catalogue/shipclass";
import { locExists } from "../game/day";
import type { Game } from "../game/game";
import type { Catalogue } from "../catalogue/catalogue";
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
import { describeTemper, oddsWanted, withdrawAt } from "../game/temper";
import { admiralText, alerts, fleetStatus, type Alert, type FleetState, type FleetStatus } from "../game/attention";
import type { Admiral, Build, Engage, Fleet, Loc, LogEntry, StandingOrders, TargetPriority } from "../game/types";
import { LOC_NAMES, STANDING_PRESETS } from "../game/types";
import { visibleSystems } from "../game/visibility";
import {
  describeAtmosphere,
  describeGovernment,
  describeHydrographics,
  describePopulation,
  describeSize,
  describeHeadcount,
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
    const mine = game.fleetsSeenBy(me.id).filter((f) => f.transit === null && f.system === at && f.loc === loc && f.order?.kind !== "garrison");
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
      ...(() => {
        const garrison = game.fleetsSeenBy(me.id).filter((f) => f.transit === null && f.system === at && f.order?.kind === "garrison");
        if (garrison.length === 0) return [];
        const all = garrison.flatMap((f) => f.ships);
        const probe = { ...garrison[0]!, ships: all };
        return [h("dt", {}, "Garrison"), h("dd", {}, `${ships(all.length)}: ${summariseClasses(game, probe)}`)];
      })(),
      h("dt", {}, "Navy"),
      h(
        "dd",
        {},
        (() => {
          const navy = game.navyOf(at);
          if (navy.cls === undefined || navy.full === 0) return "None";
          return `${navy.boats} of ${navy.full} ${navy.cls.name}${navy.full === 1 ? "" : "s"}`;
        })(),
      ),
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
    yard && (ws.owner === me.id || ws.owner === null) ? slipsHere(ctx, at) : null,
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

/**
 * A yard's slips at a glance: what is on each and when she is due, and what
 * waits for one. Only at yards the player may build at; another Empire's ship
 * at an independent yard is shown as taken, not named.
 */
function slipsHere(ctx: Ctx, at: string): HTMLElement | null {
  const { game, me } = ctx;
  const total = slipsAt(game.world(at));
  if (total === 0) return null;
  const today = game.state.day;
  const on = game.slipsTomorrow(at);
  const ownerOf = (b: Build) => game.state.factions.find((f) => f.builds.includes(b));
  const due = (b: Build) => `day ${b.done} (${b.done - today} ${b.done - today === 1 ? "day" : "days"})`;
  const building = [...on].filter(([, n]) => n > 0);
  const waiting = [...on].filter(([, n]) => n === 0);
  const used = building.reduce((t, [, n]) => t + n, 0);
  const what = (b: Build) => (ownerOf(b) === me ? `${game.catalogue.get(b.classId).name} ${b.name}` : "Another Empire's ship");
  const rows = [
    ...building.map(([b, n]) =>
      h("tr", {}, h("td", {}, what(b)), h("td", { class: "muted" }, n === 1 ? "1 slip" : `${n} slips`), h("td", { class: "r num" }, ownerOf(b) === me ? due(b) : "")),
    ),
    ...Array.from({ length: Math.max(0, total - used) }, () => h("tr", {}, h("td", { class: "muted" }, "Free"), h("td", {}), h("td", {}))),
    ...waiting.map(([b]) =>
      h("tr", {}, h("td", {}, what(b)), h("td", { class: "muted" }, "waiting"), h("td", { class: "r num" }, ownerOf(b) === me ? `starts day ${b.start}, due ${due(b)}` : "")),
    ),
  ];
  return h(
    "div",
    {},
    h("h2", {}, `Shipyard: ${total} slip${total === 1 ? "" : "s"}, ${used} in use`),
    h("table", { class: "slips" }, rows),
  );
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
    case "garrison":
      return `Garrisoning ${game.world(f.system).name}`;
  }
}

/** The fleet list's search, sort and open sections, kept while the game is open. */
const listView = { search: "", sort: "name" as "name" | "place" | "strength", open: { needs: true, busy: true, parked: false } as Record<FleetState, boolean> };

const MARKS: Record<FleetStatus["mark"], string> = {
  jump: "↗", move: "→", siege: "◎", fight: "✸", repair: "✚", fuel: "⛽", hurt: "!", hangar: "▢", idle: "?", home: "⌂", admiral: "★",
};

/**
 * Every fleet, one line each, grouped by what it needs: those waiting on you,
 * those busy, and those at rest at home. Searchable by name, place or class.
 */
function fleetList(ctx: Ctx, fleets: readonly Fleet[]): HTMLElement {
  const { game } = ctx;
  const q = listView.search.trim().toLowerCase();
  const where = (f: Fleet) => game.world(f.transit?.to ?? f.system).name;
  const shown = fleets.filter(
    (f) => q === "" || f.name.toLowerCase().includes(q) || where(f).toLowerCase().includes(q) || f.ships.some((s) => game.cls(s).name.toLowerCase().includes(q)),
  );
  const by = {
    name: (a: Fleet, b: Fleet) => a.name.localeCompare(b.name, undefined, { numeric: true }),
    place: (a: Fleet, b: Fleet) => where(a).localeCompare(where(b)) || a.name.localeCompare(b.name, undefined, { numeric: true }),
    strength: (a: Fleet, b: Fleet) => game.fleetStrength(b) - game.fleetStrength(a),
  }[listView.sort];
  const groups: { state: FleetState; title: string; fleets: Fleet[] }[] = [
    { state: "needs", title: "Needs orders", fleets: [] },
    { state: "busy", title: "Busy", fleets: [] },
    { state: "parked", title: "At home", fleets: [] },
  ];
  const status = new Map(shown.map((f) => [f.id, fleetStatus(game, f)]));
  for (const f of [...shown].sort(by)) groups.find((g) => g.state === status.get(f.id)!.state)!.fleets.push(f);
  const search = h("input", {
    type: "search",
    placeholder: "Find a fleet, place or class",
    value: listView.search,
    style: "flex:1;min-width:0",
    oninput: (e: Event) => {
      listView.search = (e.target as HTMLInputElement).value;
      const at = (e.target as HTMLInputElement).selectionStart;
      ctx.refresh();
      const again = document.querySelector<HTMLInputElement>(".fleet-search input");
      again?.focus();
      if (at !== null) again?.setSelectionRange(at, at);
    },
  });
  return h(
    "div",
    {},
    h("h2", {}, `Your fleets (${fleets.length})`),
    h(
      "div",
      { class: "row fleet-search" },
      search,
      h(
        "select",
        { onchange: (e: Event) => { listView.sort = (e.target as HTMLSelectElement).value as typeof listView.sort; ctx.refresh(); } },
        (["name", "place", "strength"] as const).map((k) => h("option", { value: k, selected: listView.sort === k }, `By ${k}`)),
      ),
    ),
    groups.map((g) =>
      g.fleets.length === 0
        ? null
        : h(
            "details",
            {
              class: `fleet-group ${g.state}`,
              open: listView.open[g.state] || q !== "" || g.fleets.some((f) => f.id === ctx.fleet),
              ontoggle: (e: Event) => { if (q === "") listView.open[g.state] = (e.target as HTMLDetailsElement).open; },
            },
            h("summary", {}, `${g.title} (${g.fleets.length})`),
            h(
              "table",
              { class: "fleet-rows" },
              g.fleets.map((f) => {
                const st = status.get(f.id)!;
                return h(
                  "tr",
                  { class: ctx.fleet === f.id ? "chosen" : "", onclick: () => ctx.selectFleet(f.id, true), title: st.text },
                  h("td", { class: `mark ${st.mark}` }, MARKS[st.mark]),
                  h("td", { class: "fname" }, f.name, h("div", { class: "hint" }, st.text)),
                  h("td", { class: "r num" }, `${f.ships.length}`),
                  h("td", { class: "r num muted" }, `${Math.round(game.fleetStrength(f))}`),
                );
              }),
            ),
          ),
    ),
    shown.length === 0 && q !== "" ? h("p", { class: "muted" }, "No fleet matches.") : null,
  );
}

export function fleetPane(ctx: Ctx): HTMLElement {
  const { game, me } = ctx;
  // A garrison is part of its world's defences, not a fleet to command.
  const mine = game
    .fleetsSeenBy(me.id)
    .filter((f) => f.order?.kind !== "garrison")
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  // With nothing picked, the first that needs orders is: an empty pane is no use to anyone.
  if ((ctx.fleet === null || !mine.some((f) => f.id === ctx.fleet)) && mine.length > 0) {
    ctx.fleet = (mine.find((f) => fleetStatus(game, f).state === "needs") ?? mine[0]!).id;
  }
  const selected = ctx.fleet === null ? undefined : mine.find((f) => f.id === ctx.fleet);
  const detail = selected !== undefined ? fleetDetail(ctx, selected) : h("p", { class: "muted" }, mine.length === 0 ? "You have no fleets. Build some at a shipyard." : "Pick a fleet.");
  return h("div", {}, detail, fleetList(ctx, mine));
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
    hangars.slots > 0 && riders.length > 0 && !game.tendered(f)
      ? h(
          "p",
          { class: "warn" },
          `${riders.length} craft ${riders.length === 1 ? "has" : "have"} no hangar, so ${f.name} cannot jump. Split ${riders.length === 1 ? "one" : riders.length} of its fighters off into a new fleet, or hire tenders for the jump.`,
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
        inJump || game.worldState(here).owner !== f.owner
          ? null
          : h(
              "button",
              {
                title: "Give these ships to this world's defences, for good: they guard its orbit, leave your fleets and the map, and take no more orders",
                onclick: () => {
                  const world = game.world(here).name;
                  const ok = window.confirm(
                    `${f.name}'s ${ships(f.ships.length)} will join ${world}'s defences for good. They will guard its orbit, but leave your fleets and the map, and can never be given orders again. They are lost if ${world} is. Go ahead?`,
                  );
                  if (ok) ctx.command(f, { order: { kind: "garrison" }, standing: { ...STANDING_PRESETS["Guard"]! } }, `${f.name} will join ${world}'s defences.`);
                },
              },
              "Add to defences",
            ),
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
    admiralPanel(ctx, f),
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
                if (other === undefined || real === undefined) return;
                // Warn before a merge leaves craft with no hangar: a fleet
                // like that cannot jump without tenders.
                const joined = { ...real, ships: [...real.ships, ...other.ships] };
                if (unhoused(game, joined) > 0 && game.hangarSpace(joined).slots > 0 && !game.tendered(real)) {
                  const n = unhoused(game, joined);
                  const ok = window.confirm(
                    `Merging leaves ${n} craft with no hangar (${game.hangarSpace(joined).slots} hangars, all full), so ${f.name} could not jump without hiring tenders. Merge anyway?`,
                  );
                  if (!ok) {
                    ctx.refresh();
                    return;
                  }
                }
                if (game.mergeFleets(real, other)) {
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

/**
 * Hand a fleet to an admiral, who gives it its orders from then on: to take
 * worlds near a base, or defend them; boldly, steadily or carefully. Any order
 * given the fleet by hand relieves the admiral.
 */
function admiralPanel(ctx: Ctx, f: Fleet): HTMLElement | null {
  const { game, me } = ctx;
  if (game.state.phase !== "play" || f.order?.kind === "garrison") return null;
  const a = f.admiral;
  const now = f.transit?.to ?? f.system;
  const base = a?.base ?? (game.worldState(now).owner === me.id ? now : me.capital);
  const bases = game.ownedWorlds(me.id).sort((x, y) => x.name.localeCompare(y.name));
  const hand = (next: Admiral | null, text: string) => ctx.command(f, { admiral: next }, text);
  const current = { mission: a?.mission ?? "conquer", style: a?.style ?? "steady", base } as Admiral;
  const set = (change: Partial<Admiral>) => {
    const next = { ...current, ...change };
    hand(next, `${f.name}'s admiral will be ${admiralText(game, { ...f, admiral: next })}.`);
  };
  return h(
    "div",
    { class: `admiral${a !== undefined ? " on" : ""}` },
    h("h2", {}, "Admiral"),
    h(
      "div",
      { class: "standing" },
      h("label", {}, "Orders"),
      h(
        "select",
        {
          onchange: (e: Event) => {
            const v = (e.target as HTMLSelectElement).value;
            if (v === "none") hand(null, `${f.name}'s admiral is relieved: the fleet waits on your orders.`);
            else set({ mission: v as Admiral["mission"] });
          },
        },
        h("option", { value: "none", selected: a === undefined }, "None: you give the orders"),
        h("option", { value: "conquer", selected: a?.mission === "conquer" }, "Take worlds near a base"),
        h("option", { value: "defend", selected: a?.mission === "defend" }, "Defend the worlds near a base"),
      ),
      h("label", {}, "Style"),
      h(
        "select",
        { disabled: a === undefined, onchange: (e: Event) => set({ style: (e.target as HTMLSelectElement).value as Admiral["style"] }) },
        h("option", { value: "bold", selected: current.style === "bold" }, "Bold: attacks at even odds, fights on"),
        h("option", { value: "steady", selected: current.style === "steady" }, "Steady"),
        h("option", { value: "careful", selected: current.style === "careful" }, "Careful: wants two to one, breaks off early"),
      ),
      h("label", {}, "Base"),
      h(
        "select",
        { disabled: a === undefined, onchange: (e: Event) => set({ base: (e.target as HTMLSelectElement).value }) },
        bases.map((w) => h("option", { value: w.at, selected: w.at === base }, `${w.name}${w.at === me.capital ? " (capital)" : ""}`)),
      ),
    ),
    h(
      "p",
      { class: "hint" },
      a === undefined
        ? "Hand the fleet to an admiral and it gives itself orders each day: it picks worlds it can beat near its base, refuels, mends when hurt, and comes back to base when there is nothing to do."
        : `Admiral: ${admiralText(game, f)}. It gives the fleet its own orders; any order you give by hand relieves it.`,
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
      `The treasury holds ${mcr(me.credits)}. Anything in the catalogue can be bought for the first fleet, whatever your worlds' tech level; it will be waiting at ${game.world(me.capital).name}. After this, ships are built at your own yards. Your Empire starts as every world a jump-1 ship can reach, so to take anyone else's worlds you will need jump-2 or better. Keep something back for fuel and reloads.`,
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

/**
 * The catalogue's sections, in order, and whether each is open. Warships and
 * system defence start open; capital ships and civilians start closed. A
 * section stays as the player left it for the rest of the session.
 */
const SECTIONS: readonly { role: Role; title: string; hint: string }[] = [
  { role: "warship", title: "Warships", hint: "starships built to fight" },
  { role: "defence", title: "System defence", hint: "no jump drive: tenders or a carrier to go anywhere" },
  { role: "capital", title: "Capital ships", hint: "5,000 tons and up" },
  { role: "civilian", title: "Civilian and support", hint: "traders, liners, scouts and utility craft" },
];
const sectionOpen: Record<Role, boolean> = { warship: true, defence: true, capital: false, civilian: false };

function catalogueTable(ctx: Ctx, action: (cls: ShipClass) => HTMLElement, price: (cls: ShipClass) => number = (c) => c.cost, note: (cls: ShipClass) => string = () => ""): HTMLElement {
  const all = ctx.game.catalogue.all();
  return h(
    "div",
    {},
    SECTIONS.map((sec) => {
      const classes = all.filter((c) => roleOf(c) === sec.role);
      if (classes.length === 0) return null;
      return h(
        "details",
        {
          class: "catalogue-group",
          open: sectionOpen[sec.role],
          ontoggle: (e: Event) => {
            sectionOpen[sec.role] = (e.target as HTMLDetailsElement).open;
          },
        },
        h("summary", {}, `${sec.title} (${classes.length})`, h("span", { class: "hint" }, ` ${sec.hint}`)),
        classRows(ctx.game.catalogue, classes, action, price, note),
      );
    }),
  );
}

/** A carrier's tag: the fighters that come with it, a full hangar's worth. */
function carrierTag(c: ShipClass, catalogue: Catalogue): HTMLElement | null {
  if (c.hangars.length === 0) return null;
  const aboard = c.hangars.map((hg) => {
    const name = catalogue.fighterFor(hg)?.name ?? "fighter";
    return `${hg.slots} ${/fighter$/i.test(name) ? `${name}s` : `${name} fighters`}`;
  });
  return h(
    "span",
    { class: "tag", title: "Built with a full set of fighters, in the price. Buy more only to replace losses: fighters beyond the hangars need tenders to jump." },
    `Comes with ${aboard.join(" and ")}`,
  );
}

/** Craft without a jump drive in a fleet that no hangar holds. */
function unhoused(game: Game, f: Fleet): number {
  const aboard = game.hangared(f);
  return f.ships.filter((s) => game.cls(s).jump === 0 && !aboard.has(s.id)).length;
}

function classRows(
  catalogue: Catalogue,
  classes: readonly ShipClass[],
  action: (cls: ShipClass) => HTMLElement,
  price: (cls: ShipClass) => number,
  note: (cls: ShipClass) => string,
): HTMLElement {
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
          carrierTag(c, catalogue),
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
  const queue = me.builds.map((b) => {
    const on = game.slipsTomorrow(b.at).get(b) ?? 0;
    return h(
      "tr",
      {},
      h("td", {}, b.name),
      h("td", {}, game.catalogue.get(b.classId).name),
      h("td", {}, game.world(b.at).name),
      h("td", { class: "r num" }, on === 0 ? `waits to day ${b.start}` : on > 1 ? `on ${on} slips` : "on the slips"),
      h("td", { class: "r num" }, `day ${b.done}`),
    );
  });
  const slipLine = (() => {
    if (yard === undefined) return null;
    const total = slipsAt(yard);
    const tomorrow = [...game.slipsTomorrow(yard.at).values()];
    const onSlips = tomorrow.reduce((n, s) => n + s, 0);
    const waiting = tomorrow.filter((s) => s === 0).length;
    const next = game.scheduleAt(yard.at, 1).start;
    const spare = tomorrow.reduce((n, s) => n + Math.max(0, s - 1), 0);
    const now =
      next > today
        ? `The next slip comes free on day ${next}.`
        : onSlips < total
          ? "A slip is free now."
          : `A new order takes back ${spare === 1 ? "the spare slip" : "a spare slip"} from a big ship.`;
    return h("p", { class: "hint" }, `${total} slip${total === 1 ? "" : "s"}, ${onSlips} in use${waiting > 0 ? `, ${waiting} waiting` : ""}. ${now}`);
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
      h(
        "a",
        { href: "https://github.com/Doomy66/MainLine/issues/new?title=Ship%20design%3A%20", target: "_blank", rel: "noopener", class: "hint", title: "Attach the .ship file to the issue" },
        "Suggest a design for the catalogue",
      ),
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
                  const when = game.scheduleAt(yard.at, buildDaysFor(cls, game.state.options.buildSpeed), cls.tons);
                  return when.start > game.state.day ? `Queue · day ${when.done}` : `Build · ${when.done - game.state.day}d`;
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
  const target = game.victoryTarget();
  const byPeople = target.by === "population";
  const share = (n: number, of: number) => `${of === 0 ? 0 : Math.round((n / of) * 1000) / 10}%`;
  const mineNow = game.holding(me.id);
  const neutral = game.holding(null);
  const standings = game.state.factions
    .map((f) => ({ f, ...game.holding(f.id) }))
    .sort((a, b) => (byPeople ? b.people - a.people : b.worlds - a.worlds) || b.worlds - a.worlds);
  return h(
    "div",
    {},
    h("h3", {}, me.name),
    h("p", { class: "hint" }, `${me.playerName}, ruling the ${me.main} Empire from ${game.world(me.capital).name}.`),
    h(
      "dl",
      { class: "props" },
      h("dt", {}, "Treasury"), h("dd", {}, mcr(me.credits)),
      (me.disorderUntil ?? 0) > game.state.day ? h("dt", { class: "bad" }, "Disorder") : null,
      (me.disorderUntil ?? 0) > game.state.day ? h("dd", { class: "bad" }, `Until day ${me.disorderUntil}: income a quarter, yards idle`) : null,
      h("dt", {}, "Income"), h("dd", {}, `${mcr(inc)} a week`),
      h("dt", {}, "Upkeep"), h("dd", {}, `${mcr(upkeep, 2)} a week`),
      h("dt", {}, "Fleet"), h("dd", {}, `${game.fleetsOf(me.id).reduce((n, f) => n + f.ships.length, 0)} ships in ${game.fleetsOf(me.id).length} fleets`),
      h("dt", {}, "Population"), h("dd", {}, `${describeHeadcount(mineNow.people)}, ${share(mineNow.people, target.people)} of the sector's ${describeHeadcount(target.people)}`),
      h("dt", {}, "Worlds"), h("dd", {}, `${mineNow.worlds} of ${target.worlds} peopled worlds, ${share(mineNow.worlds, target.worlds)}`),
      h("dt", {}, "To win"),
      h(
        "dd",
        {},
        byPeople
          ? `Rule ${Math.round(game.state.options.victoryShare * 100)}% of the sector's people: ${describeHeadcount(target.need)}`
          : `Hold ${target.need} of the ${target.worlds} peopled worlds`,
      ),
      h("dt", {}, "Neutral"), h("dd", {}, `${neutral.worlds} independent worlds, ${describeHeadcount(neutral.people)} people (${share(neutral.people, target.people)})`),
    ),
    fogSettings(ctx),
    victorySettings(ctx),
    h("h2", {}, "Standings"),
    h(
      "table",
      {},
      h("tr", {}, h("th", {}, "Empire"), h("th", { class: "r" }, "Worlds"), h("th", { class: "r" }, "Population"), h("th", {})),
      standings.slice(0, 40).map(({ f, worlds: n, people: p }) =>
        h(
          "tr",
          {},
          h(
            "td",
            { style: f.alive ? "" : "text-decoration:line-through;opacity:.5" },
            emblem(f, game.state.factions),
            " ",
            f.name,
            f.human ? h("span", { class: "muted" }, ` (${f.playerName})`) : null,
            f.human
              ? null
              : h(
                  "div",
                  {
                    class: "hint",
                    title: `Aggression ${f.temper.aggression}, resolve ${f.temper.resolve}, expansion ${f.temper.expansion}, caution ${f.temper.caution}: its fleets break off at ${Math.round(withdrawAt(f.temper) * 100)}% hull, and it attacks at odds of ${oddsWanted(f.temper).toFixed(1)} to 1`,
                  },
                  `${f.personality}: ${describeTemper(f.temper)}`,
                ),
          ),
          h("td", { class: "r num" }, n),
          h("td", { class: "r num", title: share(p, target.people) + " of the sector" }, describeHeadcount(p)),
          h("td", {}, h("button", { class: "small", onclick: () => ctx.selectSystem(f.capital, true) }, "Capital")),
        ),
      ),
      h("tr", { class: "muted" }, h("td", {}, "Neutral (independent)"), h("td", { class: "r num" }, neutral.worlds), h("td", { class: "r num", title: share(neutral.people, target.people) + " of the sector" }, describeHeadcount(neutral.people)), h("td", {})),
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

/** What winning counts, people or worlds: changeable at any time, like the fog. */
function victorySettings(ctx: Ctx): HTMLElement {
  const { game } = ctx;
  const o = game.state.options;
  const pct = Math.round(o.victoryShare * 100);
  return h(
    "div",
    {},
    h("h2", {}, "Victory"),
    h(
      "div",
      { class: "standing" },
      h("label", {}, "Victory by"),
      h(
        "select",
        {
          disabled: game.state.phase === "over",
          onchange: (e: Event) => {
            o.victoryBy = (e.target as HTMLSelectElement).value as "population" | "worlds";
            const text = o.victoryBy === "population" ? `Victory now goes to whoever rules ${pct}% of the sector's people.` : `Victory now goes to whoever holds ${pct}% of the sector's peopled worlds.`;
            game.log({ to: game.state.factions.map((f) => f.id), kind: "info", text, firsthand: game.state.factions.map((f) => f.id) });
            ctx.say(text);
            ctx.refresh();
          },
        },
        h("option", { value: "population", selected: o.victoryBy === "population" }, `Population: rule ${pct}% of the sector's people`),
        h("option", { value: "worlds", selected: o.victoryBy === "worlds" }, `Worlds: hold ${pct}% of its peopled worlds`),
      ),
    ),
    h("p", { class: "hint" }, "This applies to every player, and can be changed at any time. An Empire that already has enough wins at the end of the day."),
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

const ALERT_MARKS: Record<Alert["kind"], string> = { siege: "◎", enemy: "⚠", lost: "✸", fallen: "⚑", fleets: "?", slips: "⚒" };

/** The day's to-do list, each line a way straight to the place or fleet. */
function attentionPanel(ctx: Ctx, goto: (at: string) => void): HTMLElement | null {
  if (ctx.game.state.phase !== "play") return null;
  const list = alerts(ctx.game, ctx.me);
  if (list.length === 0) return h("div", { class: "attention quiet" }, h("span", { class: "muted" }, "Nothing needs your attention today."));
  return h(
    "div",
    { class: "attention" },
    h("h2", {}, "Needs attention"),
    list.map((a) =>
      h(
        "div",
        {
          class: `alert ${a.kind}`,
          onclick: () => {
            if (a.fleet !== undefined) ctx.selectFleet(a.fleet, true);
            else if (a.yard !== undefined) {
              ctx.yard = a.yard;
              ctx.setTab("yard");
            } else if (a.at !== undefined) goto(a.at);
          },
        },
        h("span", { class: "amark" }, ALERT_MARKS[a.kind]),
        withEmblems(a.text, ctx.game.state.factions),
      ),
    ),
  );
}

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
    attentionPanel(ctx, goto),
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
