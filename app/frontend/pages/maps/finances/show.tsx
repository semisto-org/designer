import { Head, Link } from '@inertiajs/react'
import clsx from 'clsx'
import { ArrowLeft, Download, Info, Plus, Printer, RefreshCw, TriangleAlert, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, Input } from '@/components/ui/Field'
import { CashChart } from '@/components/finances/CashChart'
import { NumberInput } from '@/components/finances/NumberInput'
import { ResultsTable } from '@/components/finances/ResultsTable'
import { RowsEditor, newId, type Column } from '@/components/finances/RowsEditor'
import { SpeciesCard } from '@/components/finances/SpeciesCard'
import { YearSelect } from '@/components/finances/YearSelect'
import { formatMoney, formatQuantity } from '@/components/finances/format'
import { usePlanAutosave, type SaveStatus } from '@/components/finances/usePlanAutosave'
import { formatNumber, t } from '@/lib/i18n'
import {
  INVESTMENT_CATEGORIES, REVENUE_KINDS, SUBSIDY_KINDS, VARIABLE_BASES,
  type FinanceIndicators, type FinanceInputs, type FinancePlanData, type FinanceResult, type FinanceWarning,
  type Investment, type Loan, type OtherRevenue, type SpeciesLine, type Subsidy, type VariableCost, type YearlyRow,
} from '@/types/climate_finance'
import type { MapData } from '@/types'

type Props = {
  map: Pick<MapData, 'id' | 'name' | 'areaM2' | 'role' | 'region'>
  plan: FinancePlanData
  result: FinanceResult
  mapPlants: { key: string; name: string; latinName: string | null; quantity: number }[]
  canEdit: boolean
}

type Tab = 'species' | 'investments' | 'costs' | 'revenues' | 'financing' | 'settings'
const TABS: Tab[] = ['species', 'investments', 'costs', 'revenues', 'financing', 'settings']

const field = (list: string, key: string) => t(`finances.fields.${list}.${key}`)
const options = (list: string, values: readonly string[]) => values.map((value) => ({ value, label: t(`finances.options.${list}.${value}`) }))

/**
 * The financial dashboard of a map: 20-year profit and loss and cash flow
 * from the user's own assumptions, saved as they type, exportable for a
 * bank or a funder. Always labelled as an indicative estimate.
 */
