import clsx from 'clsx'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { isPlannedPlant, setScenario, useScenario, type Scenario } from '@/map/scenario'

const OPTIONS: Scenario[] = ['current', 'projected']

/**
 * « Actuelle | Projetée » in the editor header: shows what is on the ground
 * today, or the whole design with what is still a project drawn apart.
 * Only there when the map holds something planned (plants not planted yet,
 * Claude's drafts).
 */
export default function ScenarioToggle() {
  const { features } = useEditor()
  const scenario = useScenario()
  const hasProject = features.some((f) => f.properties.status === 'draft' || isPlannedPlant(f.properties))
  if (!hasProject && scenario === 'projected') return null
  return (
    <div role="group" aria-label={t('scenario.label')} className="inline-flex shrink-0 rounded-full bg-loam-100 p-0.5 text-xs font-medium sm:text-sm">
      {OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={scenario === option}
          title={t(`scenario.${option}_hint`)}
          onClick={() => setScenario(option)}
          className={clsx(
            'rounded-full px-2.5 py-1 transition-colors sm:px-3',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-prune-600',
            scenario === option ? 'bg-white text-loam-900 shadow-sm ring-1 ring-loam-200' : 'text-loam-500 hover:text-loam-800',
          )}
        >
          {t(`scenario.${option}`)}
        </button>
      ))}
    </div>
  )
}
