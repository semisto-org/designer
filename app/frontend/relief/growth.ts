// The map's plants growing in the 3D view: how big each one is, a given
// number of years after the garden's first planting, from its adult size
// in the catalogue and the years it takes to get there (Relief::GrowingPlants
// on the server). Pure functions, no three.js: tested in test/frontend/relief.
//
// Coordinates: metres on the relief grid (x east, y SOUTH), see grid.ts.

import type { Position } from 'geojson'
import { toGrid, type GridMeta } from './grid.ts'

export type PlantStrata = 'canopy' | 'sub_canopy' | 'shrub' | 'herbaceous' | 'ground_cover' | 'vine' | 'root' | 'aquatic'

/** What the server says of a species or cultivar on this map. */
export type GrowthInputs = {
  speciesId: number | null
  varietyId: number | null
  strata: PlantStrata
  name: string | null
  latinName: string | null
  foliage: string | null
  plantType: string | null
  heightM: number
  spreadM: number
  maturityYears: number
  /** Some of the values are a strata default or come from the growth rate. */
  indicative: boolean
  /** Its silhouette in the open (the species', else its genus'), or null: drawn round. */
  crownForm?: CrownForm | null
  /** Months (1–12) it flowers in, from its sheet. */
  flowering?: number[]
  /** Months (1–12) it bears fruit (or is harvested), from its sheet. */
  fruiting?: number[]
  /** Its sheet's exposures (sun, partial-shade, shade) and soil moisture (dry, moist, wet, waterlogged). */
  exposures?: string[]
  soilMoisture?: string[]
}

/**
 * The silhouette of a tree or a shrub grown in the open (PlantCrownForm on
 * the server): round (a lime, an apple), spreading (a chestnut, a walnut,
 * branching low), columnar (an Italian cypress), conical (a fir, a larch),
 * weeping (a weeping willow) or multi-stem (a hazel, an elder).
 */
export type CrownForm = 'round' | 'spreading' | 'columnar' | 'conical' | 'weeping' | 'multi_stem'
export const CROWN_FORMS: readonly CrownForm[] = ['round', 'spreading', 'columnar', 'conical', 'weeping', 'multi_stem']

/** A silhouette the server sent, or null when it is unknown. */
export function crownFormOf(value: unknown): CrownForm | null {
  return CROWN_FORMS.includes(value as CrownForm) ? (value as CrownForm) : null
}

/** What someone measured on the plant itself (PlantableFeature#plant_measures): metres, girth in cm, the day. */
export type PlantMeasures = { height: number | null; crown: number | null; girth: number | null; on: string | null }

/**
 * A measure as the growth reads it: height and spread (m), trunk girth at
 * 1.30 m (cm), and the plant's age when it was measured (years after its
 * planting), null when it was already there before anyone noted it.
 */
export type Measured = { height: number | null; spread: number | null; girth: number | null; age: number | null }

/** The measures of a plant planted on `plantedOn` (null: date unknown), or null when nothing was measured. */
export function measuredOf(measures: PlantMeasures | null | undefined, plantedOn: string | null, longAgo = false): Measured | null {
  if (!measures) return null
  const positive = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)
  const height = positive(measures.height)
  const spread = positive(measures.crown)
  const girth = positive(measures.girth)
  if (height == null && spread == null && girth == null) return null
  const age = !longAgo && plantedOn && measures.on ? Math.max(0, yearsBetween(plantedOn, measures.on)) : null
  return { height, spread, girth, age }
}

export type GrowingPlantData = GrowthInputs & {
  id: number
  /** How the gardener keeps it: left free, pollarded, coppiced or chopped and dropped. */
  training: PlantTraining | null
  /** A support plant (nitrogen fixer, pioneer, biomass) that builds the soil, then gives way. */
  support?: boolean
  /** Years after its planting when the support plant is removed, or null when it stays. */
  supportUntil?: number | null
  /** A grafted fruit tree: its form, trunk height (m), rootstock vigour and rootstock, as the gardener gave them. */
  graft: GraftData | null
  /** What someone measured on it (height, crown, girth, day), or null. */
  measures?: PlantMeasures | null
  lng: number
  lat: number
  number: string | number | null
  ownName: string | null
  plantedOn: string | null
  /** In the ground since a date nobody knows: shown grown from year 0. */
  plantedLongAgo?: boolean
  /** A tree already on the land (« Arbre existant »), drawn at the size noted on it. */
  existing?: boolean
  /** Proposed by an AI, not reviewed yet: a ghost in 3D, with its reason. */
  draft?: boolean
  rationale?: string | null
}

