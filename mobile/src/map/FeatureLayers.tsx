// The design drawn over the base map: zones, lines, points and plants,
// coloured like on the website, as the display settings filter them.
// Plants are small discs in their strata's colour, so a planted orchard
// reads tree by tree over the aerial photo; close up, a numbered plant's
// disc grows to hold its number, as on a hand-drawn planting plan (the
// website's « Numéro » mode); other points are discs with
// the glyph of what they are. Sectors stay off the map (isShown).
// Tapping a feature selects it (the closest point first, see pickFeatureId).
import { GeoJSONSource, Images, Layer } from '@maplibre/maplibre-react-native'
import { useMemo } from 'react'
import { isShown, type Display } from '@/lib/display-core'
import { featureColor, featureTitle, inkOn, pointIcon, strataColor } from '@/lib/elements'
import { pickFeatureId } from '@/lib/pick'
import type { MapBundle } from '@/lib/types'
import { colors } from '@/ui/theme'
import { POINT_ICON_IMAGES } from './pointIcons'

export const FEATURE_LAYER_IDS = ['features-fill', 'features-line', 'features-line-dashed', 'features-point', 'features-point-icon', 'features-plant', 'features-plant-number']
const FONT = ['Noto Sans Regular']
// From this zoom a numbered plant's disc is big enough to write its number in.
const NUMBER_ZOOM = 19
const NUMBERED: ['!=', ['get', 'number'], ''] = ['!=', ['get', 'number'], '']

