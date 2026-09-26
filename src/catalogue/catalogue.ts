/**
 * The catalogue: every ship class a faction can buy.
 *
 * The bundled classes are the `.ship` files in `ships/` at the root of the
 * repository, read at build time. More can be imported during a game from any
 * `.ship` the Ship Designer saved; those travel inside the saved game.
 */

import type { Design } from "../shipdesign/engine/design";
import { designErrors, shipClass, type ShipClass } from "./shipclass";

const bundled = import.meta.glob("../../ships/*.ship", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** The file stem of a path, which is a class's id. */
function stemOf(path: string): string {
  const name = path.split("/").pop() ?? path;
  return name.replace(/\.(ship|json)$/i, "");
}

/** Read a .ship file's text into a design, or throw saying why not. */
export function parseDesign(text: string): Design {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  if (typeof raw !== "object" || raw === null) throw new Error("That file is not a ship design.");
  const d = raw as Partial<Design>;
  if (typeof d.hull !== "object" || d.hull === null || typeof d.powerPlant !== "object") {
    throw new Error("That file has no hull or power plant, so it is not a ship design.");
  }
  const design = { name: "Untitled", tl: 12, bridge: { kind: "standard" }, ...d } as Design;
  const errors = designErrors(design);
  if (errors.length > 0) throw new Error(`${design.name} breaks the design rules: ${errors.join(" ")}`);
  return design;
}

/** The designs that ship with the game, by id. */
export function bundledDesigns(): Map<string, Design> {
  const out = new Map<string, Design>();
  for (const [path, text] of Object.entries(bundled)) {
    try {
      out.set(stemOf(path), parseDesign(text));
    } catch (error) {
      console.warn(`Catalogue: ${path} left out.`, error);
    }
  }
  return out;
}

/** An id for an imported design that does not collide with one already held. */
export function idFor(name: string, taken: ReadonlySet<string>): string {
  const stem = name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "Ship";
  if (!taken.has(stem)) return stem;
  for (let n = 2; ; n++) if (!taken.has(`${stem}-${n}`)) return `${stem}-${n}`;
}

export class Catalogue {
  private readonly classes = new Map<string, ShipClass>();

  constructor(designs: ReadonlyMap<string, Design>) {
    for (const [id, design] of designs) this.classes.set(id, shipClass(id, design));
  }

  get(id: string): ShipClass {
    const held = this.classes.get(id);
    if (held === undefined) throw new Error(`No ship class ${id} in the catalogue.`);
    return held;
  }

  has(id: string): boolean {
    return this.classes.has(id);
  }

  /** Cheapest first. */
  all(): ShipClass[] {
    return [...this.classes.values()].sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
  }

  /**
   * The class that fills a carrier's hangar: the one the design names, if the
   * catalogue has it, or else the best armed craft without a jump drive that
   * fits the hangar.
   */
  fighterFor(hangar: { label: string; tons: number }): ShipClass | undefined {
    const all = this.all().filter((c) => c.jump === 0 && c.armed && c.tons <= hangar.tons);
    const label = hangar.label.toLowerCase();
    return (
      all.find((c) => c.name.toLowerCase() === label) ??
      all.find((c) => c.name.toLowerCase().includes(label) || label.includes(c.name.toLowerCase())) ??
      [...all].sort((a, b) => b.strength - a.strength)[0]
    );
  }

  add(id: string, design: Design): ShipClass {
    const made = shipClass(id, design);
    this.classes.set(id, made);
    return made;
  }
}
