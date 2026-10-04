// The design drawn over the base map: zones, lines, points and plants,
// coloured like on the website. Tapping a feature selects it.
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native'
import { useMemo } from 'react'
import { featureColor, featureTitle } from '@/lib/elements'
import type { MapBundle } from '@/lib/types'

export const FEATURE_LAYER_IDS = ['features-fill', 'features-line', 'features-point', 'features-plant']
const FONT = ['Noto Sans Regular']

export function FeatureLayers({ bundle, selectedId, onSelect }: { bundle: MapBundle; selectedId: number | null; onSelect: (id: number) => void }) {
  const data = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: bundle.features.map((feature) => ({
      type: 'Feature',
      id: feature.id,
      geometry: feature.geometry as GeoJSON.Geometry,
      properties: {
        fid: feature.id,
        kind: feature.properties.kind,
        color: featureColor(feature),
        label: feature.properties.kind === 'plant' ? '' : featureTitle(feature, bundle.planting),
        planted: feature.properties.planted_on ? 1 : 0,
        selected: feature.id === selectedId ? 1 : 0,
        pending: feature.properties.pending ? 1 : 0,
      },
    })),
  }), [bundle, selectedId])

  const boundary = bundle.map.boundary

  return (
    <>
      {boundary && (
        <GeoJSONSource id="boundary" data={{ type: 'Feature', geometry: boundary as GeoJSON.Geometry, properties: {} }}>
          <Layer id="boundary-line" type="line" paint={{ 'line-color': '#ffffff', 'line-width': 3, 'line-dasharray': [2, 1.5] }} />
        </GeoJSONSource>
      )}
      <GeoJSONSource
        id="features"
        data={data}
        onPress={(event) => {
          const fid = event.nativeEvent.features?.[0]?.properties?.fid
          if (typeof fid === 'number') onSelect(fid)
        }}
      >
        <Layer id="features-fill" type="fill" filter={['==', ['geometry-type'], 'Polygon']}
          paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': ['case', ['==', ['get', 'selected'], 1], 0.45, 0.25] }} />
        <Layer id="features-line" type="line" filter={['!=', ['geometry-type'], 'Point']}
          paint={{ 'line-color': ['get', 'color'], 'line-width': ['case', ['==', ['get', 'selected'], 1], 5, 2.5] }} />
        <Layer id="features-point" type="circle" filter={['all', ['==', ['geometry-type'], 'Point'], ['!=', ['get', 'kind'], 'plant']]}
          paint={{ 'circle-color': ['get', 'color'], 'circle-radius': ['case', ['==', ['get', 'selected'], 1], 10, 7], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 }} />
        <Layer id="features-plant" type="circle" filter={['==', ['get', 'kind'], 'plant']}
          paint={{
            'circle-color': ['case', ['==', ['get', 'planted'], 1], ['get', 'color'], '#ffffff'],
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 16, 4, 20, ['case', ['==', ['get', 'selected'], 1], 14, 10]],
            'circle-stroke-color': ['get', 'color'],
            'circle-stroke-width': ['case', ['==', ['get', 'selected'], 1], 4, 2.5],
            'circle-opacity': ['case', ['==', ['get', 'pending'], 1], 0.7, 1],
          }} />
        <Layer id="features-label" type="symbol" minzoom={17}
          layout={{ 'text-field': ['get', 'label'], 'text-font': FONT, 'text-size': 12, 'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-optional': true }}
          paint={{ 'text-color': '#1b1712', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 }} />
      </GeoJSONSource>
    </>
  )
}
