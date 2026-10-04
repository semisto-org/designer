// Pure helpers (no MapLibre, no aliases): tested with node:test in
// test/frontend/drone/.

/** Source and layer ids of drone views: `aerial-view-<id>`. */
export const AERIAL_PREFIX = 'aerial-view-'

export const aerialLayerId = (viewId: number) => `${AERIAL_PREFIX}${viewId}`

/** The view behind a source or layer id, if it is one of ours. */
export function aerialViewIdOf(id: string | undefined): number | null {
  if (!id?.startsWith(AERIAL_PREFIX)) return null
  const viewId = Number(id.slice(AERIAL_PREFIX.length))
  return Number.isInteger(viewId) && viewId > 0 ? viewId : null
}

/**
 * Where the drone layers must go in the style's layer `order` (bottom to
 * top): right above the topmost "floor" layer (a base map, or the map's
 * neutral fallback) and under everything else. Returns null when they
 * already are there, else the id to insert them before (undefined: on top).
 */
export function aerialMove(order: string[], isFloor: (id: string) => boolean): { before: string | undefined } | null {
  const ours = order.filter((id) => aerialViewIdOf(id) != null)
  if (ours.length === 0) return null
  const others = order.filter((id) => aerialViewIdOf(id) == null)
  let floor = -1
  others.forEach((id, index) => {
    if (isFloor(id)) floor = index
  })
  const before = others[floor + 1]
  const low = floor >= 0 ? order.indexOf(others[floor]) : -1
  const high = before ? order.indexOf(before) : order.length
  const placed = ours.every((id) => {
    const index = order.indexOf(id)
    return index > low && index < high
  })
  return placed ? null : { before }
}
