import type { Feature, FeatureCollection, Geometry } from 'geojson'

/** A design phase put away (MapPhase#as_json). */
export type DesignPhase = {
  id: number
  number: number
  name: string
  notes: string | null
  counts: { planned?: number; existing?: number; by_layer?: Record<string, number> }
  putAwayAt: string
  putAwayBy?: string
  /** Every variant of its time (each designer's sketch, each proposal), with its own elements counted. Absent on a map without variants. */
  variants?: PhaseVariant[]
}

export type PhaseVariant = { id: number; name: string; retained: boolean; author?: string | null; own?: number }

/** The variant a reopened phase shows by default: the one retained then (null: the phase kept no variant). */
export function phaseRetained(phase: DesignPhase): number | null {
  return phase.variants?.find((v) => v.retained)?.id ?? null
}

export type PhaseFeature = Feature<Geometry, Record<string, unknown> & { id: number; layer: string; kind: string; name?: string | null }>

/** What the map of today changed since the phase (MapPhase#compare). */
export type PhaseCompare = { added: number[]; removed: number[]; changed: number[] }

export type OpenPhase = DesignPhase & { snapshot: { type: 'FeatureCollection'; features: PhaseFeature[] }; compare: PhaseCompare }

/** Today's element as compared with a phase (a MapFeature's properties, loosely). */
type TodayFeature = { properties: { id: number; layer: string; status?: string; lockVersion?: number; variant_id?: number | null } }

/** Notes a phase keeps (MapPhase::KEPT_NOTE_KINDS): the freehand sketches are a pencil designer's design. */
const KEPT_NOTE_KINDS = ['sketch']

/** Whether a phase keeps this element (MapPhase.kept): everything but the visit notes. */
export function keptByPhase(p: { layer: string; kind?: unknown }): boolean {
  return p.layer !== 'notes' || KEPT_NOTE_KINDS.includes(String(p.kind))
}

/**
 * The phase seen in one of its variants (MapPhase#features_of): the common
 * project and that variant's own elements; every element when the phase
 * kept no variant.
 */
export function phaseFeaturesOf(phase: OpenPhase, variant: number | null): PhaseFeature[] {
  if (!phase.variants?.length && variant == null) return phase.snapshot.features
  return phase.snapshot.features.filter((f) => {
    const own = f.properties.variant_id
    return own == null || own === variant
  })
}

/**
 * What the map of today changed since the phase, worked out from the
 * editor's elements (mirrors MapPhase#compare): the phase seen in
 * `variant`, against today's common project and that variant if it still
 * exists, else the variant retained today; visit notes left out.
 */
export function compareWith(phase: OpenPhase, features: TodayFeature[], retained: number | null, variant: number | null = phaseRetained(phase), variantsToday: number[] = []): PhaseCompare {
  const kept = new Map(phaseFeaturesOf(phase, variant).map((f) => [Number(f.properties.id), f.properties.lockVersion]))
  const against = variant != null && variantsToday.includes(variant) ? variant : retained
  const now = new Map<number, unknown>()
  for (const f of features) {
    const p = f.properties as TodayFeature['properties'] & { kind?: unknown }
    if (p.status !== 'active' || !keptByPhase(p)) continue
    if (p.variant_id != null && p.variant_id !== against) continue
    now.set(p.id, p.lockVersion)
  }
  const added = [...now.keys()].filter((id) => !kept.has(id)).sort((a, b) => a - b)
  const removed = [...kept.keys()].filter((id) => !now.has(id)).sort((a, b) => a - b)
  const changed = [...kept.keys()].filter((id) => now.has(id) && now.get(id) !== kept.get(id)).sort((a, b) => a - b)
  return { added, removed, changed }
}

export type PhaseState = 'same' | 'changed' | 'removed'

/** How an element of the phase fares on the map of today. */
export function phaseStateOf(compare: PhaseCompare, id: number): PhaseState {
  if (compare.removed.includes(id)) return 'removed'
  if (compare.changed.includes(id)) return 'changed'
  return 'same'
}

/**
 * Whether an element of the phase was design work then: a project (a
 * plant not yet in the ground), or a drawing (zone, bubble, pencil sketch).
 */
export function isPhaseProject(feature: PhaseFeature): boolean {
  const p = feature.properties
  return p.planned === true || (p.layer === 'plants' && !p.planted_on) || p.layer === 'drawings' || (p.layer === 'notes' && KEPT_NOTE_KINDS.includes(String(p.kind)))
}

/** The phase's elements in `variant`, each told what became of it since (for the map layers). */
export function phaseCollection(phase: OpenPhase, compare: PhaseCompare = phase.compare, variant: number | null = phaseRetained(phase)): FeatureCollection<Geometry> {
  return {
    type: 'FeatureCollection',
    // What was already there is today's map too: the sheet carries the
    // project, and what of the existing changed since.
    features: phaseFeaturesOf(phase, variant).filter((feature) => isPhaseProject(feature) || phaseStateOf(compare, Number(feature.properties.id)) !== 'same').map((feature) => ({
      type: 'Feature',
      id: feature.id ?? feature.properties.id,
      geometry: feature.geometry,
      properties: {
        id: feature.properties.id,
        layer: feature.properties.layer,
        planned: isPhaseProject(feature),
        state: phaseStateOf(compare, Number(feature.properties.id)),
        stroke: feature.properties.kind === 'sketch' || undefined,
      },
    })),
  }
}

/** Suggested names for the next phase, in the order a design usually goes. */
export const PHASE_NAMES = ['esquisse', 'avant_projet', 'projet_detaille', 'plan_de_plantation'] as const

export const phaseDate = (iso: string) => new Date(iso).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })
