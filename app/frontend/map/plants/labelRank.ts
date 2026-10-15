/**
 * Which plant names the map writes, and in which order. On arrival the map
 * names what structures the place (zones, the pond, big trees); shrubs and
 * small plants are named as one zooms in. When two names collide, the
 * bigger crown keeps its name.
 */

/** Zoom from which a plant's name shows, by its adult crown (metres). */
export function plantLabelZoom(crownM: number | null | undefined): number {
  if (crownM == null || !Number.isFinite(crownM)) return 19
  if (crownM >= 6) return 17
  if (crownM >= 2) return 18
  return 19
}

/** MapLibre places the lowest `symbol-sort-key` first: big crowns first. */
export function plantLabelRank(crownM: number | null | undefined): number {
  return crownM != null && Number.isFinite(crownM) ? -crownM : 0
}
