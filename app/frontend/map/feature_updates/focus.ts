import { bbox as turfBbox } from '@turf/turf'
import type { Editor } from '@/map/editor/EditorContext'
import type { MapFeature } from '@/types'

// Room the inspector takes on the right of the map on desktop (w-80 + margins).
const INSPECTOR_PX = 352

/**
 * Selects an element and frames it in the part of the map left visible by
 * a card on the left (desktop) or by the inspector bottom sheet (mobile).
 */
export function focusFeature(editor: Editor, feature: MapFeature, card: HTMLElement | null, isDesktop: boolean) {
  editor.select(feature.properties.id)
  const map = editor.instance
  const box = map.getContainer().getBoundingClientRect()
  const padding = { top: 72, bottom: 72, left: 72, right: 72 }
  if (isDesktop) {
    padding.right = INSPECTOR_PX + 24
    const list = card?.getBoundingClientRect()
    if (list) padding.left = Math.max(padding.left, list.right - box.left + 24)
    const spare = box.width - padding.left - padding.right
    if (spare < 160) padding.left = Math.max(24, padding.left - (160 - spare))
  } else {
    padding.top = 96
    padding.bottom = Math.round(box.height * 0.6) + 16
  }
  const [minX, minY, maxX, maxY] = turfBbox(feature)
  map.fitBounds([[minX, minY], [maxX, maxY]], { padding, maxZoom: 19, duration: 600 })
}
