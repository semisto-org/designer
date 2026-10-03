import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type { FeatureCollection, MultiPolygon } from 'geojson'
import type { ParcelData } from '@/types/map_data'

export const PARCELS_SOURCE = 'parcel-selection'
const LAYERS = ['parcel-selection-fill', 'parcel-selection-line']

function collection(parcels: ParcelData[]): FeatureCollection<MultiPolygon> {
  return {
    type: 'FeatureCollection',
    features: parcels.map((p) => ({ type: 'Feature', geometry: p.geometry, properties: { capakey: p.capakey } })),
  }
}

/** Parcels picked for the terrain outline, highlighted under the features. */
export function showParcelSelection(map: MapLibreMap, parcels: ParcelData[]) {
  const data = collection(parcels)
  const source = map.getSource(PARCELS_SOURCE) as GeoJSONSource | undefined
  if (source) {
    source.setData(data)
    return
  }
  map.addSource(PARCELS_SOURCE, { type: 'geojson', data })
  const before = map.getLayer('features-fill') ? 'features-fill' : undefined
  map.addLayer({ id: LAYERS[0], type: 'fill', source: PARCELS_SOURCE, paint: { 'fill-color': '#726b9f', 'fill-opacity': 0.3 } }, before)
  map.addLayer({ id: LAYERS[1], type: 'line', source: PARCELS_SOURCE, paint: { 'line-color': '#4a4668', 'line-width': 2.5 } }, before)
}

export function hideParcelSelection(map: MapLibreMap) {
  if (!map.getStyle()) return
  LAYERS.forEach((id) => map.getLayer(id) && map.removeLayer(id))
  if (map.getSource(PARCELS_SOURCE)) map.removeSource(PARCELS_SOURCE)
}
