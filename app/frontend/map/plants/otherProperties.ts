// Properties a plant may carry that no section of its sheet shows: written by
// an AI through the MCP or brought by an import (« santé », « production
// 2025 »…). Pure, no React: test/frontend/plants tests it.

/** Keys some section of a plant's sheet already shows or uses. */
export const SHOWN_PLANT_KEYS: ReadonlySet<string> = new Set([
  // Added by MapFeature#as_geojson, never the plant's own.
  'id', 'layer', 'kind', 'name', 'notes', 'status', 'source', 'rationale', 'style', 'lockVersion', 'updatedAt', 'tags',
  // The plant sheet, its photos and its GPS check.
  'species_id', 'variety_id', 'planted_on', 'planted_on_precision', 'training', 'graft_form', 'trunk_height',
  'rootstock_vigor', 'rootstock', 'count', 'number', 'cover_photo_id', 'gps_checked', 'gps_accuracy_m', 'planned', 'built_on',
  // Its phase in the implementation plan (« Mise en œuvre »).
  'phase_id',
])

export type OtherProperty = { key: string; label: string; value: string }

/** `production_2025` → « production 2025 ». */
export function propertyLabel(key: string): string {
  const words = key.replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function shown(value: unknown): string | null {
  if (value == null || value === '') return null
  if (typeof value === 'boolean') return value ? 'oui' : 'non'
  if (Array.isArray(value)) return value.map((v) => shown(v)).filter((v): v is string => v != null).join(', ') || null
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** The plant's other properties, in key order, empty values left out. */
export function otherProperties(properties: Record<string, unknown>): OtherProperty[] {
  return Object.keys(properties)
    .filter((key) => !SHOWN_PLANT_KEYS.has(key))
    .sort((a, b) => a.localeCompare(b, 'fr'))
    .flatMap((key) => {
      const value = shown(properties[key])
      return value == null ? [] : [{ key, label: propertyLabel(key), value }]
    })
}
