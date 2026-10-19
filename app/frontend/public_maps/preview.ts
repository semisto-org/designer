// The link preview of a published map (og:image, 1200 × 630): a page of the
// field notebook with the map's title on the left and, on the right, the
// terrain as a pencil outline with its water and paths, and the garden in
// watercolour as it will be in year 15. Painted in the owner's browser right
// after publishing (it has the fonts and the paintings), then sent to the
// server (Maps::PublicationPreviewsController). Only what the public view
// shows is drawn: the preview is built from its props.
import type { Position } from 'geojson'
import { formatArea, t } from '@/lib/i18n'
import { calendarYear } from '@/relief/growth'
import type { PublicMapProps } from '@/types/collab'
import { CROWN_SHARE, GARDEN_YEARS, SEASONS, gardenAt, gardenPlants, yearNow } from './garden'
import { drawSprite, loadAtlases } from './gardenLayer'

export const PREVIEW_WIDTH = 1200
export const PREVIEW_HEIGHT = 630

/** Where the terrain is drawn, in px: the right part of the page. */
const FRAME = { x: 600, y: 30, w: 560, h: 545 }

type Colors = { paper: string; wash: string; ink: string; prune: string; muted: string; leaf: string; hand: string; water: string }

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
    // No token for pond water (as in the time-lapse).
    water: '#7fa7c2',
  }
}

/** The year the preview shows: year 15, or ten years ahead of an older garden. */
export function previewYear(today: number): number {
  return today < 15 ? 15 : Math.min(GARDEN_YEARS, Math.round(today) + 10)
}

/** Every position of a GeoJSON geometry. */
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

/** Lines of `text` that fit `width` with the context's current font, at most `max` (the last one ends with …). */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, max: number): string[] {
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

async function fontsReady() {
  if (!document.fonts) return
  const wanted = ['600 64px "EB Garamond Variable"', '400 26px "Inter Variable"', '600 22px "Inter Variable"', '500 44px "Caveat Variable"']
  await Promise.race([Promise.all(wanted.map((font) => document.fonts.load(font))), new Promise((resolve) => setTimeout(resolve, 2500))])
}

/** A pencil line: drawn twice, the second pass slightly off. */
function pencil(ctx: CanvasRenderingContext2D, rings: [number, number][][], color: string, width: number) {
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

/** A scale bar of a round length, in the bottom-right corner of the frame. */
function scaleBar(ctx: CanvasRenderingContext2D, pxPerMeter: number, c: Colors) {
  const target = 120 / pxPerMeter
  const length = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find((m) => m >= target * 0.6) ?? 1000
  const px = length * pxPerMeter
  const x = FRAME.x + FRAME.w - px - 8
  const y = PREVIEW_HEIGHT - 14
  pencil(ctx, [[[x, y], [x + px, y]], [[x, y - 6], [x, y + 2]], [[x + px, y - 6], [x + px, y + 2]]], c.ink, 2)
  ctx.fillStyle = c.muted
  ctx.font = '400 20px "Inter Variable", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(`${length} m`, x + px / 2, y - 12)
  ctx.textAlign = 'left'
}

/** Paints the preview of a public view, or null when there is nothing to draw (no terrain, no element). */
export async function renderPreview(props: PublicMapProps): Promise<Blob | null> {
  const growth = props.growth ?? null
  const plants = growth ? gardenPlants(growth) : []
  const today = growth ? yearNow(growth, new Date()) : 0
  const year = previewYear(today)
  const painted = gardenAt(plants, year, SEASONS.summer)

  const all = [...positions(props.map.boundary), ...props.features.features.flatMap((f) => positions(f.geometry)), ...painted.map((p) => [p.lng, p.lat])]
  if (all.length === 0) return null

  const [atlases] = await Promise.all([painted.length ? loadAtlases() : Promise.resolve(null), fontsReady()])
  const c = colors()
  const canvas = document.createElement('canvas')
  canvas.width = PREVIEW_WIDTH
  canvas.height = PREVIEW_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // The page, and a wash where the terrain sits.
  ctx.fillStyle = c.paper
  ctx.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT)
  ctx.fillStyle = c.wash
  ctx.beginPath()
  ctx.ellipse(FRAME.x + FRAME.w / 2, FRAME.y + FRAME.h / 2, FRAME.w / 2 + 20, FRAME.h / 2 + 10, -0.08, 0, Math.PI * 2)
  ctx.fill()

  // North up, metres to pixels, the terrain fitted in its frame.
  const lat0 = all.reduce((sum, p) => sum + p[1], 0) / all.length
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180)
  const ky = 110_540
  const xs = all.map((p) => p[0] * kx)
  const ys = all.map((p) => p[1] * ky)
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const pad = 30
  const scale = Math.min((FRAME.w - 2 * pad) / Math.max(maxX - minX, 10), (FRAME.h - 2 * pad) / Math.max(maxY - minY, 10))
  const cx = FRAME.x + FRAME.w / 2
  const cy = FRAME.y + FRAME.h / 2
  const midX = (minX + maxX) / 2
  const midY = (minY + maxY) / 2
  const project = ([lng, lat]: Position): [number, number] => [cx + (lng * kx - midX) * scale, cy - (lat * ky - midY) * scale]

  // Polygons first (water as a blue wash), then lines.
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

  // The terrain's outline, in pencil over a pale green wash.
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
  scaleBar(ctx, scale, c)

  // The words, on the left.
  const left = 64
  const width = 480
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = c.prune
  ctx.font = '600 22px "Inter Variable", sans-serif'
  ctx.fillText(t('public_maps.preview.kicker'), left, 110)

  ctx.fillStyle = c.ink
  ctx.font = '600 64px "EB Garamond Variable", Georgia, serif'
  const titleLines = wrap(ctx, props.title, width, 3)
  titleLines.forEach((line, i) => ctx.fillText(line, left, 190 + i * 70))
  let y = 190 + (titleLines.length - 1) * 70 + 58

  const place = props.map.locality || props.map.regionName
  const facts = [props.map.areaM2 ? formatArea(props.map.areaM2) : null, place].filter(Boolean) as string[]
  if (facts.length) {
    ctx.fillStyle = c.muted
    ctx.font = '400 26px "Inter Variable", sans-serif'
    ctx.fillText(facts.length === 2 ? t('public_maps.preview.area_place', { area: facts[0], place: facts[1] }) : facts[0], left, y)
    y += 70
  }

  if (growth && painted.length) {
    const ahead = Math.round(year - today)
    const when = ahead > 0
      ? `${t('public_maps.preview.years_later', { count: ahead })}, ${t('public_maps.preview.in_year', { year: calendarYear(growth.origin, year) })}`
      : t('public_maps.preview.in_year', { year: calendarYear(growth.origin, year) })
    ctx.save()
    ctx.translate(left, y)
    ctx.rotate(-0.04)
    ctx.fillStyle = c.hand
    ctx.font = '500 44px "Caveat Variable", cursive'
    ctx.fillText(when, 0, 0)
    ctx.restore()
  }

  ctx.fillStyle = c.muted
  ctx.font = '400 20px "Inter Variable", sans-serif'
  ctx.fillText(window.location.host, left, PREVIEW_HEIGHT - 48)

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'))
}
