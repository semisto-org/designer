import clsx from 'clsx'
import { Check, CircleAlert, LoaderCircle } from 'lucide-react'
import { SchemaFields } from '@/components/journey/SchemaFields'
import { t } from '@/lib/i18n'
import type { ProjectSheetApi, SaveStatus } from '@/lib/projectSheet'
import type { ProjectSchema, SectionStatus } from '@/types/journey'

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

/** Hint, fields and the "section finished" toggle of one section. */
export function SectionBody({ sheet, schema, section, canEdit }: {
  sheet: ProjectSheetApi; schema: ProjectSchema; section: string; canEdit: boolean
}) {
  const definition = schema.sections.find((s) => s.key === section)
  if (!definition) return null
  const done = sheet.project.meta?.done?.includes(section) ?? false
  return (
    <div>
      <p className="text-sm text-loam-600">{t(`journey.project.sections.${section}.hint`)}</p>
      <div className="mt-5">
        <SchemaFields
          fields={definition.fields}
          values={sheet.project[section] ?? {}}
          onChange={(key, value) => sheet.setField(section, key, value)}
          prefix={`journey.project.sections.${section}.fields`}
          disabled={!canEdit}
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
