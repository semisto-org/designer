import { Check, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { acceptDraft, rejectDraft } from '@/map/drafts/actions'
import type { MapFeature } from '@/types'

/** In the inspector of a draft, next to its rationale: accept or reject it. */
export default function DraftReviewSection({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const [busy, setBusy] = useState(false)
  if (!editor.canEdit) return null
  const id = feature.properties.id

  async function review(action: 'accept' | 'reject') {
    setBusy(true)
    try {
      if (action === 'accept') {
        await acceptDraft(editor, id)
        editor.notify(t('drafts.accepted'))
      } else {
        await rejectDraft(editor, id)
        editor.notify(t('drafts.rejected'))
      }
    } catch (error) {
      editor.notify((error as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-humus-200 bg-humus-50/60 p-3">
      <p className="text-xs text-loam-600">{t('drafts.inspector_hint')}</p>
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="leaf" className="flex-1" disabled={busy} onClick={() => review('accept')}>
          <Check className="h-4 w-4" />
          {t('drafts.accept')}
        </Button>
        <Button size="sm" variant="secondary" className="flex-1 text-clay-500" disabled={busy} onClick={() => review('reject')}>
          <X className="h-4 w-4" />
          {t('drafts.reject')}
        </Button>
      </div>
    </div>
  )
}
