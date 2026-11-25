import type { Feature, FeatureCollection, LineString, Point } from 'geojson'
import type { GeoJSONSource, Map as MapLibreMap, StyleImageMetadata } from 'maplibre-gl'
import { layoutNumbers, pastilleRadius } from './numberLayout.ts'
import { inkOn } from './strataColors.ts'

/** The numbered pastilles and cluster pills (« Numéro » mode), and the leader lines of those that stepped aside. */
export const NUMBERS_SOURCE = 'plant-numbers'
export const LEADERS_SOURCE = 'plant-number-leaders'
export const CLUSTER_LAYER = 'plant-numbers-cluster'

/** The ink of a cluster that mixes strata: no colour would be true. */
const MIXED = '#4a4036'
const PLANNED_INK = '#1b1712'

/**
 * A pastille's properties: `ax`/`ay` keep the plant's own point while the
 * pastille may sit beside it; `clustered`: held by a cluster pill, not drawn.
 * A pill has `cluster` set, the plants it holds (`bounds`, `count`) and the
 * image of its background (`pill`).
 */
type NumberProps = {
  featureId: number; number: string; color: string; ink?: string; planted: boolean; selected?: boolean
  ax?: number; ay?: number; clustered?: boolean
  cluster?: boolean; pill?: string; count?: number; bounds?: string
}

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }

/** The plant's own point of a pastille, wherever it was moved to. */
function anchorOf(feature: Feature<Point, NumberProps>): [number, number] {
  const { ax, ay } = feature.properties
  return typeof ax === 'number' && typeof ay === 'number' ? [ax, ay] : (feature.geometry.coordinates as [number, number])
}

const PIXEL_RATIO = 2
const RADIUS = 20 // device pixels: a full pill at the cluster's text size
const SIZE = RADIUS * 2 + 2
const BORDER = 3 // device pixels

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)]
}

/** A stretchable pill: `fill` inside a `border` ring, anti-aliased, as the pastille's disc and ring. */
function pillImage(fill: string, border: string): { width: number; height: number; data: Uint8Array } & Partial<StyleImageMetadata> {
  const data = new Uint8Array(SIZE * SIZE * 4)
  const [fr, fg, fb] = rgb(fill)
  const [br, bg, bb] = rgb(border)
  const samples = 4
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let outer = 0
      let inner = 0
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const px = x + (sx + 0.5) / samples
          const py = y + (sy + 0.5) / samples
          const cx = Math.min(Math.max(px, RADIUS + 1), SIZE - RADIUS - 1)
          const cy = Math.min(Math.max(py, RADIUS + 1), SIZE - RADIUS - 1)
          const d = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2)
          if (d <= RADIUS) outer++
          if (d <= RADIUS - BORDER) inner++
        }
      }
      const n = samples * samples
      const a = outer / n
      const f = a > 0 ? inner / outer : 0
      const i = (y * SIZE + x) * 4
      data[i] = Math.round(fr * f + br * (1 - f))
      data[i + 1] = Math.round(fg * f + bg * (1 - f))
      data[i + 2] = Math.round(fb * f + bb * (1 - f))
      data[i + 3] = Math.round(255 * a)
    }
  }
  return {
    width: SIZE,
    height: SIZE,
    data,
    pixelRatio: PIXEL_RATIO,
    stretchX: [[RADIUS, SIZE - RADIUS]],
    stretchY: [[RADIUS, SIZE - RADIUS]],
    content: [RADIUS / 2, RADIUS / 2, SIZE - RADIUS / 2, SIZE - RADIUS / 2],
  }
}

/** The pill of a cluster: filled in its strata colour once all are in the ground, white with a coloured ring otherwise (as the pastilles). */
function ensurePill(map: MapLibreMap, color: string, planted: boolean): string {
  const id = `plant-numbers-pill-${color.replace('#', '')}-${planted ? 'in' : 'out'}`
  if (!map.hasImage(id)) {
    const { width, height, data, ...options } = planted ? pillImage(color, '#ffffff') : pillImage('#ffffff', color)
    map.addImage(id, { width, height, data }, options)
  }
  return id
}

