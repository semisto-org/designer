import clsx from 'clsx'
import { FolderLock } from 'lucide-react'
import { t } from '@/lib/i18n'

/**
 * « Dans le livrable client »: the team's mark on a document, a photo, a
 * video or a soil point. Its client sees it in the deliverable at once
 * (Pro and Team).
 */
export function DeliverableToggle({ checked, onChange, disabled, className }: {
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <label className={clsx('flex items-start gap-2 rounded-lg bg-prune-50 px-3 py-2 text-sm text-prune-900', className)}>
      <input type="checkbox" className="mt-0.5 rounded border-prune-300 text-prune-600" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="flex items-center gap-1.5 font-medium"><FolderLock className="h-4 w-4" aria-hidden />{t('deliverables.mark.label')}</span>
        <span className="block text-prune-700">{t('deliverables.mark.hint')}</span>
      </span>
    </label>
  )
}

/** The small mark on a tile: this file is in the client deliverable. */
export function DeliverableBadge({ className }: { className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full bg-prune-600/90 px-2 py-0.5 text-sm text-white', className)} title={t('deliverables.mark.badge')}>
      <FolderLock className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">{t('deliverables.mark.badge')}</span>
    </span>
  )
}
