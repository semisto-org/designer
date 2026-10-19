// The notebook the features page leafs through: the published map painted on
// a canvas, layer after layer, as the visit goes on (scene.ts says what each
// station shows). The terrain in pencil, water as a blue wash, the garden in
// the home page's watercolours, growing with the years, and notes in the
// margin written by hand next to what they are about. North is up and the
// geometry is exact: the notebook dresses the map, it never distorts it.

import type { Position } from 'geojson'
import { CROWN_SHARE, gardenAt, gardenPlants, SEASONS, yearNow, type GardenPlant, type PublicGrowth } from '@/public_maps/garden'
import { drawSprite, type Atlases } from '@/public_maps/gardenLayer'
import { calendarYear } from '@/relief/growth'
import type { PublicMapProps } from '@/types/collab'
import { layerOf, outlineRings, type Facts, type NoteKey, type Scene, type TourFeature } from './scene'

type Colors = { paper: string; wash: string; ink: string; prune: string; muted: string; leaf: string; hand: string; water: string; clay: string; humus: string }

function colors(): Colors {
  const style = getComputedStyle(document.documentElement)
  const token = (name: string, fallback: string) => style.getPropertyValue(`--color-${name}`).trim() || fallback
  return {
    paper: token('loam-50', '#f7f3ea'),
    wash: token('loam-100', '#efe9dc'),
    ink: token('prune-900', '#2b2940'),
    prune: token('prune-600', '#5b5781'),
    muted: token('loam-600', '#4d4a45'),
    leaf: token('leaf-600', '#6d7a00'),
    hand: token('leaf-700', '#4d5500'),
    clay: token('clay-600', '#b0463c'),
    humus: token('humus-500', '#e0a23a'),
    // No token for pond water (as in the time-lapse).
    water: '#7fa7c2',
  }
}

/** The words the canvas writes, already filled in with the place's facts. */
export type TourLabels = Record<NoteKey, string> & { north: string }

type Point = [number, number]

function positions(geometry: { type: string; coordinates?: unknown } | null | undefined): Position[] {
  if (!geometry || !('coordinates' in geometry)) return []
  const out: Position[] = []
  const walk = (value: unknown) => {
    if (Array.isArray(value) && typeof value[0] === 'number') out.push(value as Position)
    else if (Array.isArray(value)) value.forEach(walk)
  }
  walk(geometry.coordinates)
  return out
}

/** A small, stable wobble so that pencil lines are never ruled. */
function wobble(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s / 2147483647 - 0.5) * 2
  }
}

function pathLength(rings: Point[][]) {
  let total = 0
  for (const ring of rings) for (let i = 1; i < ring.length; i++) total += Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1])
  return total
}

/** A pencil line drawn twice, the second pass slightly off; `reveal` draws only the first part of it. */
function pencil(ctx: CanvasRenderingContext2D, rings: Point[][], color: string, width: number, alpha = 1, reveal = 1, dash?: number[]) {
  if (alpha <= 0.01 || reveal <= 0.001) return
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  const length = reveal < 1 ? pathLength(rings) : 0
  ;[[0, 0, 0.85], [1.1, -0.7, 0.35]].forEach(([dx, dy, a]) => {
    ctx.globalAlpha = a * alpha
    ctx.lineWidth = width
    if (dash) ctx.setLineDash(dash)
    else if (reveal < 1) ctx.setLineDash([length * reveal, length])
    ctx.beginPath()
    rings.forEach((ring) => ring.forEach(([x, y], i) => (i ? ctx.lineTo(x + dx, y + dy) : ctx.moveTo(x + dx, y + dy))))
    ctx.stroke()
  })
  ctx.restore()
}

function fill(ctx: CanvasRenderingContext2D, rings: Point[][], color: string, alpha: number) {
  if (alpha <= 0.005) return
  ctx.save()
  ctx.beginPath()
  rings.forEach((ring) => ring.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))))
  ctx.closePath()
  ctx.fillStyle = color
  ctx.globalAlpha = alpha
  ctx.fill('evenodd')
  ctx.restore()
}

type Projected = { feature: TourFeature; polygons: Point[][][]; lines: Point[][]; points: Point[] }

export class TourPainter {
  private c: Colors
  private plants: GardenPlant[]
  private today: number
  private features: TourFeature[]
  private atlases: Atlases | null = null
  private lastKey = ''

  constructor(
    private ctx: CanvasRenderingContext2D,
    private props: PublicMapProps,
    private facts: Facts,
    private labels: TourLabels,
  ) {
    this.c = colors()
    this.features = props.features.features as TourFeature[]
    const growth = props.growth as PublicGrowth | null | undefined
    this.plants = growth ? gardenPlants(growth) : []
    this.today = growth ? yearNow(growth, new Date()) : 0
  }