export default function FinancesShow({ map, plan, result: initialResult, mapPlants, canEdit }: Props) {
  const autosave = usePlanAutosave(map.id, plan, initialResult, canEdit)
  const { inputs, setInputs, result, status } = autosave
  const [tab, setTab] = useState<Tab>('species')
  const [notice, setNotice] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const startYear = inputs.settings.startYear
  const readOnly = !canEdit
  const patch = (changes: Partial<FinanceInputs>) => setInputs({ ...inputs, ...changes })

  async function exportFile(format: 'csv' | 'xlsx') {
    await autosave.save()
    window.location.href = `/maps/${map.id}/finances.${format}`
  }

  async function sync() {
    setSyncing(true)
    try {
      const { added, updated } = await autosave.syncFromMap()
      setNotice(added + updated > 0 ? t('finances.page.sync_done', { added, updated }) : t('finances.page.sync_nothing'))
    } catch (error) {
      setNotice((error as Error).message)
    } finally {
      setSyncing(false)
    }
  }

  const counts: Record<Tab, number> = {
    species: inputs.species.length,
    investments: inputs.investments.length,
    costs: inputs.fixedCosts.length + inputs.variableCosts.length,
    revenues: inputs.otherRevenues.length + inputs.subsidies.length + (inputs.carbon.enabled ? 1 : 0),
    financing: inputs.loans.length,
    settings: 0,
  }

  return (
    <div className="space-y-6">
      <Head title={`${t('finances.page.title')} · ${map.name}`} />

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href={`/maps/${map.id}`} className="inline-flex items-center gap-1 text-sm text-loam-500 hover:text-loam-900 print:hidden">
            <ArrowLeft className="h-4 w-4" />{t('finances.page.back')}
          </Link>
          <h1 className="mt-1 text-2xl">{t('finances.page.title')}</h1>
          <p className="truncate text-loam-500">{map.name}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {canEdit && <SaveIndicator status={status} />}
          <span className="sr-only">{t('finances.page.export_label')}</span>
          <Button variant="secondary" size="sm" onClick={() => void exportFile('csv')}><Download className="h-4 w-4" />{t('finances.page.export_csv')}</Button>
          <Button variant="secondary" size="sm" onClick={() => void exportFile('xlsx')}><Download className="h-4 w-4" />{t('finances.page.export_xlsx')}</Button>
          <Button variant="ghost" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" />{t('finances.page.print')}</Button>
        </div>
      </header>

      <div className="flex gap-3 rounded-xl bg-humus-50 p-4 text-sm text-humus-700 ring-1 ring-inset ring-humus-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p><strong className="font-semibold">{t('finances.page.disclaimer_title')}.</strong> {t('finances.page.disclaimer')}</p>
      </div>

      {readOnly && <p className="text-sm text-loam-500">{t('finances.page.read_only')}</p>}
      {autosave.conflict && <Banner tone="warning" onClose={autosave.clearConflict}>{autosave.conflict}</Banner>}
      {status === 'error' && <Banner tone="error">{t('finances.page.save_error')}</Banner>}

      <Kpis indicators={result.indicators} />

      <Card className="space-y-3">
        <div>
          <h2 className="text-lg">{t('finances.chart.title')}</h2>
          <p className="text-sm text-loam-500">{t('finances.chart.subtitle')}</p>
        </div>
        <CashChart years={result.years} />
      </Card>

      <Warnings warnings={result.warnings} />

      <section className="space-y-4 print:hidden" aria-label={t('finances.tabs.species')}>
        <div role="tablist" aria-label={t('finances.page.title')} className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {TABS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`inputs-tab-${key}`}
              aria-selected={tab === key}
              aria-controls={`inputs-panel-${key}`}
              onClick={() => setTab(key)}
              className={clsx(
                'shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium',
                tab === key ? 'bg-prune-600 text-white' : 'bg-white text-loam-700 ring-1 ring-inset ring-loam-200 hover:bg-loam-100',
              )}
            >
              {t(`finances.tabs.${key}`)}
              {counts[key] > 0 && <span className={clsx('ml-1.5 rounded-full px-1.5 text-xs', tab === key ? 'bg-white/20' : 'bg-loam-100 text-loam-600')}>{counts[key]}</span>}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`inputs-panel-${tab}`} aria-labelledby={`inputs-tab-${tab}`} className="space-y-6">
          {tab === 'species' && (
            <SpeciesTab
              inputs={inputs} onChange={(species) => patch({ species })} readOnly={readOnly} startYear={startYear}
              mapPlants={mapPlants} onSync={sync} syncing={syncing} notice={notice} onDismiss={() => setNotice(null)}
            />
          )}
          {tab === 'investments' && (
            <Card className="space-y-4">
              <RowsEditor<Investment>
                title={t('finances.tabs.investments')}
                intro={t('finances.sections.investments_intro')}
                rows={inputs.investments}
                onChange={(investments) => patch({ investments })}
                readOnly={readOnly}
                startYear={startYear}
                newRow={() => ({ id: newId(), label: t('finances.defaults.investment'), category: 'fencing', amount: null, year: 1, depreciationYears: null })}
                columns={[
                  { key: 'label', label: field('investments', 'label'), type: 'text', span: 2 },
                  { key: 'category', label: field('investments', 'category'), type: 'select', options: options('investments', INVESTMENT_CATEGORIES) },
                  { key: 'amount', label: field('investments', 'amount'), type: 'number', unit: '€' },
                  { key: 'year', label: field('investments', 'year'), type: 'year' },
                  { key: 'depreciationYears', label: field('investments', 'depreciation_years'), type: 'integer', unit: t('finances.units.years') },
                ]}
              />
              <p className="text-sm text-loam-600">
                {t('finances.options.investments.plants')} : {formatMoney(result.indicators.investmentByCategory.plants ?? 0)}
              </p>
            </Card>
          )}
          {tab === 'costs' && (
            <>
              <Card><YearlyEditor list="fixed_costs" rows={inputs.fixedCosts} onChange={(fixedCosts) => patch({ fixedCosts })} readOnly={readOnly} startYear={startYear} defaultLabel={t('finances.defaults.fixed_cost')} /></Card>
              <Card>
                <RowsEditor<VariableCost>
                  title={t('finances.sections.variable_costs')}
                  intro={t('finances.sections.variable_costs_intro')}
                  rows={inputs.variableCosts}
                  onChange={(variableCosts) => patch({ variableCosts })}
                  readOnly={readOnly}
                  startYear={startYear}
                  newRow={() => ({ id: newId(), label: t('finances.defaults.variable_cost'), basis: 'per_kg', rate: null, startYear: 1, endYear: null })}
                  columns={[
                    { key: 'label', label: field('variable_costs', 'label'), type: 'text', span: 2 },
                    { key: 'basis', label: field('variable_costs', 'basis'), type: 'select', options: options('variable_costs', VARIABLE_BASES), span: 1.3 },
                    { key: 'rate', label: field('variable_costs', 'rate'), type: 'number' },
                    { key: 'startYear', label: field('variable_costs', 'start_year'), type: 'year' },
                    { key: 'endYear', label: field('variable_costs', 'end_year'), type: 'end_year' },
                  ]}
                />
              </Card>
            </>
          )}
          {tab === 'revenues' && (
            <>
              <Card>
                <YearlyEditor<OtherRevenue> list="other_revenues" rows={inputs.otherRevenues} onChange={(otherRevenues) => patch({ otherRevenues })} readOnly={readOnly} startYear={startYear}
                  defaultLabel={t('finances.defaults.other_revenue')} kinds={REVENUE_KINDS} newKind="workshops" />
              </Card>
              <Card>
                <YearlyEditor<Subsidy> list="subsidies" rows={inputs.subsidies} onChange={(subsidies) => patch({ subsidies })} readOnly={readOnly} startYear={startYear}
                  defaultLabel={t('finances.defaults.subsidy')} kinds={SUBSIDY_KINDS} newKind="hedges" oneOff />
              </Card>
              <Card><CarbonEditor inputs={inputs} onChange={(carbon) => patch({ carbon })} readOnly={readOnly} startYear={startYear} /></Card>
            </>
          )}
          {tab === 'financing' && (
            <>
              <Card className="space-y-3">
                <Field label={field('settings', 'opening_cash')} className="max-w-xs">
                  <NumberInput value={inputs.settings.openingCash} unit="€" disabled={readOnly} onValue={(openingCash) => patch({ settings: { ...inputs.settings, openingCash } })} />
                </Field>
              </Card>
              <Card>
                <RowsEditor<Loan>
                  title={t('finances.sections.loans')}
                  intro={t('finances.sections.loans_intro')}
                  rows={inputs.loans}
                  onChange={(loans) => patch({ loans })}
                  readOnly={readOnly}
                  startYear={startYear}
                  newRow={() => ({ id: newId(), label: t('finances.defaults.loan'), amount: null, ratePct: null, years: null, startYear: 1 })}
                  columns={[
                    { key: 'label', label: field('loans', 'label'), type: 'text', span: 2 },
                    { key: 'amount', label: field('loans', 'amount'), type: 'number', unit: '€' },
                    { key: 'ratePct', label: field('loans', 'rate_pct'), type: 'number', unit: '%' },
                    { key: 'years', label: field('loans', 'years'), type: 'integer', unit: t('finances.units.years') },
                    { key: 'startYear', label: field('loans', 'start_year'), type: 'year' },
                  ]}
                />
              </Card>
            </>
          )}
          {tab === 'settings' && <SettingsEditor plan={plan} inputs={inputs} onChange={(settings) => patch({ settings })} readOnly={readOnly} />}
        </div>
      </section>

      <ResultsTable result={result} />
    </div>
  )
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  const label = {
    new: t('finances.page.not_saved'),
    pending: t('finances.page.saving'),
    saving: t('finances.page.saving'),
    saved: t('finances.page.saved'),
    error: t('finances.page.save_error'),
  }[status]
  return (
    <span role="status" className={clsx('mr-1 text-xs', status === 'error' ? 'text-clay-700' : 'text-loam-500')}>
      {label}
    </span>
  )
}

