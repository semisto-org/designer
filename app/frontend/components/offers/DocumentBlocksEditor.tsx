import { ChevronDown, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { Pill } from '@/components/ui/Pill'
import { t } from '@/lib/i18n'
import { DOCUMENT_BLOCKS, type DocumentBlock, type DocumentBlockKey, type DocumentBlocks, type DocumentStep } from '@/types/offers'
import { phaseLabel } from './shared'

const PHASED: Partial<Record<DocumentBlockKey, DocumentStep[]>> = {
  approach: ['pre_design', 'design', 'implementation', 'co_management'],
  phases: ['pre_design', 'design', 'implementation'],
  deliverables: ['pre_design', 'design', 'implementation', 'co_management'],
}
// Blocks whose content is mostly numbers or layout: their text only introduces them.
const GENERATED: DocumentBlockKey[] = ['cover', 'scope', 'budget']

type Props = {
  /** What applies under these changes: the template's blocks (an offer) or Semisto's (a template). */
  base: Record<DocumentBlockKey, DocumentBlock>
  own: DocumentBlocks
  readOnly: boolean
  /** « Reprendre le texte du barème » or « … de Semisto ». */
  resetLabel: string
  changedLabel: string
  onChange: (own: DocumentBlocks) => void
}

/**
 * The blocks of a client document, each with its switch, its title and its
 * Markdown text (and, for the four steps and the deliverables, one text per
 * step). The fields show the text that applies; what differs from the base
 * is kept as this layer's change, and « Reprendre » drops it.
 */
export function DocumentBlocksEditor({ base, own, readOnly, resetLabel, changedLabel, onChange }: Props) {
  const setBlock = (key: DocumentBlockKey, next: DocumentBlock) => {
    const blocks = { ...own }
    const clean = compact(next, base[key])
    if (Object.keys(clean).length) blocks[key] = clean
    else delete blocks[key]
    onChange(blocks)
  }

  return (
    <ul className="divide-y divide-loam-100 rounded-xl ring-1 ring-inset ring-loam-200">
      {DOCUMENT_BLOCKS.map((key) => {
        const under = base[key] ?? {}
        const mine = own[key] ?? {}
        const enabled = mine.enabled ?? under.enabled ?? true
        const changed = Object.keys(mine).length > 0
        const set = (patch: DocumentBlock) => setBlock(key, { ...mine, ...patch })
        const setStep = (step: DocumentStep, value: string) => set({ phases: { ...mine.phases, [step]: value } })
        return (
          <li key={key}>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5">
                <input
                  type="checkbox"
                  aria-label={t('offers.document.in_document')}
                  className="rounded border-loam-300 text-prune-600 focus:ring-prune-600"
                  checked={enabled}
                  disabled={readOnly}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => set({ enabled: e.target.checked })}
                />
                <span className={enabled ? 'font-medium text-loam-900' : 'text-loam-500 line-through'}>{t(`offers.document.blocks.${key}`)}</span>
                {changed && <Pill tone="humus">{changedLabel}</Pill>}
                <ChevronDown className="ml-auto h-4 w-4 text-loam-400 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <div className="space-y-3 px-3 pb-4">
                {GENERATED.includes(key) && <p className="text-sm text-loam-500">{t(`offers.document.generated.${key}`)}</p>}
                <Field label={t('offers.document.title_label')}>
                  <Input value={mine.title ?? under.title ?? ''} disabled={readOnly} maxLength={120} onChange={(e) => set({ title: e.target.value })} />
                </Field>
                <Field label={key === 'letter' ? t('offers.document.letter_body_label') : t('offers.document.body_label')}>
                  <Textarea
                    rows={rows(mine.body ?? under.body)}
                    value={mine.body ?? under.body ?? ''}
                    disabled={readOnly}
                    onChange={(e) => set({ body: e.target.value })}
                  />
                </Field>
                {PHASED[key]?.map((step) => (
                  <Field key={step} label={step === 'co_management' ? t('offers.co_management.title') : phaseLabel(step)}>
                    <Textarea
                      rows={rows(mine.phases?.[step] ?? under.phases?.[step])}
                      value={mine.phases?.[step] ?? under.phases?.[step] ?? ''}
                      disabled={readOnly}
                      onChange={(e) => setStep(step, e.target.value)}
                    />
                  </Field>
                ))}
                {changed && !readOnly && (
                  <Button variant="ghost" size="sm" onClick={() => setBlock(key, {})}>
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />{resetLabel}
                  </Button>
                )}
              </div>
            </details>
          </li>
        )
      })}
    </ul>
  )
}

function rows(text?: string) {
  return Math.min(16, Math.max(2, (text ?? '').split('\n').length + 1))
}

/** Only what differs from the base is a change. A blank text falls back to the base too. */
function compact(block: DocumentBlock, base: DocumentBlock): DocumentBlock {
  const out: DocumentBlock = {}
  if (block.enabled != null && block.enabled !== (base.enabled ?? true)) out.enabled = block.enabled
  if (block.title?.trim() && block.title !== base.title) out.title = block.title
  if (block.body?.trim() && block.body !== base.body) out.body = block.body
  const phases = Object.fromEntries(
    Object.entries(block.phases ?? {}).filter(([step, text]) => text?.trim() && text !== base.phases?.[step as DocumentStep]),
  )
  if (Object.keys(phases).length) out.phases = phases
  return out
}
