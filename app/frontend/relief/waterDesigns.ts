// The map's water works (ponds, swales, keylines dug as swales, check
// dams, fascines, hedge banks, half-moons, grass strips) and the soil heaped
// up (mounds, raised beds) or graded (terraces, benches, banks: cut and fill) as designs the relief can be dug with
// (design.ts), and the tanks with the roofs that fill them. Shared by the 3D view (controller)
// and the 2D flow overlay in « Projet » mode (mapOverlay), so both show
// the same axes.
import type { Feature, Geometry } from 'geojson'
import { pointsAlong, type Design, type GridPoint } from './design.ts'
import { GRADE_RATIO_DEFAULT } from './grading.ts'
import { toGrid, type GridMeta } from './grid.ts'

const POND_KINDS = new Set(['pond'])
const SWALE_KINDS = new Set(['swale', 'keyline', 'ditch'])
const SWALE_DEFAULTS: Record<string, { width: number; depth: number; berm: number }> = {
  swale: { width: 2, depth: 0.5, berm: 0.4 },
  keyline: { width: 1, depth: 0.3, berm: 0.2 },
  ditch: { width: 1, depth: 0.5, berm: 0 },
}
// Structures across the flow, raised on the relief. A level crest holds a
// pool in a gully; `seep` is the share of the flow a porous one lets
// through below its crest (0: an earth bank); `pool` how far upstream the
// water it holds reaches.
const BARRIER_DEFAULTS: Record<string, { height: number; width: number; level: boolean; seep: number; pool: number }> = {
  check_dam: { height: 0.4, width: 0.8, level: true, seep: 0.05, pool: 30 },
  beaver_dam_analogue: { height: 0.6, width: 1, level: true, seep: 0.03, pool: 50 },
  fascine: { height: 0.3, width: 0.5, level: false, seep: 0.15, pool: 5 },
  hedge_bank: { height: 0.6, width: 1.5, level: false, seep: 0, pool: 5 },
}
// Soil heaped on the ground: a rounded mound, a raised bed filled to the brim.
const MOUND_DEFAULTS: Record<string, { height: number; profile: 'dome' | 'flat' }> = {
  mound: { height: 0.8, profile: 'dome' },
  raised_bed: { height: 0.4, profile: 'flat' },
}
const CHECK_DAM_SEEP: Record<string, number> = { dry_stone: 0.05, gabion: 0.08, wood: 0.02, brush: 0.12 }
// What a work does to the soil it covers: hedge roots open it, dense grass
// opens it and slows the water running over it (its highest speed, m/s).
export type SoilEffect = { rateFactor: number; speed?: number }
const SOIL_EFFECTS: Record<string, SoilEffect> = {
  hedge_bank: { rateFactor: 3 },
  grass_strip: { rateFactor: 2.5, speed: 0.1 },
  'grass_strip:lawn': { rateFactor: 1.5, speed: 0.3 },
}

function numberProp(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : fallback
}

/** Horizontal metres per metre of height of a talus, from its gradient (%) or the older `slope_ratio`. */
function talusRatio(props: Record<string, unknown>, key: 'cut_slope_pct' | 'fill_slope_pct'): number {
  const pct = levelProp(props[key])
  if (pct != null && pct > 0) return 100 / Math.min(200, Math.max(5, pct))
  return numberProp(props.slope_ratio, GRADE_RATIO_DEFAULT)
}

