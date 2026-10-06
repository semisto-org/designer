import clsx from 'clsx'
import { Check } from 'lucide-react'
import { Fragment } from 'react'
import { stageLabel } from '@/components/journey/JourneyParts'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { STAGES, useGuide } from '@/map/editor/guide'

/**
 * The four steps in the header. The step in focus is a pill; the map's
 * current step has a filled circle, a finished one a check. Picking a step
 * brings its tools forward in the rail and its next task in the guide card.
 */
export function StageStepper() {
  const editor = useEditor()
  const guide = useGuide()
  const done = new Set(guide.data?.steps.filter((s) => s.done).map((s) => s.key) ?? [])

  return (
    <ol aria-label={t('editor.steps.label')} className="flex items-center gap-2 text-[13px]">
      {STAGES.map((stage, index) => {
        const focused = stage === editor.focusStage
        const current = stage === editor.map.stage
        const finished = done.has(stage)
        return (
          <Fragment key={stage}>
            {index > 0 && <li aria-hidden className="h-px w-[18px] shrink-0 bg-[#c9c6d8]" />}
            <li>
              <button
                type="button"
                aria-current={focused ? 'step' : undefined}
                onClick={() => editor.focusStep(stage)}
                className={clsx(
                  'flex items-center gap-1.5 rounded-full py-[5px] pl-1.5 pr-3 transition-colors active:scale-[0.98]',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-prune-600',
                  focused ? 'bg-prune-100 font-semibold text-prune-600' : 'text-loam-400 hover:bg-[#f4f1ea] hover:text-loam-900',
                )}
              >
                <span
                  aria-hidden
                  className={clsx(
                    'grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full text-[10px] font-semibold',
                    current || finished || focused ? 'bg-prune-600 text-white' : 'border border-[#9a9a9a]',
                  )}
                >
                  {finished ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : index + 1}
                </span>
                <span className={clsx(!focused && 'sr-only xl:not-sr-only')}>{stageLabel(stage)}</span>
                {(current || finished) && (
                  <span className="sr-only">{` (${finished ? t('editor.steps.done') : t('editor.steps.current')})`}</span>
                )}
              </button>
            </li>
          </Fragment>
        )
      })}
    </ol>
  )
}
