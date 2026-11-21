import { elementFor, ELEMENTS, GENERIC_KINDS } from '@/map/drawing/catalog'
import { isDiggable, isReceiving } from '@/map/earthworks/earthworks'
import { gpsAccuracy } from '@/map/gps/accuracy'
import { canBePlanned, canBeRemoved, isAnnotationLayer, isPlanned } from '@/map/scenario'
import { variantStore } from '@/map/variants/store'
import type { MapFeature } from '@/types'

// Which inspector sections show for a selected feature (INSPECTOR_SECTIONS).
// The tests live here, away from the sections themselves, so that the editor
// can decide what to show without fetching each section's code (deferred).

export function appliesToVariant(feature: MapFeature): boolean {
  const p = feature.properties
  if (variantStore.get().variants.length === 0 || p.status === 'rejected') return false
  return isPlanned(p) || isAnnotationLayer(p.layer) || p.status === 'draft'
}

export const appliesToFruitStore = (feature: MapFeature) => feature.properties.kind === 'fruit_store' && feature.properties.status !== 'rejected'

// Twin of isPermacultureZone (map/zones/permaculture), whose geometry helpers stay out of the editor's first load.
const isZone = (f: MapFeature) => f.properties.kind === 'permaculture_zone' && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')

export function appliesToZone(feature: MapFeature): boolean {
  if (isZone(feature)) return true
  return !isAnnotationLayer(feature.properties.layer) && feature.properties.status === 'active'
}

export function appliesToGpsPoint(feature: MapFeature): boolean {
  return feature.geometry.type === 'Point' && gpsAccuracy(feature.properties) != null
}

export function appliesToElement(feature: MapFeature): boolean {
  // A sector is edited in its own panel, which keeps its arc and colour in step with its type.
  if (feature.properties.kind === 'sector') return false
  return elementFor(feature.properties.kind) != null || GENERIC_KINDS.includes(feature.properties.kind)
}

export function appliesToProjectState(feature: MapFeature): boolean {
  const p = feature.properties
  return p.status === 'active' && (canBePlanned(p.layer, p.kind) || canBeRemoved(p.layer, p.kind))
}

const PHASE_LAYERS = new Set(['water', 'access', 'structures', 'plants', 'animals', 'networks'])

export function appliesToPhase(feature: MapFeature): boolean {
  const p = feature.properties
  return p.status === 'active' && PHASE_LAYERS.has(p.layer) && (isPlanned(p) || typeof p.phase_id === 'number')
}

export const CATCHMENT_KINDS = ['pond', 'swale', 'keyline', 'rain_garden', 'half_moon', 'check_dam', 'fascine', 'beaver_dam_analogue', 'hedge_bank']

export function appliesToCatchment(feature: MapFeature): boolean {
  return CATCHMENT_KINDS.includes(feature.properties.kind) && feature.properties.status !== 'rejected'
}

export const appliesToInfiltration = (feature: MapFeature) => feature.properties.kind === 'infiltration_test'

export function appliesToKeyline(feature: MapFeature): boolean {
  return feature.properties.kind === 'keyline' && feature.properties.status !== 'rejected' && feature.geometry?.type === 'LineString'
}

export const appliesToStorm = (feature: MapFeature) => feature.properties.kind === 'storm_observation' && feature.properties.status !== 'rejected'

// Twins of MapFeature::WaterLinks (ENDPOINT_LAYERS, ENDPOINT_GEOMETRIES, LINE_GEOMETRIES).
const ENDPOINT_LAYERS = ['existing', 'water', 'structures', 'animals', 'networks']
const ENDPOINT_GEOMETRIES = ['Point', 'Polygon', 'MultiPolygon']
const LINE_GEOMETRIES = ['LineString', 'MultiLineString']

/** A pipe, a ditch, a hose: an element that carries water from one place to another. */
export const isLink = (f: MapFeature) => ELEMENTS[f.properties.kind]?.links === true
/** A swale or a ditch: water can be led into it anywhere along it. */
export const receives = (f: MapFeature) => ELEMENTS[f.properties.kind]?.receives === true && LINE_GEOMETRIES.includes(f.geometry.type)
/** A tank, a pond, a roof, a swale…: what a link can start from or lead to. */
export const isEndpoint = (f: MapFeature) =>
  ENDPOINT_LAYERS.includes(f.properties.layer) && ((ENDPOINT_GEOMETRIES.includes(f.geometry.type) && !isLink(f)) || receives(f))

/** Pipes, ditches, swales… and the tanks, ponds, roofs and swales they can connect. */
export function appliesToLinks(feature: MapFeature): boolean {
  return feature.properties.status !== 'rejected' && (isLink(feature) || isEndpoint(feature))
}

export function appliesToEarthworks(feature: MapFeature): boolean {
  return isDiggable(feature.properties.kind) || isReceiving(feature.properties.kind)
}

/** A bubble (map/tracing), or a free zone, line or note that can be laid on a tracing sheet. */
export function appliesToTracing(feature: MapFeature): boolean {
  const p = feature.properties
  if (p.status === 'rejected' || p.kind === 'sector' || p.kind === 'permaculture_zone') return false
  return p.kind === 'bubble' || p.layer === 'notes' || (p.layer === 'drawings' && ['zone', 'line', 'point'].includes(p.kind))
}
