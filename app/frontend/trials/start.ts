import { router } from '@inertiajs/react'
import { useState } from 'react'
import { ApiError, api } from '@/lib/api'
import { track } from '@/lib/analytics'
import { t } from '@/lib/i18n'
import type { GeocodeResult } from '@/types/map_data'

export type TrialOrigin = 'public_map' | 'home' | 'direct'

/**
 * Starts a trial on the place found (POST /essai) and opens it. `via` tells
 * the server where the address was typed; a public map passes its token.
 * The address kept is the geocoder's label (« Rue du Verger 12, 5530
 * Yvoir »), whose last part names the town the map is named after.
 */
export function useStartTrial({ via, from }: { via: TrialOrigin; from?: string | null }) {
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function start(place: GeocodeResult) {
    setStarting(true)
    setError(null)
    try {
      const { path } = await api<{ path: string }>('/essai', {
        method: 'POST',
        body: { lng: place.lng, lat: place.lat, address: place.label || place.detail, from: from ?? undefined, via },
      })
      track('try_address', { from: via })
      router.visit(path)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('trials.errors.invalid_place'))
      setStarting(false)
    }
  }

  return { start, starting, error }
}
