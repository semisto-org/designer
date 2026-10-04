import raw from '../../../../config/map_elements.yml'
import type { DrawShape } from '@/map/editor/draw'
import type { FeatureLayer, MapFeature } from '@/types'
import type { ElementGeometry, ElementLayer, ElementSpec } from '@/types/drawing'

type RawElement = Omit<ElementSpec, 'kind' | 'layer' | 'geometries' | 'defaults' | 'fields' | 'computed' | 'pickable'> & {
  geometry: ElementGeometry | ElementGeometry[]
  defaults?: Record<string, unknown>
  fields?: ElementSpec['fields']
  computed?: string[]
  pickable?: boolean
}
type RawCatalog = { layers: Record<string, { color: string; elements: Record<string, RawElement> }> }

/** The element library, shared with the server (MapElements). */
export const ELEMENT_LAYERS: ElementLayer[] = Object.entries((raw as unknown as RawCatalog).layers).map(([layer, config]) => ({
  layer: layer as FeatureLayer,
  color: config.color,
  elements: Object.entries(config.elements).map(([kind, spec]) => ({
    ...spec,
    kind,
    layer: layer as FeatureLayer,
    geometries: Array.isArray(spec.geometry) ? spec.geometry : [spec.geometry],
    defaults: spec.defaults ?? {},
    fields: spec.fields ?? [],
    computed: spec.computed ?? [],
    pickable: spec.pickable ?? true,
  })),
}))

export const ELEMENTS: Record<string, ElementSpec> = Object.fromEntries(
  ELEMENT_LAYERS.flatMap((l) => l.elements).map((e) => [e.kind, e]),
)

/** Generic shapes of the editor shell, editable like library elements. */
export const GENERIC_KINDS = ['zone', 'line', 'point']

/** Colours offered in the inspector, besides the element's own. */
export const COLOR_SWATCHES = ['#2b7bb9', '#3d7d42', '#b8851a', '#5b5781', '#946614', '#c03c28', '#6e6355', '#1b1712']

export const DESIGN_LAYERS: FeatureLayer[] = ['existing', 'water', 'access', 'structures', 'plants', 'animals', 'networks', 'notes']

export function elementFor(kind: string | null | undefined): ElementSpec | null {
  return (kind && ELEMENTS[kind]) || null
}

export function layerColor(layer: string): string {
  return ELEMENT_LAYERS.find((l) => l.layer === layer)?.color ?? '#6e6355'
}

/** Colour of a feature: its own style first, then its kind, then its layer. */
export function featureColor(feature: MapFeature): string {
  const own = feature.properties.style?.color
  if (typeof own === 'string' && /^#[0-9a-f]{6}$/i.test(own)) return own
  return elementFor(feature.properties.kind)?.color ?? layerColor(feature.properties.layer)
}

export function drawShapeFor(geometry: ElementGeometry): DrawShape {
  return geometry === 'Point' ? 'point' : geometry === 'Polygon' ? 'polygon' : 'linestring'
}

/** Keys that MapFeature#as_geojson adds next to the stored properties. */
const META_KEYS = new Set(['id', 'layer', 'kind', 'name', 'notes', 'status', 'source', 'rationale', 'style', 'lockVersion', 'updatedAt'])

/** The feature's stored `properties` (without the columns merged in by the server). */
export function storedProperties(feature: MapFeature): Record<string, unknown> {
  return Object.fromEntries(Object.entries(feature.properties).filter(([key]) => !META_KEYS.has(key)))
}
