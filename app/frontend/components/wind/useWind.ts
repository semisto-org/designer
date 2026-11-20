import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { WindReport } from './model'

const POLL_MS = 20_000

/**
 * The wind of a map's place (GET /maps/:id/wind), polled while thirty
 * years of ERA5-Land are being read (the first time, minutes). `version`
 * reloads it, e.g. once a wind sector or a sign is saved.
 */
export function useWind(mapId: number | string | null | undefined, version?: unknown): WindReport | null {
  const [report, setReport] = useState<WindReport | null>(null)
  useEffect(() => {
    if (mapId == null) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = () => {
      api<WindReport>(`/maps/${mapId}/wind`, { signal: controller.signal })
        .then((next) => {
          setReport(next)
          if (next.available && next.status === 'pending') timer = setTimeout(load, POLL_MS)
        })
        .catch(() => { /* the rose is a companion: without it, the panel still works */ })
    }
    load()
    return () => { controller.abort(); if (timer) clearTimeout(timer) }
  }, [mapId, version])
  return report
}
