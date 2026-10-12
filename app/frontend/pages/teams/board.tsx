import { Head, Link, router } from '@inertiajs/react'
import clsx from 'clsx'
import { ArrowLeft } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HelpButton } from '@/components/help/HelpButton'
import { t } from '@/lib/i18n'
import { BoardContext, formatLongDay, patchProject, type BoardContextValue, type NextStep, type ProjectChange } from '@/team_board/board'
import { Frieze, tickTask } from '@/team_board/Frieze'
import { People } from '@/team_board/People'
import { Requests } from '@/team_board/Requests'
import { Season } from '@/team_board/Season'
import type { BoardProject, TeamBoardProps } from '@/types/teamBoard'

type Toast = { id: number; message: string; tone: 'info' | 'error' }

/**
 * The team board (« Tableau de l'équipe »), read top to bottom at the
 * team's operational meeting: the new requests first, then every project on
 * one timeline (dragged from column to column), the season to come, and
 * who carries what. Everything changes in place.
 */
export default function TeamBoard(props: TeamBoardProps) {
  const { team, today, season, figures } = props
  const [projects, setProjects] = useState(props.projects)
  useEffect(() => setProjects(props.projects), [props.projects])
  const [toast, setToast] = useState<Toast | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const notify = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    window.clearTimeout(timer.current)
    setToast({ id: Date.now(), message, tone })
    timer.current = window.setTimeout(() => setToast(null), tone === 'error' ? 6000 : 2500)
  }, [])

  // The figures and the load of each person follow every change.
  const refresh = useCallback((keys: string[] = ['figures', 'people']) => router.reload({ only: keys }), [])

  const replace = (project: BoardProject) => setProjects((list) => list.map((p) => (p.id === project.id ? project : p)))

  const saveProject = useCallback(async (project: BoardProject, change: ProjectChange, nextStep?: NextStep) => {
    const now = new Date().toISOString()
    const optimistic: BoardProject = { ...project }
    if (change.phase && change.phase !== project.phase) Object.assign(optimistic, { phase: change.phase, phaseChangedAt: now, onHoldSince: null })
    if (change.on_hold !== undefined) optimistic.onHoldSince = change.on_hold ? now : null
    if (change.closed_reason) Object.assign(optimistic, { closedAt: now, closedReason: change.closed_reason })
    if (change.reopen) Object.assign(optimistic, { closedAt: null, closedReason: null, closedNote: null })
    if (nextStep) optimistic.nextStep = { id: 0, title: nextStep.title, dueOn: nextStep.due_on, assignee: props.members.find((m) => m.id === nextStep.assignee_id) ?? null }
    replace(optimistic)
    try {
      const { project: saved } = await patchProject(team.id, project.id, change, nextStep)
      replace(saved)
      notify(t('team_board.frieze.saved'))
      refresh()
      return true
    } catch (e) {
      replace(project)
      notify((e as Error).message || t('team_board.frieze.error'), 'error')
      return false
    }
  }, [team.id, props.members, notify, refresh])

  async function tick(project: BoardProject) {
    if (!project.nextStep) return
    replace({ ...project, nextStep: null })
    try {
      await tickTask(project.id, project.nextStep.id)
      notify(t('team_board.frieze.ticked', { title: project.nextStep.title }))
      refresh(['projects', 'figures', 'people'])
    } catch (e) {
      replace(project)
      notify((e as Error).message || t('team_board.frieze.error'), 'error')
    }
  }

  const context = useMemo<BoardContextValue>(() => ({
    teamId: team.id,
    today,
    phases: props.phases,
    closedReasons: props.closedReasons,
    stepKinds: props.stepKinds,
    members: props.members,
    notify,
    saveProject,
  }), [team.id, today, props.phases, props.closedReasons, props.stepKinds, props.members, notify, saveProject])

  const seasonNote = t(season.inSeason ? 'team_board.planting.in_season' : 'team_board.planting.before', { count: season.weeks })

  return (
    <BoardContext.Provider value={context}>
      <div className="space-y-12">
        <Head title={`${t('team_board.title')} · ${team.name}`} />

        <header className="space-y-6">
          <div className="flex items-center justify-between gap-3">
            <Link href={`/teams/${team.id}`} className="inline-flex items-center gap-1.5 text-sm text-loam-500 hover:text-loam-900">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t('team_board.back')}
            </Link>
            <HelpButton slug="tableau-de-l-equipe" />
          </div>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-semibold tracking-wide text-prune-600 uppercase">{team.name}</p>
              <h1 className="font-serif text-4xl leading-tight text-loam-900 sm:text-5xl">{t('team_board.title')}</h1>
              <p className="font-hand text-2xl leading-snug text-loam-600">{formatLongDay(today)}. {seasonNote}</p>
            </div>
            <dl className="grid w-full grid-cols-2 gap-3 sm:w-auto">
              <Figure
                label={t('team_board.figures.unanswered')}
                value={String(figures.unanswered)}
                note={t('team_board.figures.unanswered_goal')}
                alert={figures.unanswered > 0}
              />
              <Figure
                label={t('team_board.figures.plantings')}
                value={figures.plantingsPlanned ? `${figures.plantingsReady} / ${figures.plantingsPlanned}` : '–'}
                note={figures.plantingsPlanned ? t('team_board.figures.plantings_hint') : t('team_board.figures.plantings_none')}
              />
            </dl>
          </div>
        </header>

        <Requests requests={props.requests} form={props.requestForm} />
        <div className="2xl:-mx-20">
          <Frieze projects={projects} onTick={(p) => void tick(p)} />
        </div>
        <Season steps={props.steps} projects={projects} season={season} onChanged={() => refresh()} />
        <People people={props.people} projects={projects} />
      </div>

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
        {toast && (
          <p key={toast.id} role={toast.tone === 'error' ? 'alert' : 'status'} className={clsx(
            'rounded-full px-4 py-2 text-sm font-semibold shadow-lg',
            toast.tone === 'error' ? 'bg-clay-600 text-white' : 'bg-loam-900 text-white',
          )}>
            {toast.message}
          </p>
        )}
      </div>
    </BoardContext.Provider>
  )
}

function Figure({ label, value, note, alert = false }: { label: string; value: string; note: string; alert?: boolean }) {
  return (
    <div className={clsx('flex flex-col rounded-2xl border bg-[#fffdf7] px-4 py-3 sm:w-56', alert ? 'border-clay-300' : 'border-loam-200')}>
      <dt className="order-2 text-sm leading-snug text-loam-600">{label}</dt>
      <dd className={clsx('order-1 font-serif text-4xl leading-none font-semibold tabular-nums', alert ? 'text-clay-600' : 'text-loam-900')}>{value}</dd>
      <dd className="order-3 mt-1 font-hand text-lg leading-tight text-loam-400">{note}</dd>
    </div>
  )
}
