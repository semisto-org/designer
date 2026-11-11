import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type { Feature, FeatureCollection, Geometry, MultiPolygon } from 'geojson'

/**
 * A territory's dossier on the map. A lead on private or agricultural land
 * whose farmer has not said yes is a fuzzy zone (a blurred halo, never a
 * line on a parcel); a lead on public land, or agreed, is a sharp outline.
 * Markers are dots coloured by their proof: computed (attention), seen on
 * site (alive), confirmed (plum). A draft is paler, with an amber ring.
 * A sub-basin is a dashed plum outline under everything else.
 */
export const ITEMS_SOURCE = 'territory-items'
export const TEAM_MAPS_SOURCE = 'territory-team-maps'

export type MapItem = {
  id: number
  kind: 'basin' | 'marker' | 'lead'
  status: string
  geometry: Geometry
  proof?: string | null
  sharp?: boolean | null
  title: string
}

const LEAF = '#6d7a00'
const LEAF_LIGHT = '#c2cf45'
const PRUNE = '#5b5781'
const HUMUS = '#c47f17'
const INK = '#1a1a1a'

export const ITEM_LAYER_IDS = [
  'territory-basin-line',
  'territory-lead-fuzzy-area', 'territory-lead-fuzzy-line', 'territory-lead-fuzzy-point',
  'territory-lead-sharp-area', 'territory-lead-sharp-outline', 'territory-lead-sharp-line', 'territory-lead-sharp-point',
  'territory-marker', 'territory-selected',
]

function collection(items: MapItem[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: items.map((item): Feature => ({
      type: 'Feature',
      id: item.id,
      geometry: item.geometry,
      properties: { id: item.id, kind: item.kind, draft: item.status === 'draft', proof: item.proof ?? 'computed', sharp: item.sharp === true, title: item.title },
    })),
  }
}

const isLead = ['==', ['get', 'kind'], 'lead']
const isSharp = ['==', ['get', 'sharp'], true]
const geom = (type: string) => ['==', ['geometry-type'], type]
const opacity = (full: number) => ['case', ['get', 'draft'], full * 0.55, full]

