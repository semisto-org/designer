// The style of a terrain map: the base map, with the drone view chosen in
// « Affichage » laid over it. Offline, a drone view shows only once it is
// on the phone; otherwise the map falls back to the downloaded base map
// rather than staying blank.
import { useEffect, useState } from 'react'
import { useDisplay } from '@/lib/display'
import { shownAerialView } from '@/lib/display-core'
import { aerialDownloadState, styleUrl } from '@/lib/maps'
import type { MapBundle } from '@/lib/types'
import { useOnline } from './sync'

export function useMapStyle(mapId: number, bundle: MapBundle | null | undefined): string {
  const online = useOnline()
  const view = shownAerialView(useDisplay(mapId), bundle?.aerialViews)
  const [kept, setKept] = useState<number | null>(null)
  useEffect(() => {
    if (!view || online) return
    let live = true
    void aerialDownloadState(mapId, view.id).then((state) => { if (live) setKept(state.state === 'complete' ? view.id : null) }).catch(() => {})
    return () => { live = false }
  }, [mapId, view, online])
  const drone = view && (online || kept === view.id) ? view.id : null
  return styleUrl(mapId, { drone })
}