export type GrowingPatchData = {
  id: number
  name: string | null
  ring: Position[]
  lines: (GrowthInputs & { quantity: number; shown: number })[]
}

export type GrowingPlantsData = {
  today: string
  /** Year 0: the first planting, or today when nothing is planted yet. */
  origin: string
  plants: GrowingPlantData[]
  patches: GrowingPatchData[]
}

/**
 * How a tree or a bush is kept: free (as nature grows it), pollarded (a
 * trunk cut back to a head every few years, « trogne »), coppiced (cut
 * back to the ground, regrowing as many stems, « cépée ») or chopped and
 * dropped (a support plant cut hard every year, its cuttings left at the
 * foot of the fruit trees as mulch, « couper-déposer »).
 */
export type PlantTraining = 'free' | 'pollard' | 'coppice' | 'chop_and_drop'

/**
 * The form a grafted fruit tree is sold with, named after its trunk: a
 * standard (« haute-tige », hoogstam), a half-standard (« demi-tige »,
 * halfstam) or a bush (« basse-tige », laagstam). The trunk is formed in the
 * nursery and does not grow taller afterwards.
 */
export type GraftForm = 'standard' | 'half_standard' | 'bush'

/**
 * How vigorous the rootstock is, which sets the tree's adult size (for an
 * apple: M27, M9, M26, MM106, then MM111, M25 or a seedling).
 */
export type RootstockVigor = 'very_dwarf' | 'dwarf' | 'semi_dwarf' | 'semi_vigorous' | 'vigorous'

export const GRAFT_FORMS: readonly GraftForm[] = ['bush', 'half_standard', 'standard']
export const ROOTSTOCK_VIGORS: readonly RootstockVigor[] = ['very_dwarf', 'dwarf', 'semi_dwarf', 'semi_vigorous', 'vigorous']

/** What the server sends of a grafted tree (properties graft_form, trunk_height, rootstock_vigor, rootstock). */
export type GraftData = {
  form: string | null
  trunkHeight: number | null
  vigor: string | null
  rootstock: string | null
}

/** A grafted tree as the scene draws it: the height of its trunk (m) and the vigour of its rootstock. */
export type Graft = { trunk: number; vigor: RootstockVigor }

/**
 * Trunk height of each form (m), within what Belgian, French and Dutch
 * nurseries sell: a standard from 1.80 m (the Walloon orchard grant's
 * minimum), a half-standard 1.20 to 1.60 m, a bush 0.50 to 0.80 m.
 */
export const GRAFT_TRUNK: Record<GraftForm, number> = { standard: 1.8, half_standard: 1.4, bush: 0.6 }

/** The rootstock a form is usually grafted on, when the gardener does not say. */
export const FORM_VIGOR: Record<GraftForm, RootstockVigor> = { standard: 'vigorous', half_standard: 'semi_vigorous', bush: 'semi_dwarf' }

/** Trunk heights the sheet accepts (m). */
export const TRUNK_RANGE = { min: 0.2, max: 3 } as const

/**
 * The most a tree reaches on a weak rootstock (m), and the years it takes:
 * an apple on M27, M9, M26 or MM106. A vigorous rootstock (MM111, M25, a
 * seedling) lets the species grow to its own size.
 */
export const VIGOR_SIZE: Record<Exclude<RootstockVigor, 'vigorous'>, { height: number; spread: number; maturityYears: number }> = {
  very_dwarf: { height: 2, spread: 1.5, maturityYears: 4 },
  dwarf: { height: 3, spread: 2.5, maturityYears: 5 },
  semi_dwarf: { height: 4, spread: 3.5, maturityYears: 7 },
  semi_vigorous: { height: 5.5, spread: 5, maturityYears: 10 },
}

/** A crown is at least this tall above the trunk of a grafted tree (m). */
export const GRAFT_CROWN = 1.2

/** A grafted tree as the scene draws it, or null when the plant is not one (or not a tree). */
export function graftOf(form: PlantForm, data: GraftData | null | undefined): Graft | null {
  if (form !== 'tree' || !data) return null
  const graftForm = GRAFT_FORMS.includes(data.form as GraftForm) ? (data.form as GraftForm) : null
  const given = ROOTSTOCK_VIGORS.includes(data.vigor as RootstockVigor) ? (data.vigor as RootstockVigor) : null
  const height = typeof data.trunkHeight === 'number' && Number.isFinite(data.trunkHeight)
    ? Math.min(TRUNK_RANGE.max, Math.max(TRUNK_RANGE.min, data.trunkHeight)) : null
  if (!graftForm && !given && height == null) return null
  const trunk = height ?? (graftForm ? GRAFT_TRUNK[graftForm] : given === 'vigorous' ? GRAFT_TRUNK.standard : given === 'semi_vigorous' ? GRAFT_TRUNK.half_standard : GRAFT_TRUNK.bush)
  const vigor = given ?? (graftForm ? FORM_VIGOR[graftForm] : trunk >= GRAFT_TRUNK.standard ? 'vigorous' : trunk >= 1.2 ? 'semi_vigorous' : 'semi_dwarf')
  return { trunk, vigor }
}

