// The visit of a real notebook on the features page: what the canvas shows at
// each station (which layers of the published map, which year of the
// garden, which notes in the margin) and the facts those notes quote.
// Pure functions, no DOM: tested in test/frontend/site.

import { area as turfArea, centroid as turfCentroid, length as turfLength } from '@turf/turf'
import type { Feature, Geometry, MultiPolygon, Position } from 'geojson'

/** The layers of the notebook, drawn in this order. */
export const LAYERS = ['outline', 'compass', 'existing', 'water', 'access', 'structures', 'drafts', 'plants', 'comments', 'focus'] as const
export type LayerKey = (typeof LAYERS)[number]

/** The margin notes the canvas can write, each next to the element it is about. */
export const NOTES = ['area', 'sun', 'wind', 'existing', 'water', 'draft', 'plants', 'comment'] as const
export type NoteKey = (typeof NOTES)[number]

/**
 * What the canvas shows: how far each layer is drawn (0 to 1), the garden's
 * age (years from today) and the notes. `span` is the share of the way from
 * the previous station over which the canvas moves to this scene: short for
 * a new layer, the whole way for thirty years of growth.
 */
export type Scene = Record<LayerKey, number> & { year: number; notes: NoteKey[]; span?: number }

const BLANK: Scene = { outline: 0, compass: 0, existing: 0, water: 0, access: 0, structures: 0, drafts: 0, plants: 0, comments: 0, focus: 0, year: 0, notes: [] }
/** The default `span`: the change happens over the last part before the station. */
const SPAN = 0.4

/**
 * The scenes a station can ask for (`scene` in site.features.tour), each
 * adding to the one before: the notebook fills as the visit goes on, in the
 * order of the method (read the place, map what is there, water first, then
 * structure, then plants).
 */
export const SCENES = {
  place: { ...BLANK, outline: 1, notes: ['area'] },
  layers: { ...BLANK, outline: 1, compass: 1, notes: ['area', 'sun'] },
  climate: { ...BLANK, outline: 1, compass: 1, notes: ['sun', 'wind'] },
  existing: { ...BLANK, outline: 1, compass: 1, existing: 1, notes: ['existing'] },
  field: { ...BLANK, outline: 1, compass: 0.4, existing: 1, access: 1, notes: ['existing'] },
  water: { ...BLANK, outline: 1, compass: 0.4, existing: 1, access: 1, water: 1, notes: ['water'] },
  drafts: { ...BLANK, outline: 1, compass: 0.4, existing: 1, access: 1, water: 1, structures: 1, drafts: 1, notes: ['draft'] },
  structure: { ...BLANK, outline: 1, compass: 0.4, existing: 1, access: 1, water: 1, structures: 1, notes: ['water'] },
  palette: { ...BLANK, outline: 1, compass: 0.4, existing: 1, access: 1, water: 1, structures: 1, plants: 1, focus: 1, year: 0.6, notes: ['plants'] },
  growth: { ...BLANK, outline: 1, compass: 0.4, existing: 1, access: 1, water: 1, structures: 1, plants: 1, focus: 1, year: 30, notes: [], span: 1 },
  share: { ...BLANK, outline: 1, compass: 0.4, existing: 1, access: 1, water: 1, structures: 1, plants: 1, year: 15, comments: 1, notes: ['comment'] },
} satisfies Record<string, Scene>

export type SceneKey = keyof typeof SCENES

