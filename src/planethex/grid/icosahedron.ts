import type { Vec3 } from "./vec3";
import { normalise } from "./vec3";

/**
 * The icosahedron, built as two poles and two rings of five, because that
 * arrangement is what makes the net in netLayout fall out cleanly. The 20 faces
 * come in four groups of five: north cap, north band, south band, south cap.
 */

const RING_LAT = Math.atan(0.5);

function fromLatLon(latRad: number, lonDeg: number): Vec3 {
  const lon = (lonDeg * Math.PI) / 180;
  const c = Math.cos(latRad);
  return normalise([c * Math.cos(lon), Math.sin(latRad), c * Math.sin(lon)]);
}

export const NORTH_POLE = 0;
export const SOUTH_POLE = 1;
/** Upper ring vertex index for step k (0..4). */
export const upper = (k: number) => 2 + (((k % 5) + 5) % 5);
/** Lower ring vertex index for step k (0..4). */
export const lower = (k: number) => 7 + (((k % 5) + 5) % 5);

export const ICO_VERTICES: readonly Vec3[] = [
  fromLatLon(Math.PI / 2, 0),
  fromLatLon(-Math.PI / 2, 0),
  ...[0, 1, 2, 3, 4].map((k) => fromLatLon(RING_LAT, k * 72)),
  ...[0, 1, 2, 3, 4].map((k) => fromLatLon(-RING_LAT, k * 72 + 36)),
];

export type IcoFace = readonly [number, number, number];

export type FaceGroup = "north-cap" | "north-band" | "south-band" | "south-cap";

export interface FaceInfo {
  readonly corners: IcoFace;
  readonly group: FaceGroup;
  /** Which of the five columns of the net this face sits in. */
  readonly column: number;
}

function buildFaces(): FaceInfo[] {
  const faces: FaceInfo[] = [];
  for (let k = 0; k < 5; k++) {
    faces.push({ corners: [NORTH_POLE, upper(k), upper(k + 1)], group: "north-cap", column: k });
  }
  for (let k = 0; k < 5; k++) {
    faces.push({ corners: [upper(k), lower(k), upper(k + 1)], group: "north-band", column: k });
  }
  for (let k = 0; k < 5; k++) {
    faces.push({ corners: [lower(k), lower(k + 1), upper(k + 1)], group: "south-band", column: k });
  }
  for (let k = 0; k < 5; k++) {
    faces.push({ corners: [SOUTH_POLE, lower(k + 1), lower(k)], group: "south-cap", column: k });
  }
  return faces;
}

export const ICO_FACES: readonly FaceInfo[] = buildFaces();

/**
 * Which face a direction falls on, and where in that face's lattice. Spec 3.5.1.
 *
 * A window of lattice points around a cell runs off the edge of its face about a
 * third of the time at size 24, and the points beyond the edge are real points on
 * the neighbouring face rather than nothing. Rather than special-case each of the
 * thirty seams, a point is turned into a direction and the direction is looked up
 * here, which also settles the twelve corners where five faces meet and the
 * lattice genuinely cannot continue straight.
 */

/** Inverse of each face's corner matrix, so a direction can be solved for weights. */
const FACE_SOLVERS = ICO_FACES.map((face) => {
  const [a, b, c] = face.corners.map((v) => ICO_VERTICES[v]!) as [Vec3, Vec3, Vec3];
  // Columns are the three corners. Inverse by cofactors.
  const m = [
    [a[0], b[0], c[0]],
    [a[1], b[1], c[1]],
    [a[2], b[2], c[2]],
  ] as const;
  const co = (r0: number, r1: number, c0: number, c1: number) =>
    m[r0]![c0]! * m[r1]![c1]! - m[r0]![c1]! * m[r1]![c0]!;
  const det = m[0]![0]! * co(1, 2, 1, 2) - m[0]![1]! * co(1, 2, 0, 2) + m[0]![2]! * co(1, 2, 0, 1);
  return [
    [co(1, 2, 1, 2) / det, -co(0, 2, 1, 2) / det, co(0, 1, 1, 2) / det],
    [-co(1, 2, 0, 2) / det, co(0, 2, 0, 2) / det, -co(0, 1, 0, 2) / det],
    [co(1, 2, 0, 1) / det, -co(0, 2, 0, 1) / det, co(0, 1, 0, 1) / det],
  ] as const;
});

export interface FacePoint {
  readonly face: number;
  /** Lattice row and column, not rounded. */
  readonly i: number;
  readonly j: number;
}

/**
 * The face containing a direction, and its lattice position on that face. The
 * direction need not be normalised. Ties on a shared edge go to the first face
 * that claims the point, which is what makes the two sides agree.
 */
export function locate(p: Vec3, size: number): FacePoint {
  let best = 0;
  let bestScore = -Infinity;
  let bestWeights: [number, number, number] = [1, 0, 0];
  for (let f = 0; f < FACE_SOLVERS.length; f++) {
    const s = FACE_SOLVERS[f]!;
    const a = s[0]![0]! * p[0] + s[0]![1]! * p[1] + s[0]![2]! * p[2];
    const b = s[1]![0]! * p[0] + s[1]![1]! * p[1] + s[1]![2]! * p[2];
    const c = s[2]![0]! * p[0] + s[2]![1]! * p[1] + s[2]![2]! * p[2];
    const sum = a + b + c;
    if (sum <= 0) continue; // the opposite side of the sphere
    const w: [number, number, number] = [a / sum, b / sum, c / sum];
    // Inside the face means no negative weight. The least weight is how far in.
    const score = Math.min(w[0], w[1], w[2]);
    if (score > bestScore) {
      bestScore = score;
      best = f;
      bestWeights = w;
    }
  }
  const [, w1, w2] = bestWeights;
  return { face: best, i: (w1 + w2) * size, j: w2 * size };
}

/**
 * Barycentric weights of a direction over one face's three corners. Positive on
 * all three means the direction falls inside that face; a zero means it sits on
 * an edge, which is how a point shared by two faces is recognised as shared.
 *
 * `locate` above answers "which one face", which is what sampling wants. This
 * answers "what does this face make of it", which is what canonicalising a
 * coordinate wants, since a cell on a seam has to be found from either side.
 */
export function faceWeights(face: number, p: Vec3): [number, number, number] | null {
  const s = FACE_SOLVERS[face]!;
  const a = s[0]![0]! * p[0] + s[0]![1]! * p[1] + s[0]![2]! * p[2];
  const b = s[1]![0]! * p[0] + s[1]![1]! * p[1] + s[1]![2]! * p[2];
  const c = s[2]![0]! * p[0] + s[2]![1]! * p[1] + s[2]![2]! * p[2];
  const sum = a + b + c;
  // The far side of the sphere solves to a negative sum, and dividing through by
  // it would turn three negative weights into three positive ones.
  if (sum <= 0) return null;
  return [a / sum, b / sum, c / sum];
}
