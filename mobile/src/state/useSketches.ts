// The sketches of a photo, asked of the server when the phone is online and
// kept for the session (online first: sketches are not downloaded with the
// map). `remember` puts a sketch just saved in place, so the photo screen
// shows it at once on the way back.
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { Sketch } from '@/lib/sketch'
import { useOnline } from './sync'

const kept = new Map<string, Sketch[]>()
const listeners = new Set<() => void>()

const keyOf = (mapId: number, photoId: number) => `${mapId}/${photoId}`

export function rememberSketch(mapId: number, sketch: Sketch) {
  const key = keyOf(mapId, sketch.photoId)
  const list = kept.get(key) ?? []
  kept.set(key, list.some((s) => s.id === sketch.id) ? list.map((s) => (s.id === sketch.id ? sketch : s)) : [...list, sketch])
  listeners.forEach((listener) => listener())
}

export function useSketches(mapId: number, photoId: number, enabled = true): { sketches: Sketch[]; loaded: boolean } {
  const online = useOnline()
  const key = keyOf(mapId, photoId)
  const [, bump] = useState(0)
  const refresh = useCallback(() => bump((n) => n + 1), [])
  useEffect(() => {
    listeners.add(refresh)
    return () => { listeners.delete(refresh) }
  }, [refresh])
  useEffect(() => {
    if (!enabled || !online || kept.has(key)) return
    let live = true
    api<{ sketches: Sketch[] }>('GET', `/maps/${mapId}/photos/${photoId}/sketches`)
      .then(({ sketches }) => { kept.set(key, sketches); if (live) refresh() })
      .catch(() => {})
    return () => { live = false }
  }, [key, mapId, photoId, online, enabled, refresh])
  return { sketches: kept.get(key) ?? [], loaded: kept.has(key) }
}
