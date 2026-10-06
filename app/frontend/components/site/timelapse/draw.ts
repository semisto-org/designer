// Paints the time-lapse scene on a canvas: paper, contour lines, the parcel,
// watercolour crowns that grow and change with the seasons, shadows, weather
// and the neighbouring pieces of the patchwork when the camera pulls back
// (patchwork.ts). See model.ts.

import {
  BEDS, BIRD_SIZE, HEDGE, HOUSE, PARCEL, PATH, PLANTED, POND, PX_PER_M, RUNOFF, SPECIES, STREAM, TRAILS, TREES, UNDERSTOREY, WORLD_H, WORLD_W,
  birdsAt, bump, crownPx, fishAt, heightM, rng, seasonAt, smooth,
  type Point, type Season, type SceneState, type SpeciesKey, type Tree,
} from './model.ts'
import { LOOKS, spriteRect, type Paint, type SpriteKey } from './paint.ts'
import { PIECES } from './patchwork.ts'

type RGB = [number, number, number]

export type Palette = {
  paper: RGB; paper2: RGB; ink: RGB; prune: RGB; leaf: RGB; wash: RGB
  humus: RGB; clay: RGB; blossom: RGB; water: RGB; snow: RGB; shade: RGB
}

/** Canvas annotations, from site.home.story.canvas. */
export type Labels = { wind: string; water: string; slope: string; walnut: string; hedge: string; shade: string; yours: string }

export type PlantedTree = { sp: SpeciesKey; x: number; y: number; seed: number; age: number }

export type Particle = { type: 'snow' | 'petal' | 'leaf'; x: number; y: number; vx: number; vy: number; s: number; rot: number; vr: number; life: number; decay: number; age: number; tone: RGB }

export type Camera = { k: number; ox: number; oy: number }

function hexRgb(hex: string, fallback: RGB): RGB {
  const m = hex.trim().replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(m)) return fallback
  const n = parseInt(m, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Colours come from the design tokens of application.css. */
export function readPalette(root: Element): Palette {
  const s = getComputedStyle(root)
  const token = (name: string, fallback: RGB) => hexRgb(s.getPropertyValue(`--color-${name}`), fallback)
  return {
    paper: token('loam-50', [247, 243, 234]),
    paper2: token('loam-100', [239, 233, 220]),
    ink: token('prune-900', [43, 41, 64]),
    prune: token('prune-600', [91, 87, 129]),
    leaf: token('leaf-600', [109, 122, 0]),
    wash: token('leaf-400', [175, 189, 0]),
    humus: token('humus-400', [239, 155, 13]),
    clay: token('clay-500', [176, 26, 25]),
    // No token for these two: pond water and fruit-tree blossom.
    water: [127, 167, 194],
    blossom: [242, 201, 212],
    snow: [255, 255, 255],
    shade: [43, 40, 51],
  }
}

const rgba = (c: RGB, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const TAU = Math.PI * 2

const HERBS = UNDERSTOREY.filter((p) => SPECIES[p.sp].kind === 'herb')
const WOODY = [...HEDGE, ...UNDERSTOREY.filter((p) => SPECIES[p.sp].kind !== 'herb')]
const SUN = Math.atan2(-0.8, 0.55)

/** The terrain's outline as a pencil would leave it: broken, wobbly strokes that overshoot the corners, gone over twice. */
const OUTLINE: { pts: Point[]; a: number; w: number }[] = (() => {
  const r = rng(1789)
  const out: { pts: Point[]; a: number; w: number }[] = []
  for (let pass = 0; pass < 2; pass++) {
    PARCEL.forEach(([ax, ay], i) => {
      const [bx, by] = PARCEL[(i + 1) % PARCEL.length]
      const len = Math.hypot(bx - ax, by - ay)
      const ux = (bx - ax) / len
      const uy = (by - ay) / len
      const shift = pass ? (r() - 0.5) * 2.4 : 0
      const phase = r() * 9
      let d = -4 - r() * 6
      while (d < len + 6) {
        const dash = pass ? 18 + r() * 40 : 26 + r() * 60
        const end = Math.min(len + 4 + r() * 6, d + dash)
        const pts: Point[] = []
        for (let t = d; t <= end; t += 5) {
          const wob = shift + Math.sin(t / 23 + phase) * 1.1 + (r() - 0.5) * 0.7
          pts.push([ax + ux * t - uy * wob, ay + uy * t + ux * wob])
        }
        if (pts.length > 1) out.push({ pts, a: pass ? 0.3 + r() * 0.25 : 0.55 + r() * 0.3, w: pass ? 0.8 : 1.25 + r() * 0.4 })
        d = end + (pass ? 6 + r() * 16 : 2 + r() * 5)
      }
    })
  }
  return out
})()

/**
 * The west wind as a few long brush ribbons blowing in from the left, each
 * ending in a curl, like the wind drawn on old maps.
 */
const WIND: Point[][] = (() => {
  const r = rng(77)
  return [215, 340, 465, 585].map((y0, i) => {
    const pts: Point[] = []
    const x0 = -230 + r() * 50 + (i % 2) * 50
    const len = 330 + r() * 160
    const amp = 9 + r() * 9
    const ph = r() * 6
    for (let s = 0; s <= len; s += 4) pts.push([x0 + s, y0 + Math.sin(s / 75 + ph) * amp * Math.min(1, s / 100)])
    // the curl, turning up and in on itself
    const [ex, ey] = pts[pts.length - 1]
    const R = 22 + r() * 12
    const turns = 1.5 + r() * 0.35
    for (let a = 0.1; a <= turns * Math.PI; a += 0.1) {
      const rr = R * (1 - a / (turns * Math.PI * 1.3))
      pts.push([ex + Math.sin(a) * rr, ey - R + Math.cos(a) * rr])
    }
    return pts
  })
})()

/** Where smoke leaves the chimney painted on the roof (house.webp), in world space. */
const CHIMNEY: Point = (() => {
  const w = HOUSE.w * 1.05
  const h = (w * 235) / 360
  const lx = 0.286 * w
  const ly = -0.126 * h
  const a = -0.12
  return [HOUSE.x + HOUSE.w / 2 + lx * Math.cos(a) - ly * Math.sin(a), HOUSE.y + HOUSE.h / 2 + lx * Math.sin(a) + ly * Math.cos(a)]
})()

const CONTOURS: Point[][] = (() => {
  const r = rng(42)
  const out: Point[][] = []
  for (let k = -2; k < 12; k++) {
    const y0 = 40 + k * 78
    const amp = 14 + r() * 18
    const ph = r() * 6
    const pts: Point[] = []
    for (let x = -400; x <= 1400; x += 24) pts.push([x, y0 + Math.sin(x / 170 + ph) * amp + Math.sin(x / 61 + ph * 2) * 4])
    out.push(pts)
  }
  return out
})()

export function makePaper(C: Palette): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 1400
  c.height = 1000
  const x = c.getContext('2d')!
  const r = rng(7)
  x.fillStyle = rgba(C.paper, 1)
  x.fillRect(0, 0, c.width, c.height)
  for (let i = 0; i < 14000; i++) {
    x.fillStyle = r() < 0.5 ? rgba(C.ink, 0.022) : rgba(C.paper2, 0.5)
    x.fillRect(r() * c.width, r() * c.height, 1 + r() * 2, 1 + r() * 2)
  }
  for (let i = 0; i < 24; i++) {
    const cx = r() * c.width
    const cy = r() * c.height
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, 160 + r() * 220)
    g.addColorStop(0, rgba(C.paper2, 0.5))
    g.addColorStop(1, rgba(C.paper2, 0))
    x.fillStyle = g
    x.fillRect(0, 0, c.width, c.height)
  }
  return c
}

