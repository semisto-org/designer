import clsx from 'clsx'
import { Link } from '@inertiajs/react'
import { Lightbulb, Lock, Plus, Settings2, Trash2 } from 'lucide-react'
import { NumberInput } from '@/components/finances/NumberInput'
import { Card } from '@/components/ui/Card'
import { Input, Select, Textarea } from '@/components/ui/Field'
import { t } from '@/lib/i18n'
import type { AdjustmentInput, AdjustmentPhase, OfferCatalog, OfferInputs, OfferMeasures, OfferResult, OfferSettings, Phase, PricingInfo, TripInput } from '@/types/offers'
import { categoryLabel, newId, SectionTitle } from './shared'

type Props = {
  inputs: OfferInputs
  measures: OfferMeasures
  result: OfferResult
  catalog: OfferCatalog
  pricing: PricingInfo
  templates: { id: number; name: string; clientTypes: string[] }[]
  templateId: number | null
  onTemplate: (id: number | null) => void
  readOnly: boolean
  onChange: (inputs: OfferInputs) => void
}

const ADJUSTMENT_PHASES: AdjustmentPhase[] = ['all', 'pre_design', 'design', 'implementation']

/**
 * The internal sheet: what the team knows of the project and the client
 * never reads. Services bring tasks in, adjustments move the fees up or
 * down, trips and rates finish the picture.
 */
