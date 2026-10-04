import { Lock } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'

/**
 * Shown where the reading of results would be, when the map owner's plan has
 * no analyses. Never blocks the data: figures stay entered and visible.
 */
export default function Upsell() {
  const editor = useEditor()
  return (
    <section className="space-y-2 rounded-xl bg-prune-50 p-3.5 text-sm text-prune-900" aria-label={t('soil.upsell.title')}>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-prune-900">
        <Lock className="h-4 w-4 text-prune-600" aria-hidden />
        {t('soil.upsell.title')}
      </h3>
      <p className="text-prune-800">{t('soil.upsell.body')}</p>
      {editor.isOwner ? (
        <ButtonLink href="/billing" size="sm">{t('soil.upsell.cta')}</ButtonLink>
      ) : (
        <p className="text-xs text-prune-700">{t('soil.upsell.owner_only')}</p>
      )}
    </section>
  )
}
