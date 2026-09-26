/**
 * Setting up a game: which sector, which part of it, who plays which Main, and
 * the few rules worth choosing. The map beside it shows the Mains as they are
 * found, shaded the way PlanetHex shades them, so a player can see what they
 * are choosing.
 */

import { bundledDesigns } from "../catalogue/catalogue";
import { SUBSECTOR_LETTERS } from "../sector/hex";
import type { Main } from "../sector/mains";
import { parseSec, type SectorData } from "../sector/sec";
import type { Game } from "../game/game";
import { factionColour } from "../game/names";
import { chooseFile } from "../game/save";
import { createGame, DEFAULT_OPTIONS, factionMains, mainIncome, startingCredits, worldsInArea } from "../game/setup";
import { aiSetup } from "../game/turn";
import type { GameOptions } from "../game/types";
import { h, kids } from "./dom";
import { createMap } from "./map";

const bundledSectors = import.meta.glob("../../sectors/*.sec", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

interface PlayerSlot {
  name: string;
  capital: string;
}

const QUADRANTS: Record<string, string> = {
  "Whole sector": SUBSECTOR_LETTERS,
  "Spinward coreward": "ABEF",
  "Trailing coreward": "CDGH",
  "Spinward rimward": "IJMN",
  "Trailing rimward": "KLOP",
  "Middle four": "FGJK",
};

export function showSetup(root: HTMLElement, onStart: (game: Game) => void, onBack: () => void): void {
  const sectors = new Map<string, SectorData>();
  for (const [path, text] of Object.entries(bundledSectors)) {
    const stem = (path.split("/").pop() ?? path).replace(/\.sec$/, "").replace(/-/g, " ");
    try {
      sectors.set(stem, parseSec(text, stem));
    } catch (error) {
      console.warn(`Setup: ${path} left out.`, error);
    }
  }
  let sectorKey = [...sectors.keys()][0] ?? "";
  let area = new Set(SUBSECTOR_LETTERS.split(""));
  const options: GameOptions = { ...DEFAULT_OPTIONS };
  const players: PlayerSlot[] = [{ name: "Player 1", capital: "" }];
  let active = 0;
  let gameName = "";
  let message = "";

  const map = createMap();
  const side = h("div", { class: "setup-side" });
  const mapBox = h("div", { class: "setup-map" }, map.element);
  root.replaceChildren(h("div", { class: "setup" }, side, mapBox));

  let mains: Main[] = [];
  const colours = new Map<string, string>();

  function sector(): SectorData {
    return sectors.get(sectorKey)!;
  }

  function recompute(): void {
    mains = factionMains(sector(), [...area], options.factionMinWorlds);
    colours.clear();
    mains.forEach((m, i) => colours.set(m.capital, factionColour(i, false, 0)));
    for (const p of players) {
      if (p.capital !== "" && !mains.some((m) => m.capital === p.capital)) p.capital = "";
    }
    // Give a player without a Main the biggest one nobody has.
    for (const p of players) {
      if (p.capital === "") p.capital = mains.find((m) => !players.some((q) => q.capital === m.capital))?.capital ?? "";
    }
    const inPlay = new Set(worldsInArea(sector(), [...area]).map((w) => w.at));
    map.setWorlds(sector().worlds, inPlay);
    drawMap(inPlay);
  }

  function drawMap(inPlay: ReadonlySet<string>): void {
    const owners = new Map<string, string>();
    const capitals = new Set<string>();
    players.forEach((p, i) => {
      const m = mains.find((x) => x.capital === p.capital);
      if (m !== undefined) colours.set(m.capital, factionColour(0, true, i));
    });
    mains.forEach((m, i) => {
      const taken = players.findIndex((p) => p.capital === m.capital);
      const colour = taken >= 0 ? factionColour(0, true, taken) : factionColour(i, false, 0);
      for (const at of m.hexes) owners.set(at, colour);
      capitals.add(m.capital);
    });
    map.update({
      owners,
      capitals,
      selected: players[active]?.capital || null,
      selectedFleet: null,
      fleets: [],
      transits: [],
      range: new Set(),
      reach: new Set(),
      route: [],
      sieges: new Set(),
      battles: new Set(),
      inPlay,
    });
  }

  map.onPickHex((at) => {
    const m = mains.find((x) => x.hexes.includes(at));
    const slot = players[active];
    if (m === undefined || slot === undefined) return;
    const other = players.findIndex((p, i) => i !== active && p.capital === m.capital);
    if (other >= 0) players[other]!.capital = slot.capital;
    slot.capital = m.capital;
    render();
  });

  function render(): void {
    const worlds = new Map(sector().worlds.map((w) => [w.at, w]));
    const sectorSelect = h(
      "select",
      {
        onchange: (e: Event) => {
          sectorKey = (e.target as HTMLSelectElement).value;
          gameName = "";
          recompute();
          render();
          map.resetView();
        },
      },
      [...sectors.keys()].map((k) => h("option", { value: k, selected: k === sectorKey }, k)),
    );
    const loadSec = h(
      "button",
      {
        onclick: async () => {
          const file = await chooseFile(".sec,.tab,.txt");
          if (file === null) return;
          try {
            const stem = file.name.replace(/\.[^.]+$/, "").replace(/-/g, " ");
            const data = parseSec(file.text, stem);
            sectors.set(data.name, data);
            sectorKey = data.name;
            gameName = "";
            message = "";
          } catch (error) {
            message = error instanceof Error ? error.message : String(error);
          }
          recompute();
          render();
          map.resetView();
        },
      },
      "Load a PlanetHex .sec…",
    );

    const areaGrid = h(
      "div",
      { class: "area-grid" },
      SUBSECTOR_LETTERS.split("").map((l) =>
        h(
          "button",
          {
            class: area.has(l) ? "small on" : "small",
            onclick: () => {
              if (area.has(l)) {
                if (area.size > 1) area.delete(l);
              } else area.add(l);
              recompute();
              render();
            },
          },
          l,
        ),
      ),
    );
    const presets = h(
      "select",
      {
        onchange: (e: Event) => {
          const v = (e.target as HTMLSelectElement).value;
          if (QUADRANTS[v] !== undefined) area = new Set(QUADRANTS[v]!.split(""));
          recompute();
          render();
        },
      },
      h("option", { value: "" }, "Presets…"),
      Object.keys(QUADRANTS).map((k) => h("option", { value: k }, k)),
    );

    const mainRows = mains.map((m) => {
      const capital = worlds.get(m.capital)!;
      const who = players.findIndex((p) => p.capital === m.capital);
      const topTl = Math.max(...m.hexes.map((at) => worlds.get(at)!.uwp.tl));
      const row = h(
        "tr",
        {
          class: who >= 0 ? "picked" : "",
          onclick: () => {
            const slot = players[active];
            if (slot === undefined) return;
            const other = players.findIndex((p, i) => i !== active && p.capital === m.capital);
            if (other >= 0) players[other]!.capital = slot.capital;
            slot.capital = m.capital;
            map.centreOn(m.capital, 2.2);
            render();
          },
        },
        h("td", {}, h("span", { class: "chip", style: `background:${colours.get(m.capital)}` }), m.name),
        h("td", { class: "r num" }, m.hexes.length),
        h("td", { class: "num" }, capital.uwpText),
        h("td", { class: "r num" }, topTl),
        h("td", { class: "r num" }, mainIncome(m, worlds).toFixed(1)),
        h("td", { class: "r num" }, startingCredits(m, worlds, options)),
        h("td", {}, who >= 0 ? players[who]!.name : ""),
      );
      return row;
    });

    const playerRows = players.map((p, i) =>
      h(
        "div",
        { class: "player" },
        h("input", {
          type: "text",
          value: p.name,
          onfocus: () => {
            active = i;
            drawMap(new Set(worldsInArea(sector(), [...area]).map((w) => w.at)));
          },
          oninput: (e: Event) => {
            p.name = (e.target as HTMLInputElement).value;
          },
          onchange: () => render(),
        }),
        h(
          "select",
          {
            onfocus: () => {
              active = i;
            },
            onchange: (e: Event) => {
              const cap = (e.target as HTMLSelectElement).value;
              const other = players.findIndex((q, j) => j !== i && q.capital === cap);
              if (other >= 0) players[other]!.capital = p.capital;
              p.capital = cap;
              active = i;
              render();
            },
          },
          mains.map((m) => h("option", { value: m.capital, selected: m.capital === p.capital }, `${m.name} (${m.hexes.length})`)),
        ),
        h(
          "button",
          {
            class: "small",
            disabled: players.length <= 1,
            onclick: () => {
              players.splice(i, 1);
              active = Math.min(active, players.length - 1);
              render();
            },
          },
          "✕",
        ),
      ),
    );

    const factionsCount = mains.length;
    const canStart = players.length > 0 && players.every((p) => p.capital !== "" && p.name.trim() !== "") && factionsCount >= 2;
    const name = gameName || `${sector().name} campaign`;

    side.replaceChildren(...kids(
      h(
        "div",
        { class: "row" },
        h("button", { class: "small", onclick: onBack }, "← Back"),
        h("h3", {}, "New game"),
        h("span", { class: "spacer" }),
        h("a", { href: "./help.html#start", target: "_blank", rel: "noopener" }, "Help with your first game"),
      ),
      h("h2", {}, "Sector"),
      h("div", { class: "row" }, sectorSelect, loadSec),
      h(
        "p",
        { class: "hint" },
        `${sector().worlds.length} systems. Make a sector of your own in `,
        h("a", { href: "https://doomy66.github.io/PlanetHex/", target: "_blank", rel: "noopener" }, "PlanetHex"),
        `: every sector it saves comes with a .sec file beside it. Sparse or Rift density plays best; at Standard, one Main can swallow half the sector.`,
      ),
      message === "" ? null : h("p", { class: "error" }, message),
      h("h2", {}, "Area in play"),
      h("div", { class: "row" }, areaGrid, h("div", {}, presets, h("p", { class: "hint" }, `${area.size} of 16 subsectors, ${worldsInArea(sector(), [...area]).length} systems.`))),
      h("h2", {}, `Mains: ${factionsCount} factions`),
      h(
        "div",
        { class: "opt" },
        h("label", {}, "Smallest Main that is a faction"),
        h("input", {
          type: "number",
          min: 3,
          max: 30,
          value: options.factionMinWorlds,
          style: "width:60px",
          onchange: (e: Event) => {
            options.factionMinWorlds = Math.max(3, Math.min(30, Number((e.target as HTMLInputElement).value) || 4));
            recompute();
            render();
          },
        }),
      ),
      h("p", { class: "hint" }, "Every Main is a faction; the computer plays those no player takes. Smaller Mains and lone worlds are independent, there to be taken. Click a Main, here or on the map, to give it to the highlighted player."),
      h(
        "div",
        { class: "mains" },
        h(
          "table",
          {},
          h("tr", {}, h("th", {}, "Main"), h("th", { class: "r" }, "Worlds"), h("th", {}, "Capital"), h("th", { class: "r" }, "TL"), h("th", { class: "r" }, "MCr/wk"), h("th", { class: "r" }, "Start"), h("th", {}, "Player")),
          mainRows,
        ),
      ),
      h("h2", {}, "Players"),
      h("div", { class: "players" }, playerRows),
      h(
        "button",
        {
          class: "small",
          disabled: players.length >= 6 || players.length >= mains.length,
          onclick: () => {
            players.push({ name: `Player ${players.length + 1}`, capital: "" });
            active = players.length - 1;
            recompute();
            render();
          },
        },
        "+ Add player",
      ),
      h("p", { class: "hint" }, "Players share this screen and take turns giving orders for each day."),
      h("h2", {}, "Rules"),
      h(
        "div",
        { class: "opt" },
        h("label", {}, "Game name"),
        h("input", {
          type: "text",
          value: name,
          oninput: (e: Event) => {
            gameName = (e.target as HTMLInputElement).value;
          },
        }),
        h("label", {}, `Victory: hold ${Math.round(options.victoryShare * 100)}% of peopled worlds`),
        h("input", {
          type: "range",
          min: 20,
          max: 100,
          step: 5,
          value: Math.round(options.victoryShare * 100),
          oninput: (e: Event) => {
            options.victoryShare = Number((e.target as HTMLInputElement).value) / 100;
            ((e.target as HTMLElement).previousElementSibling as HTMLElement).textContent = `Victory: hold ${Math.round(options.victoryShare * 100)}% of peopled worlds`;
          },
        }),
        h("label", {}, "Starting treasury"),
        h(
          "select",
          {
            onchange: (e: Event) => {
              options.startingCredits = (e.target as HTMLSelectElement).value as GameOptions["startingCredits"];
              render();
            },
          },
          h("option", { value: "wealth", selected: options.startingCredits === "wealth" }, "By the Main's wealth"),
          h("option", { value: "equal", selected: options.startingCredits === "equal" }, "Equal: MCr600 each"),
        ),
        h("label", {}, `Starting wealth: ×${options.startingWealth}`),
        h("input", {
          type: "range",
          min: 1,
          max: 5,
          step: 0.5,
          value: options.startingWealth,
          oninput: (e: Event) => {
            options.startingWealth = Number((e.target as HTMLInputElement).value);
            ((e.target as HTMLElement).previousElementSibling as HTMLElement).textContent = `Starting wealth: ×${options.startingWealth}`;
          },
          onchange: () => render(),
        }),
        h("label", {}, "News travels"),
        h(
          "select",
          {
            onchange: (e: Event) => {
              options.newsLag = Number((e.target as HTMLSelectElement).value);
            },
          },
          [
            [0, "Instantly: you see all your fleets see"],
            [4, "By express boat: a week per jump-4"],
            [2, "By courier: a week per jump-2"],
            [1, "By trader: a week per parsec"],
          ].map(([v, label]) => h("option", { value: v as number, selected: options.newsLag === v }, label as string)),
        ),
        h("label", {}, "Full fog of war"),
        h(
          "label",
          { class: "row", style: "color:var(--text)" },
          h("input", {
            type: "checkbox",
            checked: options.fullFog,
            onchange: (e: Event) => {
              options.fullFog = (e.target as HTMLInputElement).checked;
            },
          }),
          "Your own fleets report by courier too",
        ),
        h("label", {}, "Shipyards"),
        h(
          "select",
          {
            onchange: (e: Event) => {
              options.buildSpeed = Number((e.target as HTMLSelectElement).value);
            },
          },
          [
            [0.1, "Fast: a tenth of the book's time"],
            [0.25, "Brisk: a quarter of the book's time"],
            [0.5, "Slow: half the book's time"],
            [1, "The book's construction time"],
          ].map(([v, label]) => h("option", { value: v as number, selected: options.buildSpeed === v }, label as string)),
        ),
      ),
      h(
        "div",
        { class: "row", style: "margin-top:16px" },
        h("span", { class: "spacer" }),
        h(
          "button",
          {
            class: "primary",
            disabled: !canStart,
            onclick: () => {
              const game = createGame({
                name,
                sector: sector(),
                area: [...area].sort(),
                players: players.map((p) => ({ name: p.name.trim(), capital: p.capital })),
                options,
                designs: bundledDesigns(),
                seed: `${name}|${Date.now()}`,
              });
              aiSetup(game);
              onStart(game);
            },
          },
          "Start the game",
        ),
      ),
    ));
  }

  recompute();
  render();
  requestAnimationFrame(() => map.resetView());
}

