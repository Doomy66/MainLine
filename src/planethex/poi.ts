import {
  latticeKey,
  latticeRef,
  latticeRefPosition,
  parseLattice,
  type LatticeRef,
} from "./grid/coord";
import { nearestCell, type CellId, type Grid } from "./grid/grid";

/**
 * Points of interest: the hex attachments of PlanetSpec.md 6.5.
 *
 * A POI is user data rather than generated data, so a save carries it explicitly.
 * It is keyed by the lattice name of 2.4.8, which carries the depth it was placed
 * at. That is what lets one sit on a hex of the local panel, which is finer than
 * anything the reference lattice of 2.4 has a name for.
 *
 * The name does not depend on the level being viewed, so moving the slider
 * neither moves a POI nor loses one. Every panel draws it on whichever of its own
 * hexes covers it, which is the nearest centre under 6.6.1.1.
 */

/** What a POI is. Spec 6.5.2: a place on the world, or a note about one. */
export type PoiKind = "starport" | "city" | "comment";

export const POI_KINDS: readonly PoiKind[] = ["starport", "city", "comment"];

export interface Poi {
  readonly kind: PoiKind;
  /** What the place is called. Free text, and the label a tooltip leads with. */
  readonly name: string;
  /** Free prose about it, as the planet's own narrative is under 6.10. */
  readonly narrative: string;
  /**
   * How many people it holds, where 6.24 worked one out. Absent on a comment and
   * on anything the user placed by hand, which have no size to record.
   *
   * Held as a number as well as written into the narrative of 6.24.4, because the
   * two are for different readers. The line is for the referee and is theirs to
   * rewrite; this is what the list of 6.5.7.1 puts the cities in order by, and
   * parsing it back out of prose the user is free to edit would be a sort that
   * stopped working the first time anybody wrote on one.
   */
  readonly population?: number;
  /** The point it sits on, named on the lattice it was placed on. Spec 6.6. */
  readonly ref: LatticeRef;
}

/** A POI and the cell of the grid in hand it is drawn on. Spec 6.6. */
export interface PoiPlacement {
  readonly poi: Poi;
  readonly cell: CellId;
}

/**
 * Where each POI lands on a grid. Spec 6.6.1: whichever hex of that grid covers
 * the point, which for a hex lattice is the hex whose centre it is nearest. A
 * grid that has the point itself finds that hex, since a point is nearest its own
 * centre, so the exact case needs no rule of its own.
 *
 * Works for any grid, which is what lets the display grid and the far finer
 * lattice of the local panel place the same POI by the same rule.
 */
export function poiPlacements(grid: Grid, pois: readonly Poi[]): PoiPlacement[] {
  const out: PoiPlacement[] = [];
  for (const poi of pois) {
    const cell = nearestCell(grid, latticeRefPosition(poi.ref));
    if (cell !== null) out.push({ poi, cell });
  }
  return out;
}

/** Where a POI sits on the sphere. */
export const poiPosition = latticeRefPosition;

/** One POI to a point, so a coordinate is enough to find, replace, or drop one. */
export function poiAt(pois: readonly Poi[], ref: LatticeRef | null): Poi | null {
  if (ref === null) return null;
  const key = latticeKey(ref);
  return pois.find((poi) => latticeKey(poi.ref) === key) ?? null;
}

/**
 * The list with `poi` on its point, replacing whatever was there. A new list
 * rather than a mutation, so a caller holding the old one is holding what it had.
 */
export function putPoi(pois: readonly Poi[], poi: Poi): Poi[] {
  const key = latticeKey(poi.ref);
  const kept = pois.filter((existing) => latticeKey(existing.ref) !== key);
  return [...kept, poi];
}

export function removePoi(pois: readonly Poi[], ref: LatticeRef): Poi[] {
  const key = latticeKey(ref);
  return pois.filter((poi) => latticeKey(poi.ref) !== key);
}

/**
 * Which kind a hex is marked as when it carries several. Spec 5.5.5.
 *
 * A hex of the map covers a swathe of the world under 6.6.3, and at the coarse
 * levels that is enough ground to hold a port, a city and a note about them all at
 * once. One mark to a hex, so one of the three has to win, and they rank the way
 * they matter: a starport is what a referee looks for first, a city is a place on
 * the world, and a comment is a note about one. The tooltip of 4.3.5 says what
 * else is under it.
 */
const MARK_ORDER: readonly PoiKind[] = ["starport", "city", "comment"];

