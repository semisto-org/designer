import { PANELS } from '@/map/panels'

// The journey points at panels by a stable name; other areas may register
// theirs under a slightly different id. The first registered alias wins; no
// match means "no button" rather than a dead one.
const ALIASES: Record<string, string[]> = {
  layers: ['layers', 'data-layers', 'map-layers', 'geoportal', 'geoportail', 'layer-catalog'],
  palette: ['palette', 'plant-palette', 'plants', 'catalogue'],
}

/** Opening one of these counts as "I looked at the data layers" (not the drawing layers). */
export function isLayersPanel(id: string): boolean {
  return ALIASES.layers.includes(id)
}

/** The panel to open for a journey step, among those this person can open (same rule as the panel rail). */
export function resolvePanel(name: string, canEdit: boolean, isOwner = false): string | null {
  const available = PANELS.filter((p) => !p.requires || (p.requires === 'editor' ? canEdit : isOwner)).map((p) => p.id)
  return (ALIASES[name] ?? [name]).find((id) => available.includes(id)) ?? null
}