export class Painter {
  ctx: CanvasRenderingContext2D
  C: Palette
  labels: Labels
  reduce: boolean
  private paper: HTMLCanvasElement | null = null
  /** Painted sprites, once loaded; until then crowns are drawn as washes. */
  private paint: Paint | null = null
  private ground: HTMLCanvasElement | null = null
  /** The small atlas in black, for the shadows birds cast on the garden. */
  private silhouettes: HTMLCanvasElement | null = null
  /** The ground covers, painted once while time stands still (hundreds of sprites that only change with the date). */
  private herbs: { canvas: HTMLCanvasElement; tau: number; scale: number } | null = null
  private lastTau = NaN

  constructor(ctx: CanvasRenderingContext2D, C: Palette, labels: Labels, reduce: boolean) {
    this.ctx = ctx
    this.C = C
    this.labels = labels
    this.reduce = reduce
  }

  setPalette(C: Palette) {
    this.C = C
    this.paper = null
  }

  setPaint(paint: Paint) {
    this.paint = paint
    this.ground = null
    const c = document.createElement('canvas')
    c.width = paint.small.width
    c.height = paint.small.height
    const x = c.getContext('2d')!
    x.drawImage(paint.small, 0, 0)
    x.globalCompositeOperation = 'source-in'
    x.fillStyle = '#000'
    x.fillRect(0, 0, c.width, c.height)
    this.silhouettes = c
  }

  /** The meadow inside the terrain, painted once in world space with a soft, irregular edge. */
  private meadow(paint: Paint): HTMLCanvasElement {
    const s = 1.5
    const c = document.createElement('canvas')
    c.width = WORLD_W * s
    c.height = WORLD_H * s
    const x = c.getContext('2d')!
    x.scale(s, s)
    // one painted sheet stretched over the whole terrain: no repeat, no seam
    x.drawImage(paint.meadow, 0, (WORLD_H - WORLD_W) / 2, WORLD_W, WORLD_W)
    // keep the paint inside the parcel, its edge bleeding a little like a wash
    const r = rng(11)
    const edge: Point[] = []
    PARCEL.forEach(([px, py], i) => {
      const [qx, qy] = PARCEL[(i + 1) % PARCEL.length]
      for (let k = 0; k < 12; k++) edge.push([px + ((qx - px) * k) / 12 + (r() - 0.5) * 9, py + ((qy - py) * k) / 12 + (r() - 0.5) * 9])
    })
    x.globalCompositeOperation = 'destination-in'
    x.filter = 'blur(5px)'
    x.beginPath()
    edge.forEach(([ex, ey], i) => (i ? x.lineTo(ex, ey) : x.moveTo(ex, ey)))
    x.closePath()
    x.fillStyle = '#000'
    x.fill()
    return c
  }

