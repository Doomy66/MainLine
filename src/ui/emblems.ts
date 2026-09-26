/**
 * Faction emblems and report icons: small drawings, so the reports can be read
 * at a glance for who and what.
 *
 * An emblem is a shape in the faction's colour. There are twelve shapes, drawn
 * solid or as an outline, which with the colours already spread round the
 * wheel is enough to tell thirty-odd factions apart.
 */

import type { Faction, LogKind } from "../game/types";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Twelve shapes on a 24 grid, centred on 12,12. */
const SHAPES: readonly string[] = [
  "M12 3a9 9 0 1 0 0.01 0z", // circle
  "M4 4h16v16h-16z", // square
  "M12 2l10 10l-10 10l-10 -10z", // diamond
  "M12 3l10 18h-20z", // triangle
  "M12 2l8.66 5v10l-8.66 5l-8.66 -5v-10z", // hexagon
  "M12 2l2.9 6.9l7.1 0.6l-5.4 4.7l1.7 7.3l-6.3 -4l-6.3 4l1.7 -7.3l-5.4 -4.7l7.1 -0.6z", // star
  "M9 3h6v6h6v6h-6v6h-6v-6h-6v-6h6z", // cross
  "M15 3a9 9 0 1 0 6 15a7 7 0 1 1 -6 -15z", // crescent
  "M3 5l9 7l9 -7v7l-9 7l-9 -7z", // chevron
  "M12 2l9 3v6c0 6 -4 10 -9 12c-5 -2 -9 -6 -9 -12v-6z", // shield
  "M12 21l-10 -18h20z", // triangle down
  "M7 3h10l5 9l-5 9h-10l-5 -9z", // long hexagon
];

/** Which emblem a faction bears: its place in the list of factions. */
export function emblemIndex(faction: Faction, all: readonly Faction[]): number {
  return Math.max(0, all.findIndex((f) => f.id === faction.id));
}

export function emblem(faction: Faction, all: readonly Faction[], size = 14): SVGSVGElement {
  const i = emblemIndex(faction, all);
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("class", "emblem");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", SHAPES[i % SHAPES.length]!);
  const solid = Math.floor(i / SHAPES.length) % 2 === 0;
  path.setAttribute("fill", solid ? faction.colour : "none");
  path.setAttribute("stroke", solid ? "rgba(0,0,0,0.55)" : faction.colour);
  path.setAttribute("stroke-width", solid ? "1.2" : "2.6");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  const title = document.createElementNS(SVG_NS, "title");
  title.textContent = faction.name;
  svg.append(title);
  return svg;
}

/** One icon for each kind of report, drawn as strokes on a 24 grid. */
const KIND_ICONS: Readonly<Record<LogKind, { paths: readonly string[]; colour: string; label: string }>> = {
  combat: { paths: ["M5 5l14 14", "M19 5l-14 14", "M9 3l-4 2l2 -4", "M15 3l4 2l-2 -4"], colour: "#ff5d73", label: "Battle" },
  capture: { paths: ["M6 21v-18", "M6 4h11l-2 4l2 4h-11"], colour: "#e0b341", label: "Capture" },
  arrival: { paths: ["M4 12h14", "M13 7l5 5l-5 5"], colour: "#8b93a1", label: "Arrival" },
  build: { paths: ["M12 3l8 4.5v9l-8 4.5l-8 -4.5v-9z", "M12 12l8 -4.5", "M12 12v9", "M12 12l-8 -4.5"], colour: "#5ee07a", label: "New ship" },
  economy: { paths: ["M12 3a9 9 0 1 0 0.01 0z", "M14.5 9a2.5 2 0 0 0 -2.5 -1.5c-1.6 0 -2.5 0.8 -2.5 2s1 1.7 2.5 2s2.5 0.9 2.5 2s-1 2 -2.5 2a2.5 2 0 0 1 -2.5 -1.5", "M12 6v1.5", "M12 16.5v1.5"], colour: "#4fb3ff", label: "Money" },
  info: { paths: ["M12 3a9 9 0 1 0 0.01 0z", "M12 11v6", "M12 7.5v0.5"], colour: "#8b93a1", label: "Report" },
  lost: { paths: ["M12 3a9 9 0 1 0 0.01 0z", "M6 6l12 12"], colour: "#ff5d73", label: "Loss" },
  sighting: { paths: ["M2 12c3 -5 6.5 -7 10 -7s7 2 10 7c-3 5 -6.5 7 -10 7s-7 -2 -10 -7z", "M12 9.5a2.5 2.5 0 1 0 0.01 0z"], colour: "#ffb347", label: "Sighting" },
};

export function kindIcon(kind: LogKind, size = 15): SVGSVGElement {
  const spec = KIND_ICONS[kind];
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("class", "kind-icon");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", spec.colour);
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  for (const d of spec.paths) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  const title = document.createElementNS(SVG_NS, "title");
  title.textContent = spec.label;
  svg.append(title);
  return svg;
}

/**
 * A report's text with each faction it names marked by its emblem, so the eye
 * finds the players before it reads the words.
 */
export function withEmblems(text: string, factions: readonly Faction[]): (string | Node)[] {
  const named = factions.filter((f) => f.name !== "" && text.includes(f.name)).sort((a, b) => b.name.length - a.name.length);
  if (named.length === 0) return [text];
  const out: (string | Node)[] = [];
  let rest = text;
  for (;;) {
    let first: { at: number; f: Faction } | null = null;
    for (const f of named) {
      const at = rest.indexOf(f.name);
      if (at >= 0 && (first === null || at < first.at)) first = { at, f };
    }
    if (first === null) break;
    if (first.at > 0) out.push(rest.slice(0, first.at));
    const span = document.createElement("span");
    span.className = "faction-name";
    span.append(emblem(first.f, factions), first.f.name);
    out.push(span);
    rest = rest.slice(first.at + first.f.name.length);
  }
  if (rest !== "") out.push(rest);
  return out;
}
