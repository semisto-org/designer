import { Lock } from 'lucide-react'
import { useEditor } from '@/map/editor/EditorContext'
import { t } from '@/lib/i18n'

/**
 * Header badge for a map the owner's plan no longer covers: readable,
 * exportable, commentable, but not editable. The owner is sent to /billing.
 */
export default function ReadOnlyNotice() {
  const { map, isOwner } = useEditor()
  if (!map.readOnlyByPlan) return null
  const classes = 'inline-flex items-center gap-1.5 rounded-full bg-humus-100 px-3 py-1 text-xs font-medium text-humus-700'
  if (!isOwner) {
    return (
      <span className={classes} title={t('billing.read_only_editor_hint')}>
        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
        {t('billing.read_only_short')}
      </span>
    )
  }
  return (
    <a href="/billing" className={`${classes} hover:bg-humus-200`} title={t('billing.read_only_hint')}>
      <Lock className="h-3.5 w-3.5" aria-hidden="true" />
      {t('billing.read_only_badge')}
    </a>
  )
}