export function InternalCard({ inputs, measures, result, catalog, pricing, templates, templateId, onTemplate, readOnly, onChange }: Props) {
  const patchSettings = (patch: Partial<OfferSettings>) => onChange({ ...inputs, settings: { ...inputs.settings, ...patch } })
  const setService = (key: string, on: boolean) => onChange({ ...inputs, services: { ...inputs.services, [key]: on } })
  const setAdjustment = (id: string, patch: Partial<AdjustmentInput>) =>
    onChange({ ...inputs, adjustments: inputs.adjustments.map((adjustment) => (adjustment.id === id ? { ...adjustment, ...patch } : adjustment)) })
  const usedPresets = new Set(inputs.adjustments.map((adjustment) => adjustment.preset))

  function addAdjustment(preset: string | null) {
    const spec = catalog.adjustmentPresets.find((candidate) => candidate.key === preset)
    onChange({
      ...inputs,
      adjustments: [...inputs.adjustments, { id: newId(), preset, label: preset ? null : t('offers.internal.custom_adjustment'), pct: spec?.pct ?? 5, phase: spec?.phase ?? 'all' }],
    })
  }

  return (
    <Card className="space-y-6 bg-humus-50/40 ring-humus-200">
      <SectionTitle
        title={t('offers.internal.title')}
        help={t('offers.internal.help')}
        aside={<span className="inline-flex items-center gap-1 rounded-full bg-humus-100 px-2.5 py-1 text-xs font-medium text-humus-800"><Lock className="h-3 w-3" aria-hidden />{t('offers.page.internal_badge')}</span>}
      />

      <fieldset className="space-y-1">
        <legend className="text-sm font-semibold text-loam-900">{t('offers.pricing.title')}</legend>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            className="max-w-xs"
            aria-label={t('offers.pricing.title')}
            value={templateId ?? ''}
            disabled={readOnly}
            onChange={(e) => onTemplate(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">{t('offers.pricing.semisto')}</option>
            {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
          </Select>
          <Link href="/offer_templates" className="inline-flex items-center gap-1 text-sm font-medium text-prune-700 hover:text-prune-900">
            <Settings2 className="h-4 w-4" aria-hidden />{t('offers.pricing.manage')}
          </Link>
        </div>
        <p className="text-xs text-loam-500">
          {measures.client_type
            ? t('offers.pricing.client_type', { type: t(`offers.client_types.${measures.client_type}`) })
            : t('offers.pricing.client_type_missing')}
        </p>
      </fieldset>

      <Complexity inputs={inputs} pricing={pricing} result={result} readOnly={readOnly} onChange={onChange} />

      <fieldset>
        <legend className="text-sm font-semibold text-loam-900">{t('offers.internal.designers')}</legend>
        <div className="mt-2 inline-flex rounded-full bg-white p-1 ring-1 ring-loam-200" role="radiogroup">
          {[1, 2].map((count) => (
            <button
              key={count}
              type="button"
              role="radio"
              aria-checked={inputs.settings.designers === count}
              disabled={readOnly}
              onClick={() => patchSettings({ designers: count })}
              className={clsx('rounded-full px-3 py-1 text-sm font-medium', inputs.settings.designers === count ? 'bg-prune-600 text-white' : 'text-loam-600 hover:bg-prune-50')}
            >
              {t(count === 1 ? 'offers.internal.designers_one' : 'offers.internal.designers_two')}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold text-loam-900">{t('offers.internal.services')}</legend>
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {catalog.services.map((key) => {
            const reason = measures.suggestions[key]
            return (
              <li key={key}>
                <label className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white">
                  <input
                    type="checkbox"
                    className="mt-0.5 rounded border-loam-300 text-prune-600 focus:ring-prune-600"
                    checked={measures.services[key] ?? false}
                    disabled={readOnly}
                    onChange={(e) => setService(key, e.target.checked)}
                  />
                  <span>
                    {t(`offers.services.${key}`)}
                    {reason && (
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-leaf-700">
                        <Lightbulb className="h-3 w-3 shrink-0" aria-hidden />{t('offers.internal.suggested', { reason: t(`offers.suggestions.${reason}`) })}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-loam-900">{t('offers.internal.adjustments')}</legend>
        <p className="text-xs text-loam-500">{t('offers.internal.adjustments_help')}</p>
        {inputs.adjustments.map((adjustment) => (
          <div key={adjustment.id} className="grid grid-cols-[minmax(0,1fr)_5.5rem_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_5.5rem_10rem_auto]">
            {adjustment.preset ? (
              <span className="text-sm text-loam-800">{t(`offers.adjustment_presets.${adjustment.preset}`)}</span>
            ) : (
              <Input aria-label={t('offers.internal.adjustment_label')} value={adjustment.label ?? ''} disabled={readOnly} onChange={(e) => setAdjustment(adjustment.id, { label: e.target.value })} />
            )}
            <NumberInput aria-label="%" value={adjustment.pct} unit="%" disabled={readOnly} onValue={(value) => setAdjustment(adjustment.id, { pct: value ?? 0 })} />
            <Select className="col-span-2 sm:col-span-1" aria-label={t('offers.internal.adjustments')} value={adjustment.phase} disabled={readOnly} onChange={(e) => setAdjustment(adjustment.id, { phase: e.target.value as AdjustmentPhase })}>
              {ADJUSTMENT_PHASES.map((phase) => <option key={phase} value={phase}>{t(`offers.adjustment_phases.${phase}`)}</option>)}
            </Select>
            {!readOnly && (
              <button type="button" className="row-start-1 col-start-3 rounded-full p-1.5 text-loam-400 hover:bg-clay-50 hover:text-clay-600 sm:col-start-4" aria-label={t('offers.scope.remove')} onClick={() => onChange({ ...inputs, adjustments: inputs.adjustments.filter((a) => a.id !== adjustment.id) })}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        ))}
        {!readOnly && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {catalog.adjustmentPresets.filter((preset) => !usedPresets.has(preset.key)).map((preset) => {
              const hint = measures.adjustment_hints[preset.key]
              return (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => addAdjustment(preset.key)}
                  title={hint ? t('offers.internal.suggested_adjustment', { reason: t(`offers.adjustment_hints.${hint}`) }) : undefined}
                  className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset', hint ? 'bg-leaf-50 text-leaf-800 ring-leaf-300' : 'bg-white text-loam-700 ring-loam-200 hover:bg-prune-50')}
                >
                  <Plus className="h-3 w-3" aria-hidden />{t(`offers.adjustment_presets.${preset.key}`)} ({preset.pct > 0 ? '+' : ''}{preset.pct} %)
                </button>
              )
            })}
            <button type="button" onClick={() => addAdjustment(null)} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-loam-700 ring-1 ring-inset ring-loam-200 hover:bg-prune-50">
              <Plus className="h-3 w-3" aria-hidden />{t('offers.internal.custom_adjustment')}
            </button>
          </div>
        )}
      </fieldset>

      <Trips inputs={inputs} result={result} readOnly={readOnly} onChange={onChange} />

      <label className="block space-y-1">
        <span className="text-sm font-semibold text-loam-900">{t('offers.internal.notes')}</span>
        <Textarea rows={3} value={inputs.notes ?? ''} placeholder={t('offers.internal.notes_placeholder')} disabled={readOnly} onChange={(e) => onChange({ ...inputs, notes: e.target.value })} />
      </label>

      <Rates inputs={inputs} pricing={pricing} readOnly={readOnly} onChange={onChange} />
    </Card>
  )
}

function Trips({ inputs, result, readOnly, onChange }: { inputs: OfferInputs; result: OfferResult; readOnly: boolean; onChange: (inputs: OfferInputs) => void }) {
  const setTrip = (id: string, patch: Partial<TripInput>) => onChange({ ...inputs, trips: inputs.trips.map((trip) => (trip.id === id ? { ...trip, ...patch } : trip)) })
  const kmOf = (id: string) => result.phases.flatMap((phase) => phase.expenses).find((line) => line.id === id)?.km ?? 0
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-loam-900">{t('offers.trips.title')}</legend>
      {inputs.trips.map((trip) => (
        <div key={trip.id} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[8.5rem_minmax(0,1fr)_5.5rem_6.5rem_auto]">
          <Select aria-label={t('offers.budget.title')} value={trip.phase} disabled={readOnly} onChange={(e) => setTrip(trip.id, { phase: e.target.value as Phase })}>
            {(['pre_design', 'design', 'implementation'] as Phase[]).map((phase) => <option key={phase} value={phase}>{t(`offers.phases.${phase}`)}</option>)}
          </Select>
          <Input aria-label={t('offers.trips.label')} placeholder={t('offers.trips.label')} value={trip.label ?? ''} disabled={readOnly} onChange={(e) => setTrip(trip.id, { label: e.target.value })} />
          <NumberInput aria-label={t('offers.trips.trips')} title={t('offers.trips.trips')} value={trip.trips} unit="AR" disabled={readOnly} onValue={(value) => setTrip(trip.id, { trips: value })} />
          <NumberInput aria-label={t('offers.trips.one_way_km')} title={t('offers.trips.one_way_km')} value={trip.one_way_km} unit="km" disabled={readOnly} className={clsx(trip.trips && trip.one_way_km == null && 'ring-humus-400')} onValue={(value) => setTrip(trip.id, { one_way_km: value })} />
          <span className="flex items-center justify-end gap-1 text-xs tabular-nums text-loam-500">
            {t('offers.trips.total_km', { km: Math.round(kmOf(trip.id)) })}
            {!readOnly && (
              <button type="button" className="rounded-full p-1.5 text-loam-400 hover:bg-clay-50 hover:text-clay-600" aria-label={t('offers.scope.remove')} onClick={() => onChange({ ...inputs, trips: inputs.trips.filter((other) => other.id !== trip.id) })}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            )}
          </span>
        </div>
      ))}
      {!readOnly && (
        <button type="button" onClick={() => onChange({ ...inputs, trips: [...inputs.trips, { id: newId(), phase: 'pre_design', label: null, trips: 1, one_way_km: null }] })} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-medium text-prune-700 hover:bg-prune-50">
          <Plus className="h-4 w-4" aria-hidden />{t('offers.trips.add')}
        </button>
      )}
    </fieldset>
  )
}

const RATE_FIELDS: { key: keyof OfferSettings; unit: string }[] = [
  { key: 'hourly_rate', unit: '€/h' },
  { key: 'contribution_pct', unit: '%' },
  { key: 'buffer_pct', unit: '%' },
  { key: 'km_rate', unit: '€/km' },
  { key: 'plants_per_day', unit: '/j' },
  { key: 'plants_margin_pct', unit: '%' },
  { key: 'vat_services_pct', unit: '%' },
  { key: 'vat_plants_pct', unit: '%' },
  { key: 'vat_supplies_pct', unit: '%' },
  { key: 'rounding', unit: '€' },
  { key: 'co_management_half_days', unit: '/an' },
  { key: 'half_day_hours', unit: 'h' },
]

function Rates({ inputs, pricing, readOnly, onChange }: { inputs: OfferInputs; pricing: PricingInfo; readOnly: boolean; onChange: (inputs: OfferInputs) => void }) {
  return (
    <details className="group rounded-xl bg-white/70 ring-1 ring-loam-200">
      <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold text-loam-900 marker:hidden">
        {t('offers.rates.title')} <span className="font-normal text-loam-500">· {t('offers.rates.help')}</span>
      </summary>
      <div className="grid gap-3 border-t border-loam-200 p-3 sm:grid-cols-2">
        {RATE_FIELDS.map(({ key, unit }) => (
          <label key={key} className="block space-y-1">
            <span className="block text-xs text-loam-600">{t(`offers.rates.${key}`)}</span>
            <NumberInput value={inputs.settings[key]} unit={unit} disabled={readOnly} onValue={(value) => value != null && onChange({ ...inputs, settings: { ...inputs.settings, [key]: value } })} />
          </label>
        ))}
        <p className="pt-2 text-xs font-semibold text-loam-700 sm:col-span-2">{t('offers.rates.plant_prices')}</p>
        {pricing.categories.map((category) => (
          <label key={category.key} className="block space-y-1">
            <span className="block text-xs text-loam-600">{categoryLabel(category)}</span>
            <NumberInput
              value={inputs.plant_prices[category.key] ?? category.price}
              unit="€"
              disabled={readOnly}
              onValue={(value) => {
                const prices = { ...inputs.plant_prices }
                if (value == null || value === category.price) delete prices[category.key]
                else prices[category.key] = value
                onChange({ ...inputs, plant_prices: prices })
              }}
            />
          </label>
        ))}
      </div>
    </details>
  )
}

/**
 * How demanding the project is, scored criterion by criterion like the
 * German HOAI's zones: the total picks a level whose factor moves the fees.
 */
function Complexity({ inputs, pricing, result, readOnly, onChange }: { inputs: OfferInputs; pricing: PricingInfo; result: OfferResult; readOnly: boolean; onChange: (inputs: OfferInputs) => void }) {
  const { criteria } = pricing.complexity
  if (criteria.length === 0) return null
  const score = result.complexity
  const set = (key: string, value: number | null) => {
    const next = { ...inputs.complexity }
    if (value == null) delete next[key]
    else next[key] = value
    onChange({ ...inputs, complexity: next })
  }
  const levelLabel = (key: string) => {
    const level = pricing.complexity.levels.find((candidate) => candidate.key === key)
    return level?.label || t(`offers.complexity.levels.${key}`)
  }
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-loam-900">{t('offers.complexity.title')}</legend>
      <p className="text-xs text-loam-500">{t('offers.complexity.help')}</p>
      <ul className="space-y-2">
        {criteria.map((criterion) => {
          const value = inputs.complexity[criterion.key]
          return (
            <li key={criterion.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <span className="text-sm text-loam-800">
                {criterion.label || t(`offers.complexity.criteria.${criterion.key}`)}
                {!criterion.label && <span className="block text-xs text-loam-500">{t(`offers.complexity.criteria_help.${criterion.key}`)}</span>}
              </span>
              <span className="flex items-center gap-1" role="radiogroup" aria-label={criterion.label || t(`offers.complexity.criteria.${criterion.key}`)}>
                {Array.from({ length: criterion.max + 1 }, (_, points) => (
                  <button
                    key={points}
                    type="button"
                    role="radio"
                    aria-checked={value === points}
                    disabled={readOnly}
                    onClick={() => set(criterion.key, value === points ? null : points)}
                    className={clsx(
                      'h-6 w-6 rounded-full text-xs tabular-nums ring-1 ring-inset',
                      value != null && points <= value ? 'bg-prune-600 text-white ring-prune-600' : 'bg-white text-loam-500 ring-loam-200 hover:bg-prune-50',
                    )}
                  >
                    {points}
                  </button>
                ))}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="text-sm text-loam-700">
        {score.level
          ? t('offers.complexity.result', { points: score.points ?? 0, max: score.max, level: levelLabel(score.level), factor: score.factor.toLocaleString('fr-BE') })
          : t('offers.complexity.unscored')}
      </p>
    </fieldset>
  )
}
