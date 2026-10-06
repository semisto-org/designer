// Paints a terrain as a field-notebook sketch on a canvas: the real outline
// washed in watercolour and drawn twice in pencil, what is drawn on the map
// (water, hedges, buildings, existing trees, plants by strata at their adult
// spread scaled by `growth`), and a real scale bar. North is always up.
// Everything random is seeded by the map id, so a sketch never flickers.

import type { MapSketchData, SketchGeometry } from '@/types/myMaps'

type Point = [number, number]

/** Strata colours, from the design tokens (leaf, humus, lichen, prune). */
export const STRATA_COLORS: Record<string, string> = {
  canopy: '#4d5500',
  sub_canopy: '#7d8900',
  shrub: '#afbd00',
  herbaceous: '#ef9b0d',
  ground_cover: '#a9ae98',
  vine: '#726b9f',
  root: '#a05f00',
  aquatic: '#6f97b6',
}
export const STRATA_ORDER = Object.keys(STRATA_COLORS)

const PENCIL = '#4d4a45'
const WATER = '#6f97b6'
const HAND = '"Caveat Variable", "Bradley Hand", "Segoe Print", cursive'

export type SketchInput = {
  id: number
  boundary: SketchGeometry | null
  areaLabel: string
  sketch?: MapSketchData
}

export type SketchCopy = { noOutline: string; noOutlineHint: string; growthLabel: string | null }

function seeded(seed: number) {
  let s = (seed * 9301 + 49297) % 233280
  return () => (s = (s * 9301 + 49297) % 233280) / 233280
}

function outerRings(geom: SketchGeometry | null): number[][][] {
  if (!geom) return []
  if (geom.type === 'Polygon') return [geom.coordinates[0] as number[][]]
  if (geom.type === 'MultiPolygon') return (geom.coordinates as number[][][][]).map((p) => p[0])
  return []
}

/** Local metres (equirectangular around the terrain), then fitted into the box. */
function projector(rings: number[][][], w: number, h: number, pad: number) {
  const pts = rings.flat()
  const lat0 = pts.reduce((sum, p) => sum + p[1], 0) / pts.length
  const k = Math.cos((lat0 * Math.PI) / 180)
  const raw = (p: number[]): Point => [p[0] * 111_320 * k, -p[1] * 110_540]
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity]
  for (const p of pts) {
    const [x, y] = raw(p)
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
  }
  const scale = Math.min((w - 2 * pad) / Math.max(x1 - x0, 1), (h - 2 * pad) / Math.max(y1 - y0, 1))
  const ox = (w - scale * (x1 - x0)) / 2
  const oy = (h - scale * (y1 - y0)) / 2
  return { scale, project: (p: number[]): Point => { const [x, y] = raw(p); return [ox + (x - x0) * scale, oy + (y - y0) * scale] } }
}

function densify(pts: Point[], step: number): Point[] {
  const out: Point[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]]
    const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step))
    for (let j = 0; j < n; j++) out.push([a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n])
  }
  if (pts.length) out.push(pts[pts.length - 1])
  return out
}

function wobblyPath(ctx: CanvasRenderingContext2D, pts: Point[], rand: () => number, amp: number, close: boolean) {
  ctx.beginPath()
  pts.forEach(([x, y], i) => {
    const qx = x + (rand() - 0.5) * amp
    const qy = y + (rand() - 0.5) * amp
    if (i) ctx.lineTo(qx, qy)
    else ctx.moveTo(qx, qy)
  })
  if (close) ctx.closePath()
}

