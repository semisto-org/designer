import clsx from 'clsx'
import { createContext, useContext, type ReactNode } from 'react'
import { Avatar } from '@/collab/Avatar'
import { api } from '@/lib/api'
import type { BoardPerson, BoardPhase, BoardProject, ClosedReason, StepKind } from '@/types/teamBoard'

/** What every part of the team board shares: the team, today, its people, and how to save a project. */
export type BoardContextValue = {
  teamId: number
  today: string
  phases: BoardPhase[]
  closedReasons: ClosedReason[]
  stepKinds: StepKind[]
  members: (BoardPerson & { you: boolean })[]
  notify: (message: string, tone?: 'info' | 'error') => void
  /** Saves a change of a project (optimistic), and its next step when given. */
  saveProject: (project: BoardProject, change: ProjectChange, nextStep?: NextStep) => Promise<boolean>
}

export type ProjectChange = {
  phase?: BoardPhase
  lead_id?: number | null
  crew_ids?: number[]
  promised_on?: string | null
  promised_what?: string | null
  on_hold?: boolean
  closed_reason?: ClosedReason
  closed_note?: string | null
  reopen?: boolean
}
export type NextStep = { title: string; assignee_id: number | null; due_on: string }

export const BoardContext = createContext<BoardContextValue | null>(null)

export function useBoard(): BoardContextValue {
  const value = useContext(BoardContext)
  if (!value) throw new Error('useBoard outside the team board')
  return value
}

export const boardBase = (teamId: number) => `/teams/${teamId}/board`

export function patchProject(teamId: number, mapId: number, project: ProjectChange, nextStep?: NextStep) {
  return api<{ project: BoardProject }>(`${boardBase(teamId)}/projects/${mapId}`, {
    method: 'PATCH',
    body: { project, ...(nextStep ? { next_step: nextStep } : {}) },
  })
}

// --- days -----------------------------------------------------------------
// Dates travel as ISO days (2026-10-12). Noon keeps a day whole across time zones.

export const toDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`)

export function isoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export const addDays = (iso: string, days: number) => {
  const d = toDate(iso)
  d.setDate(d.getDate() + days)
  return isoDay(d)
}

export const daysBetween = (from: string, to: string) => Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000)

const shortDay = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'short' })
const longDay = new Intl.DateTimeFormat('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })
/** « 20 oct. » */
export const formatDay = (iso: string) => shortDay.format(toDate(iso))
/** « Lundi 12 octobre » */
export const formatLongDay = (iso: string) => {
  const text = longDay.format(toDate(iso))
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// --- faces ----------------------------------------------------------------

/** The one person who leads a project, large, then the people who work on it, small. */
export function Faces({ lead, crew, size = 'md' }: { lead: BoardPerson | null; crew: BoardPerson[]; size?: 'md' | 'sm' }) {
  return (
    <span className="flex min-w-0 items-center">
      {lead && (
        <span title={lead.name} className="relative z-10 rounded-full ring-2 ring-[#fffdf7]">
          <Avatar name={lead.name} url={lead.avatarUrl} className={size === 'md' ? 'h-9 w-9 text-sm' : 'h-7 w-7'} />
        </span>
      )}
      {crew.length > 0 && (
        <span className={clsx('flex', lead && '-ml-1')}>
          {crew.slice(0, 4).map((person, i) => (
            <span key={person.id} title={person.name} className={clsx('rounded-full ring-2 ring-[#fffdf7]', i > 0 && '-ml-1.5')}>
              <Avatar name={person.name} url={person.avatarUrl} className={size === 'md' ? 'h-6 w-6' : 'h-5 w-5'} />
            </span>
          ))}
          {crew.length > 4 && <span className="ml-1 text-sm text-loam-500">+{crew.length - 4}</span>}
        </span>
      )}
    </span>
  )
}

/** A section of the board: a serif title, a hand-written hint, its content. */
export function BoardSection({ id, title, hint, aside, children }: { id: string; title: ReactNode; hint?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id={id} className="font-serif text-2xl leading-tight text-loam-900 sm:text-3xl">{title}</h2>
          {hint && <p className="mt-1 text-sm text-loam-500">{hint}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}