function levelProp(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

/**
 * A tank and what fills it: the roofs drawn on the map whose gutter (a
 * pipe, MapFeature::WaterLinks) leads to it. It sits outside the relief: the
 * rain simulation fills it with the rain on those roofs.
 */
export type TankSummary = { id: number | string; capacity: number; roofArea: number }

export type WaterDesigns = {
  designs: Design[]
  /** The tanks, with their capacity (m³) and the roof area (m²) that feeds them. */
  tanks: TankSummary[]
  /** Grass strips: no earthworks, a soil that drinks more and slows the water. */
  strips: Array<{ id: number | string; ring: GridPoint[]; effect: SoilEffect }>
  /** What a work does to the soil it covers, by design id. */
  effects: Map<number | string, SoilEffect>
}

type WaterFeature = Pick<Feature<Geometry, Record<string, unknown> | null>, 'geometry' | 'properties'>

/** The active water works among the features, on the grid. */
export function waterDesigns(meta: GridMeta, features: readonly WaterFeature[]): WaterDesigns {
  const designs: Design[] = []
  const strips: WaterDesigns['strips'] = []
  const effects: WaterDesigns['effects'] = new Map()
  const tanks: TankSummary[] = []
  for (const feature of features) {
    const props = (feature.properties ?? {}) as Record<string, unknown>
    if (props.status && props.status !== 'active') continue
    const kind = String(props.kind ?? '')
    const id = (props.id as number | string | undefined) ?? designs.length
    const geometry = feature.geometry
    if (POND_KINDS.has(kind) && geometry?.type === 'Polygon') {
      designs.push({
        id, type: 'pond', ring: geometry.coordinates[0].map((p) => toGrid(meta, p)),
        depth: numberProp(props.depth_m ?? props.depth, 1), berm: numberProp(props.berm, 0.3),
      })
    } else if (SWALE_KINDS.has(kind) && geometry?.type === 'LineString') {
      // A keyline planted with trees or subsoiled is not dug.
      if (kind === 'keyline' && props.use && props.use !== 'swale') continue
      const defaults = SWALE_DEFAULTS[kind]
      designs.push({
        id, type: 'swale', points: geometry.coordinates.map((p) => toGrid(meta, p)),
        width: numberProp(props.width_m ?? props.width, defaults.width), depth: numberProp(props.depth_m ?? props.depth, defaults.depth),
        berm: props.berm === 0 ? 0 : numberProp(props.berm, defaults.berm),
      })
    } else if (BARRIER_DEFAULTS[kind] && geometry?.type === 'LineString') {
      const defaults = BARRIER_DEFAULTS[kind]
      const seep = kind === 'check_dam' ? CHECK_DAM_SEEP[String(props.material)] ?? defaults.seep : defaults.seep
      designs.push({
        id, type: 'barrier', points: geometry.coordinates.map((p) => toGrid(meta, p)),
        height: numberProp(props.height_m, defaults.height), width: numberProp(props.width_m, defaults.width),
        level: defaults.level, seep, pool: defaults.pool,
      })
      if (SOIL_EFFECTS[kind]) effects.set(id, SOIL_EFFECTS[kind])
    } else if (kind === 'half_moon' && (geometry?.type === 'Point' || geometry?.type === 'LineString')) {
      const centres = geometry.type === 'Point'
        ? [toGrid(meta, geometry.coordinates)]
        : pointsAlong(geometry.coordinates.map((p) => toGrid(meta, p)), numberProp(props.spacing_m, 5))
      designs.push({
        id, type: 'half_moon', centres, radius: numberProp(props.diameter_m, 3) / 2, depth: numberProp(props.depth_m, 0.2),
      })
    } else if (kind === 'grass_strip' && geometry?.type === 'Polygon') {
      const effect = SOIL_EFFECTS[props.cover === 'lawn' ? 'grass_strip:lawn' : 'grass_strip']
      strips.push({ id, ring: geometry.coordinates[0].map((p) => toGrid(meta, p)), effect })
    } else if (MOUND_DEFAULTS[kind] && geometry?.type === 'Polygon') {
      const defaults = MOUND_DEFAULTS[kind]
      designs.push({
        id, type: 'mound', ring: geometry.coordinates[0].map((p) => toGrid(meta, p)),
        height: numberProp(props.height_m, defaults.height), profile: defaults.profile,
      })
    } else if ((kind === 'graded_terrace' || kind === 'terrace') && geometry?.type === 'Polygon') {
      // A patio on a slope is levelled the same way, hung in the middle by default.
      designs.push({
        id, type: 'grade', shape: 'plateau', ring: geometry.coordinates[0].map((p) => toGrid(meta, p)),
        // The server's level, read on the finer grid, unless the person set one.
        level: props.hinge === 'level' ? levelProp(props.level_m) : levelProp((props.grading as Record<string, unknown> | undefined)?.level_m),
        hinge: props.hinge === 'upper' || props.hinge === 'lower' ? props.hinge : 'middle',
        cutRatio: talusRatio(props, 'cut_slope_pct'), fillRatio: talusRatio(props, 'fill_slope_pct'),
      })
    } else if (kind === 'graded_profile' && geometry?.type === 'LineString') {
      const mode = String(props.level_mode ?? 'follow')
      designs.push({
        id, type: 'grade', shape: props.shape === 'bank' ? 'bank' : 'bench', points: geometry.coordinates.map((p) => toGrid(meta, p)),
        width: numberProp(props.width_m, props.shape === 'bank' ? 1 : 3), height: numberProp(props.height_m, 0.8),
        level: mode === 'follow' ? null : levelProp(props.level_m),
        grade: mode === 'grade' ? levelProp(props.grade_pct) ?? 0 : null,
        cutRatio: talusRatio(props, 'cut_slope_pct'), fillRatio: talusRatio(props, 'fill_slope_pct'),
      })
    } else if (kind === 'water_tank' && geometry?.type === 'Point') {
      tanks.push({ id, capacity: numberProp(props.capacity_l, 5000) / 1000, roofArea: 0 })
    }
  }
  if (tanks.length) addRoofs(meta, features, tanks)
  return { designs, tanks, strips, effects }
}

/** Area (m²) of a polygon outline, on the grid. */
function ringArea(ring: GridPoint[]): number {
  let sum = 0
  for (let k = 0, j = ring.length - 1; k < ring.length; j = k++) sum += (ring[j].x + ring[k].x) * (ring[j].y - ring[k].y)
  return Math.abs(sum) / 2
}

/** Each tank's roof area: the surfaces at the start of a line that ends at the tank. */
function addRoofs(meta: GridMeta, features: readonly WaterFeature[], tanks: TankSummary[]) {
  const byId = new Map<unknown, WaterFeature>()
  for (const feature of features) {
    const id = (feature.properties as Record<string, unknown> | null)?.id
    if (id != null) byId.set(id, feature)
  }
  const area = new Map<unknown, number>()
  const counted = new Set<string>()
  for (const feature of features) {
    const props = (feature.properties ?? {}) as Record<string, unknown>
    if (props.status && props.status !== 'active') continue
    const roof = byId.get(props.from_id)
    if (props.to_id == null || !roof || roof.geometry?.type !== 'Polygon') continue
    const key = `${String(props.from_id)}>${String(props.to_id)}`
    if (counted.has(key)) continue
    counted.add(key)
    area.set(props.to_id, (area.get(props.to_id) ?? 0) + ringArea(roof.geometry.coordinates[0].map((p) => toGrid(meta, p))))
  }
  for (const tank of tanks) tank.roofArea = area.get(tank.id) ?? 0
}