function blob(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, rand: () => number, alpha: number) {
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  for (let layer = 0; layer < 3; layer++) {
    ctx.beginPath()
    const n = 9
    const r = radius * (0.85 + rand() * 0.25)
    for (let j = 0; j <= n; j++) {
      const a = (j / n) * Math.PI * 2
      const q = r * (0.82 + rand() * 0.3)
      const px = x + Math.cos(a) * q + (rand() - 0.5) * radius * 0.15
      const py = y + Math.sin(a) * q
      if (j) ctx.lineTo(px, py)
      else ctx.moveTo(px, py)
    }
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

/** The terrain's meadow: a wash darker at its edge, uneven pigment, a few speckles. */
function meadow(ctx: CanvasRenderingContext2D, outline: Point[], rand: () => number) {
  ctx.globalAlpha = 0.1
  ctx.fillStyle = '#c2cf45'
  for (let i = 0; i < 3; i++) { wobblyPath(ctx, outline, rand, 3, true); ctx.fill() }
  ctx.save()
  wobblyPath(ctx, outline, rand, 2, true)
  ctx.clip()
  const xs = outline.map((p) => p[0])
  const ys = outline.map((p) => p[1])
  const bx = Math.min(...xs), by = Math.min(...ys)
  const bw = Math.max(...xs) - bx, bh = Math.max(...ys) - by
  const tints = ['#afbd00', '#c2cf45', '#8a917a', '#d3dc8f', '#e5c46b']
  ctx.globalAlpha = 1
  for (let i = 0; i < 14; i++) {
    const x = bx + rand() * bw, y = by + rand() * bh, r = (0.15 + rand() * 0.35) * Math.max(bw, bh)
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `${tints[i % tints.length]}40`)
    g.addColorStop(1, `${tints[i % tints.length]}00`)
    ctx.fillStyle = g
    ctx.fillRect(bx, by, bw, bh)
  }
  ctx.fillStyle = '#6d7a00'
  const specks = Math.min(4000, (bw * bh) / 90)
  for (let i = 0; i < specks; i++) { ctx.globalAlpha = 0.05 + rand() * 0.08; ctx.fillRect(bx + rand() * bw, by + rand() * bh, 1, 1) }
  ctx.restore()
  ctx.globalAlpha = 0.28
  ctx.strokeStyle = '#afbd00'
  ctx.lineWidth = 3.5
  wobblyPath(ctx, outline, rand, 1.5, true)
  ctx.stroke()
  ctx.globalAlpha = 1
}

function lines(geom: SketchGeometry): number[][][] {
  if (geom.type === 'LineString') return [geom.coordinates as number[][]]
  if (geom.type === 'MultiLineString') return geom.coordinates as number[][][]
  return []
}

function niceScale(pxPerMetre: number, maxPx: number) {
  let best = 1
  for (const m of [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]) if (m * pxPerMetre <= maxPx) best = m
  return best
}

/**
 * `growth`: 0.3 shows the plants young (today), 1 at their adult spread.
 * The canvas must already have its CSS size.
 */
export function drawSketch(canvas: HTMLCanvasElement, map: SketchInput, growth: number, copy: SketchCopy) {
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (!w || !h) return
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  const rand = seeded(map.id * 7 + 3)
  const rings = outerRings(map.boundary)

  if (rings.length === 0) {
    // No outline yet: a pencil ellipse and a note on what to do first.
    ctx.strokeStyle = '#6b665c'
    ctx.setLineDash([4, 5])
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.ellipse(w / 2, h / 2, Math.min(w, h) * 0.32, Math.min(w, h) * 0.24, -0.2, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.textAlign = 'center'
    ctx.fillStyle = '#5b5781'
    ctx.font = `600 20px ${HAND}`
    ctx.fillText(copy.noOutline, w / 2, h / 2 + 6)
    ctx.fillStyle = '#6b665c'
    ctx.font = `500 16px ${HAND}`
    ctx.fillText(copy.noOutlineHint, w / 2, h - 16)
    return
  }

  const { scale, project } = projector(rings, w, h, Math.max(22, Math.min(w, h) * 0.14))
  const outlines = rings.map((ring) => densify(ring.map(project), 6))
  outlines.forEach((o) => meadow(ctx, o, rand))

  const sketch = map.sketch
  if (sketch) {
    for (const geom of sketch.water) {
      if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
        outerRings(geom).forEach((ring) => {
          ctx.globalAlpha = 0.35
          ctx.fillStyle = '#7fa7c4'
          for (let i = 0; i < 3; i++) { wobblyPath(ctx, ring.map(project), rand, 1.5, true); ctx.fill() }
        })
      } else {
        lines(geom).forEach((line) => {
          ctx.globalAlpha = 0.45
          ctx.strokeStyle = WATER
          ctx.lineWidth = 1.4
          wobblyPath(ctx, line.map(project), rand, 0.6, false)
          ctx.stroke()
        })
      }
      ctx.globalAlpha = 1
    }
    for (const geom of sketch.buildings) {
      outerRings(geom).forEach((ring) => {
        ctx.globalAlpha = 0.5
        ctx.fillStyle = '#e2dacb'
        wobblyPath(ctx, ring.map(project), rand, 0.8, true)
        ctx.fill()
        ctx.globalAlpha = 0.7
        ctx.strokeStyle = PENCIL
        ctx.lineWidth = 0.8
        ctx.stroke()
      })
      ctx.globalAlpha = 1
    }
    for (const geom of sketch.hedges) {
      lines(geom).forEach((line) => {
        ctx.globalAlpha = 0.45
        ctx.strokeStyle = STRATA_COLORS.canopy
        ctx.lineWidth = Math.max(2, 3 * scale * growth + 1)
        wobblyPath(ctx, densify(line.map(project), 4), rand, 1.2, false)
        ctx.stroke()
      })
      ctx.globalAlpha = 1
    }
    for (const point of sketch.trees) {
      const [x, y] = project(point)
      blob(ctx, x, y, Math.max(3, 4 * scale), '#8a917a', rand, 0.25)
    }
    // Plants, largest strata first so the understorey reads on top.
    const plantRand = seeded(map.id * 13 + 1)
    for (const strata of STRATA_ORDER) {
      for (const [lng, lat, s, spread] of sketch.plants) {
        if (s !== strata) continue
        const [x, y] = project([lng, lat])
        blob(ctx, x, y, Math.max(2.2, (spread / 2) * scale * growth), STRATA_COLORS[s] ?? STRATA_COLORS.shrub, plantRand, s === 'canopy' ? 0.2 : 0.28)
      }
    }
  }

  // Pencil outline, twice, like a sketch.
  ctx.strokeStyle = PENCIL
  ctx.lineWidth = 0.9
  outlines.forEach((o) => {
    ctx.globalAlpha = 0.75; wobblyPath(ctx, o, rand, 1.1, true); ctx.stroke()
    ctx.globalAlpha = 0.35; wobblyPath(ctx, o, rand, 1.6, true); ctx.stroke()
  })
  ctx.globalAlpha = 1

  // The area, hand-written in the middle, while nothing is drawn yet.
  if (!sketch?.plants.length) {
    const extent = (o: Point[]) => Math.max(...o.map((p) => p[0])) - Math.min(...o.map((p) => p[0])) + Math.max(...o.map((p) => p[1])) - Math.min(...o.map((p) => p[1]))
    const ring = outlines.reduce((a, b) => (extent(b) > extent(a) ? b : a))
    const [cx, cy] = ring.reduce<Point>((acc, p) => [acc[0] + p[0] / ring.length, acc[1] + p[1] / ring.length], [0, 0])
    ctx.globalAlpha = 0.8
    ctx.fillStyle = '#4d5500'
    ctx.textAlign = 'center'
    ctx.font = `600 ${Math.round(Math.max(16, Math.min(26, w / 18)))}px ${HAND}`
    ctx.fillText(map.areaLabel, cx, cy + 6)
    ctx.globalAlpha = 1
  }

  // A real scale bar, hand-lettered.
  ctx.strokeStyle = '#6b665c'
  ctx.fillStyle = '#6b665c'
  ctx.lineWidth = 1
  const metres = niceScale(scale, w * 0.22)
  const len = metres * scale
  const sx = 14, sy = h - 14
  ctx.beginPath()
  ctx.moveTo(sx, sy); ctx.lineTo(sx + len, sy)
  ctx.moveTo(sx, sy - 3); ctx.lineTo(sx, sy + 3)
  ctx.moveTo(sx + len, sy - 3); ctx.lineTo(sx + len, sy + 3)
  ctx.stroke()
  ctx.textAlign = 'left'
  ctx.font = `600 15px ${HAND}`
  ctx.fillText(`${metres} m`, sx + len + 6, sy + 4)

  if (copy.growthLabel) {
    ctx.fillStyle = '#5b5781'
    ctx.font = `600 18px ${HAND}`
    ctx.fillText(copy.growthLabel, 14, 24)
  }
}
