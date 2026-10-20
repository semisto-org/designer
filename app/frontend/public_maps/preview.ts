// The link preview of a published map (og:image, 1200 × 630): a page of the
// field notebook with the map's title on the left and, on the right, the
// terrain as a pencil outline with its water and paths, and the garden in
// watercolour as it will be in year 15. Painted in the owner's browser right
// after publishing (it has the fonts and the paintings), then sent to the
// server (Maps::PublicationPreviewsController). Only what the public view
// shows is drawn: the preview is built from its props.
import { formatArea, t } from '@/lib/i18n'
import { calendarYear } from '@/relief/growth'
import type { PublicMapProps } from '@/types/collab'
import { GARDEN_YEARS, SEASONS, gardenAt, gardenPlants, yearNow } from './garden'
import { loadAtlases } from './gardenLayer'
import { colors, drawTerrain, fontsReady, terrainProjection, wrap } from './notebook'

export const PREVIEW_WIDTH = 1200
export const PREVIEW_HEIGHT = 630

/** Where the terrain is drawn, in px: the right part of the page. */
const FRAME = { x: 600, y: 30, w: 560, h: 545 }

/** The year the preview shows: year 15, or ten years ahead of an older garden. */
export function previewYear(today: number): number {
  return today < 15 ? 15 : Math.min(GARDEN_YEARS, Math.round(today) + 10)
}

/** Paints the preview of a public view, or null when there is nothing to draw (no terrain, no element). */
export async function renderPreview(props: PublicMapProps): Promise<Blob | null> {
  const growth = props.growth ?? null
  const plants = growth ? gardenPlants(growth) : []
  const today = growth ? yearNow(growth, new Date()) : 0
  const year = previewYear(today)
  const painted = gardenAt(plants, year, SEASONS.summer)

  const projection = terrainProjection(props, FRAME, painted.map((p) => [p.lng, p.lat]))
  if (!projection) return null

  const [atlases] = await Promise.all([painted.length ? loadAtlases() : Promise.resolve(null), fontsReady()])
  const c = colors()
  const canvas = document.createElement('canvas')
  canvas.width = PREVIEW_WIDTH
  canvas.height = PREVIEW_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = c.paper
  ctx.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT)
  drawTerrain(ctx, props, FRAME, projection, painted, atlases, c, { scaleY: PREVIEW_HEIGHT - 14 })

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
