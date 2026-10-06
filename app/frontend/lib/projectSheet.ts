import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { requestJourneyRefresh } from '@/lib/journeyFlags'
import type { ProjectData, ProjectDraft, ProjectProgress, SectionValues } from '@/types/journey'

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

const DEBOUNCE_MS = 700
const RETRY_MS = 4000

type Patch = Record<string, Record<string, unknown>>

const isBlank = (value: unknown) =>
  value == null || value === '' || (Array.isArray(value) && value.length === 0) || value === false

function csrfToken(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? ''
}

/**
 * The project sheet with autosave: edits update the screen immediately and
 * are sent to the server a moment later, a few fields at a time (the server
 * merges at field level, so a phone and a laptop never overwrite each
 * other). Failures keep the edits and retry; leaving the page flushes.
 */
export function useProjectSheet(
  mapId: number, initial: ProjectData, initialProgress: ProjectProgress, canEdit: boolean, initialDrafts: ProjectDraft[] = [],
) {
  const [project, setProject] = useState<ProjectData>(initial)
  const [progress, setProgress] = useState<ProjectProgress>(initialProgress)
  const [drafts, setDrafts] = useState<ProjectDraft[]>(initialDrafts)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const pending = useRef<Patch>({})
  const timer = useRef<number | undefined>(undefined)
  const inflight = useRef(false)
  const failures = useRef(0)
  const alive = useRef(true)
  const projectRef = useRef(project)
  projectRef.current = project

  const hasPending = () => Object.keys(pending.current).length > 0

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current)
    if (inflight.current || !hasPending()) return
    const patch = pending.current
    pending.current = {}
    inflight.current = true
    if (alive.current) setStatus('saving')
    try {
      const result = await api<{ progress: ProjectProgress }>(`/maps/${mapId}/project`, { method: 'PATCH', body: { project: patch } })
      failures.current = 0
      if (!alive.current) return
      setProgress(result.progress)
      setStatus(hasPending() ? 'dirty' : 'saved')
      requestJourneyRefresh()
    } catch {
      // Put the edits back (newer edits to the same field win) and try again.
      for (const [section, fields] of Object.entries(patch)) {
        pending.current[section] = { ...fields, ...(pending.current[section] ?? {}) }
      }
      failures.current += 1
      if (alive.current) setStatus('error')
      timer.current = window.setTimeout(() => void flush(), Math.min(RETRY_MS * failures.current, 30_000))
    } finally {
      inflight.current = false
      if (alive.current && hasPending() && failures.current === 0) timer.current = window.setTimeout(() => void flush(), DEBOUNCE_MS)
    }
  }, [mapId])

  const schedule = useCallback(() => {
    window.clearTimeout(timer.current)
    setStatus('dirty')
    timer.current = window.setTimeout(() => void flush(), DEBOUNCE_MS)
  }, [flush])

  const setField = useCallback((section: string, field: string, value: unknown) => {
    if (!canEdit) return
    setProject((current) => {
      const values: SectionValues = { ...(current[section] ?? {}) }
      if (isBlank(value)) delete values[field]
      else values[field] = value
      return { ...current, [section]: values }
    })
    pending.current[section] = { ...(pending.current[section] ?? {}), [field]: isBlank(value) ? null : value }
    schedule()
  }, [canEdit, schedule])

  const setDone = useCallback((section: string, done: boolean) => {
    if (!canEdit) return
    // `meta.done` is sent whole: the server replaces the list.
    const base = (pending.current.meta?.done as string[] | undefined) ?? projectRef.current.meta?.done ?? []
    const next = new Set(base)
    if (done) next.add(section)
    else next.delete(section)
    const list = Array.from(next)
    pending.current.meta = { done: list }
    setProject((current) => ({ ...current, meta: { ...current.meta, done: list } }))
    schedule()
  }, [canEdit, schedule])

  // Flush when the tab is hidden or closed, and when leaving the view.
  useEffect(() => {
    alive.current = true
    const onHide = () => {
      if (hasPending() && !inflight.current) {
        const patch = pending.current
        pending.current = {}
        // keepalive lets the request outlive the page.
        void fetch(`/maps/${mapId}/project`, {
          method: 'PATCH', keepalive: true, credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': csrfToken() },
          body: JSON.stringify({ project: patch }),
        }).catch(() => { pending.current = { ...patch, ...pending.current } })
      }
    }
    const onVisibility = () => { if (document.visibilityState === 'hidden') onHide() }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onHide)
    return () => {
      alive.current = false
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onHide)
      window.clearTimeout(timer.current)
      if (hasPending() && !inflight.current) {
        const patch = pending.current
        pending.current = {}
        void api(`/maps/${mapId}/project`, { method: 'PATCH', body: { project: patch } }).catch(() => undefined)
      }
    }
  }, [mapId])

  const retry = useCallback(() => {
    failures.current = 0
    void flush()
  }, [flush])

  /**
   * Accepts or refuses answers an AI proposed (one draft, or « all »). The
   * server answers with the sheet as it now stands; edits not sent yet stay
   * on top of it.
   */
  const review = useCallback(async (id: number | 'all', decision: 'accept' | 'reject') => {
    if (!canEdit) return
    await flush()
    const result = await api<{ project: ProjectData; progress: ProjectProgress; drafts: ProjectDraft[] }>(
      `/maps/${mapId}/project/drafts/${id}/${decision}`, { method: 'POST' },
    )
    if (!alive.current) return
    const next: ProjectData = { ...result.project }
    for (const [section, fields] of Object.entries(pending.current)) {
      if (section === 'meta') continue
      const values: SectionValues = { ...(next[section] ?? {}) }
      for (const [field, value] of Object.entries(fields)) {
        if (isBlank(value)) delete values[field]
        else values[field] = value
      }
      next[section] = values
    }
    if (pending.current.meta) next.meta = { ...next.meta, ...(pending.current.meta as ProjectData['meta']) }
    setProject(next)
    setProgress(result.progress)
    setDrafts(result.drafts)
    if (decision === 'accept') requestJourneyRefresh()
  }, [canEdit, flush, mapId])

  return { project, progress, drafts, status, setField, setDone, review, retry, flush }
}

export type ProjectSheetApi = ReturnType<typeof useProjectSheet>
