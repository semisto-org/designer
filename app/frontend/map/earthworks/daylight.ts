/**
 * The two lines where the talus of a graded terrace or profile meet the
 * natural ground, to stake out in the field: the top of the cut talus
 * (uphill) and the toe of the fill talus (downhill). The server computes
 * them on the relief (Relief::Grading, properties.grading.daylight); this
 * only turns them into map lines (EarthworksOverlay draws them, and the plan
 * at scale prints them with the map).
 */
import { bbox as turfBbox, bboxClip } from '@turf/turf'
import type { Feature, FeatureCollection, LineString, Polygon } from 'geojson'

export type DaylightRole = 'cut_top' | 'fill_toe' | 'base'
export type DaylightProps = { role: DaylightRole; id: number }

/** Earth tones: the top of the cut darker, the toe of the fill lighter. */
export const DAYLIGHT_COLORS = { cut_top: '#6b4426', fill_toe: '#a8825a', base: '#3f6b4a', label: '#4a3020', halo: '#ffffff' } as const

/** A plateau hung on a contour (« la courbe de base »): its level and the contour across the terrace. */
export type BaseContour = { level_m: number; lines: [number, number][][] }

/** How far the base contour runs beyond the terrace's outline (m), to stake it a little past each end. */
const BASE_MARGIN_M = 3

/** The contour through the clicked point, cut to the terrace (its box, a few metres wider). */
export function baseContour(contour: LineString, levelM: number, outline: Polygon): BaseContour {
  const [w, s, e, n] = turfBbox(outline)
  const dLat = BASE_MARGIN_M / 111_320
  const dLng = dLat / (Math.cos((((s + n) / 2) * Math.PI) / 180) || 1)
  const clipped = bboxClip({ type: 'Feature', geometry: contour, properties: {} }, [w - dLng, s - dLat, e + dLng, n + dLat]).geometry
  const parts = (clipped.type === 'LineString' ? [clipped.coordinates] : clipped.coordinates) as number[][][]
  const round = (v: number) => Math.round(v * 1e7) / 1e7
  return { level_m: Math.round(levelM * 100) / 100, lines: parts.filter((l) => l.length >= 2).map((l) => l.map((p) => [round(p[0]), round(p[1])] as [number, number])) }
}

/** The base contour still holds while the plateau sits at its level. */
export function activeBaseContour(props: Record<string, unknown>): [number, number][][] {
  const base = props.base_contour as Partial<BaseContour> | undefined
  if (!base || typeof base !== 'object' || props.hinge !== 'level') return []
  const level = typeof props.level_m === 'string' ? Number(props.level_m.replace(',', '.')) : props.level_m
  if (typeof level !== 'number' || typeof base.level_m !== 'number' || Math.abs(level - base.level_m) > 0.005) return []
  return lines(base.lines)
}

type Source = { id: number; properties: Record<string, unknown> }

function lines(value: unknown): [number, number][][] {
  if (!Array.isArray(value)) return []
  return value.filter((line): line is [number, number][] =>
    Array.isArray(line) && line.length >= 2 && line.every((p) => Array.isArray(p) && p.length >= 2 && p.every((v) => typeof v === 'number' && Number.isFinite(v))))
}

export function daylightToGeoJSON(features: Source[]): FeatureCollection<LineString, DaylightProps> {
  const out: Feature<LineString, DaylightProps>[] = []
  for (const feature of features) {
    for (const coordinates of activeBaseContour(feature.properties)) {
      out.push({ type: 'Feature', geometry: { type: 'LineString', coordinates }, properties: { role: 'base', id: feature.id } })
    }
    const grading = feature.properties.grading
    if (!grading || typeof grading !== 'object') continue
    const daylight = (grading as Record<string, unknown>).daylight
    if (!daylight || typeof daylight !== 'object') continue
    for (const role of ['cut_top', 'fill_toe'] as const) {
      for (const coordinates of lines((daylight as Record<string, unknown>)[role])) {
        out.push({ type: 'Feature', geometry: { type: 'LineString', coordinates }, properties: { role, id: feature.id } })
      }
    }
  }
  return { type: 'FeatureCollection', features: out }
}
