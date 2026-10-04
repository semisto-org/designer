// The element library of the server (config/map_elements.yml), via
// src/i18n/elements.json, and the labels of layers, kinds and species.
import catalog from '../i18n/elements.json'
import { has, t } from './i18n'
import type { MapFeature, Planting } from './types'

type Catalog = Record<string, { color: string; elements: Record<string, { geometries: string[]; color: string; pickable: boolean }> }>
const CATALOG = catalog as Catalog

export const LAYERS = Object.keys(CATALOG)

export const PLANTED_COLOR = '#3d7d42'
export const PLANNED_COLOR = '#726b9f'

export function featureColor(feature: MapFeature): string {
  const own = (feature.properties.style as { color?: string } | undefined)?.color
  if (typeof own === 'string' && /^#[0-9a-f]{6}$/i.test(own)) return own
  if (feature.properties.kind === 'plant') return feature.properties.planted_on ? PLANTED_COLOR : PLANNED_COLOR
  const layer = CATALOG[feature.properties.layer]
  return layer?.elements[feature.properties.kind]?.color ?? layer?.color ?? '#6e6355'
}

/** Kinds one can create on the terrain, for a geometry type. */
export function kindsFor(geometry: 'Point' | 'LineString' | 'Polygon'): { layer: string; kind: string }[] {
  return Object.entries(CATALOG).flatMap(([layer, config]) =>
    Object.entries(config.elements)
      .filter(([, spec]) => spec.pickable && spec.geometries.includes(geometry) && layer !== 'plants')
      .map(([kind]) => ({ layer, kind })))
}

export const layerLabel = (layer: string) => t(`editor.layers.${layer}`)
export const kindLabel = (kind: string) => (has(`editor.kinds.${kind}`) ? t(`editor.kinds.${kind}`) : t('mobile.feature.untitled'))

export function speciesName(planting: Planting | undefined, speciesId: unknown): string | null {
  const species = planting?.species[String(speciesId)]
  if (!species) return null
  return species.commonName ? `${species.commonName} (${species.latinName})` : species.latinName
}

/** What a person reads for a feature: its name, else its species, else its kind. */
export function featureTitle(feature: MapFeature, planting?: Planting): string {
  return feature.properties.name || speciesName(planting, feature.properties.species_id) || kindLabel(feature.properties.kind)
}
