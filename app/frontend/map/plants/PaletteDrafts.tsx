import { Check, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { strataLabel } from '@/components/plants/format'
import { api, ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { setPlanting } from '@/map/plants/store'
import { StrataDot } from '@/map/plants/strata'
import type { PaletteDraft, PlantingState } from '@/types/plants'

/**
 * Plants an AI proposed for the palette (MCP propose_palette), often a list
 * the person already kept elsewhere: each one with where it comes from, to
 * accept or refuse, one by one or all at once.
 */
export function PaletteDrafts({ drafts }: { drafts: PaletteDraft[] }) {
  const editor = useEditor()
  const mapId = editor.map.id
  const [busy, setBusy] = useState(false)

  async function decide(id: number | 'all', action: 'accept' | 'reject', message: string) {
    setBusy(true)
    try {
      const r = await api<{ planting: PlantingState }>(`/maps/${mapId}/palette_items/${id}/${action}`, { method: 'POST' })
      setPlanting(mapId, r.planting)
      editor.notify(message)
    } catch (e) {
      editor.notify(e instanceof ApiError ? e.message : t('palette.load_error'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-xl bg-humus-50 p-3 ring-1 ring-humus-200">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-humus-900">
        <Sparkles className="h-4 w-4" aria-hidden />{t('palette.drafts.title', { count: drafts.length })}
      </h3>
      <p className="mt-0.5 text-xs text-humus-800">{t('palette.drafts.intro')}</p>
      <ul className="mt-2 divide-y divide-humus-200/70">
        {drafts.map((draft) => (
          <li key={draft.id} className="flex items-start gap-2 py-2">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 font-medium text-loam-800">
                <StrataDot strata={draft.effectiveStrata} /><span className="truncate">{draft.name}</span>
              </p>
              <p className="truncate text-xs text-loam-500">
                <i>{draft.latinName}</i> · {strataLabel(draft.effectiveStrata)}
                {draft.targetCount ? ` · ${t('palette.target', { count: draft.targetCount })}` : ''}
              </p>
              {draft.rationale && <p className="mt-0.5 text-xs text-loam-600">{draft.rationale}</p>}
            </div>
            {editor.canEdit && (
              <div className="flex shrink-0 gap-1">
                <button
                  type="button" disabled={busy} onClick={() => decide(draft.id, 'accept', t('palette.drafts.accepted', { name: draft.name }))}
                  aria-label={`${t('palette.drafts.accept')} : ${draft.name}`} title={t('palette.drafts.accept')}
                  className="grid h-7 w-7 place-items-center rounded-full bg-leaf-600 text-white hover:bg-leaf-700 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  type="button" disabled={busy} onClick={() => decide(draft.id, 'reject', t('palette.drafts.rejected', { name: draft.name }))}
                  aria-label={`${t('palette.drafts.reject')} : ${draft.name}`} title={t('palette.drafts.reject')}
                  className="grid h-7 w-7 place-items-center rounded-full bg-white text-clay-600 ring-1 ring-loam-200 hover:bg-clay-50 disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {editor.canEdit && drafts.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="leaf" disabled={busy} onClick={() => decide('all', 'accept', t('palette.drafts.all_accepted'))}>
            {t('palette.drafts.accept_all')}
          </Button>
          <Button
            size="sm" variant="ghost" disabled={busy}
            onClick={() => window.confirm(t('palette.drafts.confirm_reject_all', { count: drafts.length })) && decide('all', 'reject', t('palette.drafts.all_rejected'))}
          >
            {t('palette.drafts.reject_all')}
          </Button>
        </div>
      )}
    </section>
  )
}
