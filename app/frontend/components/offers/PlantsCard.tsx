import { NumberInput } from '@/components/finances/NumberInput'
import { Card } from '@/components/ui/Card'
import { formatNumber, t } from '@/lib/i18n'
import type { OfferInputs, OfferResult } from '@/types/offers'
import { categoryLabel, euros, eurosCents, SectionTitle } from './shared'

type Props = { inputs: OfferInputs; result: OfferResult; readOnly: boolean; onChange: (inputs: OfferInputs) => void }

/**
 * « Plantes et consommables »: what the scope becomes in plants, category by
 * category, with the team's unit prices, and the supplies that go with them.
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

          <div>
            <h3 className="text-sm font-semibold text-loam-900">{t('offers.plants.supplies')}</h3>
            <ul className="mt-1 divide-y divide-loam-100 text-sm">
              {plants.supplies.filter((row) => row.base > 0).map((row) => (
                <li key={row.key} className="flex justify-between gap-2 py-1.5">
                  <span className="text-loam-700">{t(`offers.supplies.${row.key}`)} <span className="text-xs text-loam-400">{formatNumber(row.base)} × {eurosCents(row.unit_price)}</span></span>
                  <span className="tabular-nums">{euros(row.amount_base)}</span>
                </li>
              ))}
              <li className="flex justify-between gap-2 py-1.5">
                <span className="text-loam-700">{t('offers.supplies.small_material')}</span>
                <span className="tabular-nums">{euros(plants.small_material)}</span>
              </li>
            </ul>
          </div>

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
