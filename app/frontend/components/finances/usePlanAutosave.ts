import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import type { FinanceInputs, FinancePlanData, FinanceResult } from '@/types/climate_finance'

export type SaveStatus = 'new' | 'pending' | 'saving' | 'saved' | 'error'
type Response = { plan: FinancePlanData; result: FinanceResult; sync?: { added: number; updated: number } }

const DEBOUNCE_MS = 700

/**
 * Local state of the plan's inputs, saved to the server shortly after each
 * change (optimistic locking with lockVersion). The server answers with
 * the normalised inputs and the recomputed result. On a conflict, the
 * other person's version is adopted and `conflict` says so.
 */
export function usePlanAutosave(mapId: number, initial: FinancePlanData, initialResult: FinanceResult, canEdit: boolean) {
  const url = `/maps/${mapId}/finances`
  const [inputs, setInputsState] = useState(initial.inputs)
  const [result, setResult] = useState(initialResult)
  const [status, setStatus] = useState<SaveStatus>(initial.persisted ? 'saved' : 'new')
  const [conflict, setConflict] = useState<string | null>(null)
  const latest = useRef(initial.inputs)
  const lockVersion = useRef(initial.lockVersion)
  const dirty = useRef(false)
  const inflight = useRef<Promise<void> | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const adopt = useCallback((data: Response, force = false) => {
    lockVersion.current = data.plan.lockVersion
    setResult(data.result)
    if (force || !dirty.current) {
      latest.current = data.plan.inputs
      setInputsState(data.plan.inputs)
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
        adopt(await api<Response>(url, { method: 'PATCH', body: { plan: { inputs: latest.current, lock_version: lockVersion.current } } }))
        setStatus(dirty.current ? 'pending' : 'saved')
      } catch (error) {
        if (error instanceof ApiError && error.status === 409 && error.data.plan) {
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

  const setInputs = useCallback((next: FinanceInputs) => {
    if (!canEdit) return
    latest.current = next
    setInputsState(next)
    dirty.current = true
    setStatus('pending')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void save(), DEBOUNCE_MS)
  }, [canEdit, save])

  /** Saves pending changes, then imports the map's plants into the plan. */
  const syncFromMap = useCallback(async () => {
    await save()
    const data = await api<Response>(`${url}/sync`, { method: 'POST' })
    adopt(data, true)
    setStatus('saved')
    return data.sync ?? { added: 0, updated: 0 }
  }, [adopt, save, url])

  // Warn before leaving with unsaved changes.
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

  return { inputs, setInputs, result, status, save, syncFromMap, conflict, clearConflict: () => setConflict(null) }
}
