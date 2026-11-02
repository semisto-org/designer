import { router } from '@inertiajs/react'
import { Eye, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, Textarea } from '@/components/ui/Field'
import { toast } from '@/components/ui/toast'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import type { DocumentBlock, DocumentBlockKey, OfferData, OfferInputs, OfferMeasures, OfferResult } from '@/types/offers'
import { DocumentBlocksEditor } from './DocumentBlocksEditor'

type Response = { offer: OfferData; measures: OfferMeasures; result: OfferResult }

type Props = {
  mapId: number
  inputs: OfferInputs
  base: Record<DocumentBlockKey, DocumentBlock>
  readOnly: boolean
  onChange: (inputs: OfferInputs) => void
  /** Saves what is pending before leaving for the preview or answering the AI. */
  beforeLeave: () => Promise<unknown>
  onAdopt: (data: Response) => void
}

/**
 * « Document client »: what the client will read, for this offer. The
 * letter written for them (by the team, or proposed by its AI through the
 * MCP and taken or refused here), then the template's blocks, each open to
 * a change for this client only.
 */
export function DocumentCard({ mapId, inputs, base, readOnly, onChange, beforeLeave, onAdopt }: Props) {
  const document = inputs.document ?? { blocks: {} }
  const draft = document.letter_draft
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<OfferInputs['document']>) => onChange({ ...inputs, document: { ...document, ...patch } })

  async function answer(method: 'POST' | 'DELETE') {
    setBusy(true)
    try {
      await beforeLeave()
      onAdopt(await api<Response>(`/maps/${mapId}/offer/letter_draft`, { method }))
      toast(t(method === 'POST' ? 'offers.document.letter.accepted' : 'offers.document.letter.rejected'))
    } catch (error) {
      toast((error as Error).message, { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-serif text-xl font-semibold text-prune-800">{t('offers.document.title')}</h3>
        <Button variant="secondary" size="sm" onClick={async () => { await beforeLeave(); router.visit(`/maps/${mapId}/offer/preview`) }}>
          <Eye className="h-4 w-4" aria-hidden />{t('offers.document.preview')}
        </Button>
      </header>
      <p className="text-sm text-loam-600">{t('offers.document.intro')}</p>

      {draft && (
        <section className="space-y-2 rounded-xl bg-humus-50 p-3 ring-1 ring-inset ring-humus-200">
          <p className="flex items-center gap-1.5 font-medium text-humus-900">
            <Sparkles className="h-4 w-4" aria-hidden />
            {draft.client_name ? t('offers.document.letter.draft_title', { client: draft.client_name }) : t('offers.document.letter.draft_title_ai')}
          </p>
          <p className="whitespace-pre-line text-sm text-loam-800">{draft.body}</p>
          {draft.rationale && <p className="text-sm text-loam-600">{draft.rationale}</p>}
          {document.letter && <p className="text-sm text-loam-600">{t('offers.document.letter.draft_replaces')}</p>}
          {!readOnly && (
            <div className="flex gap-2">
              <Button size="sm" disabled={busy} onClick={() => answer('POST')}>{t('offers.document.letter.accept')}</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => answer('DELETE')}>{t('offers.document.letter.reject')}</Button>
            </div>
          )}
        </section>
      )}

      <Field label={t('offers.document.letter.label')} hint={t('offers.document.letter.ai_hint')}>
        <span className="block text-sm text-loam-600">{t('offers.document.letter.help')}</span>
        <Textarea
          rows={Math.min(20, Math.max(6, (document.letter ?? '').split('\n').length + 2))}
          value={document.letter ?? ''}
          disabled={readOnly}
          onChange={(e) => set({ letter: e.target.value })}
        />
      </Field>

      <div className="space-y-2">
        <p className="text-sm text-loam-500">{t('offers.document.placeholders')}</p>
        <DocumentBlocksEditor
          base={base}
          own={document.blocks ?? {}}
          readOnly={readOnly}
          resetLabel={t('offers.document.reset')}
          changedLabel={t('offers.document.changed')}
          onChange={(blocks) => set({ blocks })}
        />
      </div>
    </Card>
  )
}
