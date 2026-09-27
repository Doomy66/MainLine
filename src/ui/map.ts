/**
 * The sector map: PlanetHex's sector map, with the game drawn over it.
 *
 * The hexes, the world dots and their colours, the zoom and the drag are
 * PlanetHex's, so a sector looks here as it did where it was made. Over that go
 * who holds what, as a wash of each faction's colour over its hexes the way
 * PlanetHex shades a Main; fleets, as marks beside their worlds; fleets in jump
 * space, as a dashed line with a mark along it; and, while a jump is being
 * chosen, the systems in range.
 */

import {
  centreAt,
  centreOf,
  dotFor,
  hexPoints,
  HEX_HIGH,
  SECTOR_COLS,
  SECTOR_ROWS,
  sectorSize,
  SUB_COLS,
  SUB_ROWS,
  COLUMN_STEP,
  HEX_WIDE,
  PAD,
} from "../sector/hex";
import type { World } from "../sector/sec";
import { boxFor, pointIn, wholeOf, zoomedAt, type Box, type View } from "./viewbox";

const SVG_NS = "http://www.w3.org/2000/svg";
const ZOOM = { out: 1, in: 7 };
/** Close enough to show every name, hex number and starport. */
const DETAIL_FROM = 2.2;
/** Far out, only worlds this populous are named. */
const NAMED_FROM = 9;

function make<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** The four colours PlanetHex draws a world in. */
function worldClass(world: World): string {
  const { hydrographics, atmosphere, population } = world.uwp;
  if (population === 0) return "m-world m-empty";
  if (hydrographics > 0 && atmosphere >= 2 && atmosphere <= 9) return "m-world m-wet";
  if (atmosphere >= 2) return "m-world m-dusty";
  return "m-world m-airless";
}

/** A little ship centred on x, y, its nose to the right or up. */
function shipPoints(x: number, y: number, nose: "right" | "up"): string {
  const shape = [
    [11, 0],
    [-3, -5],
    [-9, -9],
    [-6, 0],
    [-9, 9],
    [-3, 5],
  ];
  return shape
    .map(([a, b]) => (nose === "right" ? `${x + a!},${y + b!}` : `${x + b!},${y - a!}`))
    .join(" ");
}

export interface FleetMark {
  readonly id: string;
  readonly at: string;
  readonly colour: string;
  /** The faction's id. */
  readonly owner: string;
  /** Mine, somebody else's seen now, or somebody else's last seen some days ago. */
  readonly kind: "own" | "enemy" | "ghost";
  readonly ships: number;
  /** The day it was seen there, for a ghost. */
  readonly seen?: number;
  readonly title: string;
}

export interface TransitMark {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  /** How far along, 0 to 1. */
  readonly progress: number;
  readonly colour: string;
  readonly title: string;
}

export interface Overlay {
  /** Hex to the colour of the faction holding it. */
  readonly owners: ReadonlyMap<string, string>;
  readonly capitals: ReadonlySet<string>;
  readonly selected: string | null;
  readonly selectedFleet: string | null;
  readonly fleets: readonly FleetMark[];
  readonly transits: readonly TransitMark[];
  /** Systems the selected fleet can jump to now. */
  readonly range: ReadonlySet<string>;
  /** Systems it could get to by a route of jumps. */
  readonly reach: ReadonlySet<string>;
  /** A route being shown, starting where the fleet is. */
  readonly route: readonly string[];
  readonly sieges: ReadonlySet<string>;
  readonly battles: ReadonlySet<string>;
  /** Hexes outside the game, drawn dim. */
  readonly inPlay: ReadonlySet<string>;
}

export interface MapView {
  readonly element: SVGSVGElement;
  setWorlds(worlds: readonly World[], inPlay: ReadonlySet<string>): void;
  update(overlay: Overlay): void;
  onPickHex(handler: (at: string) => void): void;
  onPickFleet(handler: (id: string) => void): void;
  /**
   * The pointer is over a world's hex, or over a fleet's mark, or neither
   * (both null). The position is the pointer's, in the page.
   */
  onHover(handler: (at: string | null, fleet: string | null, clientX: number, clientY: number) => void): void;
  centreOn(at: string, zoom?: number): void;
  resetView(): void;
}

