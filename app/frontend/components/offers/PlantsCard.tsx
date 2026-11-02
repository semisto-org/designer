import clsx from 'clsx'
import { CircleMinus, CirclePlus, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { NumberInput } from '@/components/finances/NumberInput'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Field'
import { formatNumber, t } from '@/lib/i18n'
import type { CustomSupplyInput, OfferInputs, OfferResult, SupplyOverride, SupplyRow } from '@/types/offers'
import { categoryLabel, euros, newId, SectionTitle } from './shared'

type Props = { inputs: OfferInputs; result: OfferResult; readOnly: boolean; onChange: (inputs: OfferInputs) => void }

/**
 * « Plantes et consommables »: what the scope becomes in plants, category by
 * category, with the team's unit prices, and the supplies that go with them,
 * each one to leave out, to count otherwise or to add.
 */
export function PlantsCard({ inputs, result, readOnly, onChange }: Props) {
  const plants = result.plants
  const settings = inputs.settings
  const setPrice = (key: string, value: number | null) => {
    const next = { ...inputs.plant_prices }
    if (value == null) delete next[key]
    else next[key] = value
    onChange({ ...inputs, plant_prices: next })
  }
  const hasOptions = plants.count_option > 0

  return (
    <Card className="space-y-4">
      <SectionTitle title={t('offers.plants.title')} help={t('offers.plants.help')} />
      {plants.count_base + plants.count_option === 0 ? (
        <p className="rounded-xl border border-dashed border-loam-300 px-4 py-6 text-center text-sm text-loam-500">{t('offers.plants.empty')}</p>
      ) : (
        <>
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-loam-500">
                  <th className="pb-2 font-medium">{t('offers.plants.category')}</th>
                  <th className="pb-2 text-right font-medium">{t('offers.plants.base')}</th>
                  {hasOptions && <th className="pb-2 text-right font-medium">{t('offers.plants.option')}</th>}
                  <th className="w-28 pb-2 text-right font-medium">{t('offers.plants.price')}</th>
                  <th className="pb-2 text-right font-medium">HTVA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-loam-100">
                {plants.categories.filter((row) => row.base + row.option > 0).map((row) => (
                  <tr key={row.key}>
                    <td className="py-1.5 text-loam-800">{categoryLabel(row)}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatNumber(row.base)}</td>
                    {hasOptions && <td className="py-1.5 text-right tabular-nums text-loam-500">{row.option ? `+ ${formatNumber(row.option)}` : '—'}</td>}
                    <td className="py-1.5">
                      <NumberInput
                        aria-label={`${t('offers.plants.price')} · ${categoryLabel(row)}`}
                        value={inputs.plant_prices[row.key] ?? row.price}
                        unit="€"
                        disabled={readOnly}
                        className={inputs.plant_prices[row.key] != null ? 'bg-humus-50' : undefined}
                        onValue={(value) => setPrice(row.key, value)}
                      />
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{euros(row.amount_base)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Supplies inputs={inputs} rows={plants.supplies} readOnly={readOnly} onChange={onChange} />

          <dl className="grid gap-2 rounded-xl bg-leaf-50/60 p-3 text-sm ring-1 ring-inset ring-leaf-200 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-loam-500">{t('offers.plants.plants_tvac', { pct: settings.vat_plants_pct })}</dt>
              <dd className="font-medium tabular-nums">{euros(plants.plants_base_tvac)}{hasOptions && <span className="text-loam-500"> → {euros(plants.plants_max_tvac)}</span>}</dd>
            </div>
            <div>
              <dt className="text-xs text-loam-500">{t('offers.plants.supplies_tvac', { pct: settings.vat_supplies_pct })}</dt>
              <dd className="font-medium tabular-nums">{euros(plants.supplies_base_tvac)}{hasOptions && <span className="text-loam-500"> → {euros(plants.supplies_max_tvac)}</span>}</dd>
            </div>
            <p className="text-xs text-loam-500 sm:col-span-2">{t('offers.plants.margin', { pct: settings.plants_margin_pct })}</p>
          </dl>
        </>
      )}
    </Card>
  )
}

const GRID = 'grid grid-cols-[minmax(0,1fr)_5.5rem_6rem_4.5rem_4.5rem] items-center gap-2'

/**
 * The supplies the plants bring (jute, compost, guards, stakes, small
 * material), computed from the scope; the team leaves one out, changes its
 * quantity or price, or adds its own (cages against voles…).
 */
function Supplies({ inputs, rows, readOnly, onChange }: { inputs: OfferInputs; rows: SupplyRow[]; readOnly: boolean; onChange: (inputs: OfferInputs) => void }) {
  const correct = (key: string, patch: Partial<SupplyOverride>) => {
    const current = inputs.supplies.find((row) => row.key === key) ?? { key, quantity: null, unit_price: null, disabled: false }
    const next = { ...current, ...patch }
    const others = inputs.supplies.filter((row) => row.key !== key)
    const empty = next.quantity == null && next.unit_price == null && !next.disabled
    onChange({ ...inputs, supplies: empty ? others : [...others, next] })
  }
  const setCustom = (id: string, patch: Partial<CustomSupplyInput>) =>
    onChange({ ...inputs, custom_supplies: inputs.custom_supplies.map((row) => (row.id === id ? { ...row, ...patch } : row)) })
  const add = () => onChange({ ...inputs, custom_supplies: [...inputs.custom_supplies, { id: newId(), label: null, quantity: 1, unit_price: 0 }] })
  // A supply the scope does not need stays out of sight, unless the team counted it.
  const shown = rows.filter((row) => row.kind === 'custom' || (row.computed_base ?? row.base) > 0 || row.overridden || row.disabled)

  return (
    <div>
      <h3 className="text-sm font-semibold text-loam-900">{t('offers.plants.supplies')}</h3>
      <p className="text-sm text-loam-500">{t('offers.supplies_edit.help')}</p>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="mt-2 min-w-[30rem] divide-y divide-loam-100 text-sm">
          <div className={clsx(GRID, 'pb-1 font-medium text-loam-500')}>
            <span />
            <span className="text-right">{t('offers.supplies_edit.quantity')}</span>
            <span className="text-right">{t('offers.supplies_edit.unit_price')}</span>
            <span className="text-right">HTVA</span>
            <span />
          </div>
          {shown.map((row) => {
            const own = row.kind === 'custom' ? inputs.custom_supplies.find((candidate) => candidate.id === row.id) : undefined
            const correction = inputs.supplies.find((candidate) => candidate.key === row.key)
            return (
              <div key={row.key} className={clsx(GRID, 'py-1.5', row.disabled && 'opacity-50')}>
                {own ? (
                  <Input aria-label={t('offers.supplies_edit.label')} value={own.label ?? ''} placeholder={t('offers.supplies_edit.custom_label')} disabled={readOnly} onChange={(e) => setCustom(own.id, { label: e.target.value })} />
                ) : (
                  <span className={clsx('min-w-0 text-loam-700', row.disabled && 'line-through')}>
                    {t(`offers.supplies.${row.key}`)}
                    {row.key !== 'small_material' && <span className="text-loam-400"> · {t(`offers.supply_units.${row.key}`)}</span>}
                  </span>
                )}
                <NumberInput
                  aria-label={t('offers.supplies_edit.quantity')}
                  value={own ? own.quantity : row.base}
                  disabled={readOnly || row.disabled}
                  className={clsx(correction?.quantity != null && 'bg-humus-50')}
                  onValue={(value) => (own ? setCustom(own.id, { quantity: value }) : correct(row.key, { quantity: value === row.computed_base ? null : value }))}
                />
                <NumberInput
                  aria-label={t('offers.supplies_edit.unit_price')}
                  value={own ? own.unit_price : row.unit_price}
                  unit="€"
                  disabled={readOnly || row.disabled}
                  className={clsx(correction?.unit_price != null && 'bg-humus-50')}
                  onValue={(value) => (own ? setCustom(own.id, { unit_price: value }) : correct(row.key, { unit_price: value === row.computed_unit_price ? null : value }))}
                />
                <span className="text-right tabular-nums">{euros(row.amount_base)}</span>
                {readOnly ? <span /> : own ? (
                  <IconButton size="sm" tone="danger" className="justify-self-end" label={t('offers.scope.remove')} onClick={() => onChange({ ...inputs, custom_supplies: inputs.custom_supplies.filter((candidate) => candidate.id !== own.id) })}>
                    <Trash2 aria-hidden />
                  </IconButton>
                ) : (
                  <span className="flex justify-end">
                    {row.overridden && (
                      <IconButton size="sm" label={t('offers.budget.reset')} onClick={() => correct(row.key, { quantity: null, unit_price: null })}>
                        <RotateCcw aria-hidden />
                      </IconButton>
                    )}
                    <IconButton size="sm" label={t(row.disabled ? 'offers.supplies_edit.enable' : 'offers.supplies_edit.disable')} onClick={() => correct(row.key, { disabled: !row.disabled })}>
                      {row.disabled ? <CirclePlus aria-hidden /> : <CircleMinus aria-hidden />}
                    </IconButton>
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>
      {!readOnly && (
        <Button variant="ghost" size="sm" className="mt-1" onClick={add}>
          <Plus className="h-3.5 w-3.5" aria-hidden />{t('offers.supplies_edit.add')}
        </Button>
      )}
    </div>
  )
}
