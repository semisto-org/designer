import { usePage } from '@inertiajs/react'
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { useEditor } from '@/map/editor/EditorContext'
import type { SharedProps } from '@/types'

// The painted terrain and its sprites load only when the carnet opens.
const TourDialog = lazy(() => import('./TourDialog'))

const OPEN_EVENT = 'designer:tour-open'

/** « Revoir le carnet de route » (Parcours panel, help) opens it again. */
export function openTour() {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

/**
 * Always mounted in the editor: opens the « carnet de route » by itself on
 * the person's first arrival on a map they can edit, and again on request.
 * Closing it the first time is remembered on the account, for all devices.
 */
export default function TourOverlay() {
  const editor = useEditor()
  const { props } = usePage<SharedProps & { aiConnected?: boolean }>()
  const firstVisit = editor.canEdit && props.currentUser != null && !props.currentUser.tourSeen
  const [open, setOpen] = useState(firstVisit)
  const remembered = useRef(!firstVisit)

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
