// A page of the field notebook, painted on a canvas from a public view's
// props: shared by the link preview (preview.ts) and the vertical video
// (video.ts). The terrain in pencil with its water and paths, the garden in
// watercolour. Only what the public view shows is drawn.
import type { Position } from 'geojson'
import type { PublicMapProps } from '@/types/collab'
import { CROWN_SHARE, type PaintedPlant } from './garden'
import { drawSprite, type Atlases } from './gardenLayer'

export type Colors = { paper: string; wash: string; ink: string; prune: string; muted: string; leaf: string; hand: string; water: string }
export type Frame = { x: number; y: number; w: number; h: number }

export function colors(): Colors {
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
    // No token for pond water (as in the time-lapse).
    water: '#7fa7c2',
  }
}

/** Every position of a GeoJSON geometry. */
export function positions(geometry: { type: string; coordinates?: unknown } | null | undefined): Position[] {
  if (!geometry || !('coordinates' in geometry)) return []
  const out: Position[] = []
  const walk = (value: unknown) => {
    if (Array.isArray(value) && typeof value[0] === 'number') out.push(value as Position)
    else if (Array.isArray(value)) value.forEach(walk)
  }
  walk(geometry.coordinates)
  return out
}

/** Lines of `text` that fit `width` with the context's current font, at most `max` (the last one ends with …). */
export function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, max: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width <= width || !line) line = next
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  if (lines.length <= max) return lines
  const kept = lines.slice(0, max)
  let last = kept[max - 1]
  while (last && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1)
  kept[max - 1] = `${last.trimEnd()}…`
  return kept
}

export async function fontsReady() {
  if (!document.fonts) return
  const wanted = ['600 64px "EB Garamond Variable"', '400 26px "Inter Variable"', '600 22px "Inter Variable"', '500 44px "Caveat Variable"']
  await Promise.race([Promise.all(wanted.map((font) => document.fonts.load(font))), new Promise((resolve) => setTimeout(resolve, 2500))])
}

/** A pencil line: drawn twice, the second pass slightly off. */
export function pencil(ctx: CanvasRenderingContext2D, rings: [number, number][][], color: string, width: number) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ;[[0, 0, 0.85], [1.2, -0.8, 0.35]].forEach(([dx, dy, alpha]) => {
    ctx.globalAlpha = alpha
    ctx.lineWidth = width
    ctx.beginPath()
    rings.forEach((ring) => ring.forEach(([x, y], i) => (i ? ctx.lineTo(x + dx, y + dy) : ctx.moveTo(x + dx, y + dy))))
    ctx.stroke()
  })
  ctx.restore()
}

/** A scale bar of a round length, ending at the right of the frame, its line at `y`. */
function scaleBar(ctx: CanvasRenderingContext2D, frame: Frame, y: number, pxPerMeter: number, c: Colors, fontPx: number) {
  const target = (frame.w * 0.2) / pxPerMeter
  const length = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find((m) => m >= target * 0.6) ?? 1000
  const px = length * pxPerMeter
  const x = frame.x + frame.w - px - 8
  pencil(ctx, [[[x, y], [x + px, y]], [[x, y - 6], [x, y + 2]], [[x + px, y - 6], [x + px, y + 2]]], c.ink, 2)
  ctx.fillStyle = c.muted
  ctx.font = `400 ${fontPx}px "Inter Variable", sans-serif`
  ctx.textAlign = 'center'
  ctx.fillText(`${length} m`, x + px / 2, y - 12)
  ctx.textAlign = 'left'
}

/**
 * North up, metres to pixels: fits the terrain, its elements and `extra`
 * positions (the crowns of the oldest year shown) in the frame.
 */
export function terrainProjection(props: PublicMapProps, frame: Frame, extra: Position[] = []) {
  const all = [...positions(props.map.boundary), ...props.features.features.flatMap((f) => positions(f.geometry)), ...extra]
  if (all.length === 0) return null
  const lat0 = all.reduce((sum, p) => sum + p[1], 0) / all.length
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180)
  const ky = 110_540
  const xs = all.map((p) => p[0] * kx)
  const ys = all.map((p) => p[1] * ky)
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const pad = 30
  const scale = Math.min((frame.w - 2 * pad) / Math.max(maxX - minX, 10), (frame.h - 2 * pad) / Math.max(maxY - minY, 10))
  const cx = frame.x + frame.w / 2
  const cy = frame.y + frame.h / 2
  const midX = (minX + maxX) / 2
  const midY = (minY + maxY) / 2
  const project = ([lng, lat]: Position): [number, number] => [cx + (lng * kx - midX) * scale, cy - (lat * ky - midY) * scale]
  return { project, scale }
}

export type Projection = NonNullable<ReturnType<typeof terrainProjection>>

/**
 * The terrain in the frame: a paper wash, the elements (water as a blue
 * wash, paths dashed), the outline over a pale green wash, the crowns,
 * then the outline in pencil and a scale bar at `scaleY`.
 */
export function drawTerrain(
  ctx: CanvasRenderingContext2D, props: PublicMapProps, frame: Frame, projection: Projection,
  painted: PaintedPlant[], atlases: Atlases | null, c: Colors, { scaleY, scaleFont = 20 }: { scaleY: number; scaleFont?: number },
) {
  const { project, scale } = projection
  ctx.fillStyle = c.wash
  ctx.beginPath()
  ctx.ellipse(frame.x + frame.w / 2, frame.y + frame.h / 2, frame.w / 2 + 20, frame.h / 2 + 10, -0.08, 0, Math.PI * 2)
  ctx.fill()

  for (const feature of props.features.features) {
    const geometry = feature.geometry
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : []
    for (const rings of polygons) {
      const projected = rings.map((ring) => ring.map(project))
      ctx.beginPath()
      projected.forEach((ring) => ring.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))))
      ctx.closePath()
      const water = feature.properties.layer === 'water'
      ctx.fillStyle = water ? c.water : c.ink
      ctx.globalAlpha = water ? 0.45 : 0.05
      ctx.fill('evenodd')
      ctx.globalAlpha = 1
      pencil(ctx, projected, water ? c.water : c.muted, 1.2)
    }
  }
  for (const feature of props.features.features) {
    const geometry = feature.geometry
    const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.type === 'MultiLineString' ? geometry.coordinates : []
    if (lines.length === 0) continue
    ctx.save()
    if (feature.properties.layer === 'access') ctx.setLineDash([8, 6])
    pencil(ctx, lines.map((line) => line.map(project)), feature.properties.layer === 'water' ? c.water : c.muted, 2)
    ctx.restore()
  }

  const boundary = props.map.boundary?.coordinates.flatMap((polygon) => polygon.map((ring) => ring.map(project))) ?? []
  if (boundary.length) {
    ctx.beginPath()
    boundary.forEach((ring) => ring.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))))
    ctx.fillStyle = c.leaf
    ctx.globalAlpha = 0.07
    ctx.fill('evenodd')
    ctx.globalAlpha = 1
  }

  // The garden in watercolour, lowest crowns first.
  if (atlases) {
    for (const plant of painted) {
      const [x, y] = project([plant.lng, plant.lat])
      const size = Math.max(6, (plant.diameter * scale) / CROWN_SHARE)
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate((plant.rotation * Math.PI) / 180)
      drawSprite(ctx, atlases, plant.sprite, size)
      ctx.restore()
    }
  }
  if (boundary.length) pencil(ctx, boundary, c.ink, 2.5)
  scaleBar(ctx, frame, scaleY, scale, c, scaleFont)
}