/** How a plant is drawn: a tree on its trunk, a bush, a low clump, a mat, a climber. */
export type PlantForm = 'tree' | 'bush' | 'clump' | 'mat' | 'climber'

/** One plant in the scene: where, what, and from when (years after year 0). */
export type ScenePlant = {
  x: number
  y: number
  form: PlantForm
  strata: PlantStrata
  heightM: number
  spreadM: number
  maturityYears: number
  training: PlantTraining
  /** A grafted fruit tree: its trunk and its rootstock's vigour, or null. */
  graft?: Graft | null
  /** Its silhouette in the open, or null (round). */
  crownForm?: CrownForm | null
  /** What someone measured on it, or null. */
  measured?: Measured | null
  /** Years after year 0 when it goes into the ground. */
  start: number
  /** A support plant, removed `until` years after its planting when that is set. */
  support?: boolean
  until?: number | null
  /** Index in `GrowingPlantsData.plants`, or null for a plant of a patch. */
  plant: number | null
  /** The patch it belongs to (index in `patches`) and its line, for a plant of a patch. */
  patch: [number, number] | null
  /** A stable number per plant: its tint and the turn of its crown. */
  seed: number
  /** Deciduous, evergreen, semi-evergreen or marcescent, from its sheet (null: unknown). */
  foliage?: string | null
  /** Months (1–12) it flowers and bears fruit in. */
  flowering?: number[]
  fruiting?: number[]
  /** An AI's proposal waiting for a human: drawn as a ghost, left out of the shade. */
  draft?: boolean
}

/** The last year the slider reaches. */
export const GROWTH_YEARS = 20

/**
 * Size when planted (m): a bare-root whip, a one-year bush, a pot of
 * perennial. Never more than the adult size.
 */
export const PLANTING_SIZE: Record<PlantStrata, { height: number; spread: number }> = {
  canopy: { height: 1.6, spread: 0.5 },
  sub_canopy: { height: 1.3, spread: 0.5 },
  shrub: { height: 0.5, spread: 0.35 },
  herbaceous: { height: 0.15, spread: 0.2 },
  ground_cover: { height: 0.05, spread: 0.15 },
  vine: { height: 0.6, spread: 0.2 },
  root: { height: 0.1, spread: 0.15 },
  aquatic: { height: 0.2, spread: 0.2 },
}

const DAY_MS = 86_400_000
const YEAR_DAYS = 365.25

/** Years from `from` to `to` (ISO dates), fractional. */
export function yearsBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / DAY_MS / YEAR_DAYS
}

/**
 * Share of the way from planting size to adult size, `age` years after
 * planting: a slow start while the roots settle, then fast, then levelling
 * off (Chapman-Richards). About 90 % at maturity, all of it soon after.
 */
export function growthShare(age: number, maturityYears: number): number {
  if (age <= 0) return 0
  const maturity = Math.max(1, maturityYears)
  return Math.min(1, Math.pow(1 - Math.exp((-3 * age) / maturity), 1.3) / 0.93)
}

/** Height of a pollard's head, where it is cut back (m). */
export const POLLARD_HEAD = 2

/**
 * The most a pollard or a coppice reaches between two cuts (m): an average
 * over its cycle, as it is cut back every five to fifteen years. Its roots,
 * not its crown, keep the age of the tree.
 */
export const MANAGED_SIZE: Record<Exclude<PlantTraining, 'free'>, { height: number; spread: number }> = {
  pollard: { height: POLLARD_HEAD + 3.5, spread: 4 },
  coppice: { height: 5, spread: 4 },
  // One summer's regrowth: it is cut every year.
  chop_and_drop: { height: 2.2, spread: 1.8 },
}

/** Whether a plant drawn with `form` can be pollarded or coppiced (a tree or a bush). */
export function trainable(form: PlantForm): boolean {
  return form === 'tree' || form === 'bush'
}