function Banner({ tone, children, onClose }: { tone: 'warning' | 'error'; children: React.ReactNode; onClose?: () => void }) {
  return (
    <div role="alert" className={clsx('flex items-start gap-2 rounded-lg p-3 text-sm', tone === 'error' ? 'bg-clay-50 text-clay-700' : 'bg-humus-50 text-humus-700')}>
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p className="flex-1">{children}</p>
      {onClose && (
        <button type="button" onClick={onClose} aria-label={t('common.close')} className="rounded p-0.5 hover:bg-black/5"><X className="h-4 w-4" /></button>
      )}
    </div>
  )
}

function Kpis({ indicators: i }: { indicators: FinanceIndicators }) {
  const calendar = (value: number) => String(i.startYear + value - 1)
  const year = (value: number | null) => (value == null ? t('finances.kpis.never') : calendar(value))
  const yearHint = (value: number | null, definition: string, never: string) =>
    value == null ? never : `${t('finances.kpis.plan_year', { year: value })} : ${definition}`
  const tiles: { label: string; value: string; hint?: string; tone?: 'bad' }[] = [
    { label: t('finances.kpis.total_investment'), value: formatMoney(i.totalInvestment) },
    { label: t('finances.kpis.break_even_year'), value: year(i.breakEvenYear), hint: yearHint(i.breakEvenYear, t('finances.kpis.break_even_hint'), t('finances.kpis.break_even_never')) },
    { label: t('finances.kpis.payback_year'), value: year(i.paybackYear), hint: yearHint(i.paybackYear, t('finances.kpis.payback_hint'), t('finances.kpis.payback_never')) },
    {
      label: t('finances.kpis.funding_need'), value: formatMoney(i.fundingNeed),
      hint: i.fundingNeed > 0 && i.lowestCashYear != null
        ? t('finances.kpis.funding_need_hint', { calendar: calendar(i.lowestCashYear), year: i.lowestCashYear })
        : undefined,
    },
    { label: t('finances.kpis.final_cash'), value: formatMoney(i.finalCash), tone: i.finalCash < 0 ? 'bad' : undefined },
    {
      label: t('finances.kpis.peak_hours'), value: formatQuantity(i.peakPickingHours, 'h'),
      hint: i.peakHarvestYear ? t('finances.kpis.peak_hours_hint', { kg: formatQuantity(i.peakHarvestKg, 'kg') }) : undefined,
    },
  ]
  return (
    <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-xl bg-white p-3.5 shadow-sm ring-1 ring-loam-200/70">
          <dt className="text-xs text-loam-500">{tile.label}</dt>
          <dd className={clsx('mt-1 text-lg font-semibold leading-tight', tile.tone === 'bad' ? 'text-clay-700' : 'text-loam-900')}>{tile.value}</dd>
          {tile.hint && <dd className="mt-1 text-[11px] leading-snug text-loam-500">{tile.hint}</dd>}
        </div>
      ))}
    </dl>
  )
}

