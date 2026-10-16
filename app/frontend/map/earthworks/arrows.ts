/**
 * Arrows of the earthworks on the map: from each hole to the mound, bed or
 * zone that receives its soil, a hand-drawn curve the colour of earth, an
 * arrowhead, and the volume halfway. Pure geometry here (tested), MapLibre
 * plumbing in EarthworksOverlay.
 */
import type { Feature, FeatureCollection, LineString, Point } from 'geojson'

export type ArrowInput = { from: [number, number]; to: [number, number]; volume: number; label: string }
export type ArrowProps = { label: string; bearing: number; role: 'line' | 'head' | 'label' }

const STEPS = 24
/** How far the curve bows out, as a share of its length: a gentle hand gesture. */
const BOW = 0.18

/**
 * A quadratic curve from `from` to `to`, bowed to the left of the travel
 * direction, computed in a local metric frame (longitude scaled by the
 * cosine of the latitude) so it keeps its shape away from the equator.
 */
export function arrowCurve(from: [number, number], to: [number, number]): [number, number][] {
  const k = Math.cos(((from[1] + to[1]) / 2) * (Math.PI / 180)) || 1
  const ax = from[0] * k, ay = from[1]
  const bx = to[0] * k, by = to[1]
  const dx = bx - ax, dy = by - ay
  const cx = (ax + bx) / 2 - dy * BOW
  const cy = (ay + by) / 2 + dx * BOW
  const points: [number, number][] = []
  for (let i = 0; i <= STEPS; i++) {
    const s = i / STEPS
    const x = (1 - s) ** 2 * ax + 2 * (1 - s) * s * cx + s ** 2 * bx
    const y = (1 - s) ** 2 * ay + 2 * (1 - s) * s * cy + s ** 2 * by
    points.push([x / k, y])
  }
  return points
}

/** Compass bearing (degrees, clockwise from north) from a to b, in the same local frame. */
export function bearing(a: [number, number], b: [number, number]): number {
  const k = Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180)) || 1
  const angle = (Math.atan2((b[0] - a[0]) * k, b[1] - a[1]) * 180) / Math.PI
  return (angle + 360) % 360
}

/** The GeoJSON of all arrows: one curve, one head and one label each. Same start and end: no arrow. */
export function arrowsToGeoJSON(arrows: ArrowInput[]): FeatureCollection<LineString | Point, ArrowProps> {
  const features: Feature<LineString | Point, ArrowProps>[] = []
  for (const arrow of arrows) {
    if (arrow.from[0] === arrow.to[0] && arrow.from[1] === arrow.to[1]) continue
    const curve = arrowCurve(arrow.from, arrow.to)
    const end = curve[curve.length - 1]
    features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: curve }, properties: { label: '', bearing: 0, role: 'line' } })
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: end }, properties: { label: '', bearing: bearing(curve[curve.length - 2], end), role: 'head' } })
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: curve[STEPS / 2] }, properties: { label: arrow.label, bearing: 0, role: 'label' } })
  }
  return { type: 'FeatureCollection', features }
}
