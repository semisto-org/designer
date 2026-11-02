// The public view's « Aujourd'hui / Avec le projet » switch. When the owner
// publishes the project too (`show_planned`), each feature says where it
// stands with the editor's own properties (map/scenario.ts): the land today
// leaves out what is still a project, the project leaves out what it takes
// away. A snapshot without the project has nothing to switch.
import type { FeatureCollection, Geometry } from 'geojson'
import { isPlanned, isToRemove } from '../map/scenario.ts'
import type { PublicGrowth } from './garden.ts'

export type Situation = 'today' | 'project'

type Collection = FeatureCollection<Geometry, Record<string, unknown>>

/** Whether the snapshot holds a project to switch to. */
export function hasProject(features: Collection): boolean {
  return features.features.some((f) => isPlanned(f.properties) || isToRemove(f.properties))
}

/** The features of one situation. */
export function featuresIn<C extends Collection>(features: C, situation: Situation): C {
  const keep = situation === 'today' ? (p: Record<string, unknown>) => !isPlanned(p) : (p: Record<string, unknown>) => !isToRemove(p)
  return { ...features, features: features.features.filter((f) => keep(f.properties)) }
}

/** The growing plants and patches of the features kept. */
export function growthIn(growth: PublicGrowth, features: Collection): PublicGrowth {
  const ids = new Set(features.features.map((f) => f.properties.id))
  return { ...growth, plants: growth.plants.filter((p) => ids.has(p.id)), patches: growth.patches.filter((p) => ids.has(p.id)) }
}
