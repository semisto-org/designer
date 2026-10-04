// One map as shown on the terrain: last known copy from disk, refreshed
// from the server when online, with the changes still in the outbox on top.
import { useCallback, useEffect, useMemo, useState } from 'react'
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

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setServer(await fetchBundle(mapId))
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError && e.status === 404 ? 'not_found' : e instanceof ApiError && e.offline ? 'offline' : 'failed')
    } finally {
      setLoading(false)
    }
  }, [mapId])

  useEffect(() => { if (online) void refresh() }, [online, refresh])

  // After the outbox sent something, take the server's ids and versions.
  const sentCount = pending.ops.length
  useEffect(() => { if (online && server) void refresh() }, [sentCount]) // eslint-disable-line react-hooks/exhaustive-deps

  const bundle = useMemo(() => (server ? applyPending(server, pending) : null), [server, pending])
  return { bundle, loading, error, refresh }
}
