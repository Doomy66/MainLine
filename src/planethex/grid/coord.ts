import { faceWeights, ICO_FACES, ICO_VERTICES } from "./icosahedron";
import { add, normalise, scale, type Vec3 } from "./vec3";
import type { CellId, Grid } from "./grid";

/**
 * Cell identity that survives a change of detail level. PlanetSpec.md section 2.4.
 *
 * A cell's `CellId` is the index it was given while the grid was built, so it is
 * only good for as long as that grid is. The (face, i, j) of a NetPlacement is
 * better but still counts lattice steps, so it moves when the detail level does.
 *
 * A lattice point is placed by the ratios (i/n, j/n), never by i and j on their
 * own, so scaling the whole triple by a whole number lands on the identical
 * direction: (face, i, j) at n rows is (face, ki, kj) at kn rows. Every detail
 * level of DETAIL_LEVELS divides REFERENCE_SIZE, so every cell at every level is
 * also a cell of the reference lattice. Its coordinate there is its name, and it
 * is the same name whatever level the user is looking at.
 */

/** The detail levels the application offers. Each one divides REFERENCE_SIZE. */
export const DETAIL_LEVELS = [6, 12, 24, 48, 96] as const;

/** The finest level, and so the lattice every cell coordinate is expressed on. */
export const REFERENCE_SIZE = 96;

/**
 * The lattice the water fraction of 5.2 is measured against, which divides
 * REFERENCE_SIZE but is not it. Spec 5.2.4.1.
 *
 * Twenty three thousand samples settle a quantile: measured on the finest lattice
 * instead, the answer moves by under a thousandth of the height range, which is a
 * small fraction of one contour interval and cannot be seen on a coastline. What
 * it does cost is four times the sampling, around a tenth of a second, and the
 * sea level is worked out again every time a digit of the UWP is touched.
 *
 * So the finest level is where the world is drawn, and this is where it is
 * measured. The two are different jobs and only one of them gets better with more
 * samples.
 */
export const SEA_SAMPLE_SIZE = 48;

/**
 * The level the sphere of 4.4.9 is drawn at, whatever the slider says. Spec 4.4.9.5.
 *
 * The finest level, so a coastline on the sphere is drawn as finely as the map can
 * draw one. Four times the hexes is not four times the cost: the mesh is rebuilt
 * at every redraw, but that is a fraction of what a redraw does, and measured
 * against half this level it adds about a sixth of a second to one - some thirty
 * parts in a hundred. The grid itself is built once a session and kept.
 */
export const SPHERE_SIZE = 96;

export const DEFAULT_DETAIL = 24;

/** Nearest offered detail level, for a size that came from somewhere else. */
export function nearestDetail(size: number): number {
  let best: number = DETAIL_LEVELS[0];
  for (const level of DETAIL_LEVELS) {
    if (Math.abs(level - size) < Math.abs(best - size)) best = level;
  }
  return best;
}

/**
 * A point named on a lattice of any depth: (face, i, j) of `size` rows, held in
 * lowest terms under reduceCoord. Spec 2.4.8.
 *
 * A RefCoord names a display hex, and every display hex is a point of the size 48
 * reference lattice, so 48 is the only depth it needs. The local panel of 4.5
 * draws hexes far finer than that, and a point of interest can sit on one of
 * those, which is a point the reference lattice has no name for. This is that
 * name: the same scheme with the depth carried alongside.
 */
export interface LatticeRef extends RefCoord {
  /** Rows of the lattice the coordinate is counted on. */
  readonly size: number;
}

/** A cell's coordinate on the reference lattice. Stable across detail levels. */
export interface RefCoord {
  readonly face: number;
  readonly i: number;
  readonly j: number;
}

/** The unit-sphere direction of lattice point (i, j) on a face of `size` rows. */
export function latticePosition(face: number, size: number, i: number, j: number): Vec3 {
  const c = ICO_FACES[face]!.corners.map((v) => ICO_VERTICES[v]!) as [Vec3, Vec3, Vec3];
  const w = [(size - i) / size, (i - j) / size, j / size] as const;
  return normalise(add(add(scale(c[0], w[0]), scale(c[1], w[1])), scale(c[2], w[2])));
}