/**
 * Years a pollard or a coppice takes to reach its size between two cuts: the
 * head or the stool is formed in the first years, then the shoots are vigorous.
 */
export const MANAGED_MATURITY = 10

/** A plant chopped and dropped every year has its stool after about three years. */
export const CHOP_MATURITY = 3

type Kept = { training?: PlantTraining; graft?: Graft | null }

/**
 * The size a plant reaches as it is kept, and when: its adult size, or less
 * and sooner when it is cut back or grafted on a weak rootstock. A grafted
 * tree always carries a crown above its trunk.
 */
export function managedSize(plant: Pick<ScenePlant, 'heightM' | 'spreadM' | 'maturityYears'> & Kept): { height: number; spread: number; maturityYears: number } {
  const cap = plant.training && plant.training !== 'free' ? MANAGED_SIZE[plant.training] : null
  if (cap) {
    const maturity = plant.training === 'chop_and_drop' ? CHOP_MATURITY : MANAGED_MATURITY
    return { height: Math.min(plant.heightM, cap.height), spread: Math.min(plant.spreadM, cap.spread), maturityYears: Math.min(plant.maturityYears, maturity) }
  }
  const graft = plant.graft
  if (graft) {
    const vigor = graft.vigor === 'vigorous' ? null : VIGOR_SIZE[graft.vigor]
    return {
      height: Math.max(graft.trunk + GRAFT_CROWN, vigor ? Math.min(plant.heightM, vigor.height) : plant.heightM),
      spread: vigor ? Math.min(plant.spreadM, vigor.spread) : plant.spreadM,
      maturityYears: vigor ? Math.min(plant.maturityYears, vigor.maturityYears) : plant.maturityYears,
    }
  }
  return { height: plant.heightM, spread: plant.spreadM, maturityYears: plant.maturityYears }
}

/** A grafted tree leaves the nursery with its trunk formed and the start of a crown (m). */
export const GRAFTED_CROWN_AT_PLANTING = { height: 0.6, spread: 0.6 }

/** The age a measure is counted at when the planting date is unknown: grown. */
export const MEASURED_LONG_AGO = 1_000_000

/**
 * A size from the curve, through what was measured: before the measure, the
 * curve scaled to it; after it, the measure plus what the curve still grows.
 */
function fromMeasure(value: number, atMeasure: number, measure: number | null, age: number, measureAge: number | null): number {
  if (measure == null || !(measure > 0)) return value
  const before = measureAge == null || age < measureAge
  if (before && atMeasure > 0) return (value * measure) / atMeasure
  return measure + Math.max(0, value - atMeasure)
}

/**
 * Height and spread `age` years after planting, or null before it is planted
 * and once a support plant gave way. A plant someone measured goes through
 * its measure: the catalogue gives the shape of the curve, the measure its size.
 */
export function sizeAt(plant: Pick<ScenePlant, 'strata' | 'heightM' | 'spreadM' | 'maturityYears'> & Kept & { until?: number | null; measured?: Measured | null }, age: number): { height: number; spread: number } | null {
  if (age < 0) return null
  if (plant.until != null && age >= plant.until) return null
  const graft = plant.training && plant.training !== 'free' ? null : plant.graft
  const start = graft
    ? { height: graft.trunk + GRAFTED_CROWN_AT_PLANTING.height, spread: GRAFTED_CROWN_AT_PLANTING.spread }
    : PLANTING_SIZE[plant.strata] ?? PLANTING_SIZE.shrub
  const adult = managedSize(plant)
  const adultHeight = Math.max(0.02, adult.height)
  const adultSpread = Math.max(0.05, adult.spread)
  const h0 = Math.min(start.height, adultHeight)
  const s0 = Math.min(start.spread, adultSpread)
  const curve = (a: number) => {
    const share = growthShare(a, adult.maturityYears)
    return { height: h0 + (adultHeight - h0) * share, spread: s0 + (adultSpread - s0) * share }
  }
  const size = curve(age)
  const m = plant.measured
  if (!m) return size
  const at = curve(m.age == null ? MEASURED_LONG_AGO : Math.max(0, m.age))
  return {
    height: fromMeasure(size.height, at.height, m.height, age, m.age),
    spread: fromMeasure(size.spread, at.spread, m.spread, age, m.age),
  }
}

/** A trunk thickens by about 2.5 cm of girth a year in the open (Mitchell's rule of thumb). */
export const GIRTH_PER_YEAR_CM = 2.5

