import clsx from 'clsx'
import { Check, CircleAlert, LoaderCircle, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import { describeValue, SchemaFields, type Texts } from '@/components/journey/SchemaFields'
import { Button } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import type { ProjectSheetApi, SaveStatus } from '@/lib/projectSheet'
import type { ProjectDraft, ProjectSchema, SchemaField, SectionStatus } from '@/types/journey'

export const sectionTitle = (section: string) => t(`journey.project.sections.${section}.title`)

export function ProgressBar({ percent, className, label }: { percent: number; className?: string; label?: string }) {
  return (
    <div
      role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={label}
      className={clsx('h-2 overflow-hidden rounded-full bg-loam-100', className)}
    >
      <div className="h-full rounded-full bg-leaf-500 transition-[width] duration-500" style={{ width: `${percent}%` }} />
    </div>
  )
}

/** A small mark of how far a section is: empty ring, half ring, check. */
export function StatusMark({ status, className }: { status: SectionStatus; className?: string }) {
  const label = t(`journey.project.status.${status}`)
  if (status === 'complete') {
    return (
      <span title={label} className={clsx('grid h-5 w-5 shrink-0 place-items-center rounded-full bg-leaf-500 text-white', className)}>
        <Check className="h-3 w-3" aria-hidden /><span className="sr-only">{label}</span>
      </span>
    )
  }
  return (
    <span
      title={label}
      className={clsx(
        'h-5 w-5 shrink-0 rounded-full border-2',
        status === 'partial' ? 'border-leaf-500 bg-gradient-to-r from-leaf-500 from-50% to-transparent to-50%' : 'border-loam-300',
        className,
      )}
    >
      <span className="sr-only">{label}</span>
    </span>
  )
}

export function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  return (
    <p aria-live="polite" className="flex items-center gap-1.5 text-xs text-loam-500">
      {status === 'saving' && <><LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />{t('journey.project.saving')}</>}
      {status === 'dirty' && t('journey.project.unsaved')}
      {status === 'saved' && <><Check className="h-3.5 w-3.5 text-leaf-600" aria-hidden />{t('journey.project.saved')}</>}
      {status === 'error' && (
        <span className="flex flex-wrap items-center gap-1.5 text-clay-600">
          <CircleAlert className="h-3.5 w-3.5" aria-hidden />
          {t('journey.project.error')}
          <button type="button" onClick={onRetry} className="font-medium underline">{t('journey.project.retry')}</button>
        </span>
      )}
    </p>
  )
}

const authorOf = (draft: ProjectDraft) => draft.clientName || t('journey.project.drafts.default_author')

/** How many answers an AI proposed in a section: a small count next to its name. */
export function DraftCount({ sheet, section, className }: { sheet: ProjectSheetApi; section: string; className?: string }) {
  const count = sheet.drafts.filter((d) => d.section === section).length
  if (!count) return null
  const label = t('journey.project.drafts.in_section', { count })
  return (
    <span title={label} className={clsx('inline-flex h-5 min-w-5 shrink-0 items-center justify-center gap-0.5 rounded-full bg-humus-100 px-1.5 text-xs font-semibold text-humus-800', className)}>
      <Sparkles className="h-3 w-3" aria-hidden />{count}<span className="sr-only">{label}</span>
    </span>
  )
}

/**
 * Answers an AI proposed for the sheet (from a conversation, an interview
 * transcript…): how many, and accept or refuse them all at once. Each one
 * also waits under its own question.
 */
