import type { Polygon } from 'geojson'
import type { jsPDF as JsPDF } from 'jspdf'
import * as maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl'
import { formatArea, formatNumber, t } from '@/lib/i18n'
import { DESIGN_LAYERS, elementFor, featureColor, layerColor } from '@/map/drawing/catalog'
import { drawIcon } from '@/map/drawing/icons'
import { applyLayerVisibility, installDrawingImages, TRANSIENT_PREFIX } from '@/map/drawing/style'
import type { MapFeature } from '@/types'

/**
 * Plan at scale, made in the browser: the current map (base layers, overlays
 * and the visible design layers) is rendered again offscreen at the exact
 * ground resolution of the chosen scale, then laid out with jsPDF on A4/A3
 * with a title block, legend, scale bar, north arrow and sources.
 *
 * Scale: one CSS pixel is 1/96 inch on paper, so at 1:N it covers
 * N × 0.0254 / 96 meters; MapLibre (512 px tiles, Web Mercator) shows
 * 40 075 016.686 × cos(latitude) / (512 × 2^zoom) meters per CSS pixel at
 * the centre of the map, which gives the zoom. The offscreen canvas uses a
 * pixel ratio of DPI / 96 so symbols keep their on-screen size on paper.
 */
export type Paper = 'A4' | 'A3'
export type Orientation = 'portrait' | 'landscape'

export const SCALES = [100, 200, 250, 500, 1000, 2000, 2500]
const NICE_SCALES = [100, 200, 250, 500, 750, 1000, 1250, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000, 15000, 20000, 25000, 50000]
const PAPER_MM: Record<Paper, [number, number]> = { A4: [210, 297], A3: [297, 420] }
const EARTH_CIRCUMFERENCE = 40075016.686
const CSS_DPI = 96
export const PRINT_DPI = 200
const MAX_CANVAS_PX = 4096
const RENDER_TIMEOUT_MS = 30_000

type Box = { x: number; y: number; w: number; h: number }
export type Layout = { width: number; height: number; frame: Box; cartouche: Box }

export function pageLayout(paper: Paper, orientation: Orientation): Layout {
  const [short, long] = PAPER_MM[paper]
  const [width, height] = orientation === 'portrait' ? [short, long] : [long, short]
  const margin = 10
  const cartoucheHeight = paper === 'A3' ? 44 : 36
  const frame = { x: margin, y: margin, w: width - 2 * margin, h: height - 2 * margin - cartoucheHeight - 4 }
  return { width, height, frame, cartouche: { x: margin, y: frame.y + frame.h + 4, w: frame.w, h: cartoucheHeight } }
}

export const mmToCss = (mm: number) => (mm / 25.4) * CSS_DPI
export const metersPerCssPixel = (scale: number) => (scale * 0.0254) / CSS_DPI

export function zoomForScale(scale: number, latitude: number): number {
  return Math.log2((EARTH_CIRCUMFERENCE * Math.cos((latitude * Math.PI) / 180)) / (512 * metersPerCssPixel(scale)))
}

export function scaleForZoom(zoom: number, latitude: number): number {
  const mpp = (EARTH_CIRCUMFERENCE * Math.cos((latitude * Math.PI) / 180)) / (512 * 2 ** zoom)
  return (mpp * CSS_DPI) / 0.0254
}

/** The smallest usual scale at which these bounds fit in the frame. */
export function fitScale(bounds: [number, number, number, number], frame: Box): number {
  const [w, s, e, n] = bounds
  const sw = maplibregl.MercatorCoordinate.fromLngLat([w, s])
  const ne = maplibregl.MercatorCoordinate.fromLngLat([e, n])
  const dx = Math.max(Math.abs(ne.x - sw.x), 1e-12)
  const dy = Math.max(Math.abs(sw.y - ne.y), 1e-12)
  const zoom = Math.log2(Math.min(mmToCss(frame.w) / (dx * 512), mmToCss(frame.h) / (dy * 512)))
  const exact = scaleForZoom(zoom, (s + n) / 2) * 1.06
  return NICE_SCALES.find((scale) => scale >= exact) ?? Math.ceil(exact / 10_000) * 10_000
}

