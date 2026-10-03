import clsx from 'clsx'
import { useState } from 'react'
import { formatCell } from '@/components/finances/format'
import { t } from '@/lib/i18n'
import type { FinanceResult, FinanceYear } from '@/types/climate_finance'

type Tab = 'pnl' | 'cash' | 'harvest'
type Column = { key: keyof FinanceYear; sign: 1 | -1; total?: boolean }

const COLUMNS: Record<Exclude<Tab, 'harvest'>, Column[]> = {
  pnl: [
    { key: 'sales', sign: 1 }, { key: 'otherRevenue', sign: 1 }, { key: 'subsidies', sign: 1 }, { key: 'carbon', sign: 1 },
    { key: 'fixedCosts', sign: -1 }, { key: 'variableCosts', sign: -1 }, { key: 'labourCost', sign: -1 },
    { key: 'ebitda', sign: 1, total: true }, { key: 'depreciation', sign: -1 }, { key: 'interest', sign: -1 }, { key: 'result', sign: 1, total: true },
  ],
  cash: [
    { key: 'ebitda', sign: 1 }, { key: 'interest', sign: -1 }, { key: 'investments', sign: -1 },
    { key: 'loanReceived', sign: 1 }, { key: 'loanRepaid', sign: -1 }, { key: 'netCashFlow', sign: 1, total: true }, { key: 'cumulativeCash', sign: 1, total: true },
  ],
}

const ROW_LABEL: Record<string, string> = {
  sales: 'sales', otherRevenue: 'other_revenue', subsidies: 'subsidies', carbon: 'carbon', fixedCosts: 'fixed_costs',
  variableCosts: 'variable_costs', labourCost: 'labour_cost', ebitda: 'ebitda', depreciation: 'depreciation', interest: 'interest',
  result: 'result', investments: 'investments', loanReceived: 'loan_received', loanRepaid: 'loan_repaid',
  netCashFlow: 'net_cash_flow', cumulativeCash: 'cumulative_cash', harvestKg: 'harvest_kg', soldKg: 'sold_kg', pickingHours: 'picking_hours',
}
const label = (key: string) => t(`finances.export.rows.${ROW_LABEL[key] ?? key}`)

/** Year-by-year tables: profit and loss, cash flow, harvest. Every tab prints. */
export function ResultsTable({ result }: { result: FinanceResult }) {
  const [tab, setTab] = useState<Tab>('pnl')
  const tabs: Tab[] = ['pnl', 'cash', 'harvest']
  return (
    <section aria-labelledby="results-title" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="results-title" className="text-lg">{t('finances.results.title')}</h2>
        <div role="tablist" aria-label={t('finances.results.title')} className="flex gap-1 rounded-lg bg-loam-100 p-1 print:hidden">
          {tabs.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`results-tab-${key}`}
              aria-selected={tab === key}
              aria-controls={`results-panel-${key}`}
              onClick={() => setTab(key)}
              className={clsx('rounded-md px-3 py-1.5 text-sm font-medium', tab === key ? 'bg-white text-prune-700 shadow-sm' : 'text-loam-600 hover:text-loam-900')}
            >
              {t(`finances.results.${key}`)}
            </button>
          ))}
        </div>
      </div>
      {tabs.map((key) => (
        <div
          key={key}
          role="tabpanel"
          id={`results-panel-${key}`}
          aria-labelledby={`results-tab-${key}`}
          className={clsx(tab === key ? 'block' : 'hidden', 'print:block print:break-inside-avoid')}
        >
          <h3 className="mb-2 hidden text-base print:block">{t(`finances.results.${key}`)}</h3>
          {key === 'harvest' ? <HarvestTable result={result} /> : <YearTable years={result.years} columns={COLUMNS[key]} />}
        </div>
      ))}
    </section>
  )
}

function YearTable({ years, columns }: { years: FinanceYear[]; columns: Column[] }) {
  return (
    <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-loam-200/70">
      <table className="w-full min-w-[44rem] text-right text-xs tabular-nums">
        <thead className="bg-loam-50 text-loam-600">
          <tr>
            <th scope="col" className="sticky left-0 bg-loam-50 px-3 py-2 text-left font-medium">{t('finances.results.year')}</th>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={clsx('px-2 py-2 align-bottom font-medium', c.total && 'text-loam-900')}>{label(c.key)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {years.map((year) => (
            <tr key={year.year} className="border-t border-loam-100">
              <th scope="row" className="sticky left-0 whitespace-nowrap bg-white px-3 py-1.5 text-left font-normal text-loam-600">
                {year.year} <span className="text-loam-400">· {year.calendarYear}</span>
              </th>
              {columns.map((c) => {
                const value = (year[c.key] as number) * c.sign
                return (
                  <td key={c.key} className={clsx('px-2 py-1.5', c.total && 'font-semibold', value < -0.5 ? 'text-clay-700' : 'text-loam-800')}>
                    {formatCell(value)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function HarvestTable({ result }: { result: FinanceResult }) {
  const species = result.species.slice(0, 12)
  return (
    <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-loam-200/70">
      <table className="w-full min-w-[36rem] text-right text-xs tabular-nums">
        <thead className="bg-loam-50 text-loam-600">
          <tr>
            <th scope="col" className="sticky left-0 bg-loam-50 px-3 py-2 text-left font-medium">{t('finances.results.year')}</th>
            <th scope="col" className="px-2 py-2 font-medium text-loam-900">{label('harvestKg')}</th>
            <th scope="col" className="px-2 py-2 font-medium">{label('soldKg')}</th>
            <th scope="col" className="px-2 py-2 font-medium text-loam-900">{label('pickingHours')}</th>
            <th scope="col" className="px-2 py-2 font-medium">{label('labourCost')}</th>
            {species.map((s) => <th key={s.id} scope="col" className="max-w-28 truncate px-2 py-2 font-medium" title={s.name ?? ''}>{s.name} (kg)</th>)}
          </tr>
        </thead>
        <tbody>
          {result.years.map((year, i) => (
            <tr key={year.year} className="border-t border-loam-100">
              <th scope="row" className="sticky left-0 whitespace-nowrap bg-white px-3 py-1.5 text-left font-normal text-loam-600">
                {year.year} <span className="text-loam-400">· {year.calendarYear}</span>
              </th>
              <td className="px-2 py-1.5 font-semibold">{formatCell(year.harvestKg)}</td>
              <td className="px-2 py-1.5">{formatCell(year.soldKg)}</td>
              <td className="px-2 py-1.5 font-semibold">{formatCell(year.pickingHours)}</td>
              <td className={clsx('px-2 py-1.5', year.labourCost > 0.5 && 'text-clay-700')}>{formatCell(-year.labourCost)}</td>
              {species.map((s) => <td key={s.id} className="px-2 py-1.5">{formatCell(s.harvestKg[i] ?? 0)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
