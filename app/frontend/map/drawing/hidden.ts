/**
 * What the viewer hid on the map besides whole layers: kinds of elements
 * (« mare », « haie »…) and plant strata. Pure helpers shared by the map,
 * the « Calques » panel, the legend and the PDF export, so all four agree
 * on what is shown.
 */

/** Plants whose strata is not known yet (no species, or data loading). */
export const UNKNOWN_STRATA = 'unknown'

type FeatureLike = { properties: { id: number; layer: string; kind: string | null } }

export const isPlantLike = (f: FeatureLike) => f.properties.layer === 'plants' && f.properties.kind === 'plant'

/** The strata key a plant is toggled by. */
export const strataKey = (strata: string | null | undefined) => strata ?? UNKNOWN_STRATA

/** Ids of the plants hidden by their strata: the map filters the plant points by id. */
export function hiddenPlantIds(features: FeatureLike[], strata: string[], strataOf: (f: FeatureLike) => string | null): number[] {
  if (strata.length === 0) return []
  return features.filter((f) => isPlantLike(f) && strata.includes(strataKey(strataOf(f)))).map((f) => f.properties.id).sort((a, b) => a - b)
}

/** MapLibre tests that leave out hidden kinds and hidden plant ids (none when nothing is hidden). */
export function hiddenTests(kinds: string[], ids: number[]): unknown[] {
  const tests: unknown[] = []
  if (kinds.length) tests.push(['!', ['in', ['coalesce', ['get', 'kind'], ''], ['literal', kinds]]])
  if (ids.length) tests.push(['!', ['in', ['get', 'id'], ['literal', ids]]])
  return tests
}