export function FeatureLayers({ bundle, display, selectedId, onSelect }: { bundle: MapBundle; display: Display; selectedId: number | null; onSelect?: (id: number) => void }) {
  const data = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: bundle.features.filter((feature) => isShown(feature.properties, display, bundle.planting)).map((feature) => {
      const plant = feature.properties.kind === 'plant'
      const color = plant ? strataColor(feature, bundle.planting) : featureColor(feature)
      const number = plant && Number(feature.properties.number) > 0 ? String(feature.properties.number) : ''
      return {
      type: 'Feature',
      id: feature.id,
      geometry: feature.geometry as GeoJSON.Geometry,
      properties: {
        fid: feature.id,
        kind: feature.properties.kind,
        color,
        number,
        ink: inkOn(color),
        icon: feature.geometry.type === 'Point' && feature.properties.kind !== 'plant' ? pointIcon(feature) : '',
        label: feature.properties.kind === 'plant' ? '' : featureTitle(feature, bundle.planting),
        planted: feature.properties.planted_on ? 1 : 0,
        selected: feature.id === selectedId ? 1 : 0,
        pending: feature.properties.pending ? 1 : 0,
        // Not on the ground yet: an AI draft, or a structure still in project.
        dashed: feature.properties.status === 'draft' || feature.properties.planned === true ? 1 : 0,
      },
    }
    }),
  }), [bundle, display, selectedId])

  const boundary = bundle.map.boundary

  return (
    <>
      <Images images={POINT_ICON_IMAGES} />
      {boundary && (
        <GeoJSONSource id="boundary" data={{ type: 'Feature', geometry: boundary as GeoJSON.Geometry, properties: {} }}>
          {/* As on the website (map/layers/boundary.ts): a plum wash, a white casing, a plum line. */}
          <Layer id="boundary-fill" type="fill" paint={{ 'fill-color': colors.prune600, 'fill-opacity': 0.12 }} />
          <Layer id="boundary-casing" type="line" paint={{ 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.9 }} />
          <Layer id="boundary-line" type="line" paint={{ 'line-color': colors.prune600, 'line-width': 3 }} />
        </GeoJSONSource>
      )}
      <GeoJSONSource
        id="features"
        data={data}
        // Without onSelect (measuring), a tap goes through to the map.
        onPress={onSelect && ((event) => {
          const fid = pickFeatureId(event.nativeEvent.features)
          if (fid === null) return
          // Otherwise the press bubbles up to the Map, whose onPress clears the selection.
          event.stopPropagation()
          onSelect(fid)
        })}
      >
        {/* As on the website (map/layers/features.ts): what is not on the ground yet is lighter and dashed. */}
        <Layer id="features-fill" type="fill" filter={['==', ['geometry-type'], 'Polygon']}
          paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': ['case', ['==', ['get', 'selected'], 1], 0.45, ['==', ['get', 'dashed'], 1], 0.12, 0.25] }} />
        <Layer id="features-line" type="line" filter={['all', ['!=', ['geometry-type'], 'Point'], ['==', ['get', 'dashed'], 0]]}
          paint={{ 'line-color': ['get', 'color'], 'line-width': ['case', ['==', ['get', 'selected'], 1], 5, 2.5] }} />
        <Layer id="features-line-dashed" type="line" filter={['all', ['!=', ['geometry-type'], 'Point'], ['==', ['get', 'dashed'], 1]]}
          paint={{ 'line-color': ['get', 'color'], 'line-width': ['case', ['==', ['get', 'selected'], 1], 5, 2.5], 'line-dasharray': [3, 2] }} />
        <Layer id="features-point" type="circle" filter={['all', ['==', ['geometry-type'], 'Point'], ['!=', ['get', 'kind'], 'plant']]}
          paint={{
            'circle-color': ['get', 'color'],
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, 7, 18, ['case', ['==', ['get', 'selected'], 1], 13, 10]],
            'circle-stroke-color': '#ffffff', 'circle-stroke-width': ['case', ['==', ['get', 'selected'], 1], 3, 1.5],
            'circle-opacity': ['case', ['==', ['get', 'dashed'], 1], 0.6, 0.92],
          }} />
        {/* The glyph only once the disc is big enough to hold it. */}
        <Layer id="features-point-icon" type="symbol" minzoom={16} filter={['all', ['==', ['geometry-type'], 'Point'], ['!=', ['get', 'kind'], 'plant']]}
          layout={{ 'icon-image': ['get', 'icon'], 'icon-size': ['interpolate', ['linear'], ['zoom'], 16, 0.24, 18, 0.33], 'icon-allow-overlap': true, 'icon-ignore-placement': true }} />
        {/* A plant: a small disc in its strata's colour, light enough to see the ground through, with a white edge; not planted yet, a ring. */}
        <Layer id="features-plant" type="circle" filter={['==', ['get', 'kind'], 'plant']}
          paint={{
            'circle-color': ['case', ['==', ['get', 'planted'], 1], ['get', 'color'], '#ffffff'],
            // Holding a number, the disc is denser so the figure stays readable over the photo.
            'circle-opacity': ['step', ['zoom'], ['case', ['==', ['get', 'planted'], 1], 0.7, 0.55],
              NUMBER_ZOOM, ['case', ['==', ['get', 'planted'], 1], ['case', NUMBERED, 0.92, 0.7], ['case', NUMBERED, 0.9, 0.55]]],
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, 2, 17, 3.5,
              NUMBER_ZOOM - 0.01, ['case', ['==', ['get', 'selected'], 1], 8, 5.5],
              NUMBER_ZOOM, ['case', NUMBERED, ['case', ['==', ['get', 'selected'], 1], 15, 12], ['==', ['get', 'selected'], 1], 8, 5.5],
              21, ['case', NUMBERED, ['case', ['==', ['get', 'selected'], 1], 19, 16], ['==', ['get', 'selected'], 1], 14, 10]],
            'circle-stroke-color': ['case', ['==', ['get', 'planted'], 1], '#ffffff', ['get', 'color']],
            'circle-stroke-width': ['case', ['==', ['get', 'selected'], 1], 3, ['==', ['get', 'planted'], 1], 1, 2],
            'circle-stroke-opacity': ['case', ['==', ['get', 'pending'], 1], 0.6, 0.9],
          }} />
        {/* The plant's number inside its disc, in white or ink depending on the strata colour (ink on a ring not planted yet). */}
        <Layer id="features-plant-number" type="symbol" minzoom={NUMBER_ZOOM} filter={['all', ['==', ['get', 'kind'], 'plant'], NUMBERED]}
          layout={{ 'text-field': ['get', 'number'], 'text-font': ['Noto Sans Bold'], 'text-size': 14, 'text-allow-overlap': true, 'text-ignore-placement': true }}
          paint={{ 'text-color': ['case', ['==', ['get', 'planted'], 1], ['get', 'ink'], '#1b1712'] }} />
        <Layer id="features-label" type="symbol" minzoom={17}
          layout={{ 'text-field': ['get', 'label'], 'text-font': FONT, 'text-size': 14, 'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-optional': true }}
          paint={{ 'text-color': '#1b1712', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 }} />
      </GeoJSONSource>
    </>
  )
}
