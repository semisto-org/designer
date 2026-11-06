/**
 * Variants of a map's project (« Projet 1 », « Projet 2 »), server model
 * MapVariant. What is still a project belongs to every variant (no
 * `variant_id`) or to exactly one; what is on the ground belongs to none.
 * The map shows one variant at a time: the common project and that
 * variant's own elements. One variant is retained: the one the palette,
 * quantities, offer, implementation plan, 3D and public map count.
 */
export type MapVariant = { id: number; name: string; notes: string | null; position: number; retained: boolean }

export function retainedVariant(variants: MapVariant[]): MapVariant | null {
  return variants.find((v) => v.retained) ?? variants[0] ?? null
}

/** The variant shown on the map: the one chosen if it still exists, else the retained one; null when the map has none. */
export function shownVariant(variants: MapVariant[], chosen: number | null): MapVariant | null {
  return variants.find((v) => v.id === chosen) ?? retainedVariant(variants)
}

/** The variant an element belongs to (null: common, or on the ground). */
export function variantOf(properties: { variant_id?: unknown }): number | null {
  const id = properties.variant_id
  return typeof id === 'number' && id > 0 ? id : null
}

/** Shown with this variant: common elements, and its own. Every element when the map has no variant. */
export function inVariant(properties: { variant_id?: unknown }, shown: number | null): boolean {
  if (shown == null) return true
  const own = variantOf(properties)
  return own == null || own === shown
}

/** MapLibre twin of `inVariant` (null: no test). */
export function variantFilter(shown: number | null): unknown[] | null {
  if (shown == null) return null
  return ['in', ['coalesce', ['get', 'variant_id'], 0], ['literal', [0, shown]]]
}

/** How many elements each variant has of its own (active and drafts alike). */
export function ownCounts(features: { properties: { variant_id?: unknown; status?: unknown } }[]): Map<number, number> {
  const counts = new Map<number, number>()
  for (const f of features) {
    const own = variantOf(f.properties)
    if (own != null && f.properties.status !== 'rejected') counts.set(own, (counts.get(own) ?? 0) + 1)
  }
  return counts
}
