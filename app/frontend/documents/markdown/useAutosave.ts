import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import type { MapDocumentData } from '@/types/documents'

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error'
export type Conflict = { message: string; mine: string }
type Saved = { document: MapDocumentData; checksum: string }
type Stale = { message: string; content: string; checksum: string; document: MapDocumentData }

const DELAY = 1200
const RETRY = 5000

/**
 * Saves a Markdown page while it is written: a pause in typing sends the
 * text with the checksum it was based on. If someone else saved meanwhile,
 * the server keeps their text and sends it back; ours is kept aside
 * (`conflict.mine`) so nothing typed is lost. A failed save is retried.
 */
export function useAutosave({ url, checksum: initial, onSaved, onStale }: {
  url: string
  checksum: string | null
  onSaved: (doc: MapDocumentData) => void
  onStale: (content: string, doc: MapDocumentData) => void
}) {
  const [status, setStatus] = useState<SaveStatus>('saved')
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const base = useRef(initial)
  const draft = useRef<string | null>(null)
  const inFlight = useRef<Promise<void> | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const callbacks = useRef({ onSaved, onStale })
  callbacks.current = { onSaved, onStale }

  const flush = useCallback(async (): Promise<void> => {
    window.clearTimeout(timer.current)
    if (inFlight.current) await inFlight.current
    const text = draft.current
    if (text === null) return
    draft.current = null
    setStatus('saving')
    let failed = false
    inFlight.current = (async () => {
      try {
        const saved = await api<Saved>(url, { method: 'PATCH', body: { content: text, base: base.current } })
        base.current = saved.checksum
        callbacks.current.onSaved(saved.document)
        setStatus(draft.current === null ? 'saved' : 'dirty')
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          const stale = error.data as unknown as Stale
          base.current = stale.checksum
          setConflict({ message: stale.message, mine: text })
          callbacks.current.onStale(stale.content, stale.document)
          setStatus('saved')
        } else {
          // Kept for the next try, unless something newer was typed.
          draft.current ??= text
          failed = true
          setStatus('error')
          timer.current = window.setTimeout(() => void flush(), RETRY)
        }
      } finally {
        inFlight.current = null
      }
    })()
    await inFlight.current
    // Words typed during the save go right after it.
    if (!failed && draft.current !== null) await flush()
  }, [url])

  const change = useCallback((text: string) => {
    draft.current = text
    setStatus((s) => (s === 'error' ? s : 'dirty'))
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void flush(), DELAY)
  }, [flush])

  // Leaving with unsaved words: the browser asks first.
  useEffect(() => {
    function onLeave(event: BeforeUnloadEvent) {
      if (draft.current === null && !inFlight.current) return
      event.preventDefault()
      void flush()
    }
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [flush])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return { status, change, flush, conflict, dismissConflict: () => setConflict(null) }
}
