import { Link } from '@inertiajs/react'
import { CalendarCheck, Settings2, SquareKanban, Trees } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import type { BoardPerson, BoardPhase, BoardProject, ClosedReason, StepKind } from '@/types/teamBoard'
import { BoardContext, Faces, boardBase, formatDay, patchProject, type BoardContextValue, type ProjectChange } from './board'
import { PhaseIcon, phaseTone } from './PhaseIcon'
import { ProjectDialog } from './ProjectDialog'

type Payload = { project: BoardProject; members: (BoardPerson & { you: boolean })[]; phases: BoardPhase[]; closedReasons: ClosedReason[]; stepKinds: StepKind[] }

/**
 * « Le projet d'équipe » in a team map's « Partager » dialog: who leads it,
 * who works on it, its phase and promised date, with the same settings as
 * on the team board. One of the team's own places shows only its people.
 */
export function MapProjectSection({ teamId, mapId, canEdit, notify }: { teamId: number; mapId: number; canEdit: boolean; notify: (message: string, tone?: 'info' | 'error') => void }) {
  const [data, setData] = useState<Payload | null>(null)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    api<Payload>(`${boardBase(teamId)}/projects/${mapId}`).then(setData).catch(() => setData(null))
  }, [teamId, mapId])

  const saveProject = useCallback(async (project: BoardProject, change: ProjectChange) => {
    try {
      const { project: saved } = await patchProject(teamId, project.id, change)
      setData((d) => (d ? { ...d, project: saved } : d))
      notify(t('team_board.frieze.saved'))
      return true
    } catch (e) {
      notify((e as Error).message || t('team_board.frieze.error'), 'error')
      return false
    }
  }, [teamId, notify])

  const context = useMemo<BoardContextValue | null>(() => data && ({
    teamId,
    today: new Date().toISOString().slice(0, 10),
    phases: data.phases,
    closedReasons: data.closedReasons,
    stepKinds: data.stepKinds,
    members: data.members,
    notify,
    saveProject,
  }), [data, teamId, notify, saveProject])

  if (!data || !context) return null
  const { project } = data

  return (
    <BoardContext.Provider value={context}>
      <section aria-labelledby="share-team-project" className="rounded-2xl border border-loam-200 bg-[#fffdf7] p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 id="share-team-project" className="text-sm font-semibold text-loam-900">{t(project.ownPlace ? 'team_board.project.place_open' : 'team_board.project.open')}</h3>
          <Link href={`${boardBase(teamId)}`} className="inline-flex items-center gap-1 text-sm font-semibold text-prune-700 hover:underline">
            <SquareKanban className="h-4 w-4" aria-hidden />{t('team_board.title')}
          </Link>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {project.lead || project.crew.length ? <Faces lead={project.lead} crew={project.crew} /> : <span className="text-sm text-loam-500">{t('team_board.project.no_lead')}</span>}
          {project.ownPlace ? (
            <span className="inline-flex items-center gap-1 text-sm text-loam-700">
              <Trees className="h-5 w-5 text-leaf-700" aria-hidden />{t('team_board.project.place_summary')}
            </span>
          ) : <>
          <span className="inline-flex items-center gap-1 text-sm text-loam-700">
            <PhaseIcon phase={project.phase} className={`h-5 w-5 ${phaseTone(project.phase)}`} />
            {project.closedAt ? t('team_board.frieze.closed_one') : t(`team_board.phases.${project.phase}`)}
            {project.onHoldSince && !project.closedAt && ` · ${t('team_board.frieze.on_hold')}`}
          </span>
          {project.promisedOn && (
            <span className="inline-flex items-center gap-1 text-sm text-loam-700">
              <CalendarCheck className="h-4 w-4 text-loam-500" aria-hidden />
              {project.promisedWhat
                ? t('team_board.frieze.promised_what', { what: project.promisedWhat, date: formatDay(project.promisedOn) })
                : t('team_board.frieze.promised', { date: formatDay(project.promisedOn) })}
            </span>
          )}
          </>}
          {canEdit && (
            <Button size="sm" variant="secondary" className="ml-auto" onClick={() => setEditing(true)}>
              <Settings2 className="h-4 w-4" aria-hidden />{t('team_board.project.edit')}
            </Button>
          )}
        </div>
      </section>
      <ProjectDialog project={editing ? project : null} onClose={() => setEditing(false)} />
    </BoardContext.Provider>
  )
}
