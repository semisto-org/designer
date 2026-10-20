// « Mon jardin dans 30 ans »: the published garden as a vertical video
// (1080 × 1920, 15 s), for a story or a WhatsApp status. A notebook page:
// the title at the top, the terrain in pencil with the crowns growing from
// planting to year 30 while the seasons turn, the year in handwriting below
// and the public address at the foot. Painted in the owner's browser from
// the public view's props and recorded with MediaRecorder (MP4 where the
// browser can, else WebM); nothing is sent to the server.
import { formatArea, t } from '@/lib/i18n'
import { calendarYear } from '@/relief/growth'
import type { PublicMapProps } from '@/types/collab'
import { GARDEN_YEARS, VIDEO_DURATION, gardenAt, gardenPlants, seasonOf, videoMoment } from './garden'
import { loadAtlases } from './gardenLayer'
import { colors, drawTerrain, fontsReady, pencil, terrainProjection, wrap, type Colors } from './notebook'

export const VIDEO_WIDTH = 1080
export const VIDEO_HEIGHT = 1920
const FPS = 30
const FRAME = { x: 40, y: 500, w: 1000, h: 1000 }
const TYPES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']

function videoType(): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') return null
  return TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null
}

/** The browser can record the video. */
export const videoSupported = () => videoType() !== null

export type GardenVideo = { blob: Blob; extension: 'mp4' | 'webm' }

/**
 * Paints and records the video, in real time (15 s). `onProgress` gets 0…1.
 * Null when the view shows no plant to grow.
 */
export async function renderGardenVideo(props: PublicMapProps, url: string, onProgress?: (done: number) => void): Promise<GardenVideo | null> {
  const type = videoType()
  const growth = props.growth ?? null
  const plants = growth ? gardenPlants(growth) : []
  if (!type || !growth || plants.length === 0) return null

  // Framed on the grown garden, so the page does not move as it grows.
  const grown = gardenAt(plants, GARDEN_YEARS, 0.6)
  const projection = terrainProjection(props, FRAME, grown.map((p) => [p.lng, p.lat]))
  if (!projection) return null
  const [atlases] = await Promise.all([loadAtlases(), fontsReady()])
  const c = colors()

  const canvas = document.createElement('canvas')
  canvas.width = VIDEO_WIDTH
  canvas.height = VIDEO_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const facts = [props.map.areaM2 ? formatArea(props.map.areaM2) : null, props.map.locality || props.map.regionName].filter(Boolean) as string[]
  const paint = (seconds: number) => {
    const { year, f } = videoMoment(seconds)
    ctx.fillStyle = c.paper
    ctx.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT)
    drawTerrain(ctx, props, FRAME, projection, gardenAt(plants, year, f), atlases, c, { scaleY: FRAME.y + FRAME.h + 10, scaleFont: 28 })
    words(ctx, c, props.title, facts, growth.origin, year, f, url)
  }

  const stream = canvas.captureStream(FPS)
  const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data)
  const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()))

  paint(0)
  recorder.start(1000)
  await new Promise<void>((resolve) => {
    const start = performance.now()
    const step = (now: number) => {
      const seconds = (now - start) / 1000
      paint(Math.min(seconds, VIDEO_DURATION))
      onProgress?.(Math.min(1, seconds / VIDEO_DURATION))
      if (seconds >= VIDEO_DURATION) resolve()
      else requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  })
  recorder.stop()
  await stopped
  stream.getTracks().forEach((track) => track.stop())
  const mime = type.split(';')[0]
  return { blob: new Blob(chunks, { type: mime }), extension: mime === 'video/mp4' ? 'mp4' : 'webm' }
}

/** The words of the page: title and facts at the top, the year below the terrain, the address at the foot. */
function words(ctx: CanvasRenderingContext2D, c: Colors, title: string, facts: string[], origin: string, year: number, f: number, url: string) {
  const left = 80
  const width = VIDEO_WIDTH - 2 * left
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillStyle = c.prune
  ctx.font = '600 34px "Inter Variable", sans-serif'
  ctx.fillText(t('public_maps.preview.kicker'), left, 150)

  ctx.fillStyle = c.ink
  ctx.font = '600 88px "EB Garamond Variable", Georgia, serif'
  const lines = wrap(ctx, title, width, 2)
  lines.forEach((line, i) => ctx.fillText(line, left, 260 + i * 92))
  if (facts.length) {
    ctx.fillStyle = c.muted
    ctx.font = '400 40px "Inter Variable", sans-serif'
    ctx.fillText(facts.join(' · '), left, 260 + (lines.length - 1) * 92 + 76)
  }

  // The year in handwriting, the garden's age and the season.
  const shown = Math.floor(year)
  const age = shown === 0 ? t('public_maps.video.planted') : t('public_maps.video.year_n', { count: shown })
  ctx.save()
  ctx.translate(left, 1660)
  ctx.rotate(-0.03)
  ctx.fillStyle = c.hand
  ctx.font = '500 132px "Caveat Variable", cursive'
  const yearText = String(calendarYear(origin, shown))
  ctx.fillText(yearText, 0, 0)
  const yearWidth = ctx.measureText(yearText).width
  ctx.font = '500 64px "Caveat Variable", cursive'
  ctx.fillText(`${age} · ${t(`public_maps.garden.seasons.${seasonOf(f)}`).toLowerCase()}`, yearWidth + 36, -8)
  ctx.restore()

  // The thirty years as a pencil line, with the moment on it.
  const x0 = left
  const x1 = VIDEO_WIDTH - left
  const y = 1730
  pencil(ctx, [[[x0, y], [x1, y]]], c.muted, 2)
  ;[0, 5, 15, 30].forEach((tick) => {
    const x = x0 + ((x1 - x0) * tick) / GARDEN_YEARS
    pencil(ctx, [[[x, y - 10], [x, y + 10]]], c.muted, 2)
  })
  ctx.fillStyle = c.leaf
  ctx.beginPath()
  ctx.arc(x0 + ((x1 - x0) * year) / GARDEN_YEARS, y, 14, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = c.prune
  ctx.font = '600 40px "Inter Variable", sans-serif'
  ctx.fillText(`${t('public_maps.video.cta')} →`, left, 1812)
  ctx.fillStyle = c.muted
  ctx.font = '400 30px "Inter Variable", sans-serif'
  ctx.fillText(wrap(ctx, url, width, 1)[0], left, 1862)
  ctx.textAlign = 'left'
}
