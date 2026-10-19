// « Cette semaine chez toi »: the week of a map, asked of the server when
// the phone is online and kept for the session, so that the card stays
// while the signal comes and goes. Offline with nothing asked yet, there is
// no card (online first: the forecast is not downloaded with the map).
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { todayIso } from '@/lib/i18n'
import type { WeekReport } from '@/lib/week'
import { useOnline } from './sync'

const kept = new Map<number, WeekReport>()

export function useWeek(mapId: number): WeekReport | null {
  const online = useOnline()
  const [report, setReport] = useState<WeekReport | null>(kept.get(mapId) ?? null)
  useEffect(() => {
    const known = kept.get(mapId)
    if (!online || (known && known.today === todayIso())) return
    let live = true
    api<WeekReport>('GET', `/maps/${mapId}/week`)
      .then((week) => { kept.set(mapId, week); if (live) setReport(week) })
      .catch(() => {})
    return () => { live = false }
  }, [mapId, online])
  return report
}
