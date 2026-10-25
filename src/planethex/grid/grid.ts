import type { Vec3 } from "./vec3";
import { add, centroid, normalise, positionKey, scale } from "./vec3";
import { ICO_FACES, ICO_VERTICES } from "./icosahedron";

/**
 * The planet grid.
 *
 * Each icosahedron face carries a triangular lattice of `size` rows. Cells sit on
 * the lattice points, so a cell is the dual of the lattice: hexagons everywhere
 * except at the twelve original icosahedron corners, which are pentagons.
 *
 * Lattice points on a shared face edge are produced twice, once by each face, and
 * are merged into one cell. That merge is what keeps the surface a single sheet
 * rather than twenty separate patches, so it is the first thing the tests check.
 */

export type CellId = number;

export interface Cell {
  readonly id: CellId;
  /** Unit-sphere position of the cell centre. */
  readonly centre: Vec3;
  /** Adjacent cells. Six of them, or five for the twelve pentagon cells. */
  readonly neighbours: readonly CellId[];
  /** True for the twelve cells sitting on an original icosahedron corner. */
  readonly isPentagon: boolean;
  /** Cell outline on the unit sphere, wound consistently for rendering. */
  readonly corners: readonly Vec3[];
}

/** Where one cell appears on one face of the flattened net. */
export interface NetPlacement {
  readonly cell: CellId;
  readonly face: number;
  readonly x: number;
  readonly y: number;
  /** Lattice row and column within the face, which height sampling needs. */
  readonly i: number;
  readonly j: number;
}

export interface NetFace {
  readonly face: number;
  /** Hexagon outline offsets from a cell centre. Constant within a face. */
  readonly hexOffsets: readonly (readonly [number, number])[];
  readonly placements: readonly NetPlacement[];
}

export interface Grid {
  readonly size: number;
  readonly cells: readonly Cell[];
  readonly net: readonly NetFace[];
  readonly netWidth: number;
  readonly netHeight: number;
}

const SQRT3_2 = Math.sqrt(3) / 2;

type Pt2 = readonly [number, number];

/** 2D corner positions of each face in the unfolded net, matching corner order. */
function netTriangle(faceIndex: number): readonly [Pt2, Pt2, Pt2] {
  const { group, column: k } = ICO_FACES[faceIndex]!;
  const h = SQRT3_2;
  switch (group) {
    case "north-cap":
      return [[k + 0.5, 0], [k, h], [k + 1, h]];
    case "north-band":
      return [[k, h], [k + 0.5, 2 * h], [k + 1, h]];
    case "south-band":
      return [[k + 0.5, 2 * h], [k + 1.5, 2 * h], [k + 1, h]];
    case "south-cap":
      return [[k + 1, 3 * h], [k + 1.5, 2 * h], [k + 0.5, 2 * h]];
  }
}

/** Lattice row/column to barycentric weights over the three face corners. */
function weights(size: number, i: number, j: number): [number, number, number] {
  return [(size - i) / size, (i - j) / size, j / size];
}

/**
 * Hexagon outline for a lattice whose steps are e1 and e2. The six corners are the
 * centroids of the six triangles meeting at a lattice point.
 */
function hexOffsets(e1: Pt2, e2: Pt2): readonly Pt2[] {
  const combine = (a: number, b: number): Pt2 => [
    (a * e1[0] + b * e2[0]) / 3,
    (a * e1[1] + b * e2[1]) / 3,
  ];
  return [
    combine(1, 1),
    combine(-1, 2),
    combine(-2, 1),
    combine(-1, -1),
    combine(1, -2),
    combine(2, -1),
  ];
}

/**
 * A grid with nothing in it, for a window that is not showing a planet.
 *
 * The application opens on the landing page of AppSpec 2, where no planet has
 * been chosen and none may be generated: AppSpec 2.5 has a user who opens the
 * landing page and closes it again roll nothing. Something has to hold the shape
 * of a grid until then, and this is the one that costs nothing to hold.
 *
 * Nothing draws it. It is replaced by a real grid before a planet is on screen.
 */
export const EMPTY_GRID: Grid = {
  size: 0,
  cells: [],
  net: [],
  netWidth: 0,
  netHeight: 0,
};

