import { ArrowRight } from 'lucide-react'
import { t } from '@/lib/i18n'
import { fieldKey, isKnownField, shownValue, type FeatureUpdateChange } from '@/map/feature_updates/diff'

export function fieldLabel(field: string): string {
  const key = fieldKey(field)
  return isKnownField(key) ? t(`feature_updates.fields.${key}`) : key
}

function Value({ change, side }: { change: FeatureUpdateChange; side: 'before' | 'after' }) {
  const shown = shownValue(change, side)
  if (shown.kind === 'empty') {
    const removed = side === 'after' && change.before != null
    return <span className="italic text-loam-400">{t(removed ? 'feature_updates.removed_value' : 'feature_updates.empty_value')}</span>
  }
  if (shown.kind === 'geometry') return <span>{t(side === 'after' ? 'feature_updates.new_position' : 'feature_updates.before')}</span>
  return <span className="break-words">{shown.text}</span>
}

/** Field by field, before → after. */
export default function ChangeList({ changes, compact = false, hideBefore = false }: {
  changes: FeatureUpdateChange[]
  compact?: boolean
  /** For a summary of many elements, whose values before differ. */
  hideBefore?: boolean
}) {
  return (
    <dl className="space-y-1.5 text-sm">
      {changes.map((change) => (
        <div key={change.field} className={compact ? 'flex flex-wrap items-baseline gap-x-1.5' : ''}>
          <dt className="font-medium text-loam-700">{fieldLabel(change.field)}{compact && ' :'}</dt>
          <dd className="flex flex-wrap items-baseline gap-x-1.5 text-loam-800">
            {change.field !== 'geometry' && !hideBefore && (
              <>
                <span className="text-loam-500 line-through decoration-loam-300"><Value change={change} side="before" /></span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 self-center text-humus-600" aria-label={t('feature_updates.after')} />
              </>
            )}
            <span className="font-medium text-loam-900"><Value change={change} side="after" /></span>
          </dd>
        </div>
      ))}
    </dl>
  )
}
