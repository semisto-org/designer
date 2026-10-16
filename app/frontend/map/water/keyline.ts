// Keyline design (P.A. Yeomans): the keypoints of the valleys, the keyline
// through each, and the lines parallel to it. Pure helpers shared by the
// « Eau et relief » panel and the inspector of a keyline.

import type { Geometry, LineString } from 'geojson'

/** GET /maps/:id/relief/keypoints (Relief::Keypoints). */
export type Keypoint = {
  lng: number
  lat: number
  elevationM: number
  slopeAbovePct: number
  slopeBelowPct: number
  catchmentM2: number
  valley: LineString
  keyline: { geometry: Geometry; elevationM: number; lengthM: number; closed: boolean } | null
}

export type KeypointsResult = { keypoints: Keypoint[]; cellSizeM: number; minCatchmentM2: number }

/** GET /maps/:id/relief/parallels (Relief::Parallels). */
export type ParallelLine = { geometry: Geometry; offsetM: number; side: 'above' | 'below'; rank: number; lengthM: number; fallM: number | null }

export type KeylineUse = 'swale' | 'trees' | 'subsoiling'

export const MAX_PER_SIDE = 10

/** Usual spacing between parallels, in metres, for each use. */
export const DEFAULT_SPACING: Record<KeylineUse, number> = { swale: 20, trees: 12, subsoiling: 3 }

export function useOf(value: unknown): KeylineUse {
  return value === 'trees' || value === 'subsoiling' ? value : 'swale'
}

export function totalLength(lines: ParallelLine[]): number {
  return lines.reduce((sum, line) => sum + line.lengthM, 0)
}

/**
 * Properties of a parallel created from a keyline: the same use and, for a
 * swale, the same section.
 */
export function parallelProperties(source: Record<string, unknown>): Record<string, unknown> {
  const use = useOf(source.use)
  const props: Record<string, unknown> = { role: 'parallel', use }
  if (use === 'swale') {
    if (source.width_m != null) props.width_m = source.width_m
    if (source.depth_m != null) props.depth_m = source.depth_m
  }
  return props
}

/** Clamp a typed count of lines per side. */
export function clampCount(value: string | number): number {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.min(MAX_PER_SIDE, Math.max(0, n)) : 0
}