/** Ground footprint (lon/lat) of the frame printed around `center`. */
export function frameGeometry(center: [number, number], scale: number, frame: Box): Polygon {
  const zoom = zoomForScale(scale, center[1])
  const c = maplibregl.MercatorCoordinate.fromLngLat(center)
  const world = 512 * 2 ** zoom
  const hx = mmToCss(frame.w) / 2 / world
  const hy = mmToCss(frame.h) / 2 / world
  const corner = (x: number, y: number) => {
    const p = new maplibregl.MercatorCoordinate(x, y).toLngLat()
    return [p.lng, p.lat]
  }
  const ring = [corner(c.x - hx, c.y - hy), corner(c.x + hx, c.y - hy), corner(c.x + hx, c.y + hy), corner(c.x - hx, c.y + hy)]
  return { type: 'Polygon', coordinates: [[...ring, ring[0]]] }
}

export const groundSize = (scale: number, frame: Box) => ({ width: (frame.w / 1000) * scale, height: (frame.h / 1000) * scale })

/** A round scale bar length no longer than `maxMm` on paper. */
export function scaleBar(scale: number, maxMm: number): { meters: number; mm: number } {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000]
  let best = { meters: steps[0], mm: (steps[0] * 1000) / scale }
  for (const meters of steps) {
    const mm = (meters * 1000) / scale
    if (mm <= maxMm) best = { meters, mm }
  }
  return best
}

// --- Offscreen rendering -----------------------------------------------------

function waitFor(map: MapLibreMap, event: 'load' | 'idle'): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, RENDER_TIMEOUT_MS)
    map.once(event, () => {
      window.clearTimeout(timer)
      resolve()
    })
  })
}

/** The editor's style without its drawing tools (Terra Draw, measures, frame). */
function printableStyle(source: MapLibreMap): StyleSpecification {
  const style = source.getStyle()
  const skip = (id: string) => id.startsWith('td-') || id.startsWith(TRANSIENT_PREFIX)
  return {
    ...style,
    layers: style.layers.filter((layer) => !skip(layer.id) && !('source' in layer && typeof layer.source === 'string' && skip(layer.source))),
    sources: Object.fromEntries(Object.entries(style.sources).filter(([id]) => !skip(id))),
  }
}

/** Sources credited on the plan: those of the layers that will be visible. */
export function attributions(source: MapLibreMap): string[] {
  const style = source.getStyle()
  const used = new Set(
    style.layers
      .filter((l) => 'source' in l && l.layout?.visibility !== 'none')
      .map((l) => (l as { source: string }).source),
  )
  const texts = Object.entries(style.sources)
    .filter(([id, s]) => used.has(id) && 'attribution' in s && s.attribution)
    .map(([, s]) => new DOMParser().parseFromString(String((s as { attribution: string }).attribution), 'text/html').body.textContent?.trim() ?? '')
  return [...new Set(texts.filter(Boolean))]
}

type RenderOptions = { center: [number, number]; scale: number; frame: Box; hiddenLayers: string[] }

export async function renderMap(source: MapLibreMap, { center, scale, frame, hiddenLayers }: RenderOptions): Promise<string> {
  const widthCss = Math.round(mmToCss(frame.w))
  const heightCss = Math.round(mmToCss(frame.h))
  const pixelRatio = Math.min(PRINT_DPI / CSS_DPI, MAX_CANVAS_PX / Math.max(widthCss, heightCss))
  const container = document.createElement('div')
  Object.assign(container.style, { position: 'fixed', left: '-20000px', top: '0', width: `${widthCss}px`, height: `${heightCss}px` })
  document.body.appendChild(container)
  const map = new maplibregl.Map({
    container,
    style: printableStyle(source),
    center,
    zoom: zoomForScale(scale, center[1]),
    bearing: 0,
    pitch: 0,
    interactive: false,
    attributionControl: false,
    pixelRatio,
    fadeDuration: 0,
    maxZoom: 24,
    canvasContextAttributes: { preserveDrawingBuffer: true },
  })
  try {
    installDrawingImages(map, source)
    await waitFor(map, 'load')
    applyLayerVisibility(map, hiddenLayers, { activeOnly: true })
    await waitFor(map, 'idle')
    return map.getCanvas().toDataURL('image/jpeg', 0.92)
  } finally {
    map.remove()
    container.remove()
  }
}

// --- Legend ------------------------------------------------------------------

export type LegendEntry = { key: string; label: string; color: string; geometry: 'Point' | 'LineString' | 'Polygon'; dash?: number[]; icon?: string }

/** One entry per kind drawn on the visible layers, in design layer order. */
export function legendEntries(features: MapFeature[], hiddenLayers: string[], withBoundary: boolean): LegendEntry[] {
  const entries: LegendEntry[] = withBoundary
    ? [{ key: 'boundary', label: t('drawing.pdf.boundary'), color: '#5b5781', geometry: 'LineString', dash: [3, 2] }]
    : []
  const seen = new Set<string>()
  const visible = features.filter((f) => f.properties.status === 'active' && !hiddenLayers.includes(f.properties.layer))
  for (const layer of DESIGN_LAYERS) {
    for (const feature of visible.filter((f) => f.properties.layer === layer)) {
      const kind = feature.properties.kind
      const color = featureColor(feature)
      const key = `${kind}:${color}`
      if (seen.has(key)) continue
      seen.add(key)
      const spec = elementFor(kind)
      const type = feature.geometry.type.replace('Multi', '') as LegendEntry['geometry']
      entries.push({
        key,
        label: t(`editor.kinds.${kind}`),
        color: spec || feature.properties.style?.color ? color : layerColor(layer),
        geometry: type,
        dash: spec?.line?.dash,
        icon: spec?.icon,
      })
    }
  }
  return entries
}

// --- PDF ---------------------------------------------------------------------

/** Standard PDF fonts are Latin-1: replace typographic characters they lack. */
export function pdfText(text: string): string {
  return text
    .replace(/[   ]/g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/³/g, '3')
    .replace(/[^\u0000-ÿ]/g, '')
}

function badge(color: string, icon: string): string {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2)
  ctx.fillStyle = color === '#ffffff' ? '#1b1712' : color
  ctx.fill()
  ctx.lineWidth = 4
  ctx.strokeStyle = '#ffffff'
  ctx.stroke()
  drawIcon(ctx, icon, size * 0.22, size * 0.22, size * 0.56, '#ffffff', 2.5)
  return canvas.toDataURL('image/png')
}

