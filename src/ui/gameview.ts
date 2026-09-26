/**
 * The game screen: a bar across the top, the sector map, and the panes down the
 * side — the system picked on the map, your fleets, the shipyard, your worlds,
 * and the reports of what happened.
 *
 * Everything is drawn from the state for whichever player is giving orders, and
 * shows only what that player's faction could know.
 */

import type { Game } from "../game/game";
import { jumpMap, pathIn, inRange } from "../game/nav";
import { imperialDate } from "../game/rules";
import { autosave, chooseFile, download, parseGame } from "../game/save";
import { endTurn, waitForEvents } from "../game/turn";
import type { Faction, Fleet } from "../game/types";
import { visibleSystems } from "../game/visibility";
import { h, kids, mcr } from "./dom";
import { createMap, type FleetMark, type TransitMark } from "./map";
import { empirePane, fleetPane, reportsPane, setupPane, shipyardPane, systemPane } from "./panes";

export type Tab = "system" | "fleets" | "yard" | "empire" | "reports";

export interface Ctx {
  game: Game;
  me: Faction;
  system: string | null;
  fleet: string | null;
  /** Ships ticked in the selected fleet, for splitting. */
  ships: Set<string>;
  /** Choosing where the selected fleet jumps to. */
  choosingJump: boolean;
  tab: Tab;
  /** The yard the shipyard pane is showing. */
  yard: string | null;
  /** The first log entry that is news since this player last looked. */
  newFrom: number;
  refresh(): void;
  selectSystem(at: string | null, centre?: boolean): void;
  selectFleet(id: string | null): void;
  setTab(tab: Tab): void;
  say(text: string, bad?: boolean): void;
}

