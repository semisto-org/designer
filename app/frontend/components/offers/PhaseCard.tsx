import clsx from 'clsx'
import { Eye, EyeOff, Plus, RotateCcw, Sparkles, Trash2 } from 'lucide-react'
import { NumberInput } from '@/components/finances/NumberInput'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Field'
import { formatNumber, t } from '@/lib/i18n'
import type { BudgetLine, CustomLineInput, OfferInputs, PhaseResult } from '@/types/offers'
import { euros, formulaText, hoursText, lineLabel, newId, PhaseMark, withLineOverride } from './shared'

type Props = { phase: PhaseResult; inputs: OfferInputs; readOnly: boolean; onChange: (inputs: OfferInputs) => void }

/**
 * One phase of the budget: its lines with the hours the map gives and why,
 * the team's corrections, the expenses, then the fees, the minimum and
 * maximum, and the price the client will read.
 */
export function PhaseCard({ phase, inputs, readOnly, onChange }: Props) {
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

  const contribution = inputs.settings.contribution_pct
  const custom = (line: BudgetLine) => inputs.custom_lines.find((candidate) => candidate.id === line.id)

  return (
    <Card className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-serif text-xl font-semibold text-prune-800"><PhaseMark phase={phase.key} /> {t(`offers.phases.${phase.key}`)}</h3>
        <p className="text-xs text-loam-500">{t('offers.budget.hours_total', { min: formatNumber(phase.hours_min), max: formatNumber(phase.hours_max) })}</p>
      </header>

      <div className="-mx-2 divide-y divide-loam-100">
        <div className="hidden grid-cols-[minmax(0,1fr)_4rem_5rem_5.5rem_2rem] gap-2 px-2 pb-1 text-xs font-medium text-loam-500 sm:grid">
          <span>{t('offers.budget.line')}</span><span className="text-right">{t('offers.budget.persons')}</span>
          <span className="text-right">{t('offers.budget.hours')}</span><span className="text-right">{t('offers.budget.amount')}</span><span />
        </div>
        {phase.lines.map((line) => {
          const own = line.kind === 'custom' ? custom(line) : undefined
          return (
            <div key={line.key} className={clsx('grid grid-cols-[minmax(0,1fr)_4rem_5rem] items-center gap-x-2 gap-y-1 px-2 py-2 sm:grid-cols-[minmax(0,1fr)_4rem_5rem_5.5rem_2rem]', line.disabled && 'opacity-50')}>
              <div className="col-span-3 min-w-0 sm:col-span-1">
                {own ? (
                  <Input aria-label={t('offers.budget.line')} value={own.label ?? ''} placeholder={t('offers.budget.custom_label')} disabled={readOnly} onChange={(e) => setCustom(own.id, { label: e.target.value })} />
                ) : (
                  <p className={clsx('text-sm text-loam-900', line.disabled && 'line-through')}>{lineLabel(line)}</p>
                )}
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-loam-500">
                  {line.option && <span className="rounded-full bg-loam-100 px-1.5 text-loam-600">{t('offers.budget.option')}</span>}
                  {formulaText(line)}
                  {!!line.gain_pct && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-leaf-50 px-1.5 text-leaf-800 ring-1 ring-inset ring-leaf-200" title={t('offers.budget.gain_help')}>
                      <Sparkles className="h-3 w-3" aria-hidden />
                      {t('offers.budget.gain', { pct: formatNumber(line.gain_pct), hours: hoursText(line.computed_hours_without ?? 0) })}
                    </span>
                  )}
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
              <p className="col-start-1 text-sm tabular-nums text-loam-900 sm:col-start-auto sm:text-right">{euros(line.amount)}</p>
              <LineActions
                readOnly={readOnly}
                line={line}
                onReset={() => onChange(withLineOverride(inputs, line.key, { persons: null, hours: null }))}
                onToggle={() => onChange(withLineOverride(inputs, line.key, { disabled: !line.disabled }))}
                onRemove={own ? () => removeCustom(own.id) : undefined}
              />
            </div>
          )
        })}
      </div>

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
          <span className="text-loam-700">
            {t('offers.budget.fees')} :{' '}
            <span className="text-loam-500">
              {t('offers.budget.fees_detail', {
                labour: euros(phase.labour_base), contribution: formatNumber(contribution),
                adjustment: phase.adjustment_pct ? t('offers.budget.adjustment_detail', { pct: `${phase.adjustment_pct > 0 ? '+' : ''}${formatNumber(phase.adjustment_pct)}` }) : '',
              })}
            </span>
          </span>
          <span className="font-medium tabular-nums">{euros(phase.fees_min)}</span>
        </div>
        <p className="text-xs text-loam-500">{t('offers.budget.min_max', { min: euros(phase.total_min), max: euros(phase.total_max) })}</p>
        {phase.hours_saved > 0 && (
          <p className="flex items-center gap-1 text-xs text-leaf-800">
            <Sparkles className="h-3 w-3 shrink-0" aria-hidden />
            {t('offers.budget.saved', { hours: hoursText(phase.hours_saved), amount: euros(phase.saved_tvac) })}
          </p>
        )}
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
              <span className="block text-xs text-loam-400">{t('offers.budget.computed_price', { value: euros(phase.computed_prices[part]) })}</span>
            </label>
          ))}
        </div>
      </footer>
    </Card>
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
        {line.disabled ? <Eye className="h-4 w-4" aria-hidden /> : <EyeOff className="h-4 w-4" aria-hidden />}
      </button>
    </span>
  )
}
