/**
 * Mainline: the title screen, and the way into setup or a game.
 */

import "./style.css";
import { chooseFile, loadAutosave, parseGame, autosave } from "./game/save";
import type { Game } from "./game/game";
import { h } from "./ui/dom";
import { showGame } from "./ui/gameview";
import { showSetup } from "./ui/setup";

declare const __APP_VERSION__: string;

const root = document.getElementById("app")!;

/**
 * A new issue on the project, with the version filled in: a report that says
 * which version it was is one that can be followed up. The rest is the
 * player's to write.
 */
function suggestionUrl(): string {
  const body = [
    "",
    "",
    "(A ship design you have found useful? Attach its .ship file from the Traveller Ship Designer, and say where the design comes from, and it can go in the catalogue for everybody.)",
    "",
    "---",
    `Mainline ${__APP_VERSION__}`,
  ].join(String.fromCharCode(10));
  return `https://github.com/Doomy66/MainLine/issues/new?body=${encodeURIComponent(body)}`;
}

const PLANETHEX = "https://doomy66.github.io/PlanetHex/";
const SHIP_DESIGNER = "https://doomy66.github.io/Traveller-Ship-Design/";
const RELEASE_NOTES = "https://github.com/Doomy66/MainLine/blob/main/CHANGELOG.md";

/** The pictures on the title screen's cards, drawn to a 48 grid. */
const ICONS = {
  resume:
    '<path d="M8 17l7-4 7 4v8l-7 4-7-4z" fill="rgba(40,52,74,0.6)" stroke="rgba(150,170,210,0.5)" stroke-width="1.2"/><path d="M26 25l7-4 7 4v8l-7 4-7-4z" fill="rgba(40,52,74,0.6)" stroke="rgba(150,170,210,0.5)" stroke-width="1.2"/><path d="M15 21L33 29" fill="none" stroke="#e0b341" stroke-width="1.6" stroke-dasharray="3 3"/><circle cx="15" cy="21" r="2.6" fill="#e0b341"/><circle cx="33" cy="29" r="2.4" fill="#6f8cc0"/>',
  newgame:
    '<circle cx="24" cy="24" r="16" fill="none" stroke="rgba(150,170,210,0.55)" stroke-width="1.2"/><path d="M24 14v20M14 24h20" fill="none" stroke="#e0b341" stroke-width="1.8" stroke-linecap="round"/>',
  load: '<path d="M8 15h12l3 3h17v18H8z" fill="rgba(40,52,74,0.6)" stroke="rgba(150,170,210,0.5)" stroke-width="1.2"/><path d="M8 20h32" fill="none" stroke="rgba(223,227,234,0.6)" stroke-width="1.3"/>',
  help: '<path d="M8 12h12a4 4 0 0 1 4 4v20a4 4 0 0 0-4-4H8z" fill="rgba(40,52,74,0.6)" stroke="rgba(150,170,210,0.5)" stroke-width="1.2"/><path d="M40 12H28a4 4 0 0 0-4 4v20a4 4 0 0 1 4-4h12z" fill="rgba(40,52,74,0.6)" stroke="rgba(150,170,210,0.5)" stroke-width="1.2"/>',
};

function icon(paths: string): HTMLElement {
  const holder = h("span", { class: "level-icon", "aria-hidden": "true" });
  holder.innerHTML = `<svg viewBox="0 0 48 48" width="52" height="52">${paths}</svg>`;
  return holder;
}

/** One of the title screen's cards: a picture, what it is, and its button. */
function level(pic: string, heading: string, lines: (string | null)[], action: HTMLElement): HTMLElement {
  return h(
    "li",
    { class: "level" },
    icon(pic),
    h("div", { class: "level-what" }, h("h2", {}, heading), ...lines.map((l, i) => (l === null ? null : h("p", { class: i === 0 ? "" : "level-extra" }, l)))),
    h("div", { class: "level-act" }, action),
  );
}

function link(text: string, href: string, newTab = true): HTMLElement {
  return h("a", newTab ? { href, target: "_blank", rel: "noopener" } : { href }, text);
}

function title(message = ""): void {
  const saved = loadAutosave();
  const error = h("div", { class: "error" }, message);
  const play = (game: Game) => showGame(root, game, () => title());
  const who = saved === null ? "" : saved.humans().map((f) => f.name).join(", ");

  root.replaceChildren(
    h(
      "div",
      { class: "title" },
      h("div", { class: "sky-stars", "aria-hidden": "true" }),
      h("div", { class: "sky-limb", "aria-hidden": "true" }),
      h(
        "div",
        { class: "title-card" },
        h(
          "header",
          {},
          h("img", { class: "title-logo", src: "./icon.svg", alt: "", width: 72, height: 72 }),
          h("h1", {}, "MainLine"),
          h("p", { class: "title-lead" }, "Hold your Empire. Take everyone else's.", h("br"), "A day a turn; a week a jump."),
          h(
            "p",
            { class: "title-what" },
            "A turn-based war of fleets inspired by Trillion Credit Squadron across a Traveller sector made in PlanetHex. Each player holds a chain of worlds. Ships come from the Traveller Ship Designer, and fight to High Guard's rules.",
          ),
        ),
        h(
          "ul",
          { class: "levels" },
          level(
            ICONS.resume,
            "Carry on",
            saved === null
              ? ["No game in progress on this browser."]
              : [
                  saved.state.name.includes(saved.state.sector.name) ? `${saved.state.name}.` : `${saved.state.name}, in ${saved.state.sector.name}.`,
                  `Day ${saved.state.day}${who === "" ? "" : ` · ${who}`}`,
                ],
            h("button", { class: "primary", disabled: saved === null, onclick: () => saved !== null && play(saved) }, "Resume"),
          ),
          level(
            ICONS.newgame,
            "New game",
            ["Pick a sector, choose your Empire, buy your first fleet."],
            h("button", { onclick: () => showSetup(root, (game) => { autosave(game); play(game); }, () => title()) }, "Start"),
          ),
          level(
            ICONS.load,
            "Load a game",
            ["Open a game saved as a .game file."],
            h(
              "button",
              {
                onclick: async () => {
                  const file = await chooseFile(".game,.json");
                  if (file === null) return;
                  try {
                    const game = parseGame(file.text);
                    autosave(game);
                    play(game);
                  } catch (e) {
                    error.textContent = e instanceof Error ? e.message : String(e);
                  }
                },
              },
              "Open",
            ),
          ),
          level(
            ICONS.help,
            "How to play",
            ["The rules, and a walk through your first game."],
            h("button", { onclick: () => window.open("./help.html", "_blank", "noopener") }, "Read"),
          ),
        ),
        error,
        h(
          "footer",
          { class: "title-foot" },
          h(
            "div",
            {},
            link("How to play", "./help.html"),
            link("Release notes", RELEASE_NOTES),
            link("Suggestions", suggestionUrl()),
            h("span", { class: "faint" }, `v${__APP_VERSION__}`),
          ),
          h("div", {}, h("span", { class: "faint" }, "Also for Traveller:"), link("PlanetHex", PLANETHEX), link("Traveller Ship Designer", SHIP_DESIGNER)),
          h(
            "p",
            {},
            "An unofficial, non-commercial fan work. The Traveller game in all forms is owned by ",
            link("Mongoose Publishing", "https://www.mongoosepublishing.com/"),
            ". Copyright 1977 – 2025 Mongoose Publishing. ",
            link("Fair use notice", "./help.html#fair-use"),
          ),
        ),
      ),
    ),
  );
}

title();
