// The element library of the server (config/map_elements.yml), via
// src/i18n/elements.json, and the labels of layers, kinds and species.
import catalog from '../i18n/elements.json'
import { has, t } from './i18n'
import type { MapFeature, Planting } from './types'

type Catalog = Record<string, { color: string; elements: Record<string, { geometries: string[]; color: string; pickable: boolean; icon?: string }> }>
const CATALOG = catalog as Catalog

export const LAYERS = Object.keys(CATALOG)

export const PLANTED_COLOR = '#3d7d42'
export const PLANNED_COLOR = '#726b9f'

/**
 * One colour per strata, as on the website (map/plants/strataColors.ts):
 * dark and light green for the two tree strata, then warm and cool hues for
 * the lower ones, so a plan reads at a glance on an aerial photo.
 */
export const STRATA_COLORS: Record<string, string> = {
  canopy: '#4d5500',
  sub_canopy: '#afbd00',
  shrub: '#c8305e',
  herbaceous: '#ef9b0d',
  ground_cover: '#1f8f7a',
  vine: '#7a3e9d',
  root: '#a05f00',
  aquatic: '#2b7bb9',
}

/** A plant's colour on the map: its strata's, else the planted green. */
export function strataColor(feature: MapFeature, planting?: Planting): string {
  const strata = planting?.species[String(feature.properties.species_id)]?.strata
  return (strata && STRATA_COLORS[strata]) || PLANTED_COLOR
}

/** Ink for a number written on a strata colour: white on dark hues, ink on light ones (as the website's inkOn). */
export function inkOn(color: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(color.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3 ? '#1b1712' : '#ffffff'
}

/** Glyphs drawn on point discs (assets/map-icons, scripts/map-icons.mjs). */
export const POINT_ICON_NAMES = [
  'calendar-days', 'circle-dot', 'circle-gauge', 'cloud-rain', 'cylinder', 'door-open', 'droplet', 'egg', 'faucet', 'gauge',
  'hexagon', 'moon', 'plug-zap', 'recycle', 'sticky-note', 'thermometer-snowflake', 'tree-deciduous',
  'paw-print', 'flower-2', 'sprout', 'map-pin',
] as const
export type PointIcon = (typeof POINT_ICON_NAMES)[number]

/**
 * The glyph of a point: an observation says what it saw (an animal, a wild
 * plant, a soil reading by its plants), anything else takes its kind's icon
 * from the element library, else a pin.
 */
export function pointIcon(feature: MapFeature): PointIcon {
  const p = feature.properties
  if (p.kind === 'note_point') {
    if (p.realm === 'fauna') return 'paw-print'
    if (p.realm === 'flora') return 'flower-2'
    if (p.agronomy) return 'sprout'
  }
  const icon = CATALOG[p.layer]?.elements[p.kind]?.icon
  return icon && (POINT_ICON_NAMES as readonly string[]).includes(icon) ? (icon as PointIcon) : 'map-pin'
}

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

/** What a person reads for a feature: its name, else its species, else its sign (a season sign), else its kind. */
export function featureTitle(feature: MapFeature, planting?: Planting): string {
  return feature.properties.name || speciesName(planting, feature.properties.species_id) || signName(feature) || kindLabel(feature.properties.kind)
}

/** « Neige qui fond d'abord » for a season sign noted without a name (by an AI, say). */
function signName(feature: MapFeature): string | null {
  const sign = feature.properties.sign
  return feature.properties.kind === 'season_sign' && typeof sign === 'string' && has(`drawing.options.sign.${sign}`) ? t(`drawing.options.sign.${sign}`) : null
}
