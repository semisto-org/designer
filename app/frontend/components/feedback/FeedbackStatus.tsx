import clsx from 'clsx'
import { Pill, type PillTone } from '@/components/ui/Pill'
import { t } from '@/lib/i18n'

export type FeedbackStatusKey = 'received' | 'reviewing' | 'planned' | 'done' | 'declined'
export const FEEDBACK_STATUSES: FeedbackStatusKey[] = ['received', 'reviewing', 'planned', 'done', 'declined']

const TONES: Record<FeedbackStatusKey, PillTone> = {
  received: 'neutral',
  reviewing: 'humus',
  planned: 'prune',
  done: 'leaf',
  declined: 'lichen',
}

/** Where a feedback stands, as a pill. */
export function FeedbackStatusPill({ status }: { status: FeedbackStatusKey }) {
  return <Pill tone={TONES[status]}>{t(`feedback.statuses.${status}`)}</Pill>
}

const PATH: FeedbackStatusKey[] = ['received', 'reviewing', 'planned', 'done']

/**
 * The way a feedback grows, from a seed to what is online: the steps behind
 * it filled, the next ones still to come. A declined feedback stops where it is.
 */
export function FeedbackPath({ status }: { status: FeedbackStatusKey }) {
  const reached = status === 'declined' ? 0 : PATH.indexOf(status)
  return (
    <ol className="flex items-center gap-1.5" aria-label={t(`feedback.status_hints.${status}`)}>
      {PATH.map((step, index) => (
        <li key={step} className="flex items-center gap-1.5" aria-hidden>
          {index > 0 && <span className={clsx('h-px w-5 sm:w-8', index <= reached ? 'bg-leaf-500' : 'bg-loam-200')} />}
          <span className={clsx('h-2.5 w-2.5 rounded-full', index <= reached ? 'bg-leaf-500' : 'border border-loam-300 bg-white', index === reached && status !== 'declined' && 'ring-4 ring-leaf-100')} />
        </li>
      ))}
    </ol>
  )
}
