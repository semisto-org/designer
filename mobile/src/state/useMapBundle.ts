// One map as shown on the terrain: last known copy from disk, refreshed
// from the server when online, with the changes still in the outbox on top.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError } from '@/lib/api'
import { cachedBundle, fetchBundle } from '@/lib/maps'
import { applyPending } from '@/lib/outbox-core'
import type { MapBundle } from '@/lib/types'
import { useOnline, useOutbox } from './sync'

export type BundleState = {
  bundle: MapBundle | null
  loading: boolean
  error: 'not_found' | 'offline' | 'failed' | null
  refresh: () => Promise<void>
}

export function useMapBundle(mapId: number): BundleState {
  const [server, setServer] = useState<MapBundle | null>(() => cachedBundle(mapId))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<BundleState['error']>(null)
  const online = useOnline()
  const pending = useOutbox()

  // Answers can come back out of order on a field connection: only the
  // latest request may replace what is shown.
  const latest = useRef(0)
  const refresh = useCallback(async () => {
    const request = ++latest.current
    setLoading(true)
    try {
      const fresh = await fetchBundle(mapId)
      if (request !== latest.current) return
      setServer(fresh)
      setError(null)
    } catch (e) {
      if (request !== latest.current) return
      setError(e instanceof ApiError && e.status === 404 ? 'not_found' : e instanceof ApiError && e.offline ? 'offline' : 'failed')
    } finally {
      if (request === latest.current) setLoading(false)
    }
  }, [mapId])

  useEffect(() => { if (online) void refresh() }, [online, refresh])

  // After the outbox sent a change of this map, take the server's ids and
  // versions; changes of other maps, or refused ones, need no reload.
  const waiting = pending.ops.filter((op) => op.mapId === mapId && !op.error).length
  const before = useRef(waiting)
  useEffect(() => {
    const sent = waiting < before.current
    before.current = waiting
    if (!sent || !online || !server) return
    // One reload once a round of sends settles, not one per change.
    const timer = setTimeout(() => void refresh(), 1500)
    return () => clearTimeout(timer)
  }, [waiting]) // eslint-disable-line react-hooks/exhaustive-deps

  const bundle = useMemo(() => (server ? applyPending(server, pending) : null), [server, pending])
  return { bundle, loading, error, refresh }
}
