import { usePage } from '@inertiajs/react'
import type { ErrorEvent as MapErrorEvent, MapSourceDataEvent } from 'maplibre-gl'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { aerialStore, useAerialState } from '@/drone/store'
import { placeAerialLayers, syncAerialViews } from '@/drone/layers'
import { aerialViewIdOf } from '@/drone/placement'
import { useEditor } from '@/map/editor/EditorContext'
import type { AerialView } from '@/types/drone'

const NONE: AerialView[] = []

// A view is flagged unreachable when its tiles fail and none has ever
// loaded: a few missing tiles at the edge of the flight are normal.
const ERRORS_BEFORE_FLAG = { xyz: 3, pmtiles: 1 } as const

/** The map's drone views, newest first (prop `aerialViews` of maps/show). */
export function useAerialViews(): AerialView[] {
  return usePage<{ aerialViews?: AerialView[] }>().props.aerialViews ?? NONE
}

/**
 * Applies the drone-view choice of « Couches » to MapLibre, whether the
 * panel is open or not, keeps the views above the base map, and watches
 * their tiles. Renders nothing.
 */
export default function AerialViewsOverlay() {
  const { instance, map, regionLayers } = useEditor()
  const views = useAerialViews()
  const state = useAerialState()
  const health = useRef(new Map<number, { errors: number; loaded: boolean }>())

  useLayoutEffect(() => {
    aerialStore.init(map.id, views)
  }, [map.id, views])

  useEffect(() => {
    if (state.mapId !== map.id) return
    syncAerialViews(instance, views, state.viewId, state.opacity)
    placeAerialLayers(instance, regionLayers)
  }, [instance, views, state.mapId, state.viewId, state.opacity, map.id, regionLayers])

  // Choosing a view again gives it a fresh chance.
  useEffect(() => {
    if (state.viewId != null) health.current.delete(state.viewId)
  }, [state.viewId])

  // Base maps and overlays come and go (a style base loads late): stay on top of the base.
  useEffect(() => {
    const place = () => placeAerialLayers(instance, regionLayers)
    instance.on('styledata', place)
    return () => {
      instance.off('styledata', place)
    }
  }, [instance, regionLayers])

  useEffect(() => {
    const entry = (viewId: number) => {
      let value = health.current.get(viewId)
      if (!value) health.current.set(viewId, (value = { errors: 0, loaded: false }))
      return value
    }
    const onData = (event: MapSourceDataEvent) => {
      const viewId = aerialViewIdOf(event.sourceId)
      if (viewId != null && event.tile) entry(viewId).loaded = true
    }
    const onError = (event: MapErrorEvent & { sourceId?: string }) => {
      const viewId = aerialViewIdOf(event.sourceId)
      if (viewId == null) return
      const value = entry(viewId)
      value.errors += 1
      const view = views.find((v) => v.id === viewId)
      if (!value.loaded && view && value.errors >= ERRORS_BEFORE_FLAG[view.kind]) aerialStore.markError(viewId)
    }
    instance.on('sourcedata', onData)
    instance.on('error', onError)
    return () => {
      instance.off('sourcedata', onData)
      instance.off('error', onError)
    }
  }, [instance, views])

  return null
}
