// Pure helpers (no MapLibre, no aliases): tested with node:test in
// test/frontend/drone/.
//
// « Recaler la vue »: the move that lines a drone view up with the map,
// from landmark pairs (a point seen on the view, then where it really is).
// The same similarity as the server's AerialViews::Alignment, computed here
// in MapLibre's mercator units (0..1, y down) for the live preview: one pair
// moves the view, two or three also turn and scale it.

export type LngLat = [number, number]
export type AlignPair = { from: LngLat; to: LngLat }

/** u' = a·u − b·v + tu, v' = b·u + a·v + tv, in mercator units. */
export type Similarity = { a: number; b: number; tu: number; tv: number }

export const IDENTITY: Similarity = { a: 1, b: 0, tu: 0, tv: 0 }
export const MAX_PAIRS = 3

export function mercator([lng, lat]: LngLat): [number, number] {
  const clamped = Math.max(-85.05, Math.min(85.05, lat))
  const rad = (clamped * Math.PI) / 180
  return [(lng + 180) / 360, (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2]
}

export function lngLat([u, v]: [number, number]): LngLat {
  const n = Math.PI - 2 * Math.PI * v
  return [u * 360 - 180, (Math.atan(Math.sinh(n)) * 180) / Math.PI]
}

/** The best similarity taking each `from` to its `to` (exact for one or two pairs). */
export function similarity(pairs: AlignPair[]): Similarity {
  if (pairs.length === 0) return IDENTITY
  const from = pairs.map((p) => mercator(p.from))
  const to = pairs.map((p) => mercator(p.to))
  const mean = (points: [number, number][]) => [
    points.reduce((s, p) => s + p[0], 0) / points.length,
    points.reduce((s, p) => s + p[1], 0) / points.length,
  ]
  const [fu, fv] = mean(from)
  const [tu, tv] = mean(to)
  let a = 1
  let b = 0
  const spread = from.reduce((s, [u, v]) => s + (u - fu) ** 2 + (v - fv) ** 2, 0)
  if (pairs.length > 1 && spread > 0) {
    a = 0
    b = 0
    from.forEach(([u, v], i) => {
      const [x, y] = to[i]
      a += (u - fu) * (x - tu) + (v - fv) * (y - tv)
      b += (u - fu) * (y - tv) - (v - fv) * (x - tu)
    })
    a /= spread
    b /= spread
  }
  return { a, b, tu: tu - (a * fu - b * fv), tv: tv - (b * fu + a * fv) }
}

export function applySimilarity(s: Similarity, [u, v]: [number, number]): [number, number] {
  return [s.a * u - s.b * v + s.tu, s.b * u + s.a * v + s.tv]
}

export function invertSimilarity(s: Similarity): Similarity {
  const d = s.a * s.a + s.b * s.b
  const a = s.a / d
  const b = -s.b / d
  return { a, b, tu: -(a * s.tu - b * s.tv), tv: -(b * s.tu + a * s.tv) }
}

/** Ground metres between two points (small distances). */
export function metersBetween(p: LngLat, q: LngLat): number {
  const lat = (((p[1] + q[1]) / 2) * Math.PI) / 180
  const dx = (q[0] - p[0]) * 111_320 * Math.cos(lat)
  const dy = (q[1] - p[1]) * 110_574
  return Math.hypot(dx, dy)
}

/** Turn in degrees (clockwise on the map is positive) and scale of a similarity. */
export function rotationDeg(s: Similarity): number {
  return (Math.atan2(s.b, s.a) * 180) / Math.PI
}

export function scaleOf(s: Similarity): number {
  return Math.hypot(s.a, s.b)
}

/**
 * The canvas transform that draws source tiles (pixels of the world at
 * zoom z, `size` pixels a tile) moved by `s`, into the tile (x, y) of that
 * zoom: [a, b, c, d, e, f] as CanvasRenderingContext2D.setTransform takes.
 */
export function tileTransform(s: Similarity, z: number, x: number, y: number, size = 256): [number, number, number, number, number, number] {
  const world = size * 2 ** z
  return [s.a, s.b, -s.b, s.a, s.tu * world - x * size, s.tv * world - y * size]
}

/** The source tiles (x0..x1, y0..y1 at zoom z) that land in tile (x, y) once moved. */
export function sourceTiles(s: Similarity, z: number, x: number, y: number): { x0: number; x1: number; y0: number; y1: number } {
  const n = 2 ** z
  const inverse = invertSimilarity(s)
  const corners = [
    [x, y],
    [x + 1, y],
    [x, y + 1],
    [x + 1, y + 1],
  ].map(([cx, cy]) => applySimilarity(inverse, [cx / n, cy / n]))
  const us = corners.map((c) => c[0] * n)
  const vs = corners.map((c) => c[1] * n)
  const clamp = (value: number) => Math.max(0, Math.min(n - 1, value))
  return {
    x0: clamp(Math.floor(Math.min(...us))),
    x1: clamp(Math.floor(Math.max(...us) - 1e-9)),
    y0: clamp(Math.floor(Math.min(...vs))),
    y1: clamp(Math.floor(Math.max(...vs) - 1e-9)),
  }
}