/**
 * Radius of the trunk at its foot (m), `age` years after planting: from the
 * girth someone measured when there is one (it keeps thickening after),
 * else from the tree's size. A pollard's trunk swells under its head, cut
 * after cut; a spreading tree carries a stout trunk.
 */
export function trunkRadius(plant: Pick<ScenePlant, 'training' | 'crownForm' | 'measured'>, size: { height: number; spread: number }, age: number): number {
  const girth = plant.measured?.girth
  if (girth != null && girth > 0) {
    const measureAge = plant.measured?.age ?? null
    const cm = measureAge == null || age >= measureAge
      ? girth + (measureAge == null ? 0 : (age - measureAge) * GIRTH_PER_YEAR_CM)
      : girth * Math.min(1, Math.max(0.05, (age + 0.5) / (measureAge + 0.5)))
    // Girth is taken at 1.30 m; the foot flares a little wider.
    return Math.max(0.02, (cm / 100 / (2 * Math.PI)) * 1.15)
  }
  const stout = plant.crownForm === 'spreading' ? 1.3 : plant.crownForm === 'columnar' || plant.crownForm === 'conical' ? 0.85 : 1
  return Math.max(0.025, size.spread * 0.03 + size.height * 0.006) * (plant.training === 'pollard' ? 2.2 : 1) * stout
}

/** A training the server sent, or free when it is unknown or the form cannot take it. */
export function trainingOf(form: PlantForm, value: string | null | undefined): PlantTraining {
  return trainable(form) && (value === 'pollard' || value === 'coppice' || value === 'chop_and_drop') ? value : 'free'
}

/** The form a plant is drawn with, from its strata and its type. */
export function plantForm(strata: PlantStrata, plantType: string | null): PlantForm {
  if (strata === 'vine' || plantType === 'climber') return 'climber'
  if (strata === 'canopy' || strata === 'sub_canopy' || plantType === 'tree') return 'tree'
  if (strata === 'shrub' || plantType === 'shrub' || plantType === 'small-shrub') return 'bush'
  if (strata === 'ground_cover' || plantType === 'ground-cover') return 'mat'
  return 'clump'
}

/** Height of the support a climber is drawn on (m). */
export const CLIMBER_SUPPORT = 2.5

/**
 * How a crown is drawn in 3D: a ball, a cluster of lobes (a spreading tree),
 * a cone, a weeping skirt open underneath. The shade and the 2D shadows read
 * the same ellipsoid whatever the look.
 */
export type CrownLook = 'ball' | 'lobed' | 'cone' | 'weep'

/** A crown on its trunk: an ellipsoid of horizontal `radius` and vertical half-axis `half`, centred `centre` m above the ground. */
export type CrownShape = { kind: 'crown'; trunk: number; centre: number; half: number; radius: number; look: CrownLook; stems: boolean }

/**
 * Share of a grown tree's height its bare trunk takes, by silhouette: low
 * branches for a tree grown in the open, nearly none for a cone.
 */
export const CLEAR_TRUNK: Record<CrownForm, number> = {
  round: 0.25, spreading: 0.14, columnar: 0.06, conical: 0.05, weeping: 0.12, multi_stem: 0,
}

/** A young tree is a whip: mostly stem, up to this share of its height. */
const WHIP_TRUNK = 0.4

/**
 * The volume a plant of `height` × `spread` is drawn with, shared by the 3D
 * models and the shade: a crown (an ellipsoid of horizontal radius `radius`
 * and vertical half-axis `half`, centred `centre` metres above the ground),
 * on a trunk of `trunk` metres for a tree; a dome for a clump or a mat; a
 * column for a climber. A tree left free takes its silhouette (`crownForm`,
 * round when unknown); a pollard is a short trunk crowned by its regrowth,
 * a coppice a crown of stems from the ground, a grafted tree a crown on the
 * trunk it was sold with (`graftTrunk`, m).
 */
