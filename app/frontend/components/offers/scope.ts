import type { Candidate, ScopeInput, ScopeMeasure } from '@/types/offers'

export type ItemMeasure = { fromMap: boolean; kind: 'area' | 'length' | null; value: number | null }

/**
 * How one scope line is measured: on the map (the server's resolved
 * measure, or the candidate it was picked from while the server has not
 * answered yet), or typed by hand. A line picked from the map is shown as
 * « from the map » only once a measure is known, so the page never reads a
 * measure that is not there.
 */
export function itemMeasure(item: ScopeInput, resolved: ScopeMeasure | undefined, candidates: Candidate[] | undefined): ItemMeasure {
  if (item.feature_id == null || resolved?.missing) return { fromMap: false, kind: resolved?.measure_kind ?? null, value: null }
  const candidate = candidates?.find((feature) => feature.id === item.feature_id)
  const kind = candidate?.measure_kind ?? resolved?.measure_kind ?? null
  const value = candidate?.measure ?? resolved?.measure ?? null
  return { fromMap: kind != null && value != null, kind, value }
}

/** Elements of the map that can still join the scope, grouped by layer in map order. */
export function addableCandidates(candidates: Candidate[] | undefined, scope: ScopeInput[]): [string, Candidate[]][] {
  const inScope = new Set(scope.map((item) => item.feature_id).filter((id) => id != null))
  const groups = new Map<string, Candidate[]>()
  for (const feature of candidates ?? []) {
    // What is already there (the house, an old hedge) is not priced as planting.
    if (inScope.has(feature.id) || feature.layer === 'existing') continue
    groups.set(feature.layer, [...(groups.get(feature.layer) ?? []), feature])
  }
  return [...groups.entries()]
}