/**
 * Lays the pastilles out for the map's current zoom (map/plants/numberLayout):
 * alone on its point, stepped aside by one pastille for two or three
 * touching plants, or held in one cluster pill for more. `numbers` are the
 * pastilles on their plants (or as last laid out: their `ax`/`ay` are read
 * back, the pills dropped); `leaveOut`: plants not drawn (a hidden strata,
 * a draft in the print), which must not join a cluster.
 */
export function spreadPlantNumbers(map: MapLibreMap, numbers: FeatureCollection<Point, NumberProps>, leaveOut: ReadonlySet<number> = new Set()) {
  const source = map.getSource(NUMBERS_SOURCE) as GeoJSONSource | undefined
  const leaders = map.getSource(LEADERS_SOURCE) as GeoJSONSource | undefined
  if (!source) return
  const all = numbers.features
    .filter((f) => !f.properties.cluster)
    .map((f) => ({ ...f, geometry: { type: 'Point', coordinates: anchorOf(f) } as Point, properties: { ...f.properties, clustered: false } }))
  const shown = all.filter((f) => !leaveOut.has(f.properties.featureId))
  const kept = all.filter((f) => leaveOut.has(f.properties.featureId))
  const zoom = map.getZoom()
  const points = shown.map((f, i) => {
    const p = map.project(f.geometry.coordinates as [number, number])
    return { id: i, x: p.x, y: p.y, number: Number(f.properties.number) || 0, selected: !!f.properties.selected }
  })
  const { placements, clusters } = layoutNumbers(points, pastilleRadius(zoom))

  const out: Feature<Point, NumberProps>[] = [...kept]
  const lines: Feature<LineString, { featureId: number; color: string; planted: boolean }>[] = []
  for (const place of placements) {
    const feature = shown[place.id]
    const [ax, ay] = feature.geometry.coordinates as [number, number]
    const at = place.moved ? map.unproject([place.x, place.y]).toArray() : [ax, ay]
    out.push({ ...feature, geometry: { type: 'Point', coordinates: at }, properties: { ...feature.properties, ax, ay } })
    if (place.moved) {
      const { featureId, color, planted } = feature.properties
      lines.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[ax, ay], at] }, properties: { featureId, color, planted } })
    }
  }
  for (const cluster of clusters) {
    const members = cluster.ids.map((i) => shown[i])
    for (const m of members) out.push({ ...m, properties: { ...m.properties, clustered: true } })
    const colors = new Set(members.map((m) => m.properties.color))
    const color = colors.size === 1 ? members[0].properties.color : MIXED
    const planted = members.every((m) => m.properties.planted)
    const coordinates = members.map((m) => m.geometry.coordinates as [number, number])
    const lngs = coordinates.map((c) => c[0])
    const lats = coordinates.map((c) => c[1])
    out.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: map.unproject([cluster.x, cluster.y]).toArray() },
      properties: {
        featureId: -1, number: cluster.label, color, planted, cluster: true, count: members.length,
        ink: planted ? inkOn(color) : PLANNED_INK, pill: ensurePill(map, color, planted),
        bounds: JSON.stringify([Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)]),
      },
    })
  }
  source.setData({ type: 'FeatureCollection', features: out })
  leaders?.setData(lines.length ? { type: 'FeatureCollection', features: lines } : EMPTY)
}

/**
 * The pastilles of a map whose style was copied (the PDF plan): read from
 * the style, they are laid out again at the print's own zoom.
 */
export function respreadCopiedNumbers(map: MapLibreMap, leaveOut: ReadonlySet<number> = new Set()) {
  const style = map.getStyle().sources[NUMBERS_SOURCE] as { data?: unknown } | undefined
  const data = style?.data as FeatureCollection<Point, NumberProps> | undefined
  if (data && typeof data === 'object' && Array.isArray(data.features)) spreadPlantNumbers(map, data, leaveOut)
}

/** The plants a cluster pill holds, as [west, south, east, north], to zoom onto them. */
export function clusterBounds(properties: Record<string, unknown> | null | undefined): [number, number, number, number] | null {
  const raw = properties?.bounds
  if (typeof raw !== 'string') return null
  try {
    const b = JSON.parse(raw)
    return Array.isArray(b) && b.length === 4 && b.every((n) => typeof n === 'number') ? (b as [number, number, number, number]) : null
  } catch {
    return null
  }
}
