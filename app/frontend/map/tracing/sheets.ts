/**
 * The three tracing sheets a designer lays one over the other on the base
 * plan (« La table à dessin »): the bubbles (rough intentions, linked to the
 * project's functions), the frame (water, access, structure, animals) and
 * the planting. Water before plants: the order is Semisto's method
 * (app/design_guides/method.md).
 *
 * While one sheet is on the table, the sheets under it show through the
 * paper, faded; the sheets above it are not drawn yet and leave the map.
 * What is on the ground (the base plan) and the free notes stay whole.
 *
 * Pure helpers and the MapLibre twins of `sheetOf`, shared by the map's
 * paint, the plants overlay, the sheet card and the tests.
 */

export const SHEETS = ['bubbles', 'frame', 'planting'] as const
export type Sheet = (typeof SHEETS)[number]

/** 0: no sheet chosen, everything shows; then 1, 2, 3 in the order of SHEETS. */
export type SheetRank = 0 | 1 | 2 | 3

export const BUBBLE_KIND = 'bubble'

/** Layers of the frame: what carries water, people and the structure of the place. */
export const FRAME_LAYERS = ['water', 'access', 'structures', 'networks', 'animals'] as const
export const PLANTING_LAYERS = ['plants'] as const

export const isSheet = (value: unknown): value is Sheet => (SHEETS as readonly unknown[]).includes(value)
export const sheetRank = (sheet: Sheet | null): SheetRank => (sheet ? ((SHEETS.indexOf(sheet) + 1) as SheetRank) : 0)
export const sheetAt = (rank: number): Sheet | null => SHEETS[rank - 1] ?? null

type Props = {
  layer?: unknown
  kind?: unknown
  status?: unknown
  planned?: unknown
  planted_on?: unknown
  tracing?: unknown
}

const isPlantPoint = (p: Props) => p.layer === 'plants' && p.kind === 'plant'

/** Twin of scenario's isPlanned, kept here so the helpers stay free of the editor. */
function inProject(p: Props): boolean {
  if (p.status === 'draft') return true
  if (isPlantPoint(p)) return typeof p.planted_on !== 'string'
  return p.planned === true
}

/**
 * The sheet an element is drawn on, or null when it belongs to the base
 * plan (what is on the ground) or to no sheet (a free note, a zone). A
 * bubble is always on the first sheet; a zone or a note can be put on a
 * sheet by hand (`properties.tracing`).
 */
export function sheetOf(p: Props): Sheet | null {
  if (p.kind === BUBBLE_KIND) return 'bubbles'
  if (isSheet(p.tracing)) return p.tracing
  if (!inProject(p)) return null
  if ((FRAME_LAYERS as readonly unknown[]).includes(p.layer)) return 'frame'
  if ((PLANTING_LAYERS as readonly unknown[]).includes(p.layer)) return 'planting'
  return null
}

export type SheetLook = 'whole' | 'under' | 'hidden'

/** How an element shows while `current` is on the table. */
export function sheetLook(p: Props, current: Sheet | null): SheetLook {
  const own = sheetRank(sheetOf(p))
  const on = sheetRank(current)
  if (on === 0 || own === 0 || own === on) return 'whole'
  return own < on ? 'under' : 'hidden'
}

/** Opacity of the sheets under the one on the table: seen through tracing paper. */
export const UNDER_OPACITY = 0.3

/** The MapLibre global state that carries the sheet on the table (a SheetRank). */
export const TRACING_STATE = 'tracingSheet'

// --- MapLibre twins -----------------------------------------------------------

const PLANT_POINT_EXPR = ['all', ['==', ['get', 'layer'], 'plants'], ['==', ['get', 'kind'], 'plant']]
const IN_PROJECT_EXPR = ['any',
  ['==', ['get', 'status'], 'draft'],
  ['all', PLANT_POINT_EXPR, ['!=', ['typeof', ['get', 'planted_on']], 'string']],
  ['all', ['!', PLANT_POINT_EXPR], ['==', ['get', 'planned'], true]],
]

/** Twin of sheetRank(sheetOf(properties)). */
export const SHEET_RANK_EXPR = ['case',
  ['==', ['get', 'kind'], BUBBLE_KIND], 1,
  ['==', ['get', 'tracing'], 'bubbles'], 1,
  ['==', ['get', 'tracing'], 'frame'], 2,
  ['==', ['get', 'tracing'], 'planting'], 3,
  ['!', IN_PROJECT_EXPR], 0,
  ['in', ['get', 'layer'], ['literal', [...FRAME_LAYERS]]], 2,
  ['in', ['get', 'layer'], ['literal', [...PLANTING_LAYERS]]], 3,
  0,
]

const ON_TABLE = ['to-number', ['coalesce', ['global-state', TRACING_STATE], 0], 0]

/** Paint factor, twin of sheetLook: 1 whole, UNDER_OPACITY under the paper, 0 not drawn yet. */
export const TRACING_FACTOR = ['let', 'own', SHEET_RANK_EXPR, 'on', ON_TABLE,
  ['case',
    ['any', ['==', ['var', 'on'], 0], ['==', ['var', 'own'], 0], ['==', ['var', 'own'], ['var', 'on']]], 1,
    ['<', ['var', 'own'], ['var', 'on']], UNDER_OPACITY,
    0,
  ],
]

/**
 * Filter test: the sheets above the one on the table leave the map, so a
 * click never lands on what is not drawn yet.
 */
export const TRACING_SHOWN = ['let', 'on', ON_TABLE, ['any', ['==', ['var', 'on'], 0], ['<=', SHEET_RANK_EXPR, ['var', 'on']]]]

/**
 * Filter test for the plants overlay's own sources (crowns, names,
 * numbers, trunks), which carry `planted`: a plant in the ground is part of
 * the base plan, a planned one waits for the planting sheet.
 */
export const PLANT_SHEET_SHOWN = ['let', 'on', ON_TABLE, ['any', ['==', ['var', 'on'], 0], ['>=', ['var', 'on'], 3], ['to-boolean', ['get', 'planted']]]]

// --- What each sheet holds ----------------------------------------------------

export type SheetCounts = Record<Sheet, number>

/** How many elements each sheet holds (rejected ones left out). */
export function sheetCounts(features: { properties: Props }[]): SheetCounts {
  const counts: SheetCounts = { bubbles: 0, frame: 0, planting: 0 }
  for (const f of features) {
    if (f.properties.status === 'rejected') continue
    const sheet = sheetOf(f.properties)
    if (sheet) counts[sheet] += 1
  }
  return counts
}

/**
 * The sheet a designer is most likely working on: the first one still
 * empty, the planting once the other two hold something.
 */
export function suggestedSheet(counts: SheetCounts): Sheet {
  return SHEETS.find((s) => counts[s] === 0) ?? 'planting'
}