export function buildGrid(size: number): Grid {
  if (!Number.isInteger(size) || size < 1) {
    throw new Error(`Grid size must be a positive whole number, got ${size}`);
  }

  const byKey = new Map<string, CellId>();
  const centres: Vec3[] = [];
  const neighbourSets: Set<CellId>[] = [];
  const triangleFans: Vec3[][] = [];
  const netFaces: NetFace[] = [];

  const cellAt = (p: Vec3): CellId => {
    const key = positionKey(p);
    const existing = byKey.get(key);
    if (existing !== undefined) return existing;
    const id = centres.length;
    byKey.set(key, id);
    centres.push(p);
    neighbourSets.push(new Set());
    triangleFans.push([]);
    return id;
  };

  const link = (a: CellId, b: CellId) => {
    neighbourSets[a]!.add(b);
    neighbourSets[b]!.add(a);
  };

  for (let f = 0; f < ICO_FACES.length; f++) {
    const corners = ICO_FACES[f]!.corners.map((v) => ICO_VERTICES[v]!);
    const tri2d = netTriangle(f);

    // Lattice point ids and 2D positions for this face, indexed [i][j].
    const ids: CellId[][] = [];
    const placements: NetPlacement[] = [];
    for (let i = 0; i <= size; i++) {
      const row: CellId[] = [];
      for (let j = 0; j <= i; j++) {
        const w = weights(size, i, j);
        const p = normalise(
          add(add(scale(corners[0]!, w[0]), scale(corners[1]!, w[1])), scale(corners[2]!, w[2])),
        );
        const id = cellAt(p);
        row.push(id);
        placements.push({
          cell: id,
          face: f,
          i,
          j,
          x: w[0] * tri2d[0][0] + w[1] * tri2d[1][0] + w[2] * tri2d[2][0],
          y: w[0] * tri2d[0][1] + w[1] * tri2d[1][1] + w[2] * tri2d[2][1],
        });
      }
      ids.push(row);
    }

    // Small triangles: they give both the neighbour links and the dual outlines.
    const record = (a: CellId, b: CellId, c: CellId) => {
      link(a, b);
      link(b, c);
      link(c, a);
      const centre = normalise(centroid([centres[a]!, centres[b]!, centres[c]!]));
      triangleFans[a]!.push(centre);
      triangleFans[b]!.push(centre);
      triangleFans[c]!.push(centre);
    };
    for (let i = 0; i < size; i++) {
      for (let j = 0; j <= i; j++) {
        record(ids[i]![j]!, ids[i + 1]![j]!, ids[i + 1]![j + 1]!);
      }
      for (let j = 0; j < i; j++) {
        record(ids[i]![j]!, ids[i]![j + 1]!, ids[i + 1]![j + 1]!);
      }
    }

    const e1: Pt2 = [
      (tri2d[1][0] - tri2d[0][0]) / size,
      (tri2d[1][1] - tri2d[0][1]) / size,
    ];
    const e2: Pt2 = [
      (tri2d[2][0] - tri2d[0][0]) / size,
      (tri2d[2][1] - tri2d[0][1]) / size,
    ];
    netFaces.push({ face: f, hexOffsets: hexOffsets(e1, e2), placements });
  }

  const cells: Cell[] = centres.map((centre, id) => ({
    id,
    centre,
    neighbours: [...neighbourSets[id]!].sort((a, b) => a - b),
    isPentagon: neighbourSets[id]!.size === 5,
    corners: orderAround(centre, dedupe(triangleFans[id]!)),
  }));

  return { size, cells, net: netFaces, netWidth: 5.5, netHeight: 3 * SQRT3_2 };
}

function dedupe(points: readonly Vec3[]): Vec3[] {
  const seen = new Map<string, Vec3>();
  for (const p of points) seen.set(positionKey(p), p);
  return [...seen.values()];
}

/** Sort outline points into a consistent winding around the cell centre. */
function orderAround(centre: Vec3, points: readonly Vec3[]): Vec3[] {
  const up: Vec3 = Math.abs(centre[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const uRaw: Vec3 = [
    up[1] * centre[2] - up[2] * centre[1],
    up[2] * centre[0] - up[0] * centre[2],
    up[0] * centre[1] - up[1] * centre[0],
  ];
  const u = normalise(uRaw);
  const v: Vec3 = [
    centre[1] * u[2] - centre[2] * u[1],
    centre[2] * u[0] - centre[0] * u[2],
    centre[0] * u[1] - centre[1] * u[0],
  ];
  const angle = (p: Vec3) => {
    const d: Vec3 = [p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]];
    return Math.atan2(d[0] * v[0] + d[1] * v[1] + d[2] * v[2], d[0] * u[0] + d[1] * u[1] + d[2] * u[2]);
  };
  return [...points].sort((a, b) => angle(a) - angle(b));
}

/**
 * The cell a direction falls in: the one whose centre it is nearest, since the
 * cells are the dual of the lattice and so are exactly the ground nearest each
 * centre. Every cell is measured rather than the lattice being solved, because a
 * point near a seam or a corner is where solving it goes wrong, and this is asked
 * on a click or a redraw rather than sixty times a second.
 */
export function nearestCell(grid: Grid, p: Vec3): CellId | null {
  let best: CellId | null = null;
  let bestDot = -Infinity;
  for (const cell of grid.cells) {
    const c = cell.centre;
    const dot = c[0] * p[0] + c[1] * p[1] + c[2] * p[2];
    if (dot > bestDot) {
      bestDot = dot;
      best = cell.id;
    }
  }
  return best;
}

/** Cell count for a grid of the given size: the standard 10n^2 + 2. */
export function cellCount(size: number): number {
  return 10 * size * size + 2;
}
