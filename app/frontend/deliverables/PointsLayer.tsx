import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl'
import { useEffect } from 'react'
import { useMapInstance } from '@/map/MapContext'
import type { DeliverablePhoto, DeliverableSoilSample } from '@/types/collab'

const SOURCE = 'deliverable-points'
const LAYER = 'deliverable-points'
const LABELS = 'deliverable-points-labels'
// The brand plum for photos, the mango of « attention » for soil points: the
// same colours as the editor's photo and soil overlays (tokens prune-600, humus-500).
const PHOTO_COLOR = 'rgb(91 87 129)'
const SOIL_COLOR = 'rgb(239 159 39)'

export type PointPick = { kind: 'photo' | 'soil'; id: number }

/**
 * The deliverable's photos and soil points on the plan: a dot where each
 * photo was taken and each sample was dug, to walk to on site. A tap opens
 * the photo or scrolls to the analysis. Installed idempotently.
 */
export function PointsLayer({ photos, samples, onPick }: {
  photos: DeliverablePhoto[]
  samples: DeliverableSoilSample[]
  onPick: (pick: PointPick) => void
}) {
  const map = useMapInstance()

  useEffect(() => {
    if (!map) return
    const data: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        ...photos.filter((p) => p.lng != null && p.lat != null).map((p) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [p.lng as number, p.lat as number] },
          properties: { kind: 'photo', id: p.id, label: '' },
        })),
        ...samples.filter((s) => s.lng != null && s.lat != null).map((s) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [s.lng as number, s.lat as number] },
          properties: { kind: 'soil', id: s.id, label: s.label },
        })),
      ],
    }
    const source = map.getSource(SOURCE) as GeoJSONSource | undefined
    if (source) source.setData(data)
    else map.addSource(SOURCE, { type: 'geojson', data })
    if (!map.getLayer(LAYER)) {
      map.addLayer({
        id: LAYER,
        type: 'circle',
        source: SOURCE,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 4, 19, 8],
          'circle-color': ['match', ['get', 'kind'], 'soil', SOIL_COLOR, PHOTO_COLOR],
          'circle-stroke-color': 'white',
          'circle-stroke-width': 2,
        },
      })
    }
    if (!map.getLayer(LABELS)) {
      map.addLayer({
        id: LABELS,
        type: 'symbol',
        source: SOURCE,
        filter: ['==', ['get', 'kind'], 'soil'],
        layout: { 'text-field': ['get', 'label'], 'text-size': 12, 'text-offset': [0, 1.2], 'text-anchor': 'top' },
        paint: { 'text-color': 'rgb(64 52 40)', 'text-halo-color': 'white', 'text-halo-width': 1.5 },
      })
    }
  }, [map, photos, samples])

  useEffect(() => {
    if (!map) return
    const click = (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0]
      if (!feature) return
      const { kind, id } = feature.properties as { kind: 'photo' | 'soil'; id: number }
      onPick({ kind, id: Number(id) })
    }
    const enter = () => { map.getCanvas().style.cursor = 'pointer' }
    const leave = () => { map.getCanvas().style.cursor = '' }
    map.on('click', LAYER, click)
    map.on('mouseenter', LAYER, enter)
    map.on('mouseleave', LAYER, leave)
    return () => {
      map.off('click', LAYER, click)
      map.off('mouseenter', LAYER, enter)
      map.off('mouseleave', LAYER, leave)
    }
  }, [map, onPick])

  return null
}

/** Centres the plan on a point, for « Voir sur le plan ». */
export function flyTo(map: import('maplibre-gl').Map | null, lng: number | null, lat: number | null) {
  if (!map || lng == null || lat == null) return
  map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 19) })
}
