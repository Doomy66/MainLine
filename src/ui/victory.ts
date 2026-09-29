/**
 * The end of a game: who won, the final standings, and how the campaign went
 * for the player looking at it, gathered from what their reports recorded.
 */

import type { Game } from "../game/game";
import { imperialDate } from "../game/rules";
import type { Faction, LogEntry } from "../game/types";
import { describeHeadcount } from "../sector/uwp";
import { h } from "./dom";
import { emblem } from "./emblems";

export interface Campaign {
  readonly battles: number;
  readonly won: number;
  readonly taken: number;
  readonly built: number;
  readonly lost: number;
  readonly sunk: number;
  readonly peak: { readonly worlds: number; readonly day: number };
  readonly best: { readonly text: string; readonly day: number; readonly sunk: number; readonly lost: number } | null;
}

/** A side's line in a battle report: "Name Fleet: 6 in, 2 lost (…)". */
const SIDE = /^(.+?): (\d+) in, (\d+) lost/;

/** How a player's campaign went, from their own reports. */
export function campaignOf(game: Game, me: Faction): Campaign {
  const log: LogEntry[] = game.state.log.filter((e) => e.to.includes(me.id));
  let battles = 0;
  let won = 0;
  let lost = 0;
  let sunk = 0;
  let best: Campaign["best"] = null;
  for (const e of log) {
    if (e.kind !== "combat" || e.happened !== undefined) continue;
    battles++;
    let mine = 0;
    let theirs = 0;
    for (const line of e.detail ?? []) {
      if (line.startsWith("Round")) break;
      const m = SIDE.exec(line);
      if (m === null) continue;
      if (m[1]!.startsWith(`${me.name} `)) mine += Number(m[3]);
      else theirs += Number(m[3]);
    }
    lost += mine;
    sunk += theirs;
    if (theirs > mine) won++;
    if (theirs > 0 && (best === null || theirs - mine > best.sunk - best.lost)) best = { text: e.text.replace(/:.*$/, ""), day: e.day, sunk: theirs, lost: mine };
  }
  const taken = log.filter((e) => e.kind === "capture" && e.happened === undefined && e.text.includes(`submits to ${me.name}`)).length;
  const built = log.filter((e) => e.kind === "build" && /is commissioned/.test(e.text)).length;
  const now = game.holding(me.id).worlds;
  const peak = me.peak !== undefined && me.peak.worlds >= now ? me.peak : { worlds: now, day: game.state.day };
  return { battles, won, taken, built, lost, sunk, peak, best };
}

export function showVictory(game: Game, me: Faction, actions: { onTitle: () => void; onSave: () => void }): void {
  const s = game.state;
  const winner = s.winner === null ? null : game.faction(s.winner);
  const target = game.victoryTarget();
  const mine = winner?.id === me.id;
  const share = (n: number, of: number) => (of === 0 ? 0 : n / of);
  const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;
  const standings = s.factions
    .map((f) => ({ f, ...game.holding(f.id) }))
    .sort((a, b) => (target.by === "population" ? b.people - a.people : b.worlds - a.worlds) || b.worlds - a.worlds)
    .slice(0, 8);
  const lead = standings[0];
  const scale = lead === undefined ? 1 : Math.max(target.by === "population" ? share(lead.people, target.people) : share(lead.worlds, target.worlds), s.options.victoryShare);
  const c = campaignOf(game, me);
  const held = winner === null ? null : game.holding(winner.id);

  const box = h(
    "div",
    { class: "modal victory" },
    h(
      "div",
      { class: "modal-box victory-box" },
      h("p", { class: "victory-kicker" }, `Day ${s.day} · ${imperialDate(s.day)}`),
      winner === null
        ? h("h1", {}, "Every player has fallen")
        : h("div", { class: "victory-head" }, emblem(winner, s.factions, 54), h("h1", {}, mine ? "Victory" : `${winner.name} has won`)),
      winner === null || held === null
        ? h("p", { class: "victory-line" }, "No player's Empire is left standing.")
        : h(
            "p",
            { class: "victory-line" },
            mine ? `${winner.name} ` : "",
            target.by === "population"
              ? `${mine ? "rules" : "It rules"} ${describeHeadcount(held.people)} of the sector's ${describeHeadcount(target.people)} people, ${pct(share(held.people, target.people))}, across ${held.worlds} worlds.`
              : `${mine ? "holds" : "It holds"} ${held.worlds} of the sector's ${target.worlds} peopled worlds, ${pct(share(held.worlds, target.worlds))}.`,
          ),
      h("h2", {}, "Final standings"),
      h(
        "div",
        { class: "victory-bars" },
        standings.map(({ f, worlds, people }) => {
          const x = target.by === "population" ? share(people, target.people) : share(worlds, target.worlds);
          return h(
            "div",
            { class: f.id === me.id ? "vbar me" : "vbar" },
            h("span", { class: "vname" }, emblem(f, s.factions, 14), " ", f.name),
            h("span", { class: "vtrack" }, h("span", { class: "vfill", style: `width:${(x / scale) * 100}%;background:${f.colour}` }), h("span", { class: "vgoal", style: `left:${(s.options.victoryShare / scale) * 100}%` })),
            h("span", { class: "vnum" }, target.by === "population" ? `${pct(x)} · ${worlds} worlds` : `${worlds} · ${pct(share(people, target.people))} of people`),
          );
        }),
      ),
      h("p", { class: "hint" }, `The line marks ${pct(s.options.victoryShare)} of the sector's ${target.by === "population" ? "people" : "peopled worlds"}, what winning took.`),
      h("h2", {}, `${me.name}'s campaign`),
      h(
        "div",
        { class: "victory-stats" },
        stat(`${s.day}`, "days"),
        stat(`${game.holding(me.id).worlds}`, `worlds held at the end, ${c.peak.worlds} at most (day ${c.peak.day})`),
        stat(`${c.taken}`, "worlds taken"),
        stat(`${c.battles}`, `battles, ${c.won} of them won`),
        stat(`${c.sunk}`, "enemy ships and boats destroyed"),
        stat(`${c.lost}`, "of your ships lost"),
        stat(`${c.built}`, "ships commissioned"),
      ),
      c.best === null ? null : h("p", { class: "victory-best" }, h("strong", {}, "Finest hour: "), `${c.best.text}, day ${c.best.day}: ${c.best.sunk} of theirs destroyed for ${c.best.lost} of yours.`),
      h(
        "div",
        { class: "row", style: "margin-top:16px;justify-content:flex-end" },
        h("button", { onclick: () => actions.onSave() }, "Save the game"),
        h("button", { onclick: () => { box.remove(); actions.onTitle(); } }, "Title screen"),
        h("button", { class: "primary", onclick: () => box.remove() }, "Look around"),
      ),
    ),
  );
  document.body.append(box);
}

function stat(big: string, what: string): HTMLElement {
  return h("div", { class: "vstat" }, h("div", { class: "vbig" }, big), h("div", { class: "hint" }, what));
}