export function showGame(root: HTMLElement, game: Game, onQuit: () => void): void {
  const map = createMap();
  const bar = h("div", { class: "bar" });
  const tabs = h("div", { class: "tabs" });
  const pane = h("div", { class: "pane" });
  const help = h("div", { class: "map-help" }, "Wheel to zoom, drag to move, click a system.");
  const banner = h("div", { class: "mode-banner", style: "display:none" });
  const mapBox = h("div", { class: "map" }, map.element, help, banner);
  const side = h("div", { class: "side" }, tabs, pane);
  root.replaceChildren(h("div", { class: "game" }, bar, mapBox, side));

  const inPlay = new Set(game.state.sector.worlds.map((w) => w.at));
  map.setWorlds(game.state.sector.worlds, inPlay);

  let status = "";
  let statusBad = false;
  /** Where each player last read the log up to. */
  const readTo = new Map<string, number>();

  const ctx: Ctx = {
    game,
    me: game.currentHuman()!,
    system: null,
    fleet: null,
    ships: new Set(),
    choosingJump: false,
    tab: game.state.phase === "setup" ? "fleets" : "reports",
    yard: null,
    newFrom: 0,
    refresh: render,
    selectSystem(at, centre = false) {
      ctx.system = at;
      ctx.choosingJump = false;
      if (at !== null && centre) map.centreOn(at);
      if (ctx.tab !== "fleets" || ctx.fleet === null) ctx.tab = "system";
      render();
    },
    selectFleet(id) {
      ctx.fleet = id;
      ctx.ships.clear();
      ctx.choosingJump = false;
      const f = id === null ? undefined : game.fleet(id);
      if (f !== undefined) ctx.system = f.transit?.to ?? f.system;
      ctx.tab = "fleets";
      render();
    },
    setTab(tab) {
      ctx.tab = tab;
      render();
    },
    say(text, bad = false) {
      status = text;
      statusBad = bad;
      renderBar();
    },
  };

  map.onPickHex((at) => {
    if (ctx.choosingJump && ctx.fleet !== null) {
      const fleet = game.fleet(ctx.fleet);
      if (fleet !== undefined && fleet.owner === ctx.me.id) {
        const route = at === fleet.system ? null : pathIn(jumpMap(game, fleet), fleet.system, at);
        if (route !== null) {
          fleet.order = { kind: "jump", route };
          ctx.choosingJump = false;
          ctx.say(
            route.length === 1
              ? `${fleet.name} will jump to ${game.world(at).name}.`
              : `${fleet.name} will jump to ${game.world(at).name} in ${route.length} jumps, refuelling on the way.`,
          );
          render();
          return;
        }
        if (game.worlds.has(at)) {
          ctx.say(`${fleet.name} cannot reach ${game.world(at).name} from here.`, true);
          return;
        }
      }
    }
    if (!game.worlds.has(at)) {
      ctx.system = null;
      render();
      return;
    }
    ctx.selectSystem(at);
  });
  map.onPickFleet((id) => {
    const f = game.fleet(id);
    if (f !== undefined && f.owner === ctx.me.id) ctx.selectFleet(id);
    else {
      const sighting = ctx.me.intel[id];
      ctx.selectSystem(f?.system ?? sighting?.system ?? null);
    }
  });

  function overlay(): void {
    const me = ctx.me;
    const sees = visibleSystems(game, me.id);
    const owners = new Map<string, string>();
    for (const [at, ws] of Object.entries(game.state.worlds)) if (ws.owner !== null) owners.set(at, game.faction(ws.owner).colour);
    const capitals = new Set(game.state.factions.filter((f) => f.alive && game.worldState(f.capital).owner === f.id).map((f) => f.capital));
    const fleets: FleetMark[] = [];
    const transits: TransitMark[] = [];
    for (const f of game.state.fleets) {
      if (f.owner === me.id) {
        if (f.transit !== null) {
          const span = Math.max(1, f.transit.arrive - f.transit.depart);
          transits.push({
            id: f.id,
            from: f.transit.from,
            to: f.transit.to,
            progress: Math.min(1, (game.state.day - f.transit.depart) / span),
            colour: me.colour,
            title: `${f.name}: in jump to ${game.world(f.transit.to).name}, arriving day ${f.transit.arrive}`,
          });
        } else {
          fleets.push({ id: f.id, at: f.system, colour: me.colour, kind: "own", ships: f.ships.length, title: `${f.name}: ${f.ships.length} ships` });
        }
      } else if (f.transit === null && sees.has(f.system)) {
        const owner = game.faction(f.owner);
        fleets.push({ id: f.id, at: f.system, colour: owner.colour, kind: "enemy", ships: f.ships.length, title: `${owner.name}: ${f.ships.length} ships, ${Math.round(game.fleetTons(f)).toLocaleString()} t` });
      }
    }
    for (const s of Object.values(me.intel)) {
      if (sees.has(s.system)) continue;
      const owner = game.faction(s.owner);
      fleets.push({ id: s.fleetId, at: s.system, colour: owner.colour, kind: "ghost", ships: s.ships, title: `${owner.name}: ${s.ships} ships, last seen day ${s.day}` });
    }
    let range = new Set<string>();
    let reach = new Set<string>();
    let route: string[] = [];
    const sel = ctx.fleet === null ? undefined : game.fleet(ctx.fleet);
    if (sel !== undefined && sel.owner === me.id) {
      if (ctx.choosingJump) {
        range = new Set(inRange(game, sel));
        reach = new Set(jumpMap(game, sel).keys());
      }
      if (sel.order?.kind === "jump") route = [sel.transit?.to ?? sel.system, ...sel.order.route];
      if (sel.transit !== null) route = [sel.transit.from, sel.transit.to, ...(sel.order?.kind === "jump" ? sel.order.route : [])];
    }
    const sieges = new Set<string>();
    for (const [at, ws] of Object.entries(game.state.worlds)) {
      if (ws.siege !== null && (sees.has(at) || ws.siege.by === me.id)) sieges.add(at);
    }
    const battles = new Set(
      game.state.log.filter((e) => e.day === game.state.day && e.kind === "combat" && e.to.includes(me.id) && e.at !== undefined).map((e) => e.at!),
    );
    map.update({ owners, capitals, selected: ctx.system, selectedFleet: ctx.fleet, fleets, transits, range, reach, route, sieges, battles, inPlay });
    if (ctx.choosingJump && sel !== undefined) {
      banner.style.display = "flex";
      banner.replaceChildren(
        h("span", {}, `Where should ${sel.name} jump? Solid green rings are in range now; dashed ones need stops to refuel.`),
        h("button", { class: "small", onclick: () => { ctx.choosingJump = false; render(); } }, "Cancel"),
      );
    } else banner.style.display = "none";
  }

  function renderBar(): void {
    const me = ctx.me;
    const s = game.state;
    const humans = game.humans().filter((f) => f.alive);
    const setup = s.phase === "setup";
    const over = s.phase === "over";
    bar.replaceChildren(...kids(
      h("span", { class: "brand" }, h("img", { src: "./icon.svg", alt: "", width: 20, height: 20 }), h("span", {}, "MAINLINE")),
      h("span", { class: "muted sector-name" }, s.sector.name),
      h("span", { class: "date" }, setup ? "Commissioning" : `Day ${s.day} · ${imperialDate(s.day)}`),
      h("span", { class: "who" }, h("span", { class: "chip", style: `background:${me.colour}` }), `${me.playerName} — ${me.name}`),
      h("span", { class: "credits" }, mcr(me.credits)),
      h("span", { class: statusBad ? "bad" : "muted", style: "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1" }, status),
      h("button", { class: "small", onclick: () => download(game), title: "Save the whole game as one .game file" }, "Save"),
      h(
        "button",
        {
          class: "small",
          onclick: async () => {
            const file = await chooseFile(".game,.json");
            if (file === null) return;
            try {
              const loaded = parseGame(file.text);
              autosave(loaded);
              showGame(root, loaded, onQuit);
            } catch (error) {
              ctx.say(error instanceof Error ? error.message : String(error), true);
            }
          },
        },
        "Load",
      ),
      h("button", { class: "small", onclick: () => { autosave(game); onQuit(); } }, "Menu"),
      setup || over
        ? null
        : h("button", { onclick: () => finish(true), title: "Let the days pass until something happens that you should see (up to 30 days)" }, "Wait for news"),
      over
        ? h("span", { class: "warn" }, s.winner === null ? "Game over" : `${game.faction(s.winner).name} has won`)
        : h(
            "button",
            { class: "primary", onclick: () => finish(false) },
            setup ? "Done: sail" : humans.length > 1 && humans.some((f) => f !== me && !f.ready) ? "End turn" : "End day",
          ),
    ));
  }

  function finish(wait: boolean): void {
    const before = game.state.day;
    const s = game.state;
    ctx.choosingJump = false;
    const dayEnded = wait ? waitForEvents(game) : endTurn(game);
    autosave(game);
    if (dayEnded && s.phase !== "setup") {
      status = s.day > before + 1 ? `${s.day - before} days passed.` : "";
    }
    const next = game.currentHuman();
    if (next === undefined) {
      render();
      return;
    }
    const multi = game.humans().filter((f) => f.alive).length > 1;
    ctx.me = next;
    ctx.fleet = null;
    ctx.ships.clear();
    ctx.tab = s.phase === "setup" ? "fleets" : "reports";
    ctx.newFrom = readTo.get(next.id) ?? 0;
    if (multi) handover(next, () => begin());
    else begin();
  }

  function begin(): void {
    const me = ctx.me;
    ctx.newFrom = readTo.get(me.id) ?? 0;
    readTo.set(me.id, game.state.log.length);
    ctx.system = me.capital;
    render();
  }

  function handover(next: Faction, then: () => void): void {
    const box = h(
      "div",
      { class: "overlay" },
      h(
        "div",
        { class: "title-card" },
        h("p", {}, game.state.phase === "setup" ? "Commissioning the first fleets" : `Day ${game.state.day}`),
        h("h1", { style: "font-size:30px" }, next.playerName),
        h("p", {}, h("span", { class: "chip", style: `background:${next.colour}` }), next.name),
        h("p", { class: "hint" }, "Hand the screen over. Nobody else should see your orders."),
        h("button", { class: "primary", onclick: () => { box.remove(); then(); } }, `I am ${next.playerName}`),
      ),
    );
    document.body.append(box);
  }

  function renderTabs(): void {
    const setup = game.state.phase === "setup";
    const news = game.state.log.slice(ctx.newFrom).filter((e) => e.to.includes(ctx.me.id)).length;
    const tab = (id: Tab, label: string, badge = 0) =>
      h("button", { class: ctx.tab === id ? "on" : "", onclick: () => ctx.setTab(id) }, label, badge > 0 ? h("span", { class: "badge" }, badge) : null);
    tabs.replaceChildren(...kids(
      tab("system", "System"),
      tab("fleets", setup ? "First fleet" : "Fleets"),
      setup ? null : tab("yard", "Shipyard"),
      tab("empire", "Empire"),
      tab("reports", "Reports", setup ? 0 : news),
    ));
  }

  function renderPane(): void {
    const setup = game.state.phase === "setup";
    let body: HTMLElement;
    switch (ctx.tab) {
      case "system":
        body = systemPane(ctx);
        break;
      case "fleets":
        body = setup ? setupPane(ctx) : fleetPane(ctx);
        break;
      case "yard":
        body = shipyardPane(ctx);
        break;
      case "empire":
        body = empirePane(ctx);
        break;
      case "reports":
        body = reportsPane(ctx, (at) => {
          map.centreOn(at);
          ctx.system = at;
          overlay();
        });
        break;
    }
    const scroll = pane.scrollTop;
    pane.replaceChildren(body);
    pane.scrollTop = scroll;
  }

  let saveTimer = 0;
  function render(): void {
    // Orders given count as the game changing: keep the autosave up with them.
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => autosave(game), 800);
    renderBar();
    renderTabs();
    renderPane();
    overlay();
  }

  const first = game.currentHuman() ?? game.state.factions[0]!;
  ctx.me = first;
  if (game.humans().filter((f) => f.alive).length > 1) handover(first, begin);
  else begin();
  requestAnimationFrame(() => map.centreOn(first.capital, 1.8));
}

/** A fleet's place in words: where it is, or where it is going. */
export function whereIs(game: Game, f: Fleet): string {
  if (f.transit !== null) return `In jump space to ${game.world(f.transit.to).name}, arriving day ${f.transit.arrive}`;
  const names = { main: "orbit", gg: "gas giant", belt: "belt", deep: "jump point" } as const;
  return `${game.world(f.system).name}, ${names[f.loc]}`;
}