/** A lighter tint of a colour, to stand for a translucent fill on paper. */
function tint(hex: string, amount = 0.65): string {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * amount)
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => mix(c).toString(16).padStart(2, '0')).join('')}`
}

function drawLegendSwatch(doc: JsPDF, entry: LegendEntry, x: number, y: number) {
  doc.setLineDashPattern([], 0)
  if (entry.geometry === 'Polygon') {
    doc.setFillColor(tint(entry.color))
    doc.setDrawColor(entry.color)
    doc.setLineWidth(0.35)
    doc.rect(x, y - 1.6, 6, 3.2, 'FD')
  } else if (entry.geometry === 'LineString') {
    doc.setDrawColor(entry.color === '#ffffff' ? '#1b1712' : entry.color)
    doc.setLineWidth(0.7)
    // Dashes are in line widths, as in MapLibre.
    if (entry.dash) doc.setLineDashPattern(entry.dash.map((d) => d * 0.7), 0)
    doc.line(x, y, x + 6, y)
    doc.setLineDashPattern([], 0)
  } else if (entry.icon) {
    doc.addImage(badge(entry.color, entry.icon), 'PNG', x + 1.2, y - 1.8, 3.6, 3.6)
  } else {
    doc.setFillColor(entry.color)
    doc.circle(x + 3, y, 1.4, 'F')
  }
}

function drawNorthArrow(doc: JsPDF, cx: number, cy: number) {
  doc.setLineDashPattern([], 0)
  doc.setFillColor('#ffffff')
  doc.setDrawColor('#1b1712')
  doc.setLineWidth(0.3)
  doc.circle(cx, cy, 6.5, 'FD')
  doc.setFillColor('#1b1712')
  doc.triangle(cx, cy - 4.2, cx - 2.2, cy + 3.2, cx, cy + 1.8, 'F')
  doc.triangle(cx, cy - 4.2, cx + 2.2, cy + 3.2, cx, cy + 1.8, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.setTextColor('#1b1712')
  doc.text(t('drawing.pdf.north'), cx, cy - 4.8, { align: 'center' })
}

function drawScaleBar(doc: JsPDF, scale: number, x: number, y: number, maxMm: number) {
  const bar = scaleBar(scale, maxMm)
  const segment = bar.mm / 4
  doc.setLineDashPattern([], 0)
  doc.setLineWidth(0.25)
  doc.setDrawColor('#1b1712')
  for (let i = 0; i < 4; i++) {
    doc.setFillColor(i % 2 === 0 ? '#1b1712' : '#ffffff')
    doc.rect(x + i * segment, y, segment, 1.6, 'FD')
  }
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor('#1b1712')
  doc.text('0', x, y + 4.4, { align: 'center' })
  doc.text(pdfText(formatNumber(bar.meters / 2)), x + bar.mm / 2, y + 4.4, { align: 'center' })
  doc.text(pdfText(`${formatNumber(bar.meters)} m`), x + bar.mm, y + 4.4, { align: 'center' })
}

export type PdfInput = {
  title: string
  paper: Paper
  orientation: Orientation
  scale: number
  center: [number, number]
  hiddenLayers: string[]
  author: string | null
  areaM2: number | null
  legend: LegendEntry[]
  sources: string[]
}

/** Renders the map and writes the PDF; resolves with the file name. */
export async function exportPdf(source: MapLibreMap, input: PdfInput, onProgress?: (step: 'map' | 'pdf') => void): Promise<string> {
  const layout = pageLayout(input.paper, input.orientation)
  const { frame, cartouche: cart } = layout
  onProgress?.('map')
  const image = await renderMap(source, { center: input.center, scale: input.scale, frame, hiddenLayers: input.hiddenLayers })
  onProgress?.('pdf')
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: input.orientation, unit: 'mm', format: input.paper.toLowerCase(), compress: true })
  const big = input.paper === 'A3'
  doc.setProperties({ title: pdfText(input.title), creator: 'Semisto Designer', author: pdfText(input.author ?? '') })

  // Map and frame.
  doc.addImage(image, 'JPEG', frame.x, frame.y, frame.w, frame.h, undefined, 'FAST')
  doc.setDrawColor('#1b1712')
  doc.setLineWidth(0.35)
  doc.rect(frame.x, frame.y, frame.w, frame.h, 'S')
  drawNorthArrow(doc, frame.x + frame.w - 11, frame.y + 11)

  // Sources, bottom right of the map.
  if (input.sources.length) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(5.5)
    const text = pdfText(`${t('drawing.pdf.sources')} : ${input.sources.join(' · ')}`)
    const lines: string[] = doc.splitTextToSize(text, frame.w * 0.6)
    const height = lines.length * 2.3 + 1.6
    const width = Math.max(...lines.map((l) => doc.getTextWidth(l))) + 3
    doc.setFillColor('#ffffff')
    doc.rect(frame.x + frame.w - width - 0.2, frame.y + frame.h - height - 0.2, width, height, 'F')
    doc.setTextColor('#423a30')
    doc.text(lines, frame.x + frame.w - width + 1.3, frame.y + frame.h - height + 2.1)
  }

  // Title block.
  doc.setLineWidth(0.3)
  doc.rect(cart.x, cart.y, cart.w, cart.h, 'S')
  const c1 = cart.w * 0.36
  const c3 = Math.max(cart.w * 0.2, 42)
  const c2 = cart.w - c1 - c3
  doc.line(cart.x + c1, cart.y, cart.x + c1, cart.y + cart.h)
  doc.line(cart.x + c1 + c2, cart.y, cart.x + c1 + c2, cart.y + cart.h)

  let y = cart.y + (big ? 8 : 7)
  doc.setTextColor('#1b1712')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(big ? 15 : 12)
  const titleLines: string[] = doc.splitTextToSize(pdfText(input.title), c1 - 8)
  doc.text(titleLines.slice(0, 2), cart.x + 4, y)
  y += (big ? 6 : 5) * Math.min(titleLines.length, 2) + 0.5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(big ? 8.5 : 7.5)
  doc.setTextColor('#332d25')
  const date = new Intl.DateTimeFormat('fr-BE', { dateStyle: 'long' }).format(new Date())
  const facts = [
    `${t('drawing.pdf.date')} : ${date}`,
    input.author ? `${t('drawing.pdf.author')} : ${input.author}` : null,
    input.areaM2 ? `${t('drawing.pdf.area')} : ${formatArea(input.areaM2)}` : null,
  ].filter((v): v is string => Boolean(v))
  facts.forEach((fact, i) => doc.text(pdfText(fact), cart.x + 4, y + i * (big ? 4.2 : 3.6)))
  doc.setFontSize(6)
  doc.setTextColor('#6e6355')
  doc.text(pdfText(t('drawing.pdf.made_with')), cart.x + 4, cart.y + cart.h - 3)

  // Legend.
  const lx = cart.x + c1 + 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(big ? 8.5 : 7.5)
  doc.setTextColor('#1b1712')
  doc.text(pdfText(t('drawing.pdf.legend')), lx, cart.y + 6)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(big ? 7.5 : 6.5)
  const rowHeight = big ? 4.6 : 4
  const rows = Math.max(1, Math.floor((cart.h - 11) / rowHeight))
  const columns = Math.max(1, Math.floor((c2 - 6) / 40))
  const capacity = rows * columns
  const shown = input.legend.length > capacity ? input.legend.slice(0, capacity - 1) : input.legend
  const columnWidth = (c2 - 6) / columns
  shown.forEach((entry, i) => {
    const x = lx + Math.floor(i / rows) * columnWidth
    const ey = cart.y + 11 + (i % rows) * rowHeight
    drawLegendSwatch(doc, entry, x, ey - 1)
    doc.setTextColor('#332d25')
    const label: string[] = doc.splitTextToSize(pdfText(entry.label), columnWidth - 9)
    doc.text(label[0] ?? '', x + 8, ey)
  })
  if (shown.length < input.legend.length) {
    const i = shown.length
    doc.setTextColor('#6e6355')
    doc.text(pdfText(t('drawing.pdf.more', { count: input.legend.length - shown.length })), lx + Math.floor(i / rows) * columnWidth + 8, cart.y + 11 + (i % rows) * rowHeight)
  }

  // Scale.
  const sx = cart.x + c1 + c2 + 5
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(big ? 11 : 9.5)
  doc.setTextColor('#1b1712')
  doc.text(pdfText(t('drawing.pdf.scale_label', { scale: formatNumber(input.scale) })), sx, cart.y + (big ? 9 : 8))
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor('#6e6355')
  doc.text(pdfText(`${input.paper} ${t(`drawing.pdf.${input.orientation}`).toLowerCase()}`), sx, cart.y + (big ? 13 : 11.5))
  drawScaleBar(doc, input.scale, sx + 1, cart.y + cart.h - (big ? 14 : 12), c3 - 12)

  const fileName = `${slug(input.title) || 'plan'}-1-${input.scale}.pdf`
  doc.save(fileName)
  return fileName
}

function slug(text: string) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
}
