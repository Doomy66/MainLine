/** Minimal 3-vector helpers. Vectors are plain tuples so they stay cheap to key and compare. */
export type Vec3 = readonly [number, number, number];

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function scale(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}

export function normalise(a: Vec3): Vec3 {
  const len = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / len, a[1] / len, a[2] / len];
}

export function centroid(points: readonly Vec3[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of points) {
    x += p[0];
    y += p[1];
    z += p[2];
  }
  const n = points.length;
  return [x / n, y / n, z / n];
}

/**
 * Quantised position key, used to recognise a lattice point that two faces both
 * produced. 1e-7 is far below the spacing between distinct points at any size we
 * support, and far above the drift between two routes to the same corner.
 */
export function positionKey(p: Vec3): string {
  const q = (v: number) => Math.round(v * 1e7) / 1e7;
  return `${q(p[0])},${q(p[1])},${q(p[2])}`;
}
