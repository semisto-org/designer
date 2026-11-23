import type { Feature, FeatureCollection, LineString, Point } from 'geojson'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import { pastilleRadius, spreadNumbers } from './numberLayout.ts'

/** The numbered pastilles (« Numéro » mode) and the leader lines of those that stepped aside. */
export const NUMBERS_SOURCE = 'plant-numbers'
export const LEADERS_SOURCE = 'plant-number-leaders'

/** Below this zoom the pastilles are small dots: they stay on their plants. */
const SPREAD_FROM_ZOOM = 15

/** A pastille's properties: `ax`/`ay` keep the plant's own point while the pastille may sit beside it. */
type NumberProps = { featureId: number; number: string; color: string; planted: boolean; ax?: number; ay?: number }

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }

/** The plant's own point of a pastille, wherever it was moved to. */
function anchorOf(feature: Feature<Point, NumberProps>): [number, number] {
  const { ax, ay } = feature.properties
  return typeof ax === 'number' && typeof ay === 'number' ? [ax, ay] : (feature.geometry.coordinates as [number, number])
}

/**
 * Lays the pastilles out for the map's current zoom: those that would touch
 * step aside, a leader line back to their plant. `numbers` are the pastilles
 * on their plants (or as last laid out: their `ax`/`ay` are read back);
 * `leaveOut`: plants not drawn (a hidden strata, a draft in the print), which
 * must not push the others aside.
 */
export function spreadPlantNumbers(map: MapLibreMap, numbers: FeatureCollection<Point, NumberProps>, leaveOut: ReadonlySet<number> = new Set()) {
  const source = map.getSource(NUMBERS_SOURCE) as GeoJSONSource | undefined
  const leaders = map.getSource(LEADERS_SOURCE) as GeoJSONSource | undefined
  if (!source) return
  const features = numbers.features.filter((f) => !leaveOut.has(f.properties.featureId))
  const zoom = map.getZoom()
  if (zoom < SPREAD_FROM_ZOOM || features.length < 2) {
    source.setData({ ...numbers, features: numbers.features.map((f) => ({ ...f, geometry: { type: 'Point', coordinates: anchorOf(f) } })) })
    leaders?.setData(EMPTY)
    return
  }
  // By number: the first of a cluster keeps its place.
  const ordered = [...features].sort((a, b) => Number(a.properties.number) - Number(b.properties.number) || a.properties.featureId - b.properties.featureId)
  const anchors = ordered.map((f) => anchorOf(f))
  const placed = spreadNumbers(
    ordered.map((_, i) => {
      const p = map.project(anchors[i])
      return { id: i, x: p.x, y: p.y }
    }),
    pastilleRadius(zoom),
  )
  const spread: Feature<Point, NumberProps>[] = []
  const lines: Feature<LineString, { featureId: number; color: string; planted: boolean }>[] = []
  placed.forEach((place, i) => {
    const feature = ordered[i]
    const [ax, ay] = anchors[i]
    const at = place.moved ? map.unproject([place.x, place.y]).toArray() : [ax, ay]
    spread.push({ ...feature, geometry: { type: 'Point', coordinates: at }, properties: { ...feature.properties, ax, ay } })
    if (place.moved) {
      const { featureId, color, planted } = feature.properties
      lines.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[ax, ay], at] }, properties: { featureId, color, planted } })
    }
  })
  source.setData({ type: 'FeatureCollection', features: spread })
  leaders?.setData({ type: 'FeatureCollection', features: lines })
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
