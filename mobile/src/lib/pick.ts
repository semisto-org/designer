// Which drawn feature a tap on the map means. MapLibre hands every feature
// under the finger (a 44 px box): a plant inside a zone comes with the
// zone, so points win over lines, and lines over areas.
type Tapped = { geometry?: { type?: string } | null; properties?: Record<string, unknown> | null }

const RANK: Record<string, number> = { Point: 0, MultiPoint: 0, LineString: 1, MultiLineString: 1, Polygon: 2, MultiPolygon: 2 }

export function pickFeatureId(features: Tapped[] | null | undefined): number | null {
  let best: { id: number; rank: number } | null = null
  for (const feature of features ?? []) {
    const id = Number(feature.properties?.fid)
    if (!Number.isFinite(id) || id === 0) continue
    const rank = RANK[feature.geometry?.type ?? ''] ?? 3
    if (!best || rank < best.rank) best = { id, rank }
  }
  return best?.id ?? null
}