const INSIDE = -1e-9;
const WHOLE = 1e-6;

/**
 * The reference coordinate of a lattice point, whatever level it came from.
 *
 * A cell on a face edge has a name on both faces and one on the twelve corners
 * has five, so the point is solved against every face and the lowest-numbered
 * answer wins. Which face is picked does not matter; that the same face is picked
 * every time does, since this is what a save file and a URL hold.
 */
export function refCoord(face: number, i: number, j: number, size: number): RefCoord {
  const p = latticePosition(face, size, i, j);
  let best: RefCoord | null = null;
  for (let f = 0; f < ICO_FACES.length; f++) {
    const w = faceWeights(f, p);
    if (!w || Math.min(w[0], w[1], w[2]) < INSIDE) continue;
    const ri = (w[1] + w[2]) * REFERENCE_SIZE;
    const rj = w[2] * REFERENCE_SIZE;
    const ni = Math.round(ri);
    const nj = Math.round(rj);
    if (Math.abs(ri - ni) > WHOLE || Math.abs(rj - nj) > WHOLE) continue;
    const found: RefCoord = { face: f, i: ni, j: nj };
    if (!best || compareRef(found, best) < 0) best = found;
  }
  if (!best) {
    throw new Error(`Lattice point ${face}/${i}/${j} of size ${size} is not on the size ${REFERENCE_SIZE} lattice`);
  }
  return best;
}

function compareRef(a: RefCoord, b: RefCoord): number {
  return a.face - b.face || a.i - b.i || a.j - b.j;
}

/**
 * The canonical name of a lattice point at any depth. The triple is reduced
 * first, so the same point counted on two lattices comes back as one name, and
 * the faces are then solved as refCoord solves them, so a point on a seam is
 * named by the same face whichever side it was reached from.
 */
export function latticeRef(face: number, i: number, j: number, size: number): LatticeRef {
  const [ri, rj, rs] = reduceCoord(i, j, size);
  const p = latticePosition(face, rs, ri, rj);
  let best: LatticeRef | null = null;
  for (let f = 0; f < ICO_FACES.length; f++) {
    const w = faceWeights(f, p);
    if (!w || Math.min(w[0], w[1], w[2]) < INSIDE) continue;
    const li = (w[1] + w[2]) * rs;
    const lj = w[2] * rs;
    const ni = Math.round(li);
    const nj = Math.round(lj);
    if (Math.abs(li - ni) > WHOLE || Math.abs(lj - nj) > WHOLE) continue;
    const found: LatticeRef = { face: f, i: ni, j: nj, size: rs };
    if (!best || compareRef(found, best) < 0) best = found;
  }
  // The face solve is what names a seam consistently, not what makes the point
  // valid, so a point it cannot place keeps the name it was asked about rather
  // than throwing under a click.
  return best ?? { face, i: ri, j: rj, size: rs };
}

/** A display hex's name as a lattice name. The reference lattice is one of these. */
export function asLatticeRef(ref: RefCoord): LatticeRef {
  return latticeRef(ref.face, ref.i, ref.j, REFERENCE_SIZE);
}

/** Where a lattice point sits on the unit sphere. */
export function latticeRefPosition(ref: LatticeRef): Vec3 {
  return latticePosition(ref.face, ref.size, ref.i, ref.j);
}

export function latticeKey(ref: LatticeRef): string {
  return `${ref.face}/${ref.i}/${ref.j}/${ref.size}`;
}

/**
 * The written form. A point of the reference lattice is written as 2.4.5 writes
 * it, since that is the form the panels show; a finer point carries the depth it
 * is counted on after a slash, because without it the numbers mean nothing.
 */
export function formatLattice(ref: LatticeRef): string {
  if (REFERENCE_SIZE % ref.size === 0) {
    const k = REFERENCE_SIZE / ref.size;
    return formatRef({ face: ref.face, i: ref.i * k, j: ref.j * k });
  }
  return `${formatRef({ face: ref.face, i: ref.i, j: ref.j })}/${ref.size}`;
}

