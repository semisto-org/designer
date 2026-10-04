import { ChevronDown, Trash2 } from 'lucide-react'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { NumberInput } from '@/components/finances/NumberInput'
import { YearSelect } from '@/components/finances/YearSelect'
import { formatMoney, formatQuantity } from '@/components/finances/format'
import { t } from '@/lib/i18n'
import { CHANNELS, type SpeciesLine } from '@/types/climate_finance'

type Props = {
  line: SpeciesLine
  onChange: (line: SpeciesLine) => void
  onRemove: () => void
  readOnly: boolean
  startYear: number
  defaultOpen: boolean
}

const f = (key: string) => t(`finances.fields.species.${key}`)

/** One species of the plan: plants bought, yield curve, sales channels. */
export function SpeciesCard({ line, onChange, onRemove, readOnly, startYear, defaultOpen }: Props) {
  const set = <K extends keyof SpeciesLine>(key: K, value: SpeciesLine[K]) => onChange({ ...line, [key]: value })
  const plantsCost = (line.quantity ?? 0) * (line.unitPrice ?? 0)
  const matureKg = (line.quantity ?? 0) * (line.yieldKgPerPlant ?? 0)
  const matureHours = line.pickingRateKgPerHour ? matureKg / line.pickingRateKgPerHour : null
  const shareTotal = CHANNELS.reduce((sum, c) => sum + (line[`${c}SharePct`] ?? 0), 0)
  const title = line.name || line.latinName || t('finances.species.new_name')

  return (
    <details open={defaultOpen} className="group rounded-xl bg-white shadow-sm ring-1 ring-loam-200/70 print:break-inside-avoid">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-3.5 [&::-webkit-details-marker]:hidden">
        <ChevronDown className="h-4 w-4 shrink-0 text-loam-400 transition-transform group-open:rotate-180 print:hidden" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-loam-900">
            {title}
            {line.latinName && line.name && <span className="latin ml-1.5 text-sm font-normal text-loam-500">{line.latinName}</span>}
          </p>
          <p className="truncate text-xs text-loam-500">
            {t('finances.units.plants', { count: line.quantity ?? 0 })}
            {plantsCost > 0 && <> · {t('finances.species.plants_cost', { amount: formatMoney(plantsCost) })}</>}
            {matureKg > 0 && <> · {formatQuantity(matureKg, 'kg')}{matureHours != null && <> · {formatQuantity(matureHours, 'h')}</>}</>}
          </p>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); onRemove() }}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-loam-400 hover:bg-clay-50 hover:text-clay-700 print:hidden"
            aria-label={t('finances.actions.remove_named', { name: title })}
            title={t('finances.actions.remove')}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </summary>
      <div className="space-y-4 border-t border-loam-100 p-3.5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={f('name')}><Input value={line.name ?? ''} disabled={readOnly} maxLength={200} onChange={(e) => set('name', e.target.value || null)} /></Field>
          <Field label={f('latin_name')}><Input value={line.latinName ?? ''} className="italic" disabled={readOnly} maxLength={200} onChange={(e) => set('latinName', e.target.value || null)} /></Field>
          <Field label={f('quantity')}><NumberInput integer value={line.quantity} disabled={readOnly} onValue={(v) => set('quantity', v)} /></Field>
          <Field label={f('unit_price')}><NumberInput value={line.unitPrice} unit="€" disabled={readOnly} onValue={(v) => set('unitPrice', v)} /></Field>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-loam-800">{t('finances.species.yield_curve')}</legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label={f('planting_year')}>
              <YearSelect value={line.plantingYear} startYear={startYear} disabled={readOnly} onValue={(v) => set('plantingYear', v ?? 1)} />
            </Field>
            <Field label={f('first_harvest_age')} hint={f('age_hint')}><NumberInput integer value={line.firstHarvestAge} unit={t('finances.units.years')} disabled={readOnly} onValue={(v) => set('firstHarvestAge', v)} /></Field>
            <Field label={f('full_production_age')}><NumberInput integer value={line.fullProductionAge} unit={t('finances.units.years')} disabled={readOnly} onValue={(v) => set('fullProductionAge', v)} /></Field>
            <Field label={f('yield_kg_per_plant')}><NumberInput value={line.yieldKgPerPlant} unit={t('finances.units.kg_per_year')} disabled={readOnly} onValue={(v) => set('yieldKgPerPlant', v)} /></Field>
            <Field label={f('picking_rate_kg_per_hour')}><NumberInput value={line.pickingRateKgPerHour} unit="kg/h" disabled={readOnly} onValue={(v) => set('pickingRateKgPerHour', v)} /></Field>
          </div>
          {matureKg > 0 && (
            <p className="text-xs text-loam-500">
              {t('finances.species.harvest_at_maturity', { kg: formatQuantity(matureKg, 'kg'), hours: matureHours == null ? '—' : formatQuantity(matureHours, 'h') })}
            </p>
          )}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-loam-800">{t('finances.species.channels')}</legend>
          <div className="overflow-hidden rounded-lg ring-1 ring-loam-200">
            <table className="w-full text-sm">
              <thead className="bg-loam-50 text-xs text-loam-500">
                <tr>
                  <th scope="col" className="px-2.5 py-1.5 text-left font-medium"><span className="sr-only">{t('finances.species.channels')}</span></th>
                  <th scope="col" className="px-1.5 py-1.5 text-left font-medium">{t('finances.species.channel_share')}</th>
                  <th scope="col" className="px-1.5 py-1.5 text-left font-medium">{t('finances.species.channel_price')}</th>
                </tr>
              </thead>
              <tbody>
                {CHANNELS.map((channel) => (
                  <tr key={channel} className="border-t border-loam-100">
                    <th scope="row" className="px-2.5 py-1.5 text-left font-normal text-loam-700">{t(`finances.channels.${channel}`)}</th>
                    <td className="px-1.5 py-1.5">
                      <NumberInput value={line[`${channel}SharePct`]} unit="%" disabled={readOnly} aria-label={f(`${channel}_share_pct`)} onValue={(v) => set(`${channel}SharePct`, v)} />
                    </td>
                    <td className="px-1.5 py-1.5">
                      <NumberInput value={line[`${channel}Price`]} unit="€/kg" disabled={readOnly} aria-label={f(`${channel}_price`)} onValue={(v) => set(`${channel}Price`, v)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 sm:grid-cols-[10rem_1fr] sm:items-start">
            <Field label={f('loss_pct')}><NumberInput value={line.lossPct} unit="%" disabled={readOnly} onValue={(v) => set('lossPct', v)} /></Field>
            <div className="text-xs text-loam-500 sm:pt-7">
              {shareTotal > 100 && <p className="text-humus-700">{t('finances.species.over_100')}</p>}
              {shareTotal > 0 && shareTotal < 100 && <p>{t('finances.species.unsold', { pct: Math.round(100 - shareTotal) })}</p>}
            </div>
          </div>
        </fieldset>

        <Field label={f('notes')}>
          <Textarea rows={2} value={line.notes ?? ''} disabled={readOnly} maxLength={200} placeholder={f('notes_placeholder')} onChange={(e) => set('notes', e.target.value || null)} />
        </Field>
      </div>
    </details>
  )
}