export function plantShape(form: PlantForm, _strata: PlantStrata, height: number, spread: number, training: PlantTraining = 'free', graftTrunk: number | null = null, crownForm: CrownForm | null = null):
  CrownShape
  | { kind: 'dome'; height: number; radius: number }
  | { kind: 'column'; height: number; radius: number } {
  const crown = (trunk: number, centre: number, half: number, radius: number, look: CrownLook = 'ball', stems = false): CrownShape =>
    ({ kind: 'crown', trunk, centre, half, radius, look, stems })
  if (trainable(form) && training === 'pollard') {
    // The head is grown first (a young pollard is a whip), then holds.
    const trunk = Math.min(POLLARD_HEAD, height * 0.55)
    const half = (height - trunk) / 2
    return crown(trunk, trunk + half, half, spread / 2)
  }
  if (trainable(form) && (training === 'coppice' || training === 'chop_and_drop')) {
    // Many stems from the stool: a crown resting on the ground, a little lifted.
    return crown(0, height * 0.52, height * 0.48, spread / 2)
  }
  if (form === 'tree' && graftTrunk != null) {
    // The trunk is the nursery's; only the crown grows, above it.
    const trunk = Math.min(graftTrunk, Math.max(0, height - 0.4))
    const half = (height - trunk) / 2
    return crown(trunk, trunk + half, half, spread / 2)
  }
  switch (form) {
    case 'tree': {
      const silhouette = crownForm ?? 'round'
      // A young tree is mostly stem; its silhouette takes over as it grows.
      const grown = Math.min(1, Math.max(0, (height - 2) / 6))
      const clear = WHIP_TRUNK + (CLEAR_TRUNK[silhouette] - WHIP_TRUNK) * grown
      if (silhouette === 'multi_stem') {
        // Stems from the ground, the crown a little lifted on them.
        const base = height * (0.4 - 0.25 * grown)
        const half = (height - base) / 2
        return crown(0, base + half, half, spread / 2, 'ball', true)
      }
      const trunk = height * clear
      const half = (height - trunk) / 2
      const radius = silhouette === 'columnar' ? Math.min(spread / 2, Math.max(0.4, height * 0.13)) : spread / 2
      const look: CrownLook = silhouette === 'spreading' ? 'lobed' : silhouette === 'conical' ? 'cone' : silhouette === 'weeping' ? 'weep' : 'ball'
      return crown(trunk, trunk + half, half, radius, look)
    }
    case 'bush': {
      const radius = crownForm === 'columnar' ? Math.min(spread / 2, Math.max(0.2, height * 0.2)) : spread / 2
      if (crownForm === 'multi_stem') return crown(0, height * 0.58, height * 0.42, radius, 'ball', true)
      return crown(0, height * 0.47, height / 2, radius, crownForm === 'conical' ? 'cone' : 'ball')
    }
    case 'climber':
      // On its support (a post, a pergola, a fence): the catalogue's height
      // is what it reaches up a tree.
      return { kind: 'column', height: Math.min(height, CLIMBER_SUPPORT), radius: Math.min(0.6, Math.max(0.08, spread / 3)) }
    default:
      return { kind: 'dome', height: Math.max(0.03, height), radius: spread / 2 }
  }
}

/** The trunk a scene plant is drawn on when it is a grafted tree left free, or null. */
export function graftTrunk(plant: Pick<ScenePlant, 'training'> & { graft?: Graft | null }): number | null {
  return plant.graft && plant.training === 'free' ? plant.graft.trunk : null
}

/** Crowns lower than this leave the ground under them in the light (a perennial is its own sunny top). */
const SHADING_CROWN = 0.8

/**
 * The plants of year `year` raised onto a height grid, for the sun: each
 * cell under a plant takes the top of its volume (a crown seen from the
 * side casts its shadow down to the ground, as a heightfield cannot hold an
 * overhang). `cover` marks the cells under a crown of a tree or a bush: the
 * ground there is in its shade whatever the sun does.
 *
 * `base` holds the heights the sun already reads (terrain, surface model,
 * roofs), `altitudes` the ground under each plant. Cells are `cell` metres,
 * rows from north to south like the plants' `y`.
 */
export function plantShade(
  base: ArrayLike<number>, cols: number, rows: number, cell: number,
  plants: ScenePlant[], altitudes: ArrayLike<number>, year: number,
): { heights: Float32Array; cover: Uint8Array; count: number } {
  const heights = base instanceof Float32Array ? base.slice() : Float32Array.from(base)
  const cover = new Uint8Array(cols * rows)
  let count = 0
  plants.forEach((plant, index) => {
    const size = sizeAt(plant, year - plant.start)
    if (!size) return
    const shape = plantShape(plant.form, plant.strata, size.height, size.spread, plant.training, graftTrunk(plant), plant.crownForm ?? null)
    const r = shape.radius
    // Smaller than a cell: its shadow is lost in the grid.
    if (r < cell / 2) return
    const ground = altitudes[index]
    const c0 = Math.max(0, Math.ceil((plant.x - r) / cell))
    const c1 = Math.min(cols - 1, Math.floor((plant.x + r) / cell))
    const r0 = Math.max(0, Math.ceil((plant.y - r) / cell))
    const r1 = Math.min(rows - 1, Math.floor((plant.y + r) / cell))
    let touched = false
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const d = Math.hypot(col * cell - plant.x, row * cell - plant.y) / r
        if (d > 1) continue
        const rise = Math.sqrt(1 - d * d)
        const top = shape.kind === 'crown' ? shape.centre + shape.half * rise
          : shape.kind === 'dome' ? shape.height * rise
          : shape.height
        const i = row * cols + col
        if (ground + top > heights[i]) heights[i] = ground + top
        if (shape.kind === 'crown' && shape.centre + shape.half >= SHADING_CROWN) cover[i] = 1
        touched = true
      }
    }
    if (touched) count++
  })
  return { heights, cover, count }
}

