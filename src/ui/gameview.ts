/**
 * The game screen: a bar across the top, the sector map, and the panes down the
 * side — the system picked on the map, your fleets, the shipyard, your worlds,
 * and the reports of what happened.
 *
 * Everything is drawn from the state for whichever player is giving orders, and
 * shows only what that player's faction could know.
 */

import { ships } from "../game/game";
import type { Game } from "../game/game";
import { jumpMap, pathIn, inRange } from "../game/nav";
import { imperialDate } from "../game/rules";
import { autosave, chooseFile, download, parseGame } from "../game/save";
import { endTurn, waitForEvents } from "../game/turn";
import type { Faction, Fleet } from "../game/types";
import { visibleSystems } from "../game/visibility";
import { h, kids, mcr } from "./dom";
import { emblem } from "./emblems";
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
  /** The jump being chosen hires tenders for the ships without jump drives. */
  tender: boolean;
  tab: Tab;
  /** The yard the shipyard pane is showing. */
  yard: string | null;
  /** The last day this player had read the reports up to; later ones are new. */
  newFrom: number;
  refresh(): void;
  selectSystem(at: string | null, centre?: boolean): void;
  selectFleet(id: string | null): void;
  setTab(tab: Tab): void;
  say(text: string, bad?: boolean): void;
  /**
   * Order one of your fleets. Under full fog it goes by courier; the text says
   * when it will land.
   */
  command(fleet: Fleet, change: { order?: Fleet["order"]; standing?: Fleet["standing"] }, text: string): void;
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
    tender: false,
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
      const f = id === null ? undefined : game.fleetSeenBy(ctx.me.id, id);
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
    command(fleet, change, text) {
      const lands = game.command(ctx.me.id, fleet.id, change, text);
      const days = lands - game.state.day;
      ctx.say(days <= 0 ? text : `${text} The order goes by courier and reaches ${fleet.name} in about ${days} days.`);
      render();
    },
  };

  map.onPickHex((at) => {
    if (ctx.choosingJump && ctx.fleet !== null) {
      const fleet = game.fleetSeenBy(ctx.me.id, ctx.fleet);
      if (fleet !== undefined) {
        const plan = planning(ctx, fleet);
        const route = at === fleet.system ? null : pathIn(jumpMap(game, plan), fleet.system, at);
        if (route !== null) {
          ctx.choosingJump = false;
          ctx.command(
            fleet,
            { order: plan.tender === true ? { kind: "jump", route, tender: true } : { kind: "jump", route } },
            (route.length === 1
              ? `${fleet.name} to jump to ${game.world(at).name}.`
              : `${fleet.name} to jump to ${game.world(at).name} in ${route.length} jumps, refuelling on the way.`) +
              (plan.tender === true ? " Jump tenders will carry its ships without jump drives." : ""),
          );
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
    if (game.fleetSeenBy(ctx.me.id, id) !== undefined) ctx.selectFleet(id);
    else {
      const heard = game.state.options.newsLag > 0 ? ctx.me.news[id] : ctx.me.intel[id];
      const live = game.state.options.newsLag > 0 ? undefined : game.fleet(id);
      ctx.selectSystem(live?.system ?? heard?.system ?? null);
    }
  });

  function overlay(): void {
    const me = ctx.me;
    const sees = visibleSystems(game, me.id);
    const lagged = game.state.options.newsLag > 0;
    const owners = new Map<string, string>();
    for (const at of Object.keys(game.state.worlds)) {
      const owner = game.knownOwner(me.id, at);
      if (owner !== null) owners.set(at, game.faction(owner).colour);
    }
    const capitals = new Set(game.state.factions.filter((f) => f.alive && game.knownOwner(me.id, f.capital) === f.id).map((f) => f.capital));
    const fleets: FleetMark[] = [];
    const transits: TransitMark[] = [];
    const seen = game.fleetsSeenBy(me.id);
    const fogged = game.fogged(me.id);
    for (const f of [...seen, ...game.state.fleets.filter((x) => x.owner !== me.id)]) {
      if (f.owner === me.id) {
        const age = game.reportAge(me.id, f.id);
        if (f.transit !== null) {
          const span = Math.max(1, f.transit.arrive - f.transit.depart);
          transits.push({
            id: f.id,
            from: f.transit.from,
            to: f.transit.to,
            progress: Math.min(1, (game.state.day - f.transit.depart) / span),
            colour: me.colour,
            title: `${f.name}: in jump to ${game.world(f.transit.to).name}, due day ${f.transit.arrive}${fogged ? ` (reported day ${game.state.day - age})` : ""}`,
          });
        } else {
          fleets.push({
            id: f.id,
            at: f.system,
            colour: me.colour,
            kind: "own",
            ships: f.ships.length,
            title: `${f.name}: ${f.ships.length} ships${age > 0 ? `, as reported ${age} days ago` : ""}`,
          });
        }
      } else if (!lagged && f.transit === null && sees.has(f.system)) {
        const owner = game.faction(f.owner);
        fleets.push({ id: f.id, at: f.system, colour: owner.colour, kind: "enemy", ships: f.ships.length, title: `${owner.name}: ${f.ships.length} ships, ${Math.round(game.fleetTons(f)).toLocaleString()} t` });
      }
    }
    // What the capital has heard of other fleets: fresh news drawn solid, older
    // news drawn as a ghost of where they were.
    for (const s of Object.values(lagged ? me.news : me.intel)) {
      if (s.left !== undefined) continue;
      if (!lagged && sees.has(s.system)) continue;
      const owner = game.faction(s.owner);
      const fresh = lagged && s.day >= game.state.day;
      fleets.push({ id: s.fleetId, at: s.system, colour: owner.colour, kind: fresh ? "enemy" : "ghost", ships: s.ships, title: `${owner.name}: ${ships(s.ships)}, ${fresh ? "seen today" : `seen day ${s.day}`}` });
    }
    let range = new Set<string>();
    let reach = new Set<string>();
    let route: string[] = [];
    const sel = ctx.fleet === null ? undefined : game.fleetSeenBy(me.id, ctx.fleet);
    if (sel !== undefined) {
      if (ctx.choosingJump) {
        const plan = planning(ctx, sel);
        range = new Set(inRange(game, plan));
        reach = new Set(jumpMap(game, plan).keys());
      }
      if (sel.order?.kind === "jump") route = [sel.transit?.to ?? sel.system, ...sel.order.route];
      if (sel.transit !== null) route = [sel.transit.from, sel.transit.to, ...(sel.order?.kind === "jump" ? sel.order.route : [])];
    }
    const sieges = new Set<string>();
    for (const [at, ws] of Object.entries(game.state.worlds)) {
      if (ws.siege === null) continue;
      const mine = ws.siege.by === me.id || ws.owner === me.id;
      if (mine || (!lagged && sees.has(at))) sieges.add(at);
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
      h("span", { class: "who" }, emblem(me, game.state.factions, 16), ` ${me.playerName} · ${me.name}`),
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
      h("button", { class: "small", onclick: () => window.open("./help.html", "_blank", "noopener"), title: "The rules, and how to get going" }, "Help"),
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
    ctx.newFrom = readTo.get(next.id) ?? -1;
    if (multi) handover(next, () => begin());
    else begin();
  }

  function begin(): void {
    const me = ctx.me;
    ctx.newFrom = readTo.get(me.id) ?? -1;
    readTo.set(me.id, game.state.day);
    ctx.system = me.capital;
    render();
  }

  function handover(next: Faction, then: () => void): void {
    const box = h(
      "div",
      { class: "overlay" },
      h(
        "div",
        { class: "handover-card" },
        h("p", {}, game.state.phase === "setup" ? "Commissioning the first fleets" : `Day ${game.state.day}`),
        h("h1", { style: "font-size:30px" }, next.playerName),
        h("p", {}, emblem(next, game.state.factions, 18), " ", next.name),
        h("p", { class: "hint" }, "Hand the screen over. Nobody else should see your orders."),
        h("button", { class: "primary", onclick: () => { box.remove(); then(); } }, `I am ${next.playerName}`),
      ),
    );
    document.body.append(box);
  }

  function renderTabs(): void {
    const setup = game.state.phase === "setup";
    const news = game.logFor(ctx.me.id).filter((e) => e.day > ctx.newFrom).length;
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

/**
 * The fleet a jump is planned for: as it is, or with tenders alongside where the
 * player has chosen to hire them.
 */
export function planning(ctx: Ctx, fleet: Fleet): Fleet {
  const wanted = ctx.tender && ctx.game.carriedTons(fleet) > 0;
  return wanted && fleet.tender !== true ? { ...fleet, tender: true } : fleet;
}

/** A fleet's place in words: where it is, or where it is going. */
export function whereIs(game: Game, f: Fleet): string {
  if (f.transit !== null) return `In jump space to ${game.world(f.transit.to).name}, arriving day ${f.transit.arrive}`;
  const names = { main: "orbit", gg: "gas giant", belt: "belt", deep: "jump point" } as const;
  return `${game.world(f.system).name}, ${names[f.loc]}`;
}