export function markKind(pois: readonly Poi[]): PoiKind {
  for (const kind of MARK_ORDER) {
    if (pois.some((poi) => poi.kind === kind)) return kind;
  }
  return "comment";
}

/**
 * Where a kind sorts, lowest first. The same order the marks rank in, because it
 * is the same judgement about which of them a referee came to the panel for: the
 * list of 4.2.5.1 puts the starport at the top for the reason the map draws it
 * over a comment.
 */
export function kindRank(kind: PoiKind): number {
  const at = MARK_ORDER.indexOf(kind);
  return at === -1 ? MARK_ORDER.length : at;
}

/**
 * How the list of 6.5.7.1 orders two points of interest: by kind, then by size
 * largest first, then by name.
 *
 * Size before name because a city's size is what a referee is looking for when
 * they look at the list at all. The capital is the top of the group and the
 * hamlets are the bottom of it, which is the order they matter in. Anything with
 * no size recorded - a comment, or a city the user placed by hand - sorts under
 * the ones that have one rather than being guessed at.
 */
export function comparePois(a: Poi, b: Poi, title: (poi: Poi) => string): number {
  return (
    kindRank(a.kind) - kindRank(b.kind) ||
    (b.population ?? -1) - (a.population ?? -1) ||
    title(a).localeCompare(title(b))
  );
}

/** What the starport a profile gives a world is called. Spec 6.5.8. */
export function starportName(letter: string): string {
  return `Starport ${letter}`;
}

/** The starports on a world, in the order they were placed. */
export function starports(pois: readonly Poi[]): Poi[] {
  return pois.filter((poi) => poi.kind === "starport");
}

/** The cities on a world. The starport is the first of them under 6.24.1, and is
 *  not among these: it is its own kind, because the profile names it. */
export function cities(pois: readonly Poi[]): Poi[] {
  return pois.filter((poi) => poi.kind === "city");
}

/**
 * The POIs of a loaded save. Unlike the seed of 6.4.3 a POI is not something the
 * planet cannot be rebuilt without, so an entry that cannot be read is dropped
 * rather than refusing the file: losing one note beats refusing the world it was
 * written about.
 */
export function parsePois(raw: unknown): Poi[] {
  if (!Array.isArray(raw)) return [];
  const out: Poi[] = [];
  for (const entry of raw) {
    const poi = readPoi(entry);
    if (poi !== null) out.push(poi);
  }
  return out;
}

function readPoi(raw: unknown): Poi | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const kind = POI_KINDS.includes(r["kind"] as PoiKind) ? (r["kind"] as PoiKind) : null;
  const ref = readRef(r["ref"]);
  if (kind === null || ref === null) return null;
  const people = r["population"];
  const population =
    typeof people === "number" && Number.isFinite(people) && people >= 0 ? people : null;
  return {
    kind,
    name: typeof r["name"] === "string" ? r["name"] : "",
    narrative: typeof r["narrative"] === "string" ? r["narrative"] : "",
    ...(population === null ? {} : { population }),
    ref,
  };
}

/**
 * A coordinate as the numbers or as the written form of 2.4.8. A save written
 * before POIs could sit on the fine lattice carries no depth, and every one of
 * those was a display hex, so the reference lattice is what it means.
 */
/**
 * The lattice a saved ref with no depth on it is counted on.
 *
 * Fixed at 48, and it must not follow REFERENCE_SIZE. Those files were written
 * when 48 was the finest level, so 48 is what their coordinates mean; read on a
 * finer lattice the same numbers name a different place, and every point of
 * interest in every old save would quietly move the day a level was added to the
 * slider. Spec 2.2.2.5.
 */
const DEPTHLESS_SIZE = 48;

function readRef(raw: unknown): LatticeRef | null {
  if (typeof raw === "string") return parseLattice(raw, DEPTHLESS_SIZE);
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const whole = (key: string) =>
    typeof r[key] === "number" && Number.isInteger(r[key]) && (r[key] as number) >= 0
      ? (r[key] as number)
      : null;
  const face = whole("face");
  const i = whole("i");
  const j = whole("j");
  const size = whole("size") ?? DEPTHLESS_SIZE;
  if (face === null || i === null || j === null) return null;
  if (face > 19 || j > i || i > size || size < 1) return null;
  // Canonical, so what a save holds and what a click makes are the same name.
  return latticeRef(face, i, j, size);
}
