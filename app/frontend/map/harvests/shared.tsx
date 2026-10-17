import clsx from 'clsx'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { todayIso } from '@/components/plants/format'
import { t } from '@/lib/i18n'
import { HARVEST_AMOUNTS, HARVEST_STAGES, HARVEST_USES, type HarvestInput, type HarvestPlantRow, type HarvestStage, type SeasonStatus, type SeasonSummary } from '@/types/harvests'

/** The colours of a season's status, also used by the map overlay. */
export const STATUS_COLORS: Record<SeasonStatus | 'unnoted', string> = {
  picked: '#b01a19', // clay-500: an apple picked
  bore: '#ef9b0d', // humus-400: fruit on the tree
  none: '#6b665c', // loam-400: nothing on it
  unnoted: '#cbc1af', // loam-300
}

/** A plant's name as the panel lists it: its own name, else number, species and variety. */
export function plantLabel(row: HarvestPlantRow): string {
  if (row.name) return row.name
  const what = [row.speciesName ?? t('plant_harvests.no_species'), row.varietyName].filter(Boolean).join(' ')
  return row.number != null ? `n° ${row.number} — ${what}` : what
}

/** One season as a drawn dot: full for a harvest, half for fruit seen, crossed for none, dashed when not noted. */
export function SeasonDot({ summary, size = 'md', title }: { summary: SeasonSummary | undefined; size?: 'sm' | 'md'; title?: string }) {
  const status = summary?.status ?? 'unnoted'
  const px = size === 'sm' ? 14 : 22
  const color = STATUS_COLORS[status]
  return (
    <svg width={px} height={px} viewBox="0 0 22 22" role="img" aria-label={title ?? t(`plant_harvests.statuses.${status}`)} className="shrink-0">
      <title>{title ?? t(`plant_harvests.statuses.${status}`)}</title>
      {status === 'unnoted' && <circle cx="11" cy="11" r="8" fill="none" stroke={color} strokeWidth="1.6" strokeDasharray="2.6 2.4" />}
      {status === 'none' && <><circle cx="11" cy="11" r="8" fill="none" stroke={color} strokeWidth="1.6" /><path d="M6 16 16 6" stroke={color} strokeWidth="1.6" strokeLinecap="round" /></>}
      {status === 'bore' && <><circle cx="11" cy="11" r="8" fill="none" stroke={color} strokeWidth="1.8" /><path d="M11 3a8 8 0 0 1 0 16Z" fill={color} /></>}
      {status === 'picked' && <circle cx="11" cy="11" r="8.5" fill={color} />}
    </svg>
  )
}

/** The seasons side by side, oldest first, the current one last. */
export function SeasonStrip({ row, seasons, size = 'md', labels = false }: { row: HarvestPlantRow | null; seasons: number[]; size?: 'sm' | 'md'; labels?: boolean }) {
  return (
    <ol className={clsx('flex items-end', size === 'sm' ? 'gap-0.5' : 'gap-2')}>
      {seasons.map((year) => {
        const summary = row?.seasons[String(year)]
        const status = summary?.status ?? 'unnoted'
        const young = row?.bearingFrom != null && year < row.bearingFrom
        return (
          <li key={year} className={clsx('flex flex-col items-center gap-0.5', young && 'opacity-40')}>
            <SeasonDot summary={summary} size={size} title={`${year} · ${t(`plant_harvests.statuses.${status}`)}`} />
            {labels && <span className="text-sm tabular-nums text-loam-500">{String(year).slice(2)}</span>}
          </li>
        )
      })}
    </ol>
  )
}

export function StatusLegend() {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-loam-600">
      {(['picked', 'bore', 'none', 'unnoted'] as const).map((status) => (
        <li key={status} className="flex items-center gap-1">
          <SeasonDot summary={status === 'unnoted' ? undefined : { status, amount: null, uses: [], quantityKg: null }} size="sm" />
          {t(`plant_harvests.legend.${status}`)}
        </li>
      ))}
    </ul>
  )
}

export function emptyInput(stage: HarvestStage = 'picked'): HarvestInput {
  return { notedOn: todayIso(), stage, amount: null, uses: [], quantityKg: '', note: '' }
}

