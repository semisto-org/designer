import { Head, Link, router } from '@inertiajs/react'
import clsx from 'clsx'
import { ArrowLeft } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HelpButton } from '@/components/help/HelpButton'
import { t } from '@/lib/i18n'
import { BoardContext, patchProject, type BoardContextValue, type NextStep, type ProjectChange } from '@/team_board/board'
import { Frieze } from '@/team_board/Frieze'
import { People } from '@/team_board/People'
import { Places } from '@/team_board/Places'
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
  const { team, today, season } = props
  // Projects and the team's own places in one list: a map moves from one to the other.
  const [maps, setMaps] = useState(() => [...props.projects, ...props.places])
  useEffect(() => setMaps([...props.projects, ...props.places]), [props.projects, props.places])
  const projects = useMemo(() => maps.filter((m) => !m.ownPlace), [maps])
  const places = useMemo(() => maps.filter((m) => m.ownPlace), [maps])
  const [toast, setToast] = useState<Toast | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const notify = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    window.clearTimeout(timer.current)
    setToast({ id: Date.now(), message, tone })
    timer.current = window.setTimeout(() => setToast(null), tone === 'error' ? 6000 : 2500)
  }, [])

  // The load of each person follows every change.
  const refresh = useCallback((keys: string[] = ['people']) => router.reload({ only: keys }), [])

  const replace = (project: BoardProject) => setMaps((list) => list.map((p) => (p.id === project.id ? project : p)))

  const saveProject = useCallback(async (project: BoardProject, change: ProjectChange, nextStep?: NextStep) => {
    const now = new Date().toISOString()
    const optimistic: BoardProject = { ...project }
    if (change.phase && change.phase !== project.phase) Object.assign(optimistic, { phase: change.phase, phaseChangedAt: now, onHoldSince: null })
    if (change.on_hold !== undefined) optimistic.onHoldSince = change.on_hold ? now : null
    if (change.closed_reason) Object.assign(optimistic, { closedAt: now, closedReason: change.closed_reason })
    if (change.reopen) Object.assign(optimistic, { closedAt: null, closedReason: null, closedNote: null })
    const moved = change.own_place !== undefined && change.own_place !== project.ownPlace
    if (moved) optimistic.ownPlace = !!change.own_place
    if (nextStep) optimistic.nextStep = { id: 0, title: nextStep.title, dueOn: nextStep.due_on, assignee: props.members.find((m) => m.id === nextStep.assignee_id) ?? null }
    replace(optimistic)
    try {
      const { project: saved } = await patchProject(team.id, project.id, change, nextStep)
      replace(saved)
      notify(moved
        ? t(saved.ownPlace ? 'team_board.places.became_place' : 'team_board.places.became_project', { name: saved.name })
        : t('team_board.frieze.saved'))
      // A place leaves the season and everyone's load; a project comes back to them.
      refresh(moved ? ['people', 'steps'] : ['people'])
      return true
    } catch (e) {
      replace(project)
      notify((e as Error).message || t('team_board.frieze.error'), 'error')
      return false
    }
  }, [team.id, props.members, notify, refresh])

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

  return (
    <BoardContext.Provider value={context}>
      <div className="space-y-12">
        <Head title={`${t('team_board.title')} · ${team.name}`} />

        <header className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Link href={`/teams/${team.id}`} className="inline-flex items-center gap-1.5 text-sm text-loam-500 hover:text-loam-900">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t('team_board.back')}
            </Link>
            <HelpButton slug="tableau-de-l-equipe" />
          </div>
          <h1 className="font-serif text-4xl leading-tight text-loam-900 sm:text-5xl">{t('team_board.title')}</h1>
        </header>

        <Requests requests={props.requests} form={props.requestForm} />
        <div className="2xl:-mx-20">
          <Frieze projects={projects} />
        </div>
        <Season steps={props.steps} projects={projects} season={season} onChanged={() => refresh()} />
        <People people={props.people} projects={projects} />
        <Places places={places} />
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
