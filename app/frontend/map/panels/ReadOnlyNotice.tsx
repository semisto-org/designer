import { router } from '@inertiajs/react'
import { Archive, Lock } from 'lucide-react'
import { useEditor } from '@/map/editor/EditorContext'
import { t } from '@/lib/i18n'
import { plansHref } from '@/components/billing/PlanGate'

const classes = 'inline-flex items-center gap-1.5 rounded-full bg-humus-100 px-3 py-1 text-sm font-medium text-humus-700'

/**
 * Header badge for a map that cannot be edited: archived by its owner (who
 * can bring it back from here), or no longer covered by the owner's plan
 * (the owner is sent to /billing). Both stay readable, exportable and
 * commentable.
 */
export default function ReadOnlyNotice() {
  const { map, isOwner } = useEditor()
  if (map.archived) {
    if (!isOwner) {
      return (
        <span className={classes} title={t('maps.archives.badge_hint')}>
          <Archive className="h-3.5 w-3.5" aria-hidden="true" />
          {t('maps.archives.badge')}
        </span>
      )
    }
    return (
      <button type="button" className={`${classes} hover:bg-humus-200`} title={t('maps.archives.badge_hint')} onClick={() => router.delete(`/maps/${map.id}/archive`)}>
        <Archive className="h-3.5 w-3.5" aria-hidden="true" />
        {t('maps.archives.badge_owner')}
      </button>
    )
  }
  if (!map.readOnlyByPlan) return null
  if (!isOwner) {
    return (
      <span className={classes} title={t('billing.read_only_editor_hint')}>
        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
        {t('billing.read_only_short')}
      </span>
    )
  }
  return (
    <a href={plansHref({ returnTo: `/maps/${map.id}` })} className={`${classes} hover:bg-humus-200`} title={t('billing.read_only_hint')}>
      <Lock className="h-3.5 w-3.5" aria-hidden="true" />
      {t('billing.read_only_badge')}
    </a>
  )
}