/** The request body of a harvest line. */
export function harvestBody(input: HarvestInput) {
  const picked = input.stage === 'picked'
  return {
    noted_on: input.notedOn,
    stage: input.stage,
    amount: input.amount,
    uses: picked ? input.uses : [],
    quantity_kg: picked && input.quantityKg.trim() ? input.quantityKg.replace(',', '.') : null,
    note: input.note.trim() || null,
  }
}

const chip = (on: boolean, tone = 'bg-prune-600 text-white ring-prune-600') =>
  clsx('rounded-full px-3 py-1.5 text-sm ring-1 ring-inset', on ? tone : 'bg-white text-loam-700 ring-loam-200 hover:bg-loam-100')

/** What was seen or picked: date, stage, amount, uses (and weight for one plant). */
export function HarvestForm({ onSubmit, onCancel, withWeight, saving, errors = {}, submitLabel }: {
  onSubmit: (input: HarvestInput) => void
  onCancel?: () => void
  withWeight: boolean
  saving: boolean
  errors?: Record<string, string[]>
  submitLabel?: string
}) {
  const [input, setInput] = useState<HarvestInput>(() => emptyInput())
  const picked = input.stage === 'picked'
  const update = (patch: Partial<HarvestInput>) => setInput((current) => ({ ...current, ...patch }))
  const amounts = HARVEST_AMOUNTS.filter((a) => picked ? a !== 'none' : true)
  const ready = picked || input.amount != null

  return (
    <div className="space-y-3 rounded-2xl bg-loam-50 p-3">
      <div className="grid grid-cols-2 gap-1.5" role="group" aria-label={t('plant_harvests.stage')}>
        {HARVEST_STAGES.map((stage) => (
          <button key={stage} type="button" aria-pressed={input.stage === stage}
            onClick={() => update({ stage, amount: null, uses: stage === 'picked' ? input.uses : [] })}
            className={clsx(chip(input.stage === stage), 'py-2 font-medium')}>
            {t(`plant_harvests.stages.${stage}`)}
          </button>
        ))}
      </div>
      <Field label={t('plant_harvests.noted_on')} error={errors.noted_on}>
        <Input type="date" value={input.notedOn} max={todayIso()} onChange={(e) => update({ notedOn: e.target.value })} />
      </Field>
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-loam-700">{t('plant_harvests.amount')}</legend>
        <div className="flex flex-wrap gap-1.5">
          {amounts.map((amount) => (
            <button key={amount} type="button" aria-pressed={input.amount === amount}
              onClick={() => update({ amount: input.amount === amount && picked ? null : amount })}
              className={chip(input.amount === amount, amount === 'none' ? 'bg-loam-600 text-white ring-loam-600' : undefined)}>
              {t(`plant_harvests.amounts.${input.stage}.${amount}`)}
            </button>
          ))}
        </div>
        {errors.amount && <span className="mt-1 block text-sm text-clay-500">{errors.amount[0]}</span>}
      </fieldset>
      {picked && (
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-loam-700">{t('plant_harvests.uses_label')}</legend>
          <div className="flex flex-wrap gap-1.5">
            {HARVEST_USES.map((use) => {
              const on = input.uses.includes(use)
              return (
                <button key={use} type="button" aria-pressed={on}
                  onClick={() => update({ uses: on ? input.uses.filter((u) => u !== use) : [...input.uses, use] })}
                  className={chip(on, 'bg-leaf-600 text-white ring-leaf-600')}>
                  {t(`plant_harvests.uses.${use}`)}
                </button>
              )
            })}
          </div>
        </fieldset>
      )}
      {picked && withWeight && (
        <Field label={t('plant_harvests.quantity_kg')} error={errors.quantity_kg}>
          <Input inputMode="decimal" value={input.quantityKg} onChange={(e) => update({ quantityKg: e.target.value })} />
        </Field>
      )}
      <Field label={t('plant_harvests.note')} error={errors.note}>
        <Textarea rows={2} value={input.note} placeholder={t('plant_harvests.note_placeholder')} onChange={(e) => update({ note: e.target.value })} />
      </Field>
      <div className="flex justify-end gap-2">
        {onCancel && <Button variant="ghost" size="sm" onClick={onCancel}>{t('common.cancel')}</Button>}
        <Button size="sm" disabled={saving || !ready} onClick={() => onSubmit(input)}>{submitLabel ?? t('plant_harvests.save')}</Button>
      </div>
    </div>
  )
}
