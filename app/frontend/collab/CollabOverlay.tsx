import type { GeoJSONSource, MapGeoJSONFeature } from 'maplibre-gl'
import { useEffect } from 'react'
import { useEditor } from '@/map/editor/EditorContext'
import { geometryCenter } from './geometry'
import { requestGeneralDiscussion, useThreads } from './threadsStore'

const SOURCE = 'comment-badges'
const LAYERS = ['comment-badges-circle', 'comment-badges-count']
const FEATURE_LAYERS = ['features-fill', 'features-line', 'features-point']

/**
 * Over the map: a small count badge on every element that has comments, and
 * the deep link of notification e-mails (?discussion=MapFeature:12 selects
 * the element, ?discussion=Map:1 opens the map's own discussion).
 */
export default function CollabOverlay() {
  const editor = useEditor()
  const { instance, features } = editor
  const { threads } = useThreads(editor.map.id)

  // Badges.
  useEffect(() => {
    const points = threads
      .filter((thread) => thread.type === 'MapFeature' && thread.count > 0)
      .flatMap((thread) => {
        const feature = features.find((f) => f.properties.id === thread.id)
        const center = feature && geometryCenter(feature.geometry)
        return center ? [{
          type: 'Feature' as const,
          id: thread.id,
          geometry: { type: 'Point' as const, coordinates: center },
          properties: { id: thread.id, count: thread.count, unread: thread.unread },
        }] : []
      })
    const data = { type: 'FeatureCollection' as const, features: points }
    const existing = instance.getSource(SOURCE) as GeoJSONSource | undefined
    if (existing) {
      existing.setData(data)
    } else {
      instance.addSource(SOURCE, { type: 'geojson', data })
      instance.addLayer({
        id: LAYERS[0],
        type: 'circle',
        source: SOURCE,
        minzoom: 14,
        paint: {
          'circle-radius': 9,
          'circle-color': ['case', ['get', 'unread'], '#5b5781', '#726b9f'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-translate': [12, -12],
        },
      })
      instance.addLayer({
        id: LAYERS[1],
        type: 'symbol',
        source: SOURCE,
        minzoom: 14,
        layout: { 'text-field': ['to-string', ['get', 'count']], 'text-size': 11, 'text-font': ['Noto Sans Regular'], 'text-allow-overlap': true },
        paint: { 'text-color': '#ffffff', 'text-translate': [12, -12] },
      })
    }
    // The editor installs its feature layers after us on first load: keep the badges on top.
    LAYERS.forEach((id) => { if (instance.getLayer(id)) instance.moveLayer(id) })
  }, [instance, features, threads])

  useEffect(() => () => {
    LAYERS.forEach((id) => { if (instance.getLayer(id)) instance.removeLayer(id) })
    if (instance.getSource(SOURCE)) instance.removeSource(SOURCE)
  }, [instance])

  // Clicking a badge opens that element's discussion (unless a drawn element is under the cursor: the editor handles that).
  useEffect(() => {
    const onClick = (e: { point: { x: number; y: number }; features?: MapGeoJSONFeature[] }) => {
      if (editor.drawing) return
      const hit = e.features?.[0]
      if (!hit || instance.queryRenderedFeatures([e.point.x, e.point.y] as [number, number], { layers: FEATURE_LAYERS.filter((id) => instance.getLayer(id)) }).length > 0) return
      editor.select(Number(hit.properties?.id))
    }
    const enter = () => { instance.getCanvas().style.cursor = 'pointer' }
    const leave = () => { instance.getCanvas().style.cursor = '' }
    instance.on('click', LAYERS[0], onClick)
    instance.on('mouseenter', LAYERS[0], enter)
    instance.on('mouseleave', LAYERS[0], leave)
    return () => {
      instance.off('click', LAYERS[0], onClick)
      instance.off('mouseenter', LAYERS[0], enter)
      instance.off('mouseleave', LAYERS[0], leave)
    }
  }, [instance, editor])

  // Deep link from an e-mail, once.
  useEffect(() => {
    const url = new URL(window.location.href)
    const target = url.searchParams.get('discussion')
    if (!target) return
    const [type, rawId] = target.split(':')
    const id = Number(rawId)
    if (type === 'MapFeature' && features.some((f) => f.properties.id === id)) {
      editor.select(id)
      const center = geometryCenter(features.find((f) => f.properties.id === id)!.geometry)
      if (center) instance.easeTo({ center, duration: 0 })
    } else if (type === 'Map') {
      requestGeneralDiscussion()
      editor.openPanel('discussions')
    }
    url.searchParams.delete('discussion')
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