  setAtlases(atlases: Atlases) {
    this.atlases = atlases
    this.lastKey = ''
  }

  /** The year of the garden a scene shows, on the slider's scale (0 = the first planting). */
  yearOf(scene: Scene) {
    return this.today + scene.year
  }

  /** The calendar year a scene shows, for the year note. */
  calendarYearOf(scene: Scene) {
    const growth = this.props.growth
    return growth ? calendarYear(growth.origin, this.yearOf(scene)) : new Date().getFullYear() + Math.floor(scene.year)
  }

  /** Paints the scene, unless nothing changed since the last frame. */
  draw(scene: Scene, width: number, height: number, dpr: number, compact: boolean) {
    const key = JSON.stringify([scene, width, height, dpr, compact, Boolean(this.atlases)].map((v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)))
    if (key === this.lastKey) return
    this.lastKey = key
    const { ctx, c } = this
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    // Room for the notes around the terrain: more at the sides on a wide screen.
    const frame = compact
      ? { x: 16, y: 58, w: width - 32, h: height - 96 }
      : { x: width * 0.12, y: height * 0.1, w: width * 0.76, h: height * 0.76 }
    const project = this.projection(frame, scene.focus)
    if (!project) return
    const { toPx, scale } = project

    // The page: a soft wash where the terrain lies.
    ctx.save()
    ctx.fillStyle = c.wash
    ctx.globalAlpha = 0.8
    ctx.beginPath()
    ctx.ellipse(frame.x + frame.w / 2, frame.y + frame.h / 2, frame.w / 2 + 24, frame.h / 2 + 14, -0.06, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    const outline = outlineRings(this.props.map.boundary).map((ring) => ring.map(toPx))
    fill(ctx, outline, c.leaf, 0.07 * scene.outline)

    const projected = this.features.map((feature) => this.project(feature, toPx))
    const byLayer = (layer: ReturnType<typeof layerOf>) => projected.filter((p) => layerOf(p.feature) === layer)

    // What is already there: buildings, hedges, paths, trees, in pencil.
    for (const p of byLayer('existing')) {
      const building = p.feature.properties?.kind === 'building'
      p.polygons.forEach((rings) => {
        fill(ctx, rings, building ? c.muted : c.ink, (building ? 0.22 : 0.04) * scene.existing)
        pencil(ctx, rings, c.muted, building ? 1.4 : 1, scene.existing)
      })
      if (p.lines.length) {
        const hedge = /hedge/.test(p.feature.properties?.kind ?? '')
        pencil(ctx, p.lines, hedge ? c.leaf : c.muted, hedge ? 3 : 1.6, scene.existing, 1, hedge ? [2, 5] : undefined)
      }
      p.points.forEach(([x, y]) => this.dot(x, y, 3, c.muted, scene.existing))
    }

    // Paths and gates.
    for (const p of byLayer('access')) {
      pencil(ctx, p.lines, c.muted, 2, scene.access, 1, [7, 6])
      p.points.forEach(([x, y]) => this.dot(x, y, 3.5, c.ink, scene.access))
    }

    // Water first: ponds as a blue wash.
    const draftId = this.facts.draft?.id
    for (const p of byLayer('water')) {
      const isDraft = draftId != null && p.feature.id === draftId
      const draftShare = isDraft ? scene.drafts : 0
      p.polygons.forEach((rings) => {
        fill(ctx, rings, c.water, 0.45 * scene.water * (1 - draftShare * 0.6))
        pencil(ctx, rings, c.water, 1.4, scene.water * (1 - draftShare))
        // A draft of « your AI »: dashed, in plum, waiting for a human to decide.
        if (draftShare > 0) pencil(ctx, rings, c.prune, 2, draftShare, 1, [6, 5])
      })
      pencil(ctx, p.lines, c.water, 2.4, scene.water)
      p.points.forEach(([x, y]) => this.dot(x, y, 4, c.water, scene.water))
    }

    // Structures: a greenhouse, a store, shelters.
    for (const p of byLayer('structures')) {
      p.polygons.forEach((rings) => {
        fill(ctx, rings, c.prune, 0.16 * scene.structures)
        pencil(ctx, rings, c.prune, 1.2, scene.structures)
      })
      pencil(ctx, p.lines, c.prune, 1.6, scene.structures)
      p.points.forEach(([x, y]) => this.dot(x, y, 3.5, c.prune, scene.structures))
    }

    // The garden in watercolour, as it will be in that year, lowest crowns first.
    if (this.atlases && scene.plants > 0.01) {
      const painted = gardenAt(this.plants, this.yearOf(scene), SEASONS.summer)
      ctx.save()
      ctx.globalAlpha = Math.min(1, scene.plants)
      for (const plant of painted) {
        const [x, y] = toPx([plant.lng, plant.lat])
        const size = Math.max(compact ? 3 : 4, (plant.diameter * scale) / CROWN_SHARE)
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate((plant.rotation * Math.PI) / 180)
        drawSprite(ctx, this.atlases, plant.sprite, size)
        ctx.restore()
      }
      ctx.restore()
    }

    // The outline on top, drawn as the visit begins.
    pencil(ctx, outline, c.ink, compact ? 2 : 2.6, Math.min(1, scene.outline * 2), scene.outline)

    if (scene.compass > 0.01) this.compass(frame, scene.compass, compact)
    if (scene.comments > 0.01) this.comments(toPx, scene.comments, compact)
    this.notes(scene, frame, toPx, compact)
    this.scaleBar(frame, scale, scene.outline, compact)
  }

  /**
   * North up, metres to pixels: fits the terrain and its elements in the
   * frame, or, as `focus` goes to 1, the planted part with room for its
   * grown crowns, so that a tree reads at its true size.
   */
  private projection(frame: { x: number; y: number; w: number; h: number }, focus: number) {
    const all = [...positions(this.props.map.boundary), ...this.features.flatMap((f) => positions(f.geometry))]
    if (all.length === 0) return null
    const lat0 = all.reduce((sum, p) => sum + p[1], 0) / all.length
    const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180)
    const ky = 110_540
    const fit = (box: [number, number, number, number], margin: number) => {
      const [minX, minY, maxX, maxY] = [box[0] * kx - margin, box[1] * ky - margin, box[2] * kx + margin, box[3] * ky + margin]
      return {
        scale: Math.min(frame.w / Math.max(maxX - minX, 10), frame.h / Math.max(maxY - minY, 10)),
        midX: (minX + maxX) / 2,
        midY: (minY + maxY) / 2,
      }
    }
    const whole = fit([Math.min(...all.map((p) => p[0])), Math.min(...all.map((p) => p[1])), Math.max(...all.map((p) => p[0])), Math.max(...all.map((p) => p[1]))], 0)
    const box = this.facts.plantsBox
    const close = box ? fit(box, 12) : whole
    // Never closer than four times the whole view: the place stays recognisable.
    const k = Math.max(0, Math.min(1, focus))
    const closeScale = Math.min(close.scale, whole.scale * 4)
    const scale = whole.scale * Math.pow(closeScale / whole.scale, k)
    const midX = whole.midX + (close.midX - whole.midX) * k
    const midY = whole.midY + (close.midY - whole.midY) * k
    const cx = frame.x + frame.w / 2
    const cy = frame.y + frame.h / 2
    const toPx = ([lng, lat]: Position): Point => [cx + (lng * kx - midX) * scale, cy - (lat * ky - midY) * scale]
    return { toPx, scale }
  }