/** A small seeded generator (mulberry32). */
function random(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Whether a point is inside a ring (even-odd). */
export function insideRing(ring: { x: number; y: number }[], x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/**
 * `count` points spread evenly over a polygon, a little at random (a
 * jittered grid), always the same for a given seed: a patch's plants keep
 * their place from one year to the next.
 */
export function scatter(ring: { x: number; y: number }[], count: number, seed: number): { x: number; y: number }[] {
  if (count <= 0 || ring.length < 3) return []
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  let area = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    area += a.x * b.y - b.x * a.y
    minX = Math.min(minX, a.x); maxX = Math.max(maxX, a.x)
    minY = Math.min(minY, a.y); maxY = Math.max(maxY, a.y)
  }
  area = Math.abs(area) / 2
  if (area <= 0) return []
  const rand = random(seed)
  const points: { x: number; y: number }[] = []
  // Shrink the spacing until the grid holds enough points inside the ring.
  for (let spacing = Math.sqrt(area / count); points.length < count && spacing > 0.01; spacing *= 0.85) {
    points.length = 0
    for (let y = minY + spacing / 2; y < maxY; y += spacing) {
      for (let x = minX + spacing / 2; x < maxX; x += spacing) {
        const px = x + (rand() - 0.5) * spacing * 0.7
        const py = y + (rand() - 0.5) * spacing * 0.7
        if (insideRing(ring, px, py)) points.push({ x: px, y: py })
      }
    }
  }
  // Too many: keep an even selection.
  if (points.length <= count) return points
  const step = points.length / count
  return Array.from({ length: count }, (_, i) => points[Math.floor(i * step)])
}

/**
 * Every plant of the map on the grid: the plant points, and the plants of
 * each patch spread over it (less the points already placed in it for the
 * same species, which are drawn as themselves).
 */
export function scenePlants(meta: GridMeta, data: GrowingPlantsData): ScenePlant[] {
  const plants: ScenePlant[] = []
  const placed = data.plants.map((p) => ({ ...toGrid(meta, [p.lng, p.lat]), p }))
  const startOf = (date: string | null) => Math.max(0, yearsBetween(data.origin, date ?? data.today))
  placed.forEach(({ x, y, p }, index) => {
    const form = plantForm(p.strata, p.plantType)
    const training = trainingOf(form, p.training)
    plants.push({
      x, y, form, strata: p.strata, heightM: p.heightM, spreadM: p.spreadM,
      maturityYears: p.maturityYears, training, graft: training === 'free' ? graftOf(form, p.graft) : null, start: p.plantedLongAgo ? -p.maturityYears : startOf(p.plantedOn), plant: index, patch: null, seed: p.id * 7919,
      crownForm: crownFormOf(p.crownForm), measured: measuredOf(p.measures, p.plantedOn, !!p.plantedLongAgo),
      foliage: p.foliage, flowering: p.flowering ?? [], fruiting: p.fruiting ?? [],
      support: !!p.support, until: p.support && !p.plantedLongAgo ? p.supportUntil ?? null : null,
      ...(p.draft ? { draft: true } : {}),
    })
  })
  const patchStart = startOf(null)
  data.patches.forEach((patch, patchIndex) => {
    const ring = patch.ring.map((position) => toGrid(meta, position))
    patch.lines.forEach((line, lineIndex) => {
      const already = placed.filter(({ x, y, p }) => p.speciesId != null && p.speciesId === line.speciesId
        && p.varietyId === line.varietyId && insideRing(ring, x, y)).length
      const count = Math.max(0, line.shown - already)
      for (const point of scatter(ring, count, patch.id * 131 + lineIndex * 17)) {
        plants.push({
          ...point, form: plantForm(line.strata, line.plantType), strata: line.strata, heightM: line.heightM,
          spreadM: line.spreadM, maturityYears: line.maturityYears, training: 'free', start: patchStart, plant: null, crownForm: crownFormOf(line.crownForm),
          foliage: line.foliage, flowering: line.flowering ?? [], fruiting: line.fruiting ?? [],
          patch: [patchIndex, lineIndex], seed: Math.round(point.x * 1000 + point.y * 7),
        })
      }
    })
  })
  return plants
}

/** The calendar year of a year on the slider. */
export function calendarYear(origin: string, year: number): number {
  return new Date(origin).getUTCFullYear() + Math.floor(year)
}

// ---- Seasons ------------------------------------------------------------------

/**
 * How a plant looks in a month of the year: its leaves (1 in full leaf, 0
 * bare), how far they have turned (autumn colour), and whether it is in
 * flower or in fruit. `month` runs from 1 (1 January) to 13 (31 December),
 * fractions moving through the month. Western and central Europe: leaves
 * open through April, turn in October, fall in November.
 */
export type SeasonLook = { leaf: number; autumn: number; blossom: boolean; fruit: boolean }

/** The foliage a plant keeps in winter: its sheet's, else what its form usually does. */
export function foliageOf(plant: Pick<ScenePlant, 'foliage' | 'form' | 'strata' | 'crownForm'>): 'deciduous' | 'evergreen' | 'semi-evergreen' | 'marcescent' {
  const known = plant.foliage
  if (known === 'deciduous' || known === 'evergreen' || known === 'semi-evergreen' || known === 'marcescent') return known
  // Unknown: a conifer keeps its needles, a ground cover its mat; the rest of
  // a temperate garden loses its leaves (or dies back to the ground).
  if (plant.crownForm === 'conical' || plant.crownForm === 'columnar') return 'evergreen'
  if (plant.strata === 'ground_cover') return 'evergreen'
  return 'deciduous'
}

const ramp = (value: number, from: number, to: number) => Math.min(1, Math.max(0, (value - from) / (to - from)))

export function seasonLook(plant: Pick<ScenePlant, 'foliage' | 'form' | 'strata' | 'crownForm' | 'flowering' | 'fruiting'>, month: number): SeasonLook {
  const m = ((((month - 1) % 12) + 12) % 12) + 1
  const whole = Math.floor(m)
  const blossom = !!plant.flowering?.includes(whole)
  const fruit = !blossom && !!plant.fruiting?.includes(whole)
  // Budburst from early April to mid-May; turning from late September; bare by late November.
  const growing = ramp(m, 4, 5.5) * (1 - ramp(m, 10.6, 11.8))
  const autumn = ramp(m, 9.7, 10.8)
  switch (foliageOf(plant)) {
    case 'evergreen': return { leaf: 1, autumn: 0, blossom, fruit }
    case 'semi-evergreen': return { leaf: 0.55 + 0.45 * growing, autumn: autumn * 0.5 * (m < 12 ? 1 : 0), blossom, fruit }
    // A young oak or beech keeps its dry leaves through winter.
    case 'marcescent': return { leaf: m >= 4 && m < 5.5 ? Math.max(0.6, growing) : 1, autumn: m >= 4 && m < 5.5 ? 1 - growing : autumn || (m < 4 ? 1 : 0), blossom, fruit }
    default: return { leaf: growing, autumn: m >= 4 && m < 9 ? 0 : autumn, blossom, fruit }
  }
}

/**
 * A plant a little taller or smaller than its neighbours of the same kind
 * (±8 %), so a row does not look cloned. What someone measured stays exact.
 */
export function sizeJitter(plant: Pick<ScenePlant, 'seed' | 'measured'>): number {
  if (plant.measured) return 1
  return 0.92 + ((Math.imul(plant.seed | 0, 2654435761) >>> 0) % 1000) / 1000 * 0.16
}

/** The seasons the 3D view can show. */
export type Season = 'winter' | 'spring' | 'summer' | 'autumn'
export const SEASONS: readonly Season[] = ['winter', 'spring', 'summer', 'autumn']

/** The month each season shows (1 = 1 January): mid-January, late April, mid-July, late October. */
export const SEASON_MONTH: Record<Season, number> = { winter: 1.5, spring: 4.8, summer: 7.5, autumn: 10.6 }

/** The season of a month (1 = 1 January … 13 = 31 December). */
export function seasonOfMonth(month: number): Season {
  const m = Math.floor(month)
  return m <= 2 || m === 12 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'autumn'
}

/** The month the 3D shows first: the middle of today's season. */
export function todaysSeasonMonth(now = new Date()): number {
  return SEASON_MONTH[seasonOfMonth(now.getMonth() + 1)]
}