  /** A path as a few loose strokes rather than a ruled line: the old mown path wide and sandy, the new ones narrow wood chip. */
  private paintedPath(line: Point[], snow: number, narrow = false) {
    const { ctx, C } = this
    const strokes: [RGB, number, number, number][] = narrow
      ? [[mix(C.humus, C.ink, 0.15), 0.18 * (1 - 0.6 * snow), 8, 0], [mix(C.humus, C.paper2, 0.6), 0.6, 5, 0.8], [C.paper, 0.3, 2, -0.6]]
      : [[C.humus, 0.2 * (1 - 0.7 * snow), 13, 0], [C.paper2, 0.55, 9, 1.4], [C.paper, 0.3, 4, -1.2]]
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const [col, a, w, off] of strokes) {
      ctx.strokeStyle = rgba(col, a)
      ctx.lineWidth = w
      ctx.beginPath()
      line.forEach(([x, y], i) => {
        if (i === 0) return ctx.moveTo(x + off, y)
        const [px, py] = line[i - 1]
        ctx.quadraticCurveTo(px + off, py, (px + x) / 2 + off, (py + y) / 2)
        if (i === line.length - 1) ctx.lineTo(x + off, y)
      })
      ctx.stroke()
    }
    ctx.restore()
  }

  /** Stamps a painted sprite of radius `r`, turned by `rot`, squeezed across by `squeeze` (a bird's wingbeat). */
  private sprite(key: SpriteKey, x: number, y: number, r: number, rot: number, alpha: number, squeeze = 1, shade = false) {
    if (!this.paint || alpha <= 0.01 || r <= 0) return
    const { ctx } = this
    const cell = spriteRect(key)
    const img = shade ? this.silhouettes : cell.small ? this.paint.small : this.paint.atlas
    if (!img) return
    const half = r * 1.06
    ctx.save()
    ctx.globalAlpha = Math.min(1, alpha)
    ctx.translate(x, y)
    ctx.rotate(rot)
    if (squeeze !== 1) ctx.scale(1, squeeze)
    ctx.drawImage(img, cell.x, cell.y, cell.side, cell.side, -half, -half, half * 2, half * 2)
    ctx.restore()
  }

  /** Where the terrain sits on screen: to the right of the notes on wide screens, at the top on phones. */
  camera(vw: number, vh: number, zoom: number): Camera {
    const wide = vw > 760
    const sceneW = wide ? vw - 520 : vw - 8
    const sceneH = wide ? vh - 120 : vh * 0.52
    const k = Math.max(0.3, Math.min(sceneW / WORLD_W, sceneH / WORLD_H)) * zoom
    const cx = wide ? 470 + sceneW / 2 : vw / 2
    const cy = wide ? vh / 2 + 20 : 106 + sceneH / 2
    return { k, ox: cx - (WORLD_W / 2) * k, oy: cy - (WORLD_H / 2) * k }
  }

  // ---------- primitives

  private blobPath(x: number, y: number, r: number, rnd: () => number, n = 20, jitter = 0.28) {
    const { ctx } = this
    const pts: Point[] = []
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU
      const rr = r * (1 - jitter / 2 + rnd() * jitter)
      pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr])
    }
    ctx.beginPath()
    for (let i = 0; i <= n; i++) {
      const p = pts[i % n]
      const q = pts[(i + 1) % n]
      const mx = (p[0] + q[0]) / 2
      const my = (p[1] + q[1]) / 2
      if (i === 0) ctx.moveTo(mx, my)
      else ctx.quadraticCurveTo(p[0], p[1], mx, my)
    }
    ctx.closePath()
  }

  /** A watercolour wash: a few translucent, slightly offset layers and a darker edge. */
  private wash(x: number, y: number, r: number, col: RGB, seed: number, layers = 5, a = 0.17, edge = 0.35) {
    const { ctx } = this
    const rnd = rng(seed)
    for (let l = 0; l < layers; l++) {
      this.blobPath(x + (rnd() - 0.5) * r * 0.12, y + (rnd() - 0.5) * r * 0.12, r * (0.82 + l * 0.05), rnd)
      ctx.fillStyle = rgba(col, a)
      ctx.fill()
    }
    if (edge) {
      this.blobPath(x, y, r * 1.02, rnd, 24, 0.18)
      ctx.strokeStyle = rgba(col, edge)
      ctx.lineWidth = 1.1
      ctx.stroke()
    }
  }

  private line(pts: Point[], col: string, w: number, dash?: number[], offset = 0) {
    const { ctx } = this
    ctx.save()
    ctx.strokeStyle = col
    ctx.lineWidth = w
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (dash) {
      ctx.setLineDash(dash)
      ctx.lineDashOffset = offset
    }
    ctx.beginPath()
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.stroke()
    ctx.restore()
  }

  private poly(pts: Point[]) {
    const { ctx } = this
    ctx.beginPath()
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.closePath()
  }

  /** Handwritten note on the plan, with a paper halo so it stays readable over the washes. */
  private hand(text: string, x: number, y: number, size: number, col: RGB, a = 1, align: CanvasTextAlign = 'left') {
    if (a <= 0.01) return
    const { ctx } = this
    ctx.save()
    ctx.globalAlpha = a
    ctx.font = `600 ${size}px "Caveat Variable", "Bradley Hand", cursive`
    ctx.textAlign = align
    ctx.lineJoin = 'round'
    ctx.strokeStyle = rgba(this.C.paper, 0.85)
    ctx.lineWidth = 5
    ctx.strokeText(text, x, y)
    ctx.fillStyle = rgba(col, 1)
    ctx.fillText(text, x, y)
    ctx.restore()
  }

  /** A comment bubble, pencilled on the plan, its tail pointing at what it says. */
  private bubble(text: string, x: number, y: number, tx: number, ty: number, size: number, col: RGB, a = 1) {
    if (a <= 0.01) return
    const { ctx, C } = this
    ctx.save()
    ctx.globalAlpha = a
    ctx.font = `600 ${size}px "Caveat Variable", "Bradley Hand", cursive`
    const w = ctx.measureText(text).width + 28
    const h = size + 16
    const dx = tx - x
    const dy = ty - y
    const d = Math.hypot(dx, dy) || 1
    const ux = dx / d
    const uy = dy / d
    const edge = Math.min(w / 2 / Math.max(Math.abs(ux), 1e-3), h / 2 / Math.max(Math.abs(uy), 1e-3)) - 4
    const bx = x + ux * edge
    const by = y + uy * edge
    const tail: Point[] = [[bx - uy * 9, by + ux * 9], [tx - ux * 5, ty - uy * 5], [bx + uy * 9, by - ux * 9]]
    const graphite = rgba(mix(C.ink, C.paper, 0.2), 0.75)
    ctx.fillStyle = rgba(C.paper, 0.94)
    ctx.beginPath()
    ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2)
    ctx.fill()
    this.poly(tail)
    ctx.fill()
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    // pencil goes round twice, never quite on the same line
    for (const [ox, oy, lw, la] of [[0, 0, 1.3, 1], [0.9, -0.7, 0.7, 0.5]]) {
      ctx.strokeStyle = graphite
      ctx.globalAlpha = a * la
      ctx.lineWidth = lw
      ctx.beginPath()
      ctx.roundRect(x - w / 2 + ox, y - h / 2 + oy, w, h, h / 2)
      ctx.stroke()
    }
    ctx.globalAlpha = a
    ctx.fillStyle = rgba(C.paper, 1)
    this.poly([[bx - uy * 7.5 - ux * 3, by + ux * 7.5 - uy * 3], tail[1], [bx + uy * 7.5 - ux * 3, by - ux * 7.5 - uy * 3]])
    ctx.fill()
    ctx.strokeStyle = graphite
    ctx.lineWidth = 1.3
    ctx.beginPath()
    ctx.moveTo(...tail[0])
    ctx.lineTo(...tail[1])
    ctx.lineTo(...tail[2])
    ctx.stroke()
    ctx.fillStyle = rgba(col, 1)
    ctx.beginPath()
    ctx.arc(tx, ty, 3, 0, TAU)
    ctx.fill()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x, y + 1)
    ctx.restore()
  }

  /** The west wind: brush ribbons that blow across from the left and curl up, carrying a leaf or two. */
  private drawWind(wind: number, alpha: number) {
    const { ctx, C } = this
    const col = mix(C.ink, C.water, 0.6)
    ctx.save()
    WIND.forEach((pts, i) => {
      const n = pts.length
      const trail = Math.round(n * 0.8)
      // the head travels along the ribbon, the tail thinning to nothing behind it
      const head = this.reduce ? n - 1 : Math.floor((wind * 30 + i * 47) % (n + trail * 0.5))
      const from = Math.max(0, head - trail)
      const to = Math.min(n - 1, head)
      if (to - from < 3) return
      const left: Point[] = []
      const right: Point[] = []
      for (let k = from; k <= to; k++) {
        const [x0, y0] = pts[Math.max(0, k - 1)]
        const [x1, y1] = pts[Math.min(n - 1, k + 1)]
        const len = Math.hypot(x1 - x0, y1 - y0) || 1
        const nx = -(y1 - y0) / len
        const ny = (x1 - x0) / len
        const u = (k - (head - trail)) / trail
        // a brush: swelling towards the head, pinched at both ends and thinner in the curl
        const w = 3 * Math.pow(Math.min(1, u), 1.3) * (1 - smooth(0.7, 1, (k - to + 6) / 6)) * (1 - 0.55 * smooth(0.6, 1, k / n)) + 0.25
        left.push([pts[k][0] + nx * w, pts[k][1] + ny * w])
        right.push([pts[k][0] - nx * w, pts[k][1] - ny * w])
      }
      ctx.fillStyle = rgba(col, 0.5 * alpha)
      this.poly([...left, ...right.reverse()])
      ctx.fill()
      // a hairline running beside it, as a dry brush leaves
      ctx.strokeStyle = rgba(col, 0.22 * alpha)
      ctx.lineWidth = 0.7
      ctx.beginPath()
      for (let k = from; k <= Math.min(to, Math.floor(n * 0.72)); k++) {
        const [x, y] = pts[k]
        if (k === from) ctx.moveTo(x, y + 7)
        else ctx.lineTo(x, y + 7)
      }
      ctx.stroke()
      // a leaf rides every other ribbon
      if (i % 2 === 0) {
        const [lx, ly] = pts[to]
        const [px, py] = pts[Math.max(0, to - 2)]
        ctx.save()
        ctx.translate(lx, ly)
        ctx.rotate(Math.atan2(ly - py, lx - px) + Math.sin(wind * 3 + i) * 0.4)
        ctx.fillStyle = rgba(mix(C.leaf, C.humus, 0.35), 0.85 * alpha)
        ctx.beginPath()
        ctx.moveTo(-7, 0)
        ctx.quadraticCurveTo(0, -5, 7, 0)
        ctx.quadraticCurveTo(0, 5, -7, 0)
        ctx.fill()
        ctx.strokeStyle = rgba(C.ink, 0.35 * alpha)
        ctx.lineWidth = 0.6
        ctx.beginPath()
        ctx.moveTo(-7, 0)
        ctx.lineTo(8, 0)
        ctx.stroke()
        ctx.restore()
      }
    })
    ctx.restore()
  }

  // ---------- the scene

  /** A ground cover: its mulch and litter from planting day, the leaves once it has spread, dying back in winter. */
  private drawHerb(t: Tree, age: number, S: Season) {
    if (age < 0) return
    const look = LOOKS[t.sp]
    const rnd = rng(t.seed + 5)
    const rot = rnd() * TAU
    const R = SPECIES[t.sp].R * PX_PER_M
    const grown = age - (t.delay ?? 0)
    const r = crownPx(t.sp, grown)
    const g = grown > 0 ? r / R : 0
    this.sprite(look.bare, t.x, t.y, R * 1.25, rot + 1, smooth(0, 0.3, age) * (1 - S.leaf * g) * 0.3)
    const leaf = look.variants && rnd() < 0.5 ? look.variants[Math.floor(rnd() * look.variants.length)] : look.leaf
    if (g > 0) this.sprite(leaf, t.x, t.y, r * (0.9 + 0.3 * S.leaf), rot, S.leaf)
  }

  /** Paints the ground covers straight away while time runs, and from a cached layer while the visitor lingers. */
  private groundCovers(tau: number, age: number, S: Season, density: number) {
    const moving = Math.abs(tau - this.lastTau) > 1e-5
    this.lastTau = tau
    if (moving) {
      this.herbs = null
      for (const h of HERBS) this.drawHerb(h, age, S)
      return
    }
    const scale = Math.min(2, Math.max(0.5, Math.round(density * 4) / 4))
    if (!this.herbs || this.herbs.tau !== tau || this.herbs.scale !== scale) {
      const canvas = document.createElement('canvas')
      canvas.width = WORLD_W * scale
      canvas.height = WORLD_H * scale
      const layer = canvas.getContext('2d')!
      layer.scale(scale, scale)
      const main = this.ctx
      this.ctx = layer
      for (const h of HERBS) this.drawHerb(h, age, S)
      this.ctx = main
      this.herbs = { canvas, tau, scale }
    }
    this.ctx.drawImage(this.herbs.canvas, 0, 0, WORLD_W, WORLD_H)
  }

  private drawTree(t: Tree, age: number, S: Season, wind: number) {
    if (age < 0) return
    const { ctx, C } = this
    const s = SPECIES[t.sp]
    const r = crownPx(t.sp, age)
    const sway = this.reduce ? 0 : Math.sin(wind * 1.3 + t.seed) * Math.min(2.5, r * 0.03)
    const x = t.x + sway
    const y = t.y

    // painted crowns: bare branches, leaves, autumn, blossom and fruit cross-fade with the seasons
    if (this.paint) {
      const look = LOOKS[t.sp]
      const rnd = rng(t.seed + 5)
      const rot = rnd() * TAU
      const leafKey = look.variants && rnd() < 0.5 ? look.variants[Math.floor(rnd() * look.variants.length)] : look.leaf
      if (look.evergreen) {
        this.sprite(leafKey, x, y, r, rot, 1)
        return
      }
      const autumn = S.autumn * (0.25 + 0.5 * rng(t.seed + 77)())
      const leafR = r * (0.7 + 0.3 * S.leaf)
      this.sprite(look.bare, x, y, r * 0.95, rot, (s.kind === 'shrub' || s.kind === 'hedge' ? 0.65 : 0.9) * (1 - S.leaf))
      this.sprite(leafKey, x, y, leafR, rot, S.leaf)
      if (autumn > 0.01) this.sprite(look.autumn, x, y, leafR, rot + 0.4, S.leaf * autumn * 1.4)
      if (look.fruit && S.fruit > 0.01 && age >= s.fruit) this.sprite(look.fruit, x, y, leafR, rot + 1.1, S.leaf * S.fruit * (1 - autumn))
      if (look.blossom && S.blossom > 0.01 && age >= (s.kind === 'hedge' ? 1.3 : 0.3)) this.sprite(look.blossom, x, y, r * 0.92, rot + 2.3, (s.kind === 'hedge' ? 0.7 : 0.95) * S.blossom)
      return
    }

    // bare branches, visible as the leaves go
    const bare = 1 - S.leaf
    if (bare > 0.05) {
      const rnd = rng(t.seed)
      ctx.save()
      ctx.strokeStyle = rgba(C.ink, 0.5 * bare)
      ctx.lineCap = 'round'
      const n = Math.max(4, Math.round(r / 8))
      for (let i = 0; i < n; i++) {
        const a = rnd() * TAU
        const l = r * (0.6 + rnd() * 0.4)
        ctx.lineWidth = Math.max(0.6, r / 38)
        const mx = x + Math.cos(a) * l * 0.5
        const my = y + Math.sin(a) * l * 0.5
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(mx, my)
        ctx.lineTo(x + Math.cos(a + 0.2) * l, y + Math.sin(a + 0.2) * l)
        ctx.moveTo(mx, my)
        ctx.lineTo(x + Math.cos(a - 0.35) * l * 0.85, y + Math.sin(a - 0.35) * l * 0.85)
        ctx.stroke()
      }
      ctx.restore()
    }
    // foliage, each tree turning at its own pace in autumn
    if (S.leaf > 0.02) {
      const turn = 0.25 + 0.5 * rng(t.seed + 77)()
      const autumnTone = t.sp === 'cerisier' || t.sp === 'cassis' || t.sp === 'noisetier' ? C.clay : C.humus
      const col = mix(s.kind === 'canopy' ? C.leaf : C.wash, autumnTone, S.autumn * turn)
      this.wash(x, y, r * (0.55 + 0.45 * S.leaf), col, t.seed, 5, (s.kind === 'canopy' ? 0.17 : 0.2) * S.leaf, 0.35 * S.leaf)
    }
    const dots = (seed: number, count: number, spread: number, col: RGB, alpha: number, size: number) => {
      const rnd = rng(seed)
      ctx.fillStyle = rgba(col, alpha)
      for (let i = 0; i < count; i++) {
        const a = rnd() * TAU
        const d = rnd() * r * spread
        ctx.beginPath()
        ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, size, 0, TAU)
        ctx.fill()
      }
    }
    if (S.blossom > 0.02 && (s.kind === 'fruit' || t.sp === 'cassis') && age >= 0.3) dots(t.seed + 3, Math.min(22, Math.round(r / 3) + 4), 0.8, C.blossom, 0.9 * S.blossom, 2.6)
    if (S.fruit > 0.02 && s.tone && age >= s.fruit) dots(t.seed + 9, Math.min(16, Math.round(r / 5) + 3), 0.75, C[s.tone], 0.9 * S.fruit, 2.5)
    ctx.fillStyle = rgba(C.ink, 0.55)
    ctx.beginPath()
    ctx.arc(x, y, 1.8, 0, TAU)
    ctx.fill()
  }

  private drawNeighbours(S: Season, alpha: number) {
    if (alpha <= 0.01) return
    const { ctx, C } = this
    ctx.save()
    ctx.globalAlpha = alpha
    for (const n of PIECES) {
      this.poly(n.poly)
      if (n.type === 'field') {
        ctx.fillStyle = S.leaf > 0.3 ? rgba(C.wash, 0.1) : rgba(C.paper2, 0.6)
        ctx.fill()
        ctx.save()
        this.poly(n.poly)
        ctx.clip()
        ctx.translate(n.cx, n.cy)
        ctx.rotate(n.angle)
        ctx.strokeStyle = rgba(C.ink, 0.07)
        ctx.lineWidth = 3
        for (let k = -700; k < 700; k += 26) {
          ctx.beginPath()
          ctx.moveTo(-800, k)
          ctx.lineTo(800, k)
          ctx.stroke()
        }
        ctx.restore()
      } else {
        ctx.fillStyle = rgba(C.wash, 0.07)
        ctx.fill()
      }
      this.poly(n.poly)
      ctx.strokeStyle = rgba(C.leaf, 0.26)
      ctx.lineWidth = 5
      ctx.lineJoin = "round"
      ctx.stroke()
      for (const [x, y, r, seed, fruit] of n.blobs) {
        if (S.leaf > 0.05) this.wash(x, y, r * (0.6 + 0.4 * S.leaf), mix(n.type === 'wood' ? C.leaf : C.wash, C.humus, S.autumn * 0.6), seed, 2, 0.22 * S.leaf, 0)
        else {
          ctx.beginPath()
          ctx.arc(x, y, r * 0.5, 0, TAU)
          ctx.strokeStyle = rgba(C.ink, 0.18)
          ctx.lineWidth = 2
          ctx.stroke()
        }
        if (fruit && S.fruit > 0.1 && n.type === 'garden') {
          ctx.fillStyle = rgba(C.clay, 0.7 * S.fruit)
          ctx.beginPath()
          ctx.arc(x + r * 0.2, y, 7, 0, TAU)
          ctx.fill()
        }
      }
    }
    ctx.restore()
  }

  draw(st: SceneState, cam: Camera, vw: number, vh: number, dpr: number, wind: number, planted: PlantedTree[], particles: Particle[]): Season {
    const { ctx, C, labels } = this
    const S = seasonAt(st.tau)
    const age = st.tau - PLANTED
    const { k } = cam

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (!this.paper) this.paper = makePaper(C)
    ctx.fillStyle = ctx.createPattern(this.paper, 'repeat')!
    ctx.fillRect(0, 0, vw, vh)
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * cam.ox, dpr * cam.oy)

    for (const l of CONTOURS) this.line(l, rgba(C.ink, 0.1), 1.1 / Math.max(k, 0.5))
    this.drawNeighbours(S, smooth(0.95, 0.6, st.zoom))

    // ground: a painted meadow (or a light wash until it loads), greener in season
    if (this.paint) {
      if (!this.ground) this.ground = this.meadow(this.paint)
      ctx.save()
      ctx.globalAlpha = 0.4 + 0.45 * S.leaf
      ctx.drawImage(this.ground, 0, 0, WORLD_W, WORLD_H)
      ctx.restore()
    } else {
      this.poly(PARCEL)
      ctx.fillStyle = rgba(C.wash, 0.04 + 0.1 * S.leaf)
      ctx.fill()
    }
    // straw mulch around the young trees
    if (age >= 0 && age < 6) {
      for (const t of TREES) {
        ctx.beginPath()
        ctx.arc(t.x, t.y, Math.max(12, crownPx(t.sp, age) * 1.2), 0, TAU)
        ctx.fillStyle = rgba(C.humus, 0.1 * (1 - age / 6))
        ctx.fill()
      }
    }

    // water: the stream, then the pond once it is dug, and later a fish now and then
    this.line(STREAM, rgba(C.water, 0.85), 2.4, [2, 8], this.reduce ? 0 : -wind * 12)
    const pond = smooth(0.4, 0.9, st.tau)
    if (pond > 0.01) {
      ctx.save()
      ctx.globalAlpha = pond
      if (this.paint) this.sprite('pond', POND.x, POND.y, POND.r * 1.25, -0.3, pond)
      else this.wash(POND.x, POND.y, POND.r, C.water, 33, 4, 0.24)
      ctx.restore()
      if (this.paint && !this.reduce && S.snow < 0.5) {
        ctx.save()
        ctx.beginPath()
        ctx.ellipse(POND.x, POND.y, POND.r * 0.8, POND.r * 0.68, -0.3, 0, TAU)
        ctx.clip()
        for (const f of fishAt(wind, age)) this.sprite(f.kind, f.x, f.y, f.kind === 'gardon' ? 14 : 12, f.heading + Math.PI, f.alpha * 0.5 * pond * (1 - S.snow))
        ctx.restore()
      }
    } else {
      ctx.beginPath()
      ctx.ellipse(POND.x, POND.y, POND.r * 0.9, POND.r * 0.6, 0, 0, TAU)
      ctx.strokeStyle = rgba(C.water, 0.35)
      ctx.setLineDash([3, 6])
      ctx.stroke()
      ctx.setLineDash([])
    }

    // the old path, then the wood-chip walk laid at planting
    const trails = smooth(PLANTED - 0.12, PLANTED, st.tau)
    if (this.paint) {
      this.paintedPath(PATH, S.snow)
      if (trails > 0.01) {
        ctx.save()
        ctx.globalAlpha = trails
        for (const t of TRAILS) this.paintedPath(t, S.snow, true)
        ctx.restore()
      }
    } else {
      this.line(PATH, rgba(C.ink, 0.25), 7)
      this.line(PATH, rgba(C.paper, 0.95), 4)
      for (const t of TRAILS) this.line(t, rgba(C.humus, 0.4 * trails), 4)
    }
    ctx.save()
    ctx.translate(HOUSE.x + HOUSE.w / 2, HOUSE.y + HOUSE.h / 2)
    ctx.rotate(-0.12)
    if (this.paint) {
      const roof = this.paint.house
      const w = HOUSE.w * 1.05
      const h = (w * roof.height) / roof.width
      ctx.drawImage(roof, -w / 2, -h / 2, w, h)
      if (S.snow > 0.05) {
        ctx.fillStyle = rgba(C.snow, 0.7 * S.snow)
        ctx.fillRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6)
      }
    } else {
      ctx.fillStyle = rgba(C.prune, 0.22)
      ctx.strokeStyle = rgba(C.prune, 0.8)
      ctx.lineWidth = 1.6
      ctx.fillRect(-HOUSE.w / 2, -HOUSE.h / 2, HOUSE.w, HOUSE.h)
      ctx.strokeRect(-HOUSE.w / 2, -HOUSE.h / 2, HOUSE.w, HOUSE.h)
      if (S.snow > 0.05) {
        ctx.fillStyle = rgba(C.snow, 0.8 * S.snow)
        ctx.fillRect(-HOUSE.w / 2, -HOUSE.h / 2, HOUSE.w, HOUSE.h / 2)
      }
      ctx.beginPath()
      ctx.moveTo(-HOUSE.w / 2, 0)
      ctx.lineTo(HOUSE.w / 2, 0)
      ctx.stroke()
    }
    ctx.restore()

    // vegetable beds, from spring 2026
    const beds = smooth(0.2, 0.3, st.tau)
    if (beds > 0) {
      ctx.save()
      ctx.globalAlpha = beds
      for (const [x, y, w, h] of BEDS) {
        if (this.paint) {
          // the painted bed, laid end to end along the row; in winter the soil shows through
          const bed = this.paint.bed
          const bh = h * 1.35
          const bw = (bh * bed.width) / bed.height
          const n = Math.ceil(w / bw)
          ctx.globalAlpha = beds * (0.55 + 0.45 * S.leaf)
          for (let i = 0; i < n; i++) ctx.drawImage(bed, x + (i * (w - bw)) / Math.max(1, n - 1), y + (h - bh) / 2, bw, bh)
          continue
        }
        ctx.fillStyle = rgba(C.humus, 0.1 + 0.15 * S.leaf)
        ctx.fillRect(x, y, w, h)
        ctx.strokeStyle = rgba(C.humus, 0.6)
        ctx.lineWidth = 1
        ctx.strokeRect(x, y, w, h)
      }
      ctx.restore()
    }

    // the ground layer: mulch at planting, then herbaceous ground covers spreading between the shrubs
    if (this.paint && age >= 0) this.groundCovers(st.tau, age, S, k * dpr)

    // snow over the ground, under the shrubs and the trees
    if (S.snow > 0.02) {
      this.poly(PARCEL)
      ctx.fillStyle = rgba(C.snow, 0.55 * S.snow)
      ctx.fill()
    }

    // shadows: late-afternoon sun in the south-west, longer in winter
    const all: [Tree, number][] = [
      ...WOODY.map((t): [Tree, number] => [t, age]),
      ...TREES.map((t): [Tree, number] => [t, age]),
      ...planted.map((p): [PlantedTree, number] => [p, p.age]),
    ]
    for (const [t, a] of all) {
      if (a < 0) continue
      const r = crownPx(t.sp, a)
      const tree = SPECIES[t.sp].kind === 'canopy' || SPECIES[t.sp].kind === 'fruit'
      const h = heightM(t.sp, a) * PX_PER_M * S.shadow * (tree ? 0.55 : 0.3)
      const leafy = 0.35 + 0.65 * S.leaf
      ctx.beginPath()
      ctx.ellipse(t.x + Math.cos(SUN) * h * 0.5, t.y + Math.sin(SUN) * h * 0.5, r * leafy + h * 0.5, r * 0.9 * leafy, SUN, 0, TAU)
      ctx.fillStyle = rgba(C.shade, (tree ? 0.07 : 0.04) * (0.5 + 0.5 * S.leaf))
      ctx.fill()
    }

    // while planning, each tree's adult size as a dotted ring
    if (st.plan > 0.01) {
      ctx.save()
      ctx.setLineDash([4, 6])
      ctx.strokeStyle = rgba(C.prune, 0.55 * st.plan)
      ctx.lineWidth = 1.3
      for (const t of TREES) {
        ctx.beginPath()
        ctx.arc(t.x, t.y, SPECIES[t.sp].R * PX_PER_M, 0, TAU)
        ctx.stroke()
      }
      ctx.restore()
    }

    // hedge, shrubs and trees, small ones first so the big crowns sit on top
    all.sort((p, q) => crownPx(p[0].sp, p[1]) - crownPx(q[0].sp, q[1])).forEach(([t, a]) => this.drawTree(t, a, S, wind))

    // snow lying on the crowns
    if (S.snow > 0.2 && age > 3) {
      for (const t of TREES) {
        const r = crownPx(t.sp, age)
        if (r <= 20) continue
        const rnd = rng(t.seed + 21)
        ctx.fillStyle = rgba(C.snow, 0.5 * S.snow)
        for (let i = 0; i < 6; i++) {
          const a = rnd() * TAU
          const d = rnd() * r * 0.6
          ctx.beginPath()
          ctx.arc(t.x + Math.cos(a) * d, t.y + Math.sin(a) * d, r * 0.12, 0, TAU)
          ctx.fill()
        }
      }
    }

    // the chimney smokes in the cold months, the smoke drifting east on the west wind
    const cold = Math.max(1 - smooth(0.16, 0.24, S.f), smooth(0.8, 0.88, S.f))
    if (cold > 0.01) {
      const t = this.reduce ? 3 : wind
      const smoke = mix(mix(C.ink, C.water, 0.35), C.paper, 0.45)
      for (let i = 0; i < 14; i++) {
        const p = (t * 0.07 + i / 14) % 1
        const sx = CHIMNEY[0] + p * 110 + Math.sin(t * 0.7 + i * 1.9) * 4 * p
        const sy = CHIMNEY[1] - p * 30 + Math.sin(t * 0.5 + i) * 7 * p
        const sr = 5 + p * 22
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr)
        const a = Math.round(650 * cold * Math.pow(1 - p, 1.2) * smooth(0, 0.05, p)) / 1000
        g.addColorStop(0, rgba(smoke, a))
        g.addColorStop(0.6, rgba(smoke, a * 0.6))
        g.addColorStop(1, rgba(smoke, 0))
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(sx, sy, sr, 0, TAU)
        ctx.fill()
      }
    }

    // the terrain's outline, in pencil
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const graphite = mix(C.ink, C.paper, 0.2)
    const scale = 1 / Math.min(1, Math.max(k, 0.35))
    for (const { pts, a, w } of OUTLINE) {
      ctx.strokeStyle = rgba(graphite, a)
      ctx.lineWidth = w * scale
      ctx.beginPath()
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
      ctx.stroke()
    }
    ctx.restore()

    // birds passing over, their shadows on the garden below
    if (this.paint && !this.reduce) {
      for (const b of birdsAt(wind, age)) {
        const { span, glide } = BIRD_SIZE[b.kind]
        const beat = glide ? 1 - 0.05 * Math.sin(b.time * 1.4) : Math.sin(b.time * 0.8) > -0.3 ? 1 - 0.38 * Math.pow(Math.sin(b.time * 11), 2) : 0.94
        this.sprite(b.kind, b.x + Math.cos(SUN) * 34, b.y + Math.sin(SUN) * 34, span / 2, b.heading, 0.1 * (0.6 + 0.4 * S.leaf), beat, true)
        this.sprite(b.kind, b.x, b.y, span / 2, b.heading, 0.95, beat)
      }
    }

    // observing: run-off and the west wind
    if (st.observe > 0.01) {
      ctx.save()
      ctx.globalAlpha = st.observe
      for (const p of RUNOFF) this.line(p, rgba(C.water, 0.9), 3, [2, 9], this.reduce ? 0 : -wind * 16)
      ctx.restore()
      this.drawWind(wind, st.observe)
      this.hand(labels.wind, 30, 160, 26, C.ink, st.observe)
      this.bubble(labels.water, 830, 632, POND.x + 32, POND.y + 44, 24, C.water, st.observe)
      this.bubble(labels.slope, 430, 657, 470, 592, 24, C.ink, st.observe)
    }
    if (st.plan > 0.01) {
      this.hand(labels.walnut, 450, 300 - SPECIES.noyer.R * PX_PER_M - 10, 26, C.prune, st.plan, 'center')
      this.hand(labels.hedge, 60, 410, 24, C.leaf, st.plan)
    }
    const shade = bump(14, 15.2, 16.4, 17.5, st.tau)
    if (shade > 0.01) {
      this.line([[450, 300 - crownPx('noyer', age) * 0.9], [470, 205]], rgba(C.prune, 0.6 * shade), 1.4)
      this.hand(labels.shade, 600, 135, 26, C.prune, shade, 'center')
    }
    if (st.zoom < 0.6) this.hand(labels.yours, 500, -40, 70, C.prune, smooth(0.6, 0.35, st.zoom), 'center')

    // weather, in world space
    for (const p of particles) {
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.globalAlpha = Math.min(1, p.age * 3)
      if (p.type === 'snow') {
        ctx.fillStyle = rgba(C.snow, 0.9 * p.life)
        ctx.beginPath()
        ctx.arc(0, 0, p.s, 0, TAU)
        ctx.fill()
        ctx.strokeStyle = rgba(C.ink, 0.12 * p.life)
        ctx.lineWidth = 0.6
        ctx.stroke()
      } else {
        ctx.fillStyle = rgba(p.type === 'petal' ? C.blossom : p.tone, 0.85 * p.life)
        ctx.beginPath()
        ctx.ellipse(0, 0, p.s * 1.6, p.s * 0.8, 0, 0, TAU)
        ctx.fill()
      }
      ctx.restore()
    }
    return S
  }

  /** Snow, blossom and falling leaves. */
  step(particles: Particle[], S: Season, tau: number, dt: number) {
    if (this.reduce) {
      particles.length = 0
      return
    }
    const age = tau - PLANTED
    const spawn = (type: Particle['type'], rate: number) => {
      for (let n = rate * dt; n > 0; n -= 1) {
        if (Math.random() >= n || particles.length >= 260) continue
        let x: number
        let y: number
        if (type === 'snow') {
          x = -200 + Math.random() * 1400
          y = -100 + Math.random() * 820
        } else {
          const t = TREES[Math.floor(Math.random() * TREES.length)]
          const r = crownPx(t.sp, age)
          if (r < 10) continue
          x = t.x + (Math.random() - 0.5) * r * 1.4
          y = t.y + (Math.random() - 0.5) * r * 1.4
        }
        const snow = type === 'snow'
        particles.push({
          type, x, y,
          vx: snow ? 6 + Math.random() * 10 : 18 + Math.random() * 20,
          vy: snow ? 30 + Math.random() * 30 : 14 + Math.random() * 16,
          s: snow ? 1.6 + Math.random() * 2.4 : 2.4 + Math.random() * 1.8,
          rot: Math.random() * 6, vr: (Math.random() - 0.5) * 4,
          life: 1, decay: snow ? 0.08 : 0.22 + Math.random() * 0.2, age: 0,
          tone: Math.random() < 0.5 ? this.C.humus : this.C.clay,
        })
      }
    }
    if (S.snow > 0.35) spawn('snow', 60 * S.snow)
    if (S.blossom > 0.3 && age > 0.3) spawn('petal', 26 * S.blossom)
    if (S.fall > 0.1 && age > 2) spawn('leaf', 40 * S.fall)
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]
      p.x += p.vx * dt
      p.y += p.vy * dt + Math.sin(p.rot) * 6 * dt
      p.rot += p.vr * dt
      p.age += dt
      p.life -= p.decay * dt
      if (p.life <= 0 || p.y > WORLD_H + 220) particles.splice(i, 1)
    }
  }
}