  private project(feature: TourFeature, toPx: (p: Position) => Point): Projected {
    const g = feature.geometry
    const polygons = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
    const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []
    const points = g.type === 'Point' ? [g.coordinates] : g.type === 'MultiPoint' ? g.coordinates : []
    return {
      feature,
      polygons: polygons.map((rings) => rings.map((ring) => ring.map(toPx))),
      lines: lines.map((line) => line.map(toPx)),
      points: points.map(toPx),
    }
  }

  private dot(x: number, y: number, r: number, color: string, alpha: number) {
    if (alpha <= 0.01) return
    const { ctx } = this
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  /** A north arrow at the top right and the sun's arc to the south, in pencil. */
  private compass(frame: { x: number; y: number; w: number; h: number }, alpha: number, compact: boolean) {
    const { ctx, c } = this
    const x = frame.x + frame.w - (compact ? 6 : 0)
    const y = frame.y + (compact ? 14 : 4)
    const r = compact ? 9 : 13
    pencil(ctx, [[[x, y + r * 1.6], [x, y - r * 1.4]], [[x - r * 0.55, y - r * 0.5], [x, y - r * 1.4], [x + r * 0.55, y - r * 0.5]]], c.ink, 1.6, alpha)
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = c.ink
    ctx.font = `600 ${compact ? 12 : 15}px "Inter Variable", sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(this.labels.north, x, y - r * 1.8)
    ctx.restore()

    // The sun's way across the sky, low in the south: a dotted arc under the terrain.
    const cx = frame.x + frame.w / 2
    const cy = frame.y + frame.h + (compact ? 4 : 10)
    const rx = frame.w * 0.42
    const ry = compact ? 14 : 34
    const arc: Point[] = []
    for (let i = 0; i <= 24; i++) {
      const a = Math.PI + (Math.PI * i) / 24
      arc.push([cx + Math.cos(a) * rx, cy - Math.sin(a) * -ry])
    }
    pencil(ctx, [arc], c.humus, 1.6, alpha * 0.9, 1, [2, 6])
    const [sx, sy] = arc[12]
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.strokeStyle = c.humus
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.arc(sx, sy, compact ? 5 : 8, 0, Math.PI * 2)
    ctx.stroke()
    const rand = wobble(7)
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8 + rand() * 0.1
      const r0 = compact ? 7.5 : 11.5
      const r1 = compact ? 10 : 16
      ctx.beginPath()
      ctx.moveTo(sx + Math.cos(a) * r0, sy + Math.sin(a) * r0)
      ctx.lineTo(sx + Math.cos(a) * r1, sy + Math.sin(a) * r1)
      ctx.stroke()
    }
    ctx.restore()
  }

  /** Comment pins on three elements of the map, the way people discuss a place. */
  private comments(toPx: (p: Position) => Point, alpha: number, compact: boolean) {
    const { ctx, c } = this
    const anchors = [this.facts.pond?.at, this.facts.plantsAt, this.facts.existingAt].filter(Boolean) as Position[]
    anchors.forEach((at, i) => {
      const [x, y] = toPx(at)
      const r = compact ? 7 : 10
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.translate(x + (i - 1) * 6, y - r * 2.2)
      ctx.fillStyle = c.paper
      ctx.strokeStyle = c.prune
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.moveTo(-r, -r * 0.8)
      ctx.lineTo(r, -r * 0.8)
      ctx.quadraticCurveTo(r * 1.3, -r * 0.8, r * 1.3, -r * 0.3)
      ctx.lineTo(r * 1.3, r * 0.5)
      ctx.quadraticCurveTo(r * 1.3, r, r, r)
      ctx.lineTo(-r * 0.2, r)
      ctx.lineTo(-r * 0.7, r * 1.8)
      ctx.lineTo(-r * 0.6, r)
      ctx.lineTo(-r, r)
      ctx.quadraticCurveTo(-r * 1.3, r, -r * 1.3, r * 0.5)
      ctx.lineTo(-r * 1.3, -r * 0.3)
      ctx.quadraticCurveTo(-r * 1.3, -r * 0.8, -r, -r * 0.8)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = c.prune
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath()
        ctx.arc(k * r * 0.5, r * 0.1, r * 0.13, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    })
  }

  /** The notes of the scene, by hand, each with a pencil arrow to its element. */
  private notes(scene: Scene, frame: { x: number; y: number; w: number; h: number }, toPx: (p: Position) => Point, compact: boolean) {
    const centre: Point = [frame.x + frame.w / 2, frame.y + frame.h / 2]
    const outline = outlineRings(this.props.map.boundary)
    const top = outline.flat().reduce<Position | null>((best, p) => (!best || p[1] > best[1] ? p : best), null)
    const west = outline.flat().reduce<Position | null>((best, p) => (!best || p[0] < best[0] ? p : best), null)
    const anchors: Partial<Record<NoteKey, Point | null>> = {
      area: top ? toPx(top) : centre,
      sun: [centre[0], frame.y + frame.h + (compact ? 4 : 10)],
      wind: west ? toPx(west) : [frame.x, centre[1]],
      existing: this.facts.existingAt ? toPx(this.facts.existingAt) : null,
      water: this.facts.pond ? toPx(this.facts.pond.at) : null,
      draft: this.facts.draft ? toPx(this.centroid(this.facts.draft)) : null,
      plants: this.facts.plantsAt ? toPx(this.facts.plantsAt) : null,
      comment: this.facts.pond ? toPx(this.facts.pond.at) : this.facts.plantsAt ? toPx(this.facts.plantsAt) : null,
    }
    scene.notes.forEach((key, index) => {
      const at = anchors[key]
      if (!at) return
      const text = this.labels[key]
      if (!text) return
      this.note(text, at, frame, index, key === 'wind' ? 'left' : key === 'sun' ? 'below' : 'auto', compact)
    })
  }

  private centroid(feature: TourFeature): Position {
    const all = positions(feature.geometry)
    return [all.reduce((s, p) => s + p[0], 0) / all.length, all.reduce((s, p) => s + p[1], 0) / all.length]
  }

  /** One note: handwriting set beside the frame, an arrow drawn to `at`. */
  private note(text: string, at: Point, frame: { x: number; y: number; w: number; h: number }, index: number, side: 'auto' | 'left' | 'below', compact: boolean) {
    const { ctx, c } = this
    const font = compact ? 20 : 27
    ctx.save()
    ctx.font = `500 ${font}px "Caveat Variable", cursive`
    const width = Math.min(ctx.measureText(text).width, compact ? frame.w * 0.62 : 300)
    const lines = this.wrap(text, width)
    const boxW = Math.max(...lines.map((l) => ctx.measureText(l).width))
    const boxH = lines.length * font * 0.95

    let x: number
    let y: number
    if (side === 'below') {
      x = at[0] - boxW / 2
      y = at[1] + (compact ? 22 : 44)
    } else if (compact) {
      // On a phone, notes sit at the top of the drawing.
      x = index % 2 ? frame.x + frame.w - boxW : frame.x
      y = frame.y + 2
    } else {
      const left = side === 'left' || at[0] < frame.x + frame.w / 2
      x = left ? Math.max(8, frame.x - boxW * 0.55) : Math.min(frame.x + frame.w + boxW * 0.55, frame.x + frame.w + 160) - boxW
      y = Math.max(frame.y - 10, at[1] - boxH - 40 - index * 30)
    }
    x = Math.max(8, Math.min(x, ctx.canvas.width / (ctx.getTransform().a || 1) - boxW - 8))

    // A paper halo under the words, so they stay readable over the drawing.
    ctx.translate(x, y)
    ctx.rotate(-0.025)
    ctx.fillStyle = c.paper
    ctx.globalAlpha = 0.85
    ctx.beginPath()
    ctx.roundRect(-8, -4, boxW + 16, boxH + 10, 10)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.fillStyle = c.hand
    ctx.textBaseline = 'top'
    lines.forEach((line, i) => ctx.fillText(line, 0, i * font * 0.95))
    ctx.restore()

    // The arrow, from the words to the element, slightly curved.
    if (side === 'below') return
    const from: Point = [x + boxW / 2, y + boxH + 6]
    const mid: Point = [(from[0] + at[0]) / 2 + 18, (from[1] + at[1]) / 2 - 10]
    const curve: Point[] = []
    for (let i = 0; i <= 12; i++) {
      const t = i / 12
      curve.push([
        (1 - t) * (1 - t) * from[0] + 2 * (1 - t) * t * mid[0] + t * t * at[0],
        (1 - t) * (1 - t) * from[1] + 2 * (1 - t) * t * mid[1] + t * t * at[1],
      ])
    }
    const end = curve[curve.length - 1]
    const before = curve[curve.length - 3]
    const angle = Math.atan2(end[1] - before[1], end[0] - before[0])
    const head = compact ? 7 : 10
    pencil(ctx, [curve.slice(0, -1), [
      [end[0] - Math.cos(angle - 0.5) * head, end[1] - Math.sin(angle - 0.5) * head], end,
      [end[0] - Math.cos(angle + 0.5) * head, end[1] - Math.sin(angle + 0.5) * head],
    ]], c.hand, 1.4, 0.9)
  }

  private wrap(text: string, width: number): string[] {
    const lines: string[] = []
    let line = ''
    for (const word of text.split(/ +/)) {
      const next = line ? `${line} ${word}` : word
      if (this.ctx.measureText(next).width <= width || !line) line = next
      else {
        lines.push(line)
        line = word
      }
    }
    if (line) lines.push(line)
    return lines
  }

  /** A scale bar of a round length at the bottom left. */
  private scaleBar(frame: { x: number; y: number; w: number; h: number }, pxPerMeter: number, alpha: number, compact: boolean) {
    if (alpha <= 0.01) return
    const { ctx, c } = this
    const target = (frame.w * 0.18) / pxPerMeter
    const length = [5, 10, 20, 50, 100, 200, 500, 1000].find((m) => m >= target * 0.6) ?? 1000
    const px = length * pxPerMeter
    const x = frame.x
    const y = frame.y + frame.h + (compact ? 20 : 30)
    pencil(ctx, [[[x, y], [x + px, y]], [[x, y - 5], [x, y + 2]], [[x + px, y - 5], [x + px, y + 2]]], c.ink, 1.6, alpha)
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = c.muted
    ctx.font = `400 ${compact ? 12 : 14}px "Inter Variable", sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(`${length} m`, x + px / 2, y - 9)
    ctx.restore()
  }
}
