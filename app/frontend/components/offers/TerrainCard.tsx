import { Link } from '@inertiajs/react'
import clsx from 'clsx'
import { MapPinned, Plus, RotateCcw, Ruler, Trash2 } from 'lucide-react'
import { NumberInput } from '@/components/finances/NumberInput'
import { Card } from '@/components/ui/Card'
import { Input, Select } from '@/components/ui/Field'
import { formatArea, formatLength, formatNumber, t } from '@/lib/i18n'
import type { Candidate, OfferInputs, OfferMap, OfferMeasures, PricingInfo, ScopeInput } from '@/types/offers'
import { addableCandidates, itemMeasure } from './scope'
import { euros, newId, SectionTitle, typeLabel } from './shared'

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
        measure: null, plants_override: null, option: false,
      }],
    })
  }

  function addManual() {
    onChange({
      ...inputs,
      scope: [...inputs.scope, { id: newId(), feature_id: null, label: null, planting_type: firstOf('area')?.key ?? '', measure: null, plants_override: null, option: false }],
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
                  <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_7rem]">
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
                    <div className="flex items-center gap-1">
                      <NumberInput
                        aria-label={t('offers.scope.plants_override')}
                        integer
                        value={item.plants_override ?? measure?.plants_total ?? 0}
                        disabled={readOnly}
                        className={clsx(item.plants_override != null && 'bg-humus-50')}
                        onValue={(value) => setItem(item.id, { plants_override: value })}
                      />
                      {item.plants_override != null && !readOnly && (
                        <button type="button" onClick={() => setItem(item.id, { plants_override: null })} className="rounded-full p-1 text-loam-400 hover:text-prune-700" aria-label={t('offers.scope.plants_reset')} title={t('offers.scope.plants_reset')}>
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      )}
                    </div>
                  </div>
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

function Fact({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="rounded-xl bg-loam-50 px-3 py-2">
      <dt className="text-xs text-loam-500">{label}</dt>
      <dd className={clsx('font-medium', muted ? 'text-loam-400' : 'text-loam-900')}>{value}</dd>
    </div>
  )
}
