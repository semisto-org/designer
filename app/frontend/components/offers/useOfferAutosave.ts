import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import type { OfferData, OfferInputs, OfferMeasures, OfferResult } from '@/types/offers'

export type SaveStatus = 'new' | 'pending' | 'saving' | 'saved' | 'error'
type Response = { offer: OfferData; measures: OfferMeasures; result: OfferResult }

const DEBOUNCE_MS = 600

/**
 * The working offer: local inputs saved shortly after each change
 * (optimistic locking with lockVersion); the server answers with the
 * normalised inputs, the map's measures and the recomputed budget. On a
 * conflict, the teammate's version is adopted and `conflict` says so.
 */
export function useOfferAutosave(mapId: number, initial: OfferData, initialMeasures: OfferMeasures, initialResult: OfferResult, canEdit: boolean) {
  const url = `/maps/${mapId}/offer`
  const [inputs, setInputsState] = useState(initial.inputs)
  const [measures, setMeasures] = useState(initialMeasures)
  const [result, setResult] = useState(initialResult)
  const [persisted, setPersisted] = useState(initial.persisted)
  const [status, setStatus] = useState<SaveStatus>(initial.persisted ? 'saved' : 'new')
  const [conflict, setConflict] = useState<string | null>(null)
  const latest = useRef(initial.inputs)
  const lockVersion = useRef(initial.lockVersion)
  const dirty = useRef(false)
  const inflight = useRef<Promise<void> | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const adopt = useCallback((data: Response, force = false) => {
    lockVersion.current = data.offer.lockVersion
    setPersisted(data.offer.persisted)
    setMeasures((current) => ({ ...data.measures, candidates: data.measures.candidates ?? current.candidates }))
    setResult(data.result)
    if (force || !dirty.current) {
      latest.current = data.offer.inputs
      setInputsState(data.offer.inputs)
    }
  }, [])

  const save = useCallback(async (): Promise<void> => {
    window.clearTimeout(timer.current)
    if (inflight.current) await inflight.current
    if (!dirty.current || !canEdit) return
    dirty.current = false
    setStatus('saving')
    const run = (async () => {
      try {
        adopt(await api<Response>(url, { method: 'PATCH', body: { offer: { inputs: latest.current, lock_version: lockVersion.current } } }))
        setStatus(dirty.current ? 'pending' : 'saved')
      } catch (error) {
        if (error instanceof ApiError && error.status === 409 && error.data.offer) {
          dirty.current = false
          adopt(error.data as unknown as Response, true)
          setConflict(error.message)
          setStatus('saved')
        } else {
          dirty.current = true
          setStatus('error')
        }
      }
    })()
    inflight.current = run
    await run
    inflight.current = null
    if (dirty.current) timer.current = window.setTimeout(() => void save(), DEBOUNCE_MS)
  }, [adopt, canEdit, url])

  const setInputs = useCallback((next: OfferInputs) => {
    if (!canEdit) return
    latest.current = next
    setInputsState(next)
    dirty.current = true
    setStatus('pending')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void save(), DEBOUNCE_MS)
  }, [canEdit, save])

  /** Saves now (a version is about to be taken). */
  const flush = useCallback(async () => {
    if (!persisted && !dirty.current) dirty.current = true
    await save()
  }, [persisted, save])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty.current || inflight.current) event.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.clearTimeout(timer.current)
    }
  }, [])

  return { inputs, setInputs, measures, result, status, persisted, save, flush, adopt, conflict, clearConflict: () => setConflict(null) }
}