function Warnings({ warnings }: { warnings: FinanceWarning[] }) {
  if (warnings.length === 0) return null
  return (
    <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-humus-200 print:hidden" aria-labelledby="finance-warnings">
      <h2 id="finance-warnings" className="flex items-center gap-2 text-base"><TriangleAlert className="h-4 w-4 text-humus-600" aria-hidden />{t('finances.warnings.title')}</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-loam-700">
        {warnings.map((w) => (
          <li key={w.code}>
            {t(`finances.warnings.${w.code}`)}
            {w.names && w.names.length > 0 && <span className="text-loam-500"> : {w.names.join(', ')}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

function SpeciesTab({ inputs, onChange, readOnly, startYear, mapPlants, onSync, syncing, notice, onDismiss }: {
  inputs: FinanceInputs
  onChange: (species: SpeciesLine[]) => void
  readOnly: boolean
  startYear: number
  mapPlants: Props['mapPlants']
  onSync: () => void
  syncing: boolean
  notice: string | null
  onDismiss: () => void
}) {
  const species = inputs.species
  const blank = (): SpeciesLine => ({
    id: newId(), sourceKey: null, name: null, latinName: null, quantity: null, unitPrice: null, plantingYear: 1,
    firstHarvestAge: null, fullProductionAge: null, yieldKgPerPlant: null, pickingRateKgPerHour: null, lossPct: null,
    retailSharePct: null, retailPrice: null, restaurantSharePct: null, restaurantPrice: null, directSharePct: null, directPrice: null, notes: null,
  })
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-loam-600">{t('finances.sections.species_intro')}</p>
        {!readOnly && (
          <div className="sm:text-right">
            <Button variant="secondary" size="sm" onClick={onSync} disabled={syncing}>
              <RefreshCw className={clsx('h-4 w-4', syncing && 'animate-spin')} />{t('finances.page.sync')}
            </Button>
            <p className="mt-1 text-xs text-loam-500">{t('finances.page.map_plants', { count: mapPlants.length })}</p>
          </div>
        )}
      </div>
      {notice && <Banner tone="warning" onClose={onDismiss}>{notice}</Banner>}
      {species.length === 0 ? (
        <p className="rounded-xl border border-dashed border-loam-300 bg-white/60 p-6 text-center text-sm text-loam-500">{t('finances.species.empty')}</p>
      ) : (
        <div className="space-y-3">
          {species.map((line, index) => (
            <SpeciesCard
              key={line.id}
              line={line}
              readOnly={readOnly}
              startYear={startYear}
              defaultOpen={species.length <= 2}
              onChange={(next) => onChange(species.map((l, i) => (i === index ? next : l)))}
              onRemove={() => onChange(species.filter((_, i) => i !== index))}
            />
          ))}
        </div>
      )}
      {!readOnly && (
        <Button variant="secondary" size="sm" onClick={() => onChange([...species, blank()])}>
          <Plus className="h-4 w-4" />{t('finances.actions.add_species')}
        </Button>
      )}
    </div>
  )
}

function YearlyEditor<R extends YearlyRow & { kind?: string }>({ list, rows, onChange, readOnly, startYear, defaultLabel, kinds, newKind, oneOff }: {
  list: 'fixed_costs' | 'other_revenues' | 'subsidies'
  rows: R[]
  onChange: (rows: R[]) => void
  readOnly: boolean
  startYear: number
  defaultLabel: string
  kinds?: readonly string[]
  newKind?: string
  oneOff?: boolean
}) {
  const columns: Column<R>[] = [
    { key: 'label', label: field(list, 'label'), type: 'text', span: 2 },
    ...(kinds ? [{ key: 'kind' as keyof R & string, label: field(list, 'kind'), type: 'select' as const, options: options(list, kinds) }] : []),
    { key: 'amount', label: field(list, 'amount'), type: 'number', unit: '€' },
    { key: 'startYear', label: field(list, 'start_year'), type: 'year' },
    { key: 'endYear', label: field(list, 'end_year'), type: 'end_year' },
  ]
  return (
    <RowsEditor<R>
      title={t(`finances.sections.${list}`)}
      intro={t(`finances.sections.${list}_intro`)}
      rows={rows}
      onChange={onChange}
      readOnly={readOnly}
      startYear={startYear}
      columns={columns}
      newRow={() => ({ id: newId(), label: defaultLabel, amount: null, startYear: 1, endYear: oneOff ? 1 : null, ...(newKind ? { kind: newKind } : {}) }) as R}
    />
  )
}

function CarbonEditor({ inputs, onChange, readOnly, startYear }: {
  inputs: FinanceInputs; onChange: (carbon: FinanceInputs['carbon']) => void; readOnly: boolean; startYear: number
}) {
  const carbon = inputs.carbon
  const set = (changes: Partial<FinanceInputs['carbon']>) => onChange({ ...carbon, ...changes })
  return (
    <section className="space-y-3">
      <header>
        <h3 className="text-base">{t('finances.sections.carbon')}</h3>
        <p className="mt-0.5 text-sm text-loam-500">{t('finances.sections.carbon_intro')}</p>
      </header>
      <label className="inline-flex items-center gap-2 text-sm text-loam-800">
        <input type="checkbox" className="rounded border-loam-300 text-prune-600 focus:ring-prune-500" checked={carbon.enabled} disabled={readOnly} onChange={(e) => set({ enabled: e.target.checked })} />
        {field('carbon', 'enabled')}
      </label>
      {carbon.enabled && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={field('carbon', 't_co2_per_ha_year')}><NumberInput value={carbon.tCo2PerHaYear} unit="t" disabled={readOnly} onValue={(tCo2PerHaYear) => set({ tCo2PerHaYear })} /></Field>
          <Field label={field('carbon', 'price_per_t')}><NumberInput value={carbon.pricePerT} unit="€/t" disabled={readOnly} onValue={(pricePerT) => set({ pricePerT })} /></Field>
          <Field label={field('carbon', 'start_year')}><YearSelect value={carbon.startYear} startYear={startYear} disabled={readOnly} onValue={(v) => set({ startYear: v ?? 1 })} /></Field>
        </div>
      )}
    </section>
  )
}

function SettingsEditor({ plan, inputs, onChange, readOnly }: {
  plan: FinancePlanData; inputs: FinanceInputs; onChange: (settings: FinanceInputs['settings']) => void; readOnly: boolean
}) {
  const s = inputs.settings
  const set = (changes: Partial<FinanceInputs['settings']>) => onChange({ ...s, ...changes })
  return (
    <Card className="space-y-4">
      <p className="text-sm text-loam-600">{t('finances.sections.settings_intro')}</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label={field('settings', 'start_year')}>
          <Input type="number" inputMode="numeric" min={2000} max={2100} value={s.startYear} disabled={readOnly}
            onChange={(e) => { const v = Number(e.target.value); if (v >= 2000 && v <= 2100) set({ startYear: v }) }} />
        </Field>
        <Field label={field('settings', 'area_ha')} hint={plan.areaHaFromMap != null ? t('finances.fields.settings.area_from_map', { area: formatNumber(plan.areaHaFromMap) }) : undefined}>
          <NumberInput value={s.areaHa} unit="ha" disabled={readOnly} onValue={(areaHa) => set({ areaHa })} />
        </Field>
        <Field label={field('settings', 'labour_cost_per_hour')}>
          <NumberInput value={s.labourCostPerHour} unit="€/h" disabled={readOnly} onValue={(labourCostPerHour) => set({ labourCostPerHour })} />
        </Field>
        <Field label={field('settings', 'plant_replacement_pct')}>
          <NumberInput value={s.plantReplacementPct} unit="%" disabled={readOnly} onValue={(plantReplacementPct) => set({ plantReplacementPct })} />
        </Field>
        <Field label={field('settings', 'plant_depreciation_years')}>
          <NumberInput integer value={s.plantDepreciationYears} unit={t('finances.units.years')} disabled={readOnly} onValue={(v) => set({ plantDepreciationYears: v ?? 10 })} />
        </Field>
      </div>
    </Card>
  )
}
