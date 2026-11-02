import { Link } from '@inertiajs/react'
import clsx from 'clsx'
import { MapPinned, Plus, RotateCcw, Ruler, Trash2 } from 'lucide-react'
import { NumberInput } from '@/components/finances/NumberInput'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'
import { formatArea, formatLength, formatNumber, t } from '@/lib/i18n'
import type { Candidate, OfferInputs, OfferMap, OfferMeasures, PlantCategory, PlantingType, PricingInfo, ScopeInput } from '@/types/offers'
import { addableCandidates, itemMeasure } from './scope'
import { categoryLabel, euros, newId, SectionTitle, typeLabel } from './shared'

type Props = {
  map: OfferMap
  inputs: OfferInputs
  measures: OfferMeasures
  pricing: PricingInfo
  readOnly: boolean
  onChange: (inputs: OfferInputs) => void
}

const measureText = (kind: 'area' | 'length', value: number) => (kind === 'area' ? formatArea(value) : formatLength(value))

/**
 * « Ce que dit le terrain »: the place, its people and budget from the
 * project sheet, and the scope of the offer, element by element, with the
 * plants each becomes.
 */
export function TerrainCard({ map, inputs, measures, pricing, readOnly, onChange }: Props) {
  const groups = addableCandidates(measures.candidates, inputs.scope)
  const available = groups.flatMap(([, features]) => features)
  const types = pricing.plantingTypes
  const firstOf = (measure: 'area' | 'length') => types.find((candidate) => candidate.measure === measure && Object.keys(candidate.mix).length > 0) ?? types[0]

  const setItem = (id: string, patch: Partial<ScopeInput>) =>
    onChange({ ...inputs, scope: inputs.scope.map((item) => (item.id === id ? { ...item, ...patch } : item)) })
  const removeItem = (id: string) => onChange({ ...inputs, scope: inputs.scope.filter((item) => item.id !== id) })

  function addFeature(feature: Candidate) {
    onChange({
      ...inputs,
      scope: [...inputs.scope, {
        id: newId(), feature_id: feature.id, label: null, planting_type: firstOf(feature.measure_kind)?.key ?? '',
        measure: null, plants_override: null, mix: {}, option: false,
      }],
    })
  }

  function addManual() {
    onChange({
      ...inputs,
      scope: [...inputs.scope, { id: newId(), feature_id: null, label: null, planting_type: firstOf('area')?.key ?? '', measure: null, plants_override: null, mix: {}, option: false }],
    })
  }

  return (
    <Card className="space-y-5">
      <SectionTitle
        title={t('offers.terrain.title')}
        aside={(
          <Link href={`/maps/${map.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-prune-700 hover:text-prune-900">
            <MapPinned className="h-4 w-4" aria-hidden />{t('offers.terrain.open_map')}
          </Link>
        )}
      />

      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <Fact label={t('offers.terrain.site_area')} value={formatArea(measures.site_area_m2)} />
        <Fact label={t('offers.terrain.lead')} value={measures.lead_name ?? t('offers.terrain.lead_missing')} muted={!measures.lead_name} />
        <Fact
          label={t('offers.terrain.budget')}
          value={measures.budget_ceiling ? t('offers.terrain.budget_ceiling', { amount: euros(measures.budget_ceiling) }) : t('offers.terrain.budget_missing')}
          muted={!measures.budget_ceiling}
        />
      </dl>

      <div>
        <h3 className="text-sm font-semibold text-loam-900">{t('offers.scope.title')}</h3>
        <p className="mt-0.5 text-sm text-loam-500">{t('offers.scope.help')}</p>

        {inputs.scope.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-loam-300 px-4 py-6 text-center text-sm text-loam-500">{t('offers.scope.empty')}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {inputs.scope.map((item) => {
              const measure = measures.scope.find((resolved) => resolved.id === item.id)
              const type = types.find((candidate) => candidate.key === item.planting_type)
              // Until the server answers, a line just picked from the map is measured from its candidate.
              const { fromMap, kind, value } = itemMeasure(item, measure, measures.candidates)
              return (
                <li key={item.id} className={clsx('rounded-xl p-3 ring-1 ring-inset', item.option ? 'bg-loam-50 ring-dashed ring-loam-300' : 'bg-leaf-50/60 ring-leaf-200')}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      aria-label={t('offers.scope.label')}
                      className="min-w-0 flex-1 font-medium"
                      value={item.label ?? ''}
                      placeholder={measure?.label ?? t('offers.scope.manual_label')}
                      disabled={readOnly}
                      onChange={(e) => setItem(item.id, { label: e.target.value })}
                    />
                    <label className="inline-flex items-center gap-1.5 text-xs text-loam-600">
                      <input
                        type="checkbox"
                        className="rounded border-loam-300 text-prune-600 focus:ring-prune-600"
                        checked={item.option}
                        disabled={readOnly}
                        onChange={(e) => setItem(item.id, { option: e.target.checked })}
                      />
                      {t('offers.scope.option')}
                    </label>
                    {!readOnly && (
                      <button type="button" onClick={() => removeItem(item.id)} className="rounded-full p-1.5 text-loam-400 hover:bg-clay-50 hover:text-clay-600" aria-label={t('offers.scope.remove')} title={t('offers.scope.remove')}>
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    )}
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_9rem]">
                    <label className="block">
                      <span className="sr-only">{t('offers.scope.type')}</span>
                      <Select value={item.planting_type} disabled={readOnly} onChange={(e) => setItem(item.id, { planting_type: e.target.value })}>
                        {types.filter((candidate) => !fromMap || candidate.measure === kind).map((candidate) => (
                          <option key={candidate.key} value={candidate.key}>{typeLabel(candidate)}</option>
                        ))}
                      </Select>
                    </label>
                    {fromMap ? (
                      <p className="flex items-center gap-1 text-sm tabular-nums text-loam-800" title={t('offers.scope.measure_from_map')}>
                        <Ruler className="h-3.5 w-3.5 text-leaf-600" aria-hidden />
                        {measureText(kind!, value!)}
                      </p>
                    ) : (
                      <NumberInput
                        aria-label={t('offers.scope.measure')}
                        value={item.measure}
                        unit={type?.measure === 'length' ? 'm' : 'm²'}
                        disabled={readOnly}
                        onValue={(value) => setItem(item.id, { measure: value })}
                      />
                    )}
                    <label className="flex items-center gap-2 text-sm text-loam-600">
                      <NumberInput
                        aria-label={t('offers.scope.plants_override')}
                        integer
                        value={item.plants_override ?? measure?.plants_total ?? 0}
                        disabled={readOnly}
                        className={clsx(item.plants_override != null && 'bg-humus-50')}
                        onValue={(value) => setItem(item.id, { plants_override: value })}
                      />
                      {t('offers.scope.plants_unit')}
                    </label>
                  </div>
                  {item.plants_override != null ? (
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-humus-50 px-3 py-2 text-sm text-humus-900">
                      <span>{t('offers.scope.plants_fixed')}</span>
                      {!readOnly && (
                        <Button variant="ghost" size="sm" onClick={() => setItem(item.id, { plants_override: null })}>
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden />{t('offers.scope.plants_reset')}
                        </Button>
                      )}
                    </div>
                  ) : type && Object.keys(type.mix).length > 0 && (
                    <>
                      <Densities
                        type={type}
                        categories={pricing.categories}
                        mix={item.mix ?? {}}
                        readOnly={readOnly}
                        onChange={(mix) => setItem(item.id, { mix })}
                      />
                      {!readOnly && <p className="mt-1 text-sm text-loam-500">{t('offers.scope.plants_hint')}</p>}
                    </>
                  )}
                  <p className="mt-1.5 text-sm text-loam-500">
                    {measure?.missing
                      ? <span className="text-clay-600">{t('offers.scope.missing')}</span>
                      : <>{type && !type.label && `${t(`offers.planting_type_rules.${item.planting_type}`)} · `}{formatNumber(measure?.plants_total ?? 0)} {t('offers.scope.plants').toLowerCase()}</>}
                  </p>
                </li>
              )
            })}
          </ul>
        )}

        {!readOnly && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">{t('offers.scope.add_feature')}</span>
              <Select
                value=""
                disabled={available.length === 0}
                onChange={(e) => {
                  const feature = available.find((candidate) => String(candidate.id) === e.target.value)
                  if (feature) addFeature(feature)
                }}
              >
                <option value="">{available.length === 0 ? t('offers.scope.add_feature_none') : t('offers.scope.add_feature')}</option>
                {groups.map(([layer, features]) => (
                  <optgroup key={layer} label={t(`editor.layers.${layer}`)}>
                    {features.map((feature) => (
                      <option key={feature.id} value={feature.id}>
                        {(feature.name || t(`editor.kinds.${feature.kind}`))} · {measureText(feature.measure_kind, feature.measure)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </label>
            <button type="button" onClick={addManual} className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm font-medium text-prune-700 hover:bg-prune-50">
              <Plus className="h-4 w-4" aria-hidden />{t('offers.scope.add_manual')}
            </button>
          </div>
        )}
      </div>
    </Card>
  )
}

/**
 * The densities of one element, category by category: « 1 tous les 4 m² »
 * as a designer thinks of spacing, or « 6 par m² » for dense plantings.
 * The type's density until the team writes its own (an existing hedge,
 * trees already there…).
 */
function Densities({ type, categories, mix, readOnly, onChange }: { type: PlantingType; categories: PlantCategory[]; mix: Record<string, number>; readOnly: boolean; onChange: (mix: Record<string, number>) => void }) {
  const unit = type.measure === 'length' ? 'm' : 'm²'
  const set = (key: string, density: number | null) => {
    const next = { ...mix }
    if (density == null || density === type.mix[key]) delete next[key]
    else next[key] = density
    onChange(next)
  }
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
      {Object.entries(type.mix).map(([key, typeDensity]) => {
        const category = categories.find((candidate) => candidate.key === key) ?? { key, label: null }
        const density = mix[key] ?? typeDensity
        const own = mix[key] != null
        // Dense plantings read per unit; the others as spacing.
        const perUnit = typeDensity >= 1
        const shown = perUnit ? density : density > 0 ? Math.round((1 / density) * 100) / 100 : null
        return (
          <label key={key} className="flex items-center gap-1.5 text-sm text-loam-600">
            <span>{categoryLabel(category)} :</span>
            <span>{perUnit ? '' : t('offers.scope.density_every')}</span>
            <span className="w-20">
              <NumberInput
                aria-label={`${t('offers.scope.density')} · ${categoryLabel(category)}`}
                value={shown}
                unit={perUnit ? `/${unit}` : unit}
                disabled={readOnly}
                className={clsx(own && 'bg-humus-50')}
                onValue={(value) => set(key, value == null ? null : perUnit ? value : value > 0 ? 1 / value : 0)}
              />
            </span>
            {own && !readOnly && (
              <Button variant="ghost" size="sm" onClick={() => set(key, null)}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />{t('offers.scope.density_reset')}
              </Button>
            )}
          </label>
        )
      })}
    </div>
  )
}

function Fact({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="rounded-xl bg-loam-50 px-3 py-2">
      <dt className="text-xs text-loam-500">{label}</dt>
      <dd className={clsx('font-medium', muted ? 'text-loam-400' : 'text-loam-900')}>{value}</dd>
    </div>
  )
}
