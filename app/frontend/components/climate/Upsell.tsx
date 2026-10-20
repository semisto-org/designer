import { PlanGate } from '@/components/billing/PlanGate'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'

/** What the free plan does not include, said about this place. */
export function Upsell({ plantsCount }: { plantsCount: number }) {
  const editor = useEditor()
  return (
    <PlanGate feature="climate" place={editor.map} canUpgrade={editor.isOwner} panel="climate">
      {plantsCount > 0 && <p>{t('climate.locked.plants_count', { count: plantsCount })}</p>}
    </PlanGate>
  )
}
