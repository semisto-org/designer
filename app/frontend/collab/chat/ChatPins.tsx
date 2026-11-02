import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl'
import { useEffect } from 'react'
import { useEditor } from '@/map/editor/EditorContext'
import type { CommentData } from '@/types/collab'
import { chatActions } from './chatStore'

const SOURCE = 'chat-pins'
const HALO = 'chat-pins-halo'
const DOT = 'chat-pins-dot'

/**
 * The spots the discussion's messages are pinned to, drawn on the map while
 * the discussion shows (hidden with it, so working on the map stays clear).
 * A click on a pin brings its message into view.
 */
export function ChatPins({ comments }: { comments: CommentData[] }) {
  const { instance } = useEditor()

  useEffect(() => {
    const data = {
      type: 'FeatureCollection' as const,
      features: comments.flatMap((comment) => comment.location ? [{
        type: 'Feature' as const,
        id: comment.id,
        geometry: { type: 'Point' as const, coordinates: comment.location },
        properties: { id: comment.id, photo: comment.photo != null },
      }] : []),
    }
    const source = instance.getSource(SOURCE) as GeoJSONSource | undefined
    if (source) {
      source.setData(data)
    } else {
      instance.addSource(SOURCE, { type: 'geojson', data })
      // Semisto prune, read from the design tokens so the map follows the palette.
      const prune = getComputedStyle(document.documentElement).getPropertyValue('--color-prune-600').trim() || 'rgb(91 87 129)'
      instance.addLayer({ id: HALO, type: 'circle', source: SOURCE, paint: { 'circle-radius': 13, 'circle-color': prune, 'circle-opacity': 0.18 } })
      instance.addLayer({
        id: DOT,
        type: 'circle',
        source: SOURCE,
        paint: { 'circle-radius': ['case', ['get', 'photo'], 7, 6], 'circle-color': prune, 'circle-stroke-color': 'white', 'circle-stroke-width': 2.5 },
      })
    }
    ;[HALO, DOT].forEach((id) => { if (instance.getLayer(id)) instance.moveLayer(id) })
  }, [instance, comments])

  useEffect(() => {
    const onClick = (event: MapLayerMouseEvent) => {
      const id = Number(event.features?.[0]?.properties?.id)
      if (id) chatActions.focus(id)
    }
    const enter = () => { instance.getCanvas().style.cursor = 'pointer' }
    const leave = () => { instance.getCanvas().style.cursor = '' }
    instance.on('click', DOT, onClick)
    instance.on('mouseenter', DOT, enter)
    instance.on('mouseleave', DOT, leave)
    return () => {
      instance.off('click', DOT, onClick)
      instance.off('mouseenter', DOT, enter)
      instance.off('mouseleave', DOT, leave)
      ;[DOT, HALO].forEach((id) => { if (instance.getLayer(id)) instance.removeLayer(id) })
      if (instance.getSource(SOURCE)) instance.removeSource(SOURCE)
    }
  }, [instance])

  return null
}
