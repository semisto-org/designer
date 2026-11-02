import { usePage } from '@inertiajs/react'
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import type { SharedProps } from '@/types'

// The painted terrain and its sprites load only when the carnet opens.
const TourDialog = lazy(() => import('./TourDialog'))

const OPEN_EVENT = 'designer:tour-open'

/** « Revoir le carnet de route » (Parcours panel, help) opens it again. */
export function openTour() {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

/**
 * Always mounted in the editor: opens the « carnet de route » on request
 * (Parcours panel, « Voici ton lieu », the welcome card). It no longer opens
 * by itself: a new map greets its owner with their own place (« Voici ton
 * lieu », FirstHourOverlay), not with the carnet's example terrain. Closing
 * it the first time is remembered on the account, for all devices.
 */
export default function TourOverlay() {
  const { props } = usePage<SharedProps & { aiConnected?: boolean }>()
  const [open, setOpen] = useState(false)
  const remembered = useRef(props.currentUser == null || props.currentUser.tourSeen)

  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    if (remembered.current) return
    remembered.current = true
    // Not remembered (offline…): it simply opens again on the next visit.
    api('/account/tour', { method: 'PATCH' }).catch(() => {})
  }, [])

  if (!open) return null
  return (
    <Suspense fallback={<div className="fixed inset-0 z-50 bg-loam-50" aria-hidden="true" />}>
      <TourDialog aiConnected={props.aiConnected ?? false} onClose={close} />
    </Suspense>
  )
}