/**
 * The written form back. A name with no depth on it is counted on `depthless`,
 * which is the reference lattice unless the caller knows better: a saved file
 * written before depths existed means the lattice of the day it was written, not
 * whatever the finest level has since become. Spec 2.2.2.5.
 */
export function parseLattice(text: string, depthless: number = REFERENCE_SIZE): LatticeRef | null {
  const [head, tail] = text.trim().split("/");
  if (head === undefined) return null;
  if (tail === undefined) {
    const ref = parseRef(head);
    return ref === null ? null : latticeRef(ref.face, ref.i, ref.j, depthless);
  }
  const size = Number(tail);
  if (!Number.isInteger(size) || size < 1) return null;
  const m = REF_PATTERN.exec(head.trim().toUpperCase().replace(/[\s-]/g, ""));
  if (!m) return null;
  const [face, i, j] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (face > 19 || i > size || j > i) return null;
  return latticeRef(face, i, j, size);
}

/**
 * Where a reference coordinate lands on a grid of `size` rows, or null if that
 * grid has no cell there. Null is the honest answer rather than a failure: a
 * coordinate taken at detail 48 names a place that detail 12 simply does not draw.
 */
export function refAtSize(ref: RefCoord, size: number): { face: number; i: number; j: number } | null {
  if (!Number.isInteger(REFERENCE_SIZE / size)) return null;
  const k = REFERENCE_SIZE / size;
  if (ref.i % k !== 0 || ref.j % k !== 0) return null;
  return { face: ref.face, i: ref.i / k, j: ref.j / k };
}

/** True if a grid of `size` rows draws this cell. */
export function existsAtSize(ref: RefCoord, size: number): boolean {
  return refAtSize(ref, size) !== null;
}

/** The coarsest offered level that still draws this cell. */
export function coarsestLevel(ref: RefCoord): number {
  for (const level of DETAIL_LEVELS) if (existsAtSize(ref, level)) return level;
  return REFERENCE_SIZE;
}

const REF_PATTERN = /^F(\d+)R(\d+)C(\d+)$/;

/** The written form, as it appears in the panel, a save file, and a URL. */
export function formatRef(ref: RefCoord): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `F${pad(ref.face)}R${pad(ref.i)}C${pad(ref.j)}`;
}

export function parseRef(text: string): RefCoord | null {
  const m = REF_PATTERN.exec(text.trim().toUpperCase().replace(/[\s-]/g, ""));
  if (!m) return null;
  const [face, i, j] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (face > 19 || i > REFERENCE_SIZE || j > i) return null;
  return { face, i, j };
}

export function refKey(ref: RefCoord): string {
  return `${ref.face}/${ref.i}/${ref.j}`;
}

/**
 * The lowest terms of a lattice coordinate: the same point named on the coarsest
 * lattice it appears on. Two levels that share a cell reduce it to one triple, so
 * anything keyed on the reduced form gives them the same answer bit for bit.
 */
export function reduceCoord(i: number, j: number, size: number): [number, number, number] {
  const g = gcd(gcd(i, j), size);
  return g > 1 ? [i / g, j / g, size / g] : [i, j, size];
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x;
}

/** Reference coordinates for a grid, both ways round. */
export interface RefIndex {
  /** Coordinate of a cell, indexed by CellId. */
  readonly of: readonly RefCoord[];
  /** The cell at a coordinate, or null if this grid does not draw it. */
  at(ref: RefCoord): CellId | null;
}

/** The index of a grid with no cells in it. See EMPTY_GRID. */
export const EMPTY_REFS: RefIndex = { of: [], at: () => null };

export function buildRefIndex(grid: Grid): RefIndex {
  const of = new Array<RefCoord>(grid.cells.length);
  const filled = new Array<boolean>(grid.cells.length).fill(false);
  for (const face of grid.net) {
    for (const p of face.placements) {
      if (filled[p.cell]) continue;
      filled[p.cell] = true;
      of[p.cell] = refCoord(p.face, p.i, p.j, grid.size);
    }
  }
  const byKey = new Map<string, CellId>();
  for (let id = 0; id < of.length; id++) byKey.set(refKey(of[id]!), id);
  return {
    of,
    at: (ref) => byKey.get(refKey(ref)) ?? null,
  };
}
