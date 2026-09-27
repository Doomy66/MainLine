/**
 * Mainline: the title screen, and the way into setup or a game.
 */

import "./style.css";
import { autosaveSummary, chooseFile, loadAutosave, parseGame, autosave } from "./game/save";
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

function title(message = ""): void {
  const saved = autosaveSummary();
  const error = h("div", { class: "error" }, message);
  root.replaceChildren(
    h(
      "div",
      { class: "title" },
      h(
        "div",
        { class: "title-card" },
        h("img", { class: "title-logo", src: "./icon.svg", alt: "", width: 72, height: 72 }),
        h("h1", {}, "Mainline"),
        h(
          "p",
          {},
          "A turn-based war of fleets across a Traveller sector. Each player holds an Empire, a chain of worlds a jump-1 ship can cross, and the computer holds all the rest. One turn is a day; a jump is a week.",
        ),
        h(
          "div",
          { class: "title-actions" },
          saved === null
            ? null
            : h(
                "button",
                {
                  class: "primary",
                  onclick: () => {
                    const game = loadAutosave();
                    if (game !== null) showGame(root, game, () => title());
                  },
                },
                "Carry on",
                h("span", {}, saved),
              ),
          h("button", { onclick: () => showSetup(root, (game) => { autosave(game); showGame(root, game, () => title()); }, () => title()) }, "New game", h("span", {}, "Pick a sector from PlanetHex, choose your Empire, and buy your first fleet.")),
          h(
            "button",
            {
              onclick: async () => {
                const file = await chooseFile(".game,.json");
                if (file === null) return;
                try {
                  const game = parseGame(file.text);
                  autosave(game);
                  showGame(root, game, () => title());
                } catch (e) {
                  error.textContent = e instanceof Error ? e.message : String(e);
                }
              },
            },
            "Load a game",
            h("span", {}, "Open a .game file."),
          ),
          h("button", { onclick: () => window.open("./help.html", "_blank", "noopener") }, "How to play", h("span", {}, "The rules, and a walk through your first game.")),
          h(
            "button",
            { onclick: () => window.open(suggestionUrl(), "_blank", "noopener") },
            "Suggestions",
            h("span", {}, "Found something wrong, want something it does not do, or have a ship design worth adding to the catalogue? Open an issue on GitHub."),
          ),
        ),
        error,
        h(
          "p",
          { class: "hint" },
          "Make your own: generate a sector in ",
          h("a", { href: "https://doomy66.github.io/PlanetHex/", target: "_blank", rel: "noopener" }, "PlanetHex"),
          " and load the .sec it saves beside it; design ships in the ",
          h("a", { href: "https://doomy66.github.io/Traveller-Ship-Design/", target: "_blank", rel: "noopener" }, "Traveller Ship Designer"),
          " and import the .ship files at a shipyard.",
        ),
        h(
          "p",
          { class: "hint", style: "margin-top:18px" },
          `Version ${__APP_VERSION__}. Sectors from `,
          h("a", { href: "https://doomy66.github.io/PlanetHex/", target: "_blank", rel: "noopener" }, "PlanetHex"),
          ", ships from the ",
          h("a", { href: "https://doomy66.github.io/Traveller-Ship-Design/", target: "_blank", rel: "noopener" }, "Traveller Ship Designer"),
          ". An unofficial fan work; Traveller is a trademark of Mongoose Publishing.",
        ),
      ),
    ),
  );
}

title();
