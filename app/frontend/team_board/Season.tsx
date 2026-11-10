import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { SeasonFrieze, type StepApi } from '@/season/SeasonFrieze'
import type { BoardProject, BoardStep } from '@/types/teamBoard'
import { BoardSection, boardBase, useBoard } from './board'

/**
 * « La saison qui vient » on the team board: every project of the team on
 * the season frieze, one lane each (SeasonFrieze). The same steps show,
 * project by project, on each map's « Tâches » page.
 */
export function Season({ steps, projects, season, onChanged }: {
  steps: BoardStep[]
  projects: BoardProject[]
  season: { opensOn: string; closesOn: string }
  onChanged: () => void
}) {
  const { teamId, today, stepKinds, notify } = useBoard()
  const base = `${boardBase(teamId)}/steps`
  const stepApi: StepApi = {
    create: async (body) => (await api<{ step: BoardStep }>(base, { method: 'POST', body: { step: body } })).step,
    update: async (id, body) => (await api<{ step: BoardStep }>(`${base}/${id}`, { method: 'PATCH', body: { step: body } })).step,
    destroy: async (id) => { await api(`${base}/${id}`, { method: 'DELETE' }) },
  }
  return (
    <SeasonFrieze
      steps={steps}
      projects={projects}
      season={season}
      today={today}
      stepKinds={stepKinds}
      api={stepApi}
      notify={notify}
      onChanged={onChanged}
      frame={({ add, body, hasSteps }) => (
        <BoardSection id="board-season" title={t('team_board.season.title')} hint={hasSteps ? t('team_board.season.hint') : undefined} aside={add}>
          {body}
        </BoardSection>
      )}
    />
  )
}