export function DraftsBanner({ sheet, canEdit, onOpen }: {
  sheet: ProjectSheetApi; canEdit: boolean; onOpen?: (section: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  if (!sheet.drafts.length) return null
  const first = sheet.drafts[0]
  async function decide(decision: 'accept' | 'reject') {
    if (decision === 'reject' && !window.confirm(t('journey.project.drafts.confirm_reject_all', { count: sheet.drafts.length }))) return
    setBusy(true)
    setFailed(false)
    try { await sheet.review('all', decision) } catch { setFailed(true) } finally { setBusy(false) }
  }
  return (
    <section aria-live="polite" className="rounded-2xl bg-humus-50 p-4 ring-1 ring-humus-200">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-humus-900">
        <Sparkles className="h-4 w-4" aria-hidden />
        {t('journey.project.drafts.title', { author: authorOf(first), count: sheet.drafts.length })}
      </h3>
      <p className="mt-1 text-sm text-humus-800">
        {t(canEdit ? 'journey.project.drafts.intro' : 'journey.project.drafts.viewer_hint')}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {onOpen && (
          <Button size="sm" variant="secondary" onClick={() => onOpen(first.section)}>{t('journey.project.drafts.review')}</Button>
        )}
        {canEdit && sheet.drafts.length > 1 && (
          <>
            <Button size="sm" variant="leaf" disabled={busy} onClick={() => decide('accept')}>{t('journey.project.drafts.accept_all')}</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => decide('reject')}>{t('journey.project.drafts.reject_all')}</Button>
          </>
        )}
      </div>
      {failed && <p className="mt-2 text-xs text-clay-600">{t('journey.project.drafts.error')}</p>}
    </section>
  )
}

/** One proposed answer, under its question: the value, where it comes from, what it would replace. */
function DraftAnswer({ draft, field, texts, current, canEdit, onReview }: {
  draft: ProjectDraft; field: SchemaField; texts: Texts; current: unknown; canEdit: boolean
  onReview: (decision: 'accept' | 'reject') => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const replaced = describeValue(field, texts, current)
  async function decide(decision: 'accept' | 'reject') {
    setBusy(true)
    setFailed(false)
    try { await onReview(decision) } catch { setFailed(true); setBusy(false) }
  }
  return (
    <div className="mt-2 rounded-xl bg-humus-50 p-3 ring-1 ring-humus-200">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-humus-900">
        <Sparkles className="h-3.5 w-3.5" aria-hidden />{t('journey.project.drafts.proposes', { author: authorOf(draft) })}
      </p>
      <p className="mt-1 whitespace-pre-line text-sm font-medium text-loam-900">{describeValue(field, texts, draft.value)}</p>
      <p className="mt-1 text-xs text-loam-600">{t('journey.project.drafts.because', { rationale: draft.rationale })}</p>
      {replaced && <p className="mt-1 text-xs text-humus-800">{t('journey.project.drafts.replaces', { value: replaced })}</p>}
      {canEdit && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="leaf" disabled={busy} onClick={() => decide('accept')}>
            <Check className="h-4 w-4" aria-hidden />{t('journey.project.drafts.accept')}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => decide('reject')}>
            <X className="h-4 w-4" aria-hidden />{t('journey.project.drafts.reject')}
          </Button>
        </div>
      )}
      {failed && <p className="mt-2 text-xs text-clay-600">{t('journey.project.drafts.error')}</p>}
    </div>
  )
}

/** Hint, fields and the "section finished" toggle of one section. */
export function SectionBody({ sheet, schema, section, canEdit }: {
  sheet: ProjectSheetApi; schema: ProjectSchema; section: string; canEdit: boolean
}) {
  const definition = schema.sections.find((s) => s.key === section)
  if (!definition) return null
  const done = sheet.project.meta?.done?.includes(section) ?? false
  const values = sheet.project[section] ?? {}
  const drafts = new Map(sheet.drafts.filter((d) => d.section === section).map((d) => [d.field, d]))
  return (
    <div>
      <p className="text-sm text-loam-600">{t(`journey.project.sections.${section}.hint`)}</p>
      <div className="mt-5">
        <SchemaFields
          fields={definition.fields}
          values={values}
          onChange={(key, value) => sheet.setField(section, key, value)}
          prefix={`journey.project.sections.${section}.fields`}
          disabled={!canEdit}
          aside={(field, texts) => {
            const draft = drafts.get(field.key)
            return draft && (
              <DraftAnswer
                key={draft.id} draft={draft} field={field} texts={texts} current={values[field.key]} canEdit={canEdit}
                onReview={(decision) => sheet.review(draft.id, decision)}
              />
            )
          }}
        />
      </div>
      {canEdit && (
        <label className="mt-6 flex cursor-pointer items-start gap-2.5 text-sm text-loam-700">
          <input
            type="checkbox" checked={done} onChange={(e) => sheet.setDone(section, e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-loam-300 text-leaf-600 focus:ring-leaf-500"
          />
          <span>{done ? t('journey.project.unmark_done') : t('journey.project.mark_done')}</span>
        </label>
      )}
    </div>
  )
}