export function installTerritoryItems(map: MapLibreMap, items: MapItem[], selectedId: number | null) {
  const data = collection(items)
  const source = map.getSource(ITEMS_SOURCE) as GeoJSONSource | undefined
  if (source) {
    source.setData(data)
  } else {
    map.addSource(ITEMS_SOURCE, { type: 'geojson', data })
    map.addLayer({ id: 'territory-basin-casing', type: 'line', source: ITEMS_SOURCE,
      filter: ['==', ['get', 'kind'], 'basin'] as never,
      layout: { 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': 4.5, 'line-opacity': opacity(0.7) as never } })
    map.addLayer({ id: 'territory-basin-line', type: 'line', source: ITEMS_SOURCE,
      filter: ['==', ['get', 'kind'], 'basin'] as never,
      layout: { 'line-join': 'round' },
      paint: { 'line-color': PRUNE, 'line-width': 2.5, 'line-dasharray': [3, 2], 'line-opacity': opacity(0.95) as never } })
    // Fuzzy zones: the blur says « somewhere around here », not « this parcel ».
    map.addLayer({ id: 'territory-lead-fuzzy-area', type: 'fill', source: ITEMS_SOURCE,
      filter: ['all', isLead, ['!', isSharp], geom('Polygon')] as never,
      paint: { 'fill-color': LEAF_LIGHT, 'fill-opacity': opacity(0.3) as never } })
    map.addLayer({ id: 'territory-lead-fuzzy-line', type: 'line', source: ITEMS_SOURCE,
      filter: ['all', isLead, ['!', isSharp], ['!=', ['geometry-type'], 'Point']] as never,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': LEAF_LIGHT, 'line-width': 22, 'line-blur': 14, 'line-opacity': opacity(0.75) as never } })
    map.addLayer({ id: 'territory-lead-fuzzy-point', type: 'circle', source: ITEMS_SOURCE,
      filter: ['all', isLead, ['!', isSharp], geom('Point')] as never,
      paint: { 'circle-color': LEAF_LIGHT, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 18, 16, 48] as never, 'circle-blur': 0.8, 'circle-opacity': opacity(0.8) as never } })
    // Sharp outlines: public land, or the farmer said yes.
    map.addLayer({ id: 'territory-lead-sharp-area', type: 'fill', source: ITEMS_SOURCE,
      filter: ['all', isLead, isSharp, geom('Polygon')] as never,
      paint: { 'fill-color': LEAF, 'fill-opacity': opacity(0.25) as never } })
    map.addLayer({ id: 'territory-lead-sharp-outline', type: 'line', source: ITEMS_SOURCE,
      filter: ['all', isLead, isSharp, geom('Polygon')] as never,
      paint: { 'line-color': LEAF, 'line-width': 2.5, 'line-opacity': opacity(1) as never } })
    map.addLayer({ id: 'territory-lead-sharp-casing', type: 'line', source: ITEMS_SOURCE,
      filter: ['all', isLead, isSharp, ['!=', ['geometry-type'], 'Point']] as never,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': opacity(0.9) as never } })
    map.addLayer({ id: 'territory-lead-sharp-line', type: 'line', source: ITEMS_SOURCE,
      filter: ['all', isLead, isSharp, geom('LineString')] as never,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': LEAF, 'line-width': 4, 'line-opacity': opacity(1) as never } })
    map.addLayer({ id: 'territory-lead-sharp-point', type: 'circle', source: ITEMS_SOURCE,
      filter: ['all', isLead, isSharp, geom('Point')] as never,
      paint: { 'circle-color': LEAF, 'circle-radius': 7, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2, 'circle-opacity': opacity(1) as never } })
    map.addLayer({ id: 'territory-marker', type: 'circle', source: ITEMS_SOURCE,
      filter: ['==', ['get', 'kind'], 'marker'] as never,
      paint: {
        'circle-color': ['match', ['get', 'proof'], 'confirmed', PRUNE, 'seen', LEAF, HUMUS] as never,
        'circle-radius': 6.5,
        'circle-stroke-color': ['case', ['get', 'draft'], HUMUS, '#ffffff'] as never,
        'circle-stroke-width': ['case', ['get', 'draft'], 3, 2] as never,
        'circle-opacity': opacity(1) as never,
      } })
    map.addLayer({ id: 'territory-selected', type: 'circle', source: ITEMS_SOURCE,
      filter: ['==', ['get', 'id'], -1] as never,
      paint: { 'circle-color': 'rgba(0,0,0,0)', 'circle-radius': 14, 'circle-stroke-color': INK, 'circle-stroke-width': 2 } })
  }
  map.setFilter('territory-selected', ['all', ['==', ['get', 'id'], selectedId ?? -1], geom('Point')] as never)
}

/** The team's own maps inside the commune: where the design already goes on. */
export function installTeamMaps(map: MapLibreMap, maps: { id: number; name: string; boundary: MultiPolygon | null }[], visible: boolean) {
  const data: FeatureCollection = {
    type: 'FeatureCollection',
    features: maps.filter((m) => m.boundary).map((m) => ({ type: 'Feature', geometry: m.boundary as MultiPolygon, properties: { id: m.id, name: m.name } })),
  }
  const source = map.getSource(TEAM_MAPS_SOURCE) as GeoJSONSource | undefined
  if (source) source.setData(data)
  else {
    map.addSource(TEAM_MAPS_SOURCE, { type: 'geojson', data })
    map.addLayer({ id: 'territory-team-maps-fill', type: 'fill', source: TEAM_MAPS_SOURCE, paint: { 'fill-color': PRUNE, 'fill-opacity': 0.15 } })
    map.addLayer({ id: 'territory-team-maps-line', type: 'line', source: TEAM_MAPS_SOURCE, paint: { 'line-color': PRUNE, 'line-width': 1.5, 'line-dasharray': [2, 1] } })
  }
  for (const id of ['territory-team-maps-fill', 'territory-team-maps-line']) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
}
