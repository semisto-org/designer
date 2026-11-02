import clsx from 'clsx'
import { CircleMinus, CirclePlus, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { NumberInput } from '@/components/finances/NumberInput'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Field'
import { formatNumber, t } from '@/lib/i18n'
import type { BudgetLine, CustomLineInput, OfferInputs, OfferResult, PhaseResult } from '@/types/offers'
import { euros, formulaText, hoursText, lineLabel, newId, PhaseMark, withLineOverride } from './shared'

type Props = { phase: PhaseResult; complexity: OfferResult['complexity']; inputs: OfferInputs; readOnly: boolean; onChange: (inputs: OfferInputs) => void }

// Persons, hours (wide enough for « 2,5 h »), amount, actions; the name above them on a phone, beside them from `sm`.
const LINE_GRID = 'grid grid-cols-[4.5rem_6rem_minmax(0,1fr)_4rem] sm:grid-cols-[minmax(0,1fr)_4.5rem_6rem_5.5rem_4rem]'

/**
 * One phase of the budget: in the offer or not, its lines with the hours
 * the map gives and why, the team's corrections, project management on its
 * own, the expenses, then how the fees are built step by step, the minimum
 * and maximum, and the price the client will read.
 */
export function PhaseCard({ phase, complexity, inputs, readOnly, onChange }: Props) {
  const setCustom = (id: string, patch: Partial<CustomLineInput>) =>
    onChange({ ...inputs, custom_lines: inputs.custom_lines.map((line) => (line.id === id ? { ...line, ...patch } : line)) })
  const removeCustom = (id: string) => onChange({ ...inputs, custom_lines: inputs.custom_lines.filter((line) => line.id !== id) })
  const addCustom = (kind: 'hours' | 'amount') =>
    onChange({ ...inputs, custom_lines: [...inputs.custom_lines, { id: newId(), phase: phase.key, kind, label: null, persons: 1, hours: kind === 'hours' ? 1 : null, amount: kind === 'amount' ? 0 : null, option: false }] })

  function setPrice(part: 'fees' | 'expenses', value: number | null) {
    const current = { ...(inputs.prices[phase.key] ?? {}) }
    if (value == null) delete current[part]
    else current[part] = value
    const prices = { ...inputs.prices }
    if (Object.keys(current).length) prices[phase.key] = current
    else delete prices[phase.key]
    onChange({ ...inputs, prices })
  }

  const custom = (line: BudgetLine) => inputs.custom_lines.find((candidate) => candidate.id === line.id)
  const enabled = phase.enabled !== false
  const setEnabled = (on: boolean) =>
    onChange({ ...inputs, phases_off: on ? inputs.phases_off.filter((key) => key !== phase.key) : [...inputs.phases_off, phase.key] })
  const management = phase.lines.find((line) => line.kind === 'project_management')
  const work = phase.lines.filter((line) => line.kind !== 'project_management')

  function renderLine(line: BudgetLine) {
    const own = line.kind === 'custom' ? custom(line) : undefined
    return (
      <div key={line.key} className={clsx(LINE_GRID, 'items-center gap-x-2 gap-y-1 px-2 py-2', line.disabled && 'opacity-50')}>
        <div className="col-span-4 min-w-0 sm:col-span-1">
          {own ? (
            <Input aria-label={t('offers.budget.line')} value={own.label ?? ''} placeholder={t('offers.budget.custom_label')} disabled={readOnly} onChange={(e) => setCustom(own.id, { label: e.target.value })} />
          ) : (
            <p className={clsx('text-sm text-loam-900', line.disabled && 'line-through')}>{lineLabel(line)}</p>
          )}
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-loam-500">
            {line.option && <span className="rounded-full bg-loam-100 px-1.5 text-loam-600">{t('offers.budget.option')}</span>}
            {formulaText(line)}
            {line.overridden && <span className="text-humus-700">{t('offers.budget.computed', { value: `${formatNumber(line.computed_persons ?? 0)} × ${hoursText(line.computed_hours ?? 0)}` })}</span>}
          </p>
        </div>
        {own ? (
          <>
            <NumberInput aria-label={t('offers.budget.persons')} value={own.persons} disabled={readOnly} onValue={(value) => setCustom(own.id, { persons: value })} />
            <NumberInput aria-label={t('offers.budget.hours')} value={own.hours} unit="h" disabled={readOnly} onValue={(value) => setCustom(own.id, { hours: value })} />
          </>
        ) : (
          <>
            <NumberInput aria-label={t('offers.budget.persons')} value={line.persons} disabled={readOnly || line.disabled} className={clsx(line.persons !== line.computed_persons && 'bg-humus-50')} onValue={(value) => onChange(withLineOverride(inputs, line.key, { persons: value === line.computed_persons ? null : value }))} />
            <NumberInput aria-label={t('offers.budget.hours')} value={line.hours} unit="h" disabled={readOnly || line.disabled} className={clsx(line.hours !== line.computed_hours && 'bg-humus-50')} onValue={(value) => onChange(withLineOverride(inputs, line.key, { hours: value === line.computed_hours ? null : value }))} />
          </>
        )}
        <p className="text-right text-sm tabular-nums text-loam-900">{euros(line.amount)}</p>
        <LineActions
          readOnly={readOnly}
          line={line}
          onReset={() => onChange(withLineOverride(inputs, line.key, { persons: null, hours: null }))}
          onToggle={() => onChange(withLineOverride(inputs, line.key, { disabled: !line.disabled }))}
          onRemove={own ? () => removeCustom(own.id) : undefined}
        />
      </div>
    )
  }

  return (
    <Card className={clsx('space-y-4', !enabled && 'bg-loam-50/70')}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={clsx('font-serif text-xl font-semibold', enabled ? 'text-prune-800' : 'text-loam-500')}><PhaseMark phase={phase.key} /> {t(`offers.phases.${phase.key}`)}</h3>
        <div className="flex flex-wrap items-center gap-3">
          {enabled && <p className="text-sm text-loam-500">{t('offers.budget.hours_total', { min: formatNumber(phase.hours_min), max: formatNumber(phase.hours_max) })}</p>}
          <label className="inline-flex items-center gap-1.5 text-sm font-medium text-loam-700">
            <input
              type="checkbox"
              className="rounded border-loam-300 text-prune-600 focus:ring-prune-600"
              checked={enabled}
              disabled={readOnly}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            {t('offers.budget.in_offer')}
          </label>
        </div>
      </header>

      {!enabled ? (
        <p className="text-sm text-loam-500">{t(phase.key === 'implementation' ? 'offers.budget.phase_off_implementation' : 'offers.budget.phase_off')}</p>
      ) : (<>

      <div className="-mx-2 divide-y divide-loam-100">
        {/* On a phone the line's name takes its own row; the columns below keep their headings. */}
        <div className={clsx(LINE_GRID, 'gap-x-2 px-2 pb-1 text-xs font-medium text-loam-500')}>
          <span className="hidden sm:block">{t('offers.budget.line')}</span><span className="sm:text-right">{t('offers.budget.persons')}</span>
          <span className="sm:text-right">{t('offers.budget.hours')}</span><span className="text-right">{t('offers.budget.amount')}</span><span />
        </div>
        {work.map(renderLine)}
      </div>

      {management && (
        <section className="rounded-xl bg-leaf-50/60 ring-1 ring-inset ring-leaf-200">
          <p className="px-3 pt-2 text-sm text-loam-600">{t('offers.budget.management_help')}</p>
          <div className="divide-y divide-loam-100">{renderLine(management)}</div>
        </section>
      )}

      {phase.expenses.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-loam-900">{t('offers.budget.expenses')}</h4>
          <div className="-mx-2 mt-1 divide-y divide-loam-100">
            {phase.expenses.map((line) => {
              const own = line.kind === 'custom' ? custom(line) : undefined
              return (
                <div key={line.key} className={clsx('grid grid-cols-[minmax(0,1fr)_6.5rem_2rem] items-center gap-2 px-2 py-1.5', line.disabled && 'opacity-50')}>
                  <div className="min-w-0">
                    {own ? (
                      <Input aria-label={t('offers.budget.line')} value={own.label ?? ''} placeholder={t('offers.budget.custom_label')} disabled={readOnly} onChange={(e) => setCustom(own.id, { label: e.target.value })} />
                    ) : (
                      <p className={clsx('text-sm text-loam-900', line.disabled && 'line-through')}>{lineLabel(line)}</p>
                    )}
                    <p className="text-xs text-loam-500">
                      {line.option && <span className="mr-2 rounded-full bg-loam-100 px-1.5 text-loam-600">{t('offers.budget.option')}</span>}
                      {line.kind === 'trip' && `${formatNumber(line.trips ?? 0)} AR × ${formatNumber(line.one_way_km ?? 0)} km × 2 = ${formatNumber(line.km ?? 0)} km`}
                    </p>
                  </div>
                  {line.kind === 'trip' ? (
                    <p className="text-right text-sm tabular-nums text-loam-900">{euros(line.amount)}</p>
                  ) : own ? (
                    <NumberInput aria-label={t('offers.budget.amount')} value={own.amount} unit="€" disabled={readOnly} onValue={(value) => setCustom(own.id, { amount: value })} />
                  ) : (
                    <NumberInput aria-label={t('offers.budget.amount')} value={line.amount} unit="€" disabled={readOnly || line.disabled} className={clsx(line.overridden && 'bg-humus-50')} onValue={(value) => onChange(withLineOverride(inputs, line.key, { amount: value === line.computed_amount ? null : value }))} />
                  )}
                  {line.kind === 'trip' ? <span /> : (
                    <LineActions
                      readOnly={readOnly}
                      line={line}
                      onReset={() => onChange(withLineOverride(inputs, line.key, { amount: null }))}
                      onToggle={() => onChange(withLineOverride(inputs, line.key, { disabled: !line.disabled }))}
                      onRemove={own ? () => removeCustom(own.id) : undefined}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-1 text-sm">
          <span className="text-loam-500">{t('offers.budget.add_line')} :</span>
          <button type="button" onClick={() => addCustom('hours')} className="inline-flex items-center gap-1 rounded-full px-2 py-1 font-medium text-prune-700 hover:bg-prune-50"><Plus className="h-3.5 w-3.5" aria-hidden />{t('offers.budget.add_hours_line')}</button>
          <button type="button" onClick={() => addCustom('amount')} className="inline-flex items-center gap-1 rounded-full px-2 py-1 font-medium text-prune-700 hover:bg-prune-50"><Plus className="h-3.5 w-3.5" aria-hidden />{t('offers.budget.add_amount_line')}</button>
        </div>
      )}

      <footer className="space-y-3 rounded-xl bg-loam-50 p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span className="font-medium text-loam-800">{t('offers.budget.fees')}</span>
          <span className="font-medium tabular-nums">{euros(phase.fees_min)} HTVA</span>
        </div>
        <FeesSteps phase={phase} complexity={complexity} vat={inputs.settings.vat_services_pct} buffer={inputs.settings.buffer_pct} />
        <div className="grid gap-2 sm:grid-cols-2">
          {(['fees', 'expenses'] as const).map((part) => (
            <label key={part} className="block space-y-1">
              <span className="block text-xs font-medium text-loam-700">{t(part === 'fees' ? 'offers.budget.fees' : 'offers.budget.expenses')} · {t('offers.budget.client_price')}</span>
              <div className="flex items-center gap-1">
                <NumberInput
                  value={phase.prices[part]}
                  unit="€"
                  disabled={readOnly}
                  className={clsx('font-semibold', phase.prices_set.includes(part) && 'bg-humus-50')}
                  onValue={(value) => setPrice(part, value)}
                />
                {phase.prices_set.includes(part) && !readOnly && (
                  <button type="button" onClick={() => setPrice(part, null)} className="rounded-full p-1 text-loam-400 hover:text-prune-700" aria-label={t('offers.budget.price_reset')} title={t('offers.budget.price_reset')}>
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </div>
              <span className="block text-sm text-loam-500">{t('offers.budget.computed_price', { value: euros(phase.computed_prices[part]) })}</span>
            </label>
          ))}
        </div>
      </footer>
      </>)}
    </Card>
  )
}

/**
 * Where the fees come from, one step per line: the work, the markup, the
 * complexity, the adjustments, then the VAT and the rounding; and what the
 * minimum and the maximum hold.
 */
function FeesSteps({ phase, complexity, vat, buffer }: { phase: PhaseResult; complexity: OfferResult['complexity']; vat: number; buffer: number }) {
  // Versions saved before the steps were kept: the factor alone.
  if (phase.contribution_pct == null || phase.complexity_factor == null) {
    return <p className="text-sm text-loam-500">{t('offers.budget.min_max', { min: euros(phase.total_min), max: euros(phase.total_max) })}</p>
  }
  const signed = (value: number) => `${value > 0 ? '+' : '−'} ${formatNumber(Math.abs(value))}`
  const steps: string[] = [t('offers.budget.step_labour', { amount: euros(phase.labour_base) })]
  if (phase.contribution_pct) steps.push(t('offers.budget.step_markup', { pct: formatNumber(phase.contribution_pct) }))
  if (phase.complexity_factor !== 1) {
    steps.push(t('offers.budget.step_complexity', { factor: formatNumber(phase.complexity_factor), level: complexity.level ? t(`offers.complexity.levels.${complexity.level}`) : '' }))
  }
  if (phase.adjustment_pct) steps.push(t('offers.budget.step_adjustments', { pct: signed(phase.adjustment_pct) }))
  return (
    <div className="space-y-1 text-sm text-loam-600">
      <p>{steps.join(' ')} = <span className="font-medium text-loam-800">{euros(phase.fees_min)} HTVA</span></p>
      <p>{t('offers.budget.step_vat', { pct: formatNumber(vat), tvac: euros(phase.fees_min_tvac), rounding: euros(phase.rounding), price: euros(phase.computed_prices.fees) })}</p>
      <p className="text-loam-500">
        {phase.total_max > phase.total_min
          ? t('offers.budget.min_max_explained', { min: euros(phase.total_min), max: euros(phase.total_max), buffer: formatNumber(buffer) })
          : t('offers.budget.min_only', { min: euros(phase.total_min) })}
      </p>
    </div>
  )
}

function LineActions({ line, readOnly, onReset, onToggle, onRemove }: { line: BudgetLine; readOnly: boolean; onReset: () => void; onToggle: () => void; onRemove?: () => void }) {
  if (readOnly) return <span />
  if (onRemove) {
    return (
      <button type="button" onClick={onRemove} className="justify-self-end rounded-full p-1.5 text-loam-400 hover:bg-clay-50 hover:text-clay-600" aria-label={t('offers.scope.remove')} title={t('offers.scope.remove')}>
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
    )
  }
  return (
    <span className="flex justify-end gap-0.5">
      {line.overridden && (
        <button type="button" onClick={onReset} className="rounded-full p-1.5 text-loam-400 hover:text-prune-700" aria-label={t('offers.budget.reset')} title={t('offers.budget.reset')}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
      <button type="button" onClick={onToggle} className="rounded-full p-1.5 text-loam-400 hover:text-prune-700" aria-label={t(line.disabled ? 'offers.budget.enable' : 'offers.budget.disable')} title={t(line.disabled ? 'offers.budget.enable' : 'offers.budget.disable')}>
        {line.disabled ? <CirclePlus className="h-4 w-4" aria-hidden /> : <CircleMinus className="h-4 w-4" aria-hidden />}
      </button>
    </span>
  )
}