export function createMap(): MapView {
  const svg = make("svg", { class: "sectormap" });
  const territory = make("g");
  const grid = make("g");
  const frames = make("g");
  const reachLayer = make("g");
  const routeLayer = make("g");
  const worldLayer = make("g");
  const markLayer = make("g");
  const selectLayer = make("g");
  svg.append(territory, grid, frames, reachLayer, routeLayer, worldLayer, markLayer, selectLayer);

  const pickHex: ((at: string) => void)[] = [];
  const pickFleet: ((id: string) => void)[] = [];
  const hover: ((at: string | null, fleet: string | null, clientX: number, clientY: number) => void)[] = [];
  const worldAt = new Set<string>();
  let view: View = { zoom: 1, x: 0, y: 0 };
  let press: { x: number; y: number; from: { x: number; y: number }; moved: boolean } | null = null;

  function content(): Box {
    const size = sectorSize();
    return { x: 0, y: 0, width: size.width, height: size.height };
  }

  function panel(): { width: number; height: number } {
    return { width: svg.clientWidth, height: svg.clientHeight };
  }

  function showView(): void {
    const box = boxFor(content(), view, panel());
    view = { ...view, x: box.x + box.width / 2, y: box.y + box.height / 2 };
    svg.setAttribute("viewBox", `${box.x} ${box.y} ${box.width} ${box.height}`);
    svg.classList.toggle("m-close", view.zoom >= DETAIL_FROM);
  }

  function setWorlds(list: readonly World[], inPlay: ReadonlySet<string>): void {
    grid.replaceChildren();
    worldLayer.replaceChildren();
    frames.replaceChildren();
    worldAt.clear();
    for (const w of list) worldAt.add(w.at);
    for (let row = 1; row <= SECTOR_ROWS; row++) {
      for (let col = 1; col <= SECTOR_COLS; col++) {
        const { x, y } = centreOf(col, row);
        const at = `${String(col).padStart(2, "0")}${String(row).padStart(2, "0")}`;
        const cell = make("polygon", { class: "m-cell", points: hexPoints(x, y) });
        cell.dataset["at"] = at;
        grid.append(cell);
        const digits = make("text", { class: "m-at", x, y: y - HEX_HIGH * 0.33 });
        digits.textContent = at;
        grid.append(digits);
      }
    }
    for (const w of list) {
      const { x, y } = centreAt(w.at);
      const g = make("g", { class: inPlay.has(w.at) ? "m-hex" : "m-hex m-out" });
      g.dataset["at"] = w.at;
      const port = make("text", { class: "m-port", x, y: y - HEX_HIGH * 0.13 });
      port.textContent = w.uwp.starport;
      g.append(port);
      if (w.pbg.giants > 0) g.append(make("circle", { class: "m-gg", cx: x + HEX_WIDE * 0.22, cy: y - HEX_HIGH * 0.2, r: 3.5 }));
      g.append(make("circle", { class: worldClass(w), cx: x, cy: y, r: dotFor(w.uwp.population) }));
      if (/N/.test(w.bases)) {
        const base = make("text", { class: "m-base", x: x - HEX_WIDE * 0.24, y: y - HEX_HIGH * 0.12 });
        base.textContent = "★";
        g.append(base);
      }
      const name = make("text", {
        class: w.uwp.population >= NAMED_FROM ? "m-name m-major" : "m-name",
        x,
        y: y + HEX_HIGH * 0.36,
      });
      name.textContent = w.name;
      g.append(name);
      worldLayer.append(g);
    }
    for (let i = 0; i < 16; i++) {
      const across = i % 4;
      const down = Math.floor(i / 4);
      frames.append(
        make("rect", {
          class: "m-frame",
          x: PAD + across * SUB_COLS * COLUMN_STEP,
          y: PAD + down * SUB_ROWS * HEX_HIGH - HEX_HIGH / 2,
          width: SUB_COLS * COLUMN_STEP + HEX_WIDE / 4,
          height: SUB_ROWS * HEX_HIGH + HEX_HIGH,
        }),
      );
    }
    showView();
  }

  function update(o: Overlay): void {
    territory.replaceChildren();
    reachLayer.replaceChildren();
    routeLayer.replaceChildren();
    markLayer.replaceChildren();
    selectLayer.replaceChildren();

    for (const [at, colour] of o.owners) {
      const { x, y } = centreAt(at);
      territory.append(make("polygon", { class: "m-held", points: hexPoints(x, y), style: `fill:${colour}` }));
    }
    for (const at of o.capitals) {
      const { x, y } = centreAt(at);
      territory.append(make("polygon", { class: "m-capital", points: hexPoints(x, y, 0.86), style: `stroke:${o.owners.get(at) ?? "#fff"}` }));
    }
    for (const at of o.reach) {
      if (o.range.has(at)) continue;
      const { x, y } = centreAt(at);
      reachLayer.append(make("circle", { class: "m-reach", cx: x, cy: y, r: 22 }));
    }
    for (const at of o.range) {
      const { x, y } = centreAt(at);
      reachLayer.append(make("circle", { class: "m-range", cx: x, cy: y, r: 24 }));
    }
    for (const at of o.sieges) {
      const { x, y } = centreAt(at);
      reachLayer.append(make("circle", { class: "m-siege", cx: x, cy: y, r: 28 }));
    }
    for (const at of o.battles) {
      const { x, y } = centreAt(at);
      const t = make("text", { class: "m-battle", x: x - HEX_WIDE * 0.26, y: y + HEX_HIGH * 0.12 });
      t.textContent = "✸";
      reachLayer.append(t);
    }
    if (o.route.length > 1) {
      const pts = o.route.map((at) => centreAt(at)).map((p) => `${p.x},${p.y}`).join(" ");
      routeLayer.append(make("polyline", { class: "m-route", points: pts }));
    }
    for (const t of o.transits) {
      const a = centreAt(t.from);
      const b = centreAt(t.to);
      routeLayer.append(make("line", { class: "m-transit", x1: a.x, y1: a.y, x2: b.x, y2: b.y, style: `stroke:${t.colour}` }));
      const px = a.x + (b.x - a.x) * t.progress;
      const py = a.y + (b.y - a.y) * t.progress;
      const g = make("g", { class: t.id === o.selectedFleet ? "m-fleet m-chosen" : "m-fleet" });
      g.append(make("circle", { cx: px, cy: py, r: 7, class: "m-jumpmark", style: `fill:${t.colour}` }));
      g.dataset["fleet"] = t.id;
      markLayer.append(g);
    }
    // Fleets beside their worlds: yours up and to the right, others down and
    // to the right, stacked when there are several.
    const stacks = new Map<string, number>();
    for (const f of o.fleets) {
      const key = `${f.at}|${f.kind === "own" ? "own" : "other"}`;
      const n = stacks.get(key) ?? 0;
      stacks.set(key, n + 1);
      const c = centreAt(f.at);
      const x = c.x + HEX_WIDE * 0.24 + n * 14;
      const y = f.kind === "own" ? c.y - HEX_HIGH * 0.02 : c.y + HEX_HIGH * 0.2;
      const g = make("g", { class: `m-fleet m-${f.kind}${f.id === o.selectedFleet ? " m-chosen" : ""}` });
      // Everyone's fleets are little ships: yours head right, others head up,
      // ringed in red, and a sighting days old is only an outline.
      if (f.kind !== "own") g.append(make("circle", { class: "m-threat", cx: x, cy: y, r: 13 }));
      g.append(make("polygon", { points: shipPoints(x, y, f.kind === "own" ? "right" : "up"), style: `fill:${f.colour}` }));
      g.dataset["fleet"] = f.id;
      markLayer.append(g);
    }
    if (o.selected !== null) {
      const { x, y } = centreAt(o.selected);
      selectLayer.append(make("polygon", { class: "m-pick", points: hexPoints(x, y) }));
    }
  }

  new ResizeObserver(() => showView()).observe(svg);

  let hovering: { at: string | null; fleet: string | null } = { at: null, fleet: null };
  function hoverAt(event: PointerEvent | null): void {
    let at: string | null = null;
    let fleet: string | null = null;
    if (event !== null && press?.moved !== true) {
      const mark = (event.target as Element).closest(".m-fleet") as SVGElement | null;
      fleet = mark?.dataset["fleet"] ?? null;
      if (fleet === null) {
        const p = pointIn(event, svg, boxFor(content(), view, panel()));
        const hex = hexAtPoint(p.x, p.y);
        at = hex !== null && worldAt.has(hex) ? hex : null;
      }
    }
    if (at === hovering.at && fleet === hovering.fleet && at === null && fleet === null) return;
    hovering = { at, fleet };
    for (const h of hover) h(at, fleet, event?.clientX ?? 0, event?.clientY ?? 0);
  }

  svg.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      view = zoomedAt(content(), view, panel(), Math.pow(0.999, event.deltaY), pointIn(event, svg, boxFor(content(), view, panel())), ZOOM);
      showView();
      hoverAt(null);
    },
    { passive: false },
  );
  svg.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    press = { x: event.clientX, y: event.clientY, from: { x: view.x, y: view.y }, moved: false };
  });
  svg.addEventListener("pointermove", (event) => {
    hoverAt(event);
    if (press === null) return;
    if (Math.abs(event.clientX - press.x) + Math.abs(event.clientY - press.y) > 4) press.moved = true;
    if (!press.moved) return;
    const on = svg.getBoundingClientRect();
    const box = boxFor(content(), view, panel());
    view.x = press.from.x - ((event.clientX - press.x) / on.width) * box.width;
    view.y = press.from.y - ((event.clientY - press.y) / on.height) * box.height;
    showView();
  });
  svg.addEventListener("pointerup", (event) => {
    const wasDrag = press?.moved === true;
    press = null;
    if (wasDrag) return;
    // A fleet mark picks the fleet, not the hex under it.
    const onFleet = (event.target as Element).closest(".m-fleet");
    if (onFleet !== null) {
      const id = (onFleet as SVGElement).dataset["fleet"];
      if (id !== undefined) for (const h of pickFleet) h(id);
      return;
    }
    // A click picks the hex under it, world or not.
    const p = pointIn(event, svg, boxFor(content(), view, panel()));
    const at = hexAtPoint(p.x, p.y);
    if (at !== null) for (const h of pickHex) h(at);
  });
  svg.addEventListener("pointerleave", () => {
    press = null;
    hoverAt(null);
  });

  /** The hex whose centre is nearest a point of the drawing. */
  function hexAtPoint(x: number, y: number): string | null {
    const col = Math.round((x - PAD - HEX_WIDE / 2) / COLUMN_STEP) + 1;
    let best: { at: string; d: number } | null = null;
    for (let c = col - 1; c <= col + 1; c++) {
      if (c < 1 || c > SECTOR_COLS) continue;
      for (let r = 1; r <= SECTOR_ROWS; r++) {
        const p = centreOf(c, r);
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (best === null || d < best.d) best = { at: `${String(c).padStart(2, "0")}${String(r).padStart(2, "0")}`, d };
      }
    }
    return best !== null && best.d < (HEX_WIDE / 2) ** 2 ? best.at : null;
  }

  return {
    element: svg,
    setWorlds,
    update,
    onPickHex: (h) => pickHex.push(h),
    onPickFleet: (h) => pickFleet.push(h),
    onHover: (h) => hover.push(h),
    centreOn(at, zoom) {
      const p = centreAt(at);
      view = { zoom: zoom ?? Math.max(view.zoom, 2.4), x: p.x, y: p.y };
      showView();
    },
    resetView() {
      view = wholeOf(content());
      showView();
    },
  };
}
