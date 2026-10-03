import type { ErrorEvent as MapErrorEvent } from 'maplibre-gl'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { useEditor } from '@/map/editor/EditorContext'
import { layerStore, useLayerState, visibleOverlays } from '@/map/data/store'
import { regionKeyOfSource, syncRegionLayers } from '@/map/layers/region'

// A layer is flagged unreachable after this many failed tiles: one stray
// timeout should not mark a whole layer as down.
const ERRORS_BEFORE_FLAG = 3

/**
 * Applies the "Couches" choice (base map, overlays, opacity) to MapLibre,
 * whether the panel is open or not, and watches tile errors of the region
 * layers. Renders nothing.
 */
export default function RegionLayersOverlay() {
  const { instance, map, regionLayers } = useEditor()
  const state = useLayerState()
  const failures = useRef(new Map<string, number>())

  useLayoutEffect(() => {
    layerStore.init(map.id, regionLayers)
    // Only when the map changes: later edits of `map` keep the choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map.id, regionLayers])

  useEffect(() => {
    if (state.mapId !== map.id) return
    syncRegionLayers(
      instance,
      regionLayers,
      { base: state.base, overlays: visibleOverlays(state), opacity: state.opacity, bounds: map.region.bounds },
      layerStore.markError,
    )
  }, [instance, regionLayers, state, map.id, map.region.bounds])

  useEffect(() => {
    const onError = (event: MapErrorEvent & { sourceId?: string }) => {
      const key = regionKeyOfSource(event.sourceId)
      if (!key) {
        // Registering a listener silences MapLibre's own logging: keep it.
        console.error(event.error)
        return
      }
      const count = (failures.current.get(key) ?? 0) + 1
      failures.current.set(key, count)
      if (count >= ERRORS_BEFORE_FLAG) layerStore.markError(key)
    }
    instance.on('error', onError)
    return () => {
      instance.off('error', onError)
    }
  }, [instance])

  // Switching a layer on again gives it a fresh chance.
  useEffect(() => {
    visibleOverlays(state).forEach((key) => {
      if (!state.errors.includes(key)) failures.current.delete(key)
    })
  }, [state])

  return null
}
