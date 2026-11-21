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
}

export type PhaseFeature = Feature<Geometry, Record<string, unknown> & { id: number; layer: string; kind: string; name?: string | null }>

/** What the map of today changed since the phase (MapPhase#compare). */
export type PhaseCompare = { added: number[]; removed: number[]; changed: number[] }

export type OpenPhase = DesignPhase & { snapshot: { type: 'FeatureCollection'; features: PhaseFeature[] }; compare: PhaseCompare }

/** Today's element as compared with a phase (a MapFeature's properties, loosely). */
type TodayFeature = { properties: { id: number; layer: string; status?: string; lockVersion?: number; variant_id?: number | null } }

/**
 * What the map of today changed since the phase, worked out from the
 * editor's elements (mirrors MapPhase#compare): the active elements of the
 * project counted (common, or of the retained variant), notes left out.
 */
export function compareWith(phase: OpenPhase, features: TodayFeature[], retained: number | null): PhaseCompare {
  const kept = new Map(phase.snapshot.features.map((f) => [Number(f.properties.id), f.properties.lockVersion]))
  const now = new Map<number, unknown>()
  for (const f of features) {
    const p = f.properties
    if (p.status !== 'active' || p.layer === 'notes') continue
    if (p.variant_id != null && p.variant_id !== retained) continue
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

/** Whether an element of the phase was still a project then (a plant not yet in the ground). */
export function isPhaseProject(feature: PhaseFeature): boolean {
  return feature.properties.planned === true || (feature.properties.layer === 'plants' && !feature.properties.planted_on)
}

/** The phase's elements, each told what became of it since (for the map layers). */
export function phaseCollection(phase: OpenPhase, compare: PhaseCompare = phase.compare): FeatureCollection<Geometry> {
  return {
    type: 'FeatureCollection',
    // What was already there is today's map too: the sheet carries the
    // project, and what of the existing changed since.
    features: phase.snapshot.features.filter((feature) => isPhaseProject(feature) || phaseStateOf(compare, Number(feature.properties.id)) !== 'same').map((feature) => ({
      type: 'Feature',
      id: feature.id ?? feature.properties.id,
      geometry: feature.geometry,
      properties: {
        id: feature.properties.id,
        layer: feature.properties.layer,
        planned: isPhaseProject(feature),
        state: phaseStateOf(compare, Number(feature.properties.id)),
      },
    })),
  }
}

/** Suggested names for the next phase, in the order a design usually goes. */
export const PHASE_NAMES = ['esquisse', 'avant_projet', 'projet_detaille', 'plan_de_plantation'] as const

export const phaseDate = (iso: string) => new Date(iso).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })
