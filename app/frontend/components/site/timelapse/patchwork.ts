// The patchwork seen when the camera pulls back: forest gardens, fields and
// woods that fit together like puzzle pieces around the example terrain, with
// no straight streets between them. Pure geometry, no DOM (see model.ts).
//
// The pieces are the cells of a Voronoi diagram. The terrain's own piece is
// exactly PARCEL: one seed sits inside it and one seed is its mirror image
// across each side, so the bisectors fall on the parcel's sides. Every other
// border is a shared, hand-drawn line, wavy and often carrying a puzzle tab,
// computed once per border so both neighbours trace the very same line.

import { PARCEL, insidePolygon, rng, type Point } from './model.ts'

export type PieceType = 'garden' | 'field' | 'wood'

export type Piece = {
  poly: Point[]
  type: PieceType
  /** Crowns: x, y, radius, watercolour seed, bears fruit. */
  blobs: [number, number, number, number, boolean][]
  /** Direction of the furrows, for a field. */
  angle: number
  cx: number
  cy: number
  /** Touches the terrain. */
  ring: boolean
}

/** Area enclosed by the seeds: pieces touching its frame are dropped. */
const FRAME = { x0: -5400, y0: -5400, x1: 6400, y1: 6100 }
/** Seeds closer than this to the terrain would cut into it. */
const CLEAR = 1150

export const PARCEL_CENTRE: Point = (() => {
  let x = 0
  let y = 0
  for (const [px, py] of PARCEL) { x += px; y += py }
  return [x / PARCEL.length, y / PARCEL.length]
})()

/** The centre's mirror image across the line through a and b. */
function mirror([px, py]: Point, [ax, ay]: Point, [bx, by]: Point): Point {
  const dx = bx - ax
  const dy = by - ay
  const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
  const fx = ax + t * dx
  const fy = ay + t * dy
  return [2 * fx - px, 2 * fy - py]
}

function seeds(): Point[] {
  const r = rng(2026)
  const out: Point[] = [PARCEL_CENTRE]
  PARCEL.forEach((a, i) => out.push(mirror(PARCEL_CENTRE, a, PARCEL[(i + 1) % PARCEL.length])))
  // A staggered lattice, shaken hard enough that no row or column shows.
  const step = 1020
  for (let j = 0, y = FRAME.y0 - 300; y <= FRAME.y1 + 300; j++, y += step * 0.86) {
    for (let x = FRAME.x0 - 300 + (j % 2) * step * 0.5; x <= FRAME.x1 + 300; x += step) {
      const p: Point = [x + (r() - 0.5) * step * 0.7, y + (r() - 0.5) * step * 0.6]
      if (Math.hypot(p[0] - PARCEL_CENTRE[0], p[1] - PARCEL_CENTRE[1]) < CLEAR) continue
      out.push(p)
    }
  }
  return out
}

/** Keeps the side of the bisector of a and b that holds a (Sutherland–Hodgman). */
function clip(poly: Point[], [ax, ay]: Point, [bx, by]: Point): Point[] {
  const nx = bx - ax
  const ny = by - ay
  const c = (nx * (ax + bx) + ny * (ay + by)) / 2
  const side = ([x, y]: Point) => nx * x + ny * y - c
  const out: Point[] = []
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    const sp = side(p)
    const sq = side(q)
    if (sp <= 0) out.push(p)
    if ((sp < 0 && sq > 0) || (sp > 0 && sq < 0)) {
      const t = sp / (sp - sq)
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t])
    }
  }
  return out
}

function cell(i: number, all: Point[]): Point[] {
  const m = 400
  let poly: Point[] = [[FRAME.x0 - m, FRAME.y0 - m], [FRAME.x1 + m, FRAME.y0 - m], [FRAME.x1 + m, FRAME.y1 + m], [FRAME.x0 - m, FRAME.y1 + m]]
  const s = all[i]
  for (let j = 0; j < all.length && poly.length; j++) {
    if (j !== i && Math.hypot(all[j][0] - s[0], all[j][1] - s[1]) < 4200) poly = clip(poly, s, all[j])
  }
  // Integer corners, so the pieces on both sides of a border name it alike.
  const out: Point[] = []
  for (const [x, y] of poly) {
    const p: Point = [Math.round(x), Math.round(y)]
    const last = out[out.length - 1]
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 2) out.push(p)
  }
  if (out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= 2) out.pop()
  return out
}

const key = ([x, y]: Point) => `${x},${y}`

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/**
 * A border from a to b as a hand-drawn line: a gentle wave and, on long
 * borders, a puzzle tab bulging into one of the two pieces.
 */
export function border(a: Point, b: Point): Point[] {
  const r = rng(hash(key(a) + '|' + key(b)))
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const L = Math.hypot(dx, dy)
  const at = (u: number, v: number): Point => [a[0] + dx * u - (dy / L) * v * L, a[1] + dy * u + (dx / L) * v * L]
  const amp = 0.03 + r() * 0.03
  const freq = 1 + Math.floor(r() * 2)
  const ph = r() * Math.PI * 2
  const wave = (u: number) => amp * Math.sin(Math.PI * u) * Math.sin(Math.PI * 2 * freq * u + ph)
  const tab = L > 300 && r() < 0.7
  const side = r() < 0.5 ? -1 : 1
  const mid = 0.42 + r() * 0.16
  const cr = Math.min(0.09, 48 / L)
  const out: Point[] = []
  const n = Math.max(6, Math.round(L / 40))
  const neck = cr * 0.6
  for (let k = 0; k <= n; k++) {
    const u = k / n
    if (tab && u > mid - neck * 1.6 && u < mid + neck * 1.6) continue
    out.push(at(u, wave(u)))
    if (tab && k < n && u <= mid - neck * 1.6 && (k + 1) / n > mid - neck * 1.6) {
      // The knob: a neck, then most of a circle, then back to the border.
      const base = wave(mid)
      const cy = base + side * cr * 1.55
      const a0 = Math.atan2(-side * cr, -neck)
      const turn = Math.PI * 2 - 2 * Math.atan2(neck, cr)
      out.push(at(mid - neck * 1.6, wave(mid - neck * 1.6)))
      out.push(at(mid - neck, base + side * cr * 0.35))
      for (let s = 0; s <= 16; s++) {
        const th = a0 - side * turn * (s / 16)
        out.push(at(mid + Math.cos(th) * cr, cy + Math.sin(th) * cr))
      }
      out.push(at(mid + neck, base + side * cr * 0.35))
      out.push(at(mid + neck * 1.6, wave(mid + neck * 1.6)))
    }
  }
  out[0] = a
  out[out.length - 1] = b
  return out
}

function onParcel(a: Point, b: Point) {
  const i = PARCEL.findIndex((p) => p[0] === a[0] && p[1] === a[1])
  const j = PARCEL.findIndex((p) => p[0] === b[0] && p[1] === b[1])
  return i >= 0 && j >= 0 && (Math.abs(i - j) === 1 || Math.abs(i - j) === PARCEL.length - 1)
}

function area(poly: Point[]) {
  let s = 0
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1])
  return Math.abs(s) / 2
}

/** The terrain's own Voronoi cell, before anything is drawn (for tests). */
export function terrainCell(): Point[] {
  return cell(0, seeds())
}

export const PIECES: Piece[] = (() => {
  const all = seeds()
  const borders = new Map<string, Point[]>()
  const trace = (a: Point, b: Point): Point[] => {
    if (onParcel(a, b)) return [a, b]
    const forward = key(a) < key(b)
    const k = forward ? key(a) + '|' + key(b) : key(b) + '|' + key(a)
    let line = borders.get(k)
    if (!line) borders.set(k, (line = forward ? border(a, b) : border(b, a)))
    return forward ? line : [...line].reverse()
  }
  const r = rng(77)
  const out: Piece[] = []
  for (let i = 1; i < all.length; i++) {
    const corners = cell(i, all)
    if (corners.length < 3) continue
    const edge = corners.some(([x, y]) => x <= FRAME.x0 || x >= FRAME.x1 || y <= FRAME.y0 || y >= FRAME.y1)
    const poly: Point[] = []
    corners.forEach((a, k) => poly.push(...trace(a, corners[(k + 1) % corners.length]).slice(0, -1)))
    const ring = i <= PARCEL.length
    const roll = r()
    const type: PieceType = roll < 0.5 ? 'garden' : roll < 0.85 ? 'field' : 'wood'
    const [cx, cy] = all[i]
    const blobs: Piece['blobs'] = []
    if (type !== 'field') {
      const xs = corners.map((p) => p[0])
      const ys = corners.map((p) => p[1])
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
      const want = Math.round((area(corners) / 640000) * (type === 'wood' ? 26 : 10 + r() * 9))
      for (let tries = 0; blobs.length < want && tries < want * 12; tries++) {
        const x = x0 + r() * (x1 - x0)
        const y = y0 + r() * (y1 - y0)
        const rad = (type === 'wood' ? 70 : 30) + r() * 70
        // Keep crowns inside the piece, clear of its tabs and waves.
        if (![[0, 0], [rad * 0.7, 0], [-rad * 0.7, 0], [0, rad * 0.7], [0, -rad * 0.7]].every(([ox, oy]) => insidePolygon(x + ox, y + oy, poly))) continue
        blobs.push([x, y, rad, 5000 + i * 50 + blobs.length, r() < 0.4])
      }
    }
    if (!edge) out.push({ poly, type, blobs, angle: r() * Math.PI, cx, cy, ring })
  }
  return out
})()
