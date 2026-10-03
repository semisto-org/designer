import { PANELS } from '@/map/panels'

// The journey points at panels by a stable name; other areas may register
// theirs under a slightly different id. The first registered alias wins; no
// match means "no button" rather than a dead one.
const ALIASES: Record<string, string[]> = {
  layers: ['layers', 'data-layers', 'map-layers', 'geoportal', 'geoportail', 'layer-catalog'],
  palette: ['palette', 'plant-palette', 'plants', 'catalogue'],
}

/** Opening any of these counts as "I looked at the data layers". */
export const LAYERS_PANEL_PATTERN = /layer|geoport|couche/i

export function resolvePanel(name: string, canEdit: boolean): string | null {
  const available = PANELS.filter((p) => !p.requires || canEdit).map((p) => p.id)
  return (ALIASES[name] ?? [name]).find((id) => available.includes(id)) ?? null
}