export function sceneOf(key: string | undefined): Scene {
  return (key && key in SCENES ? SCENES[key as SceneKey] : SCENES.place) as Scene
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/**
 * The scene between two stations, `t` of the way (0 to 1): layers fade in
 * and out, the year moves on, and the notes switch at the middle.
 */
export function blend(a: Scene, b: Scene, t: number): Scene {
  const k = clamp01(t)
  const out = { ...a, notes: k < 0.5 ? a.notes : b.notes } as Scene
  for (const layer of LAYERS) out[layer] = a[layer] + (b[layer] - a[layer]) * k
  out.year = a.year + (b.year - a.year) * k
  return out
}

/**
 * Where the visit is: the station whose top has passed `y` (a line across
 * the viewport, in page pixels) and how far the next one has come.
 * `tops` are the stations' tops in page pixels, in order.
 */
export function progressAt(tops: number[], y: number, spans: (number | undefined)[] = []): { index: number; t: number } {
  if (tops.length === 0) return { index: 0, t: 0 }
  let index = 0
  for (let i = 0; i < tops.length; i++) if (y >= tops[i]) index = i
  const next = tops[index + 1]
  if (next === undefined || y < tops[0]) return { index, t: 0 }
  const span = Math.max(0.05, Math.min(1, spans[index + 1] ?? SPAN))
  const start = tops[index] + (next - tops[index]) * (1 - span)
  return { index, t: clamp01((y - start) / (next - start)) }
}

/** The scene at a point of the visit. */
export function sceneAt(scenes: Scene[], index: number, t: number): Scene {
  const a = scenes[index] ?? BLANK
  const b = scenes[index + 1] ?? a
  return blend(a, b, t)
}

type Props = { layer?: string; kind?: string; status?: string; source?: string }
export type TourFeature = Feature<Geometry, Props>

/** Which notebook layer draws a published element (plants are painted from the growth data). */
export function layerOf(feature: TourFeature): LayerKey | null {
  switch (feature.properties?.layer) {
    case 'existing': return 'existing'
    case 'water': return 'water'
    case 'access': return 'access'
    case 'structures': case 'animals': return 'structures'
    default: return null
  }
}

/** The facts the margin notes quote, measured on the published map. */
export type Facts = {
  areaM2: number | null
  ponds: number
  /** The largest pond: where the water note points, and its area. */
  pond: { at: Position; areaM2: number } | null
  buildings: number
  hedgesM: number
  /** Where the note on what is already there points: the largest building, or any existing element. */
  existingAt: Position | null
  plants: number
  species: number
  /** Where the plants note points: the middle of the planted area. */
  plantsAt: Position | null
  /** The planted area, [west, south, east, north]: where the camera comes close. */
  plantsBox: [number, number, number, number] | null
  /** The water element shown as « your AI's draft »: a pond that is not the largest one, else the largest. */
  draft: TourFeature | null
}

type Growth = {
  plants: { lng: number; lat: number; speciesId?: number | null; latinName?: string | null; name?: string | null }[]
  patches: { ring: Position[]; lines: { quantity: number; speciesId?: number | null; latinName?: string | null; name?: string | null }[] }[]
}

const isPolygon = (g: Geometry) => g.type === 'Polygon' || g.type === 'MultiPolygon'
const isLine = (g: Geometry) => g.type === 'LineString' || g.type === 'MultiLineString'

export function factsOf(features: TourFeature[], areaM2: number | null, growth: Growth | null | undefined): Facts {
  const ponds = features.filter((f) => f.properties?.layer === 'water' && f.properties.kind === 'pond' && isPolygon(f.geometry))
  const sized = ponds.map((f) => ({ f, area: turfArea(f) })).sort((a, b) => b.area - a.area)
  const largest = sized[0]
  const buildings = features.filter((f) => f.properties?.layer === 'existing' && f.properties.kind === 'building' && isPolygon(f.geometry))
  const biggest = buildings.map((f) => ({ f, area: turfArea(f) })).sort((a, b) => b.area - a.area)[0]?.f
  const existing = biggest ?? features.find((f) => f.properties?.layer === 'existing')
  const hedgesM = features
    .filter((f) => f.properties?.layer === 'existing' && /hedge/.test(f.properties.kind ?? '') && isLine(f.geometry))
    .reduce((sum, f) => sum + turfLength(f, { units: 'meters' }), 0)

  const plants = growth?.plants ?? []
  const patches = growth?.patches ?? []
  const names = new Set<string>()
  const keyOf = (p: { speciesId?: number | null; latinName?: string | null; name?: string | null }) => String(p.speciesId ?? p.latinName ?? p.name ?? '')
  plants.forEach((p) => names.add(keyOf(p)))
  patches.forEach((patch) => patch.lines.forEach((line) => names.add(keyOf(line))))
  names.delete('')
  const points: Position[] = [...plants.map((p) => [p.lng, p.lat]), ...patches.flatMap((patch) => patch.ring)]
  const plantsAt = points.length ? [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length] : null

  return {
    areaM2,
    ponds: ponds.length,
    pond: largest ? { at: turfCentroid(largest.f).geometry.coordinates, areaM2: largest.area } : null,
    buildings: buildings.length,
    hedgesM,
    existingAt: existing ? turfCentroid(existing).geometry.coordinates : null,
    plants: plants.length + patches.reduce((sum, patch) => sum + patch.lines.reduce((s, line) => s + line.quantity, 0), 0),
    species: names.size,
    plantsAt,
    plantsBox: points.length
      ? [Math.min(...points.map((p) => p[0])), Math.min(...points.map((p) => p[1])), Math.max(...points.map((p) => p[0])), Math.max(...points.map((p) => p[1]))]
      : null,
    draft: (sized[1] ?? largest)?.f ?? null,
  }
}

/** The terrain's outline as rings of positions. */
export function outlineRings(boundary: MultiPolygon | null | undefined): Position[][] {
  return boundary?.coordinates.flatMap((polygon) => polygon) ?? []
}
