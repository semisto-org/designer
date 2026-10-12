import { Head, Link, router } from '@inertiajs/react'
import clsx from 'clsx'
import { ArrowLeft, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { NumberInput } from '@/components/finances/NumberInput'
import { categoryLabel, newId, phaseLabel, PhaseMark, typeLabel } from '@/components/offers/shared'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input, Select, Textarea } from '@/components/ui/Field'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import type { PricingData, PricingExpense, PricingTask, TemplateEditProps } from '@/types/offer_templates'
import type { ComplexityCriterion, ComplexityLevel, OfferSettings, PlantCategory, PlantingType } from '@/types/offers'

const RATE_UNITS: Record<keyof OfferSettings, string> = {
  designers: '', hourly_rate: '€/h', contribution_pct: '%', buffer_pct: '%', km_rate: '€/km', plants_per_day: '/j',
  plants_margin_pct: '%', vat_services_pct: '%', vat_plants_pct: '%', vat_supplies_pct: '%', rounding: '€',
  co_management_half_days: '/an', half_day_hours: 'h',
}

const slug = (prefix: string) => `${prefix}_${newId().replace(/[^a-z0-9]/g, '').slice(0, 8)}`
const taskLabel = (task: { key: string; label: string | null }) => task.label || t(`offers.tasks.${task.key}`)

/**
 * A pricing template, whole: who it is for, rates, the tasks of each phase
 * with their hours and what the Designer saves, expenses, plants, how
 * complexity is scored, the design share aimed at, and the terms.
 * Saved with one button; an offer priced with it follows it until a
 * version is saved.
 */
export default function OfferTemplateEdit({ template, account, vocabulary }: TemplateEditProps) {
  const [name, setName] = useState(template.name)
  const [clientTypes, setClientTypes] = useState(template.clientTypes)
  const [data, setData] = useState<PricingData>(template.data)
  const [status, setStatus] = useState<'clean' | 'dirty' | 'saving' | 'saved' | 'error'>('clean')
  const [error, setError] = useState<string | null>(null)

  const change = (next: Partial<PricingData>) => {
    setData({ ...data, ...next })
    setStatus('dirty')
  }

  async function save() {
    setStatus('saving')
    setError(null)
    try {
      const response = await api<{ template: TemplateEditProps['template'] }>(`/offer_templates/${template.id}`, {
        method: 'PATCH', body: { template: { name, client_types: clientTypes, data } },
      })
      setData(response.template.data)
      setStatus('saved')
    } catch (failure) {
      setError((failure as Error).message)
      setStatus('error')
    }
  }

  function destroy() {
    if (window.confirm(t('offer_templates.edit.delete_confirm', { name: template.name }))) router.delete(`/offer_templates/${template.id}`)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-24">
      <Head title={`${name} · ${t('offer_templates.index.title')}`} />
      <header className="space-y-1">
        <Link href="/offer_templates" className="inline-flex items-center gap-1 text-sm text-loam-500 hover:text-loam-900">
          <ArrowLeft className="h-4 w-4" />{t('offer_templates.edit.back')}
        </Link>
        <h1 className="text-2xl">{name || t('offer_templates.edit.untitled')}</h1>
        <p className="text-loam-500">{account.name ? t('offer_templates.index.team', { name: account.name }) : t('offer_templates.index.mine')}</p>
      </header>

      <Section title={t('offer_templates.edit.identity')}>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-loam-800">{t('offer_templates.edit.name')}</span>
          <Input value={name} maxLength={80} onChange={(e) => { setName(e.target.value); setStatus('dirty') }} />
        </label>
        <fieldset>
          <legend className="text-sm font-medium text-loam-800">{t('offer_templates.edit.client_types')}</legend>
          <p className="text-xs text-loam-500">{t('offer_templates.edit.client_types_help')}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {vocabulary.clientTypes.map((type) => {
              const on = clientTypes.includes(type)
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={on}
                  onClick={() => { setClientTypes(on ? clientTypes.filter((other) => other !== type) : [...clientTypes, type]); setStatus('dirty') }}
                  className={clsx('rounded-full px-3 py-1 text-sm ring-1 ring-inset', on ? 'bg-prune-600 text-white ring-prune-600' : 'bg-white text-loam-700 ring-loam-200 hover:bg-prune-50')}
                >
                  {t(`offers.client_types.${type}`)}
                </button>
              )
            })}
          </div>
        </fieldset>
      </Section>

      <Section title={t('offer_templates.edit.rates')} help={t('offer_templates.edit.rates_help')}>
        <div className="grid gap-3 sm:grid-cols-3">
          {(Object.keys(RATE_UNITS) as (keyof OfferSettings)[]).filter((key) => key !== 'designers').map((key) => (
            <label key={key} className="block space-y-1">
              <span className="block text-xs text-loam-600">{t(`offers.rates.${key}`)}</span>
              <NumberInput value={data.settings[key]} unit={RATE_UNITS[key]} onValue={(value) => value != null && change({ settings: { ...data.settings, [key]: value } })} />
            </label>
          ))}
        </div>
      </Section>

      <Section title={t('offer_templates.edit.tasks')} help={t('offer_templates.edit.tasks_help')}>
        {vocabulary.phases.map((phase) => (
          <TaskTable key={phase} phase={phase} data={data} vocabulary={vocabulary} onChange={change} />
        ))}
      </Section>

      <Section title={t('offer_templates.edit.expenses')}>
        <ExpenseTable data={data} vocabulary={vocabulary} onChange={change} />
      </Section>

      <Section title={t('offer_templates.edit.plants')} help={t('offer_templates.edit.plants_help')}>
        <Categories data={data} vocabulary={vocabulary} onChange={change} />
        <PlantingTypes data={data} onChange={change} />
      </Section>

      <Section title={t('offers.complexity.title')} help={t('offer_templates.edit.complexity_help')}>
        <Complexity data={data} onChange={change} />
      </Section>

      <Section title={t('offer_templates.edit.design_share')} help={t('offer_templates.edit.design_share_help')}>
        <label className="block w-40">
          <NumberInput value={data.target_design_share_pct} unit="%" onValue={(value) => change({ target_design_share_pct: value ?? 0 })} />
        </label>
      </Section>

      <Section title={t('offer_templates.edit.terms')} help={t('offer_templates.edit.terms_help')}>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block space-y-1">
            <span className="block text-xs text-loam-600">{t('offer_templates.edit.revisions')}</span>
            <NumberInput integer value={data.terms.revisions} onValue={(value) => change({ terms: { ...data.terms, revisions: value } })} />
          </label>
          <label className="block space-y-1">
            <span className="block text-xs text-loam-600">{t('offer_templates.edit.validity_days')}</span>
            <NumberInput integer value={data.terms.validity_days} unit="j" onValue={(value) => change({ terms: { ...data.terms, validity_days: value } })} />
          </label>
          <label className="block space-y-1">
            <span className="block text-xs text-loam-600">{t('offer_templates.edit.deposit_pct')}</span>
            <NumberInput value={data.terms.deposit_pct} unit="%" onValue={(value) => change({ terms: { ...data.terms, deposit_pct: value } })} />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="block text-xs text-loam-600">{t('offer_templates.edit.markup_label')}</span>
          <Input value={data.terms.markup_label ?? ''} maxLength={120} placeholder={t('offer_templates.edit.markup_label_placeholder')} onChange={(e) => change({ terms: { ...data.terms, markup_label: e.target.value } })} />
          <span className="block text-xs text-loam-500">{t('offer_templates.edit.markup_label_help')}</span>
        </label>
        <label className="block space-y-1">
          <span className="block text-xs text-loam-600">{t('offer_templates.edit.assumptions')}</span>
          <Textarea rows={3} value={data.terms.assumptions ?? ''} placeholder={t('offer_templates.edit.assumptions_placeholder')} onChange={(e) => change({ terms: { ...data.terms, assumptions: e.target.value } })} />
        </label>
        <label className="block space-y-1">
          <span className="block text-xs text-loam-600">{t('offer_templates.edit.exclusions')}</span>
          <Textarea rows={3} value={data.terms.exclusions ?? ''} placeholder={t('offer_templates.edit.exclusions_placeholder')} onChange={(e) => change({ terms: { ...data.terms, exclusions: e.target.value } })} />
        </label>
      </Section>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-loam-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={destroy} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-clay-600 hover:bg-clay-50">
            <Trash2 className="h-4 w-4" aria-hidden />{t('offer_templates.edit.delete')}
          </button>
          <span className="flex items-center gap-3">
            <span role="status" className={clsx('text-xs', status === 'error' ? 'text-clay-600' : 'text-loam-500')}>
              {status === 'error' ? error : status === 'dirty' ? t('offer_templates.edit.unsaved') : status === 'saved' ? t('offer_templates.edit.saved') : ''}
            </span>
            <Button onClick={() => void save()} disabled={status === 'saving' || !name.trim()}>{t('offer_templates.edit.save')}</Button>
          </span>
        </div>
      </div>
    </div>
  )
}

function Section({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-serif text-xl font-semibold text-prune-800">{title}</h2>
        {help && <p className="mt-0.5 text-sm text-loam-500">{help}</p>}
      </div>
      {children}
    </Card>
  )
}

type Editor = { data: PricingData; vocabulary: TemplateEditProps['vocabulary']; onChange: (next: Partial<PricingData>) => void }

function ConditionSelect({ value, conditions, onChange }: { value: string | null; conditions: string[]; onChange: (value: string | null) => void }) {
  return (
    <Select aria-label={t('offer_templates.edit.when')} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{t('offer_templates.edit.always')}</option>
      {conditions.map((condition) => <option key={condition} value={condition}>{t(`offer_templates.conditions.${condition}`)}</option>)}
    </Select>
  )
}

function TaskTable({ phase, data, vocabulary, onChange }: Editor & { phase: PricingTask['phase'] }) {
  const tasks = data.tasks.filter((task) => task.phase === phase)
  const set = (target: PricingTask, patch: Partial<PricingTask>) => onChange({ tasks: data.tasks.map((task) => (task === target ? { ...task, ...patch } : task)) })
  const remove = (target: PricingTask) => onChange({ tasks: data.tasks.filter((task) => task !== target) })
  const add = () => onChange({ tasks: [...data.tasks, { key: slug('task'), phase, label: t('offer_templates.edit.new_task'), persons: 1, base: 1, per: 0, driver: null, when: null, option: false, gain_pct: 0 }] })
  return (
    <div>
      <h3 className="font-serif text-lg font-semibold text-loam-900"><PhaseMark phase={phase} /> {phaseLabel(phase)}</h3>
      <ul className="mt-2 divide-y divide-loam-100">
        {tasks.map((task) => (
          <li key={`${task.phase}.${task.key}`} className="grid grid-cols-2 gap-2 py-2.5 sm:grid-cols-[minmax(0,1.6fr)_6rem_5rem_5rem_8rem_5.5rem_auto]">
            <div className="col-span-2 sm:col-span-1">
              {task.label != null ? (
                <Input aria-label={t('offer_templates.edit.task')} value={task.label ?? ''} onChange={(e) => set(task, { label: e.target.value })} />
              ) : (
                <p className="text-sm text-loam-900">{taskLabel(task)}</p>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-loam-500">
                <ConditionSelect value={task.when} conditions={vocabulary.conditions} onChange={(when) => set(task, { when })} />
                <label className="inline-flex items-center gap-1">
                  <input type="checkbox" className="rounded border-loam-300 text-prune-600" checked={task.option} onChange={(e) => set(task, { option: e.target.checked })} />
                  {t('offers.budget.option')}
                </label>
              </div>
            </div>
            <label className="block">
              <span className="block text-[11px] text-loam-500">{t('offers.budget.persons')}</span>
              <Select value={task.persons === 'designers' ? 'designers' : String(task.persons)} onChange={(e) => set(task, { persons: e.target.value === 'designers' ? 'designers' : Number(e.target.value) })}>
                <option value="designers">{t('offer_templates.edit.designers')}</option>
                {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count}</option>)}
              </Select>
            </label>
            <label className="block">
              <span className="block text-[11px] text-loam-500">{t('offer_templates.edit.base')}</span>
              <NumberInput value={task.base} unit="h" onValue={(value) => set(task, { base: value ?? 0 })} />
            </label>
            <label className="block">
              <span className="block text-[11px] text-loam-500">{t('offer_templates.edit.per')}</span>
              <NumberInput value={task.per} unit="h" onValue={(value) => set(task, { per: value ?? 0 })} />
            </label>
            <label className="block">
              <span className="block text-[11px] text-loam-500">{t('offer_templates.edit.driver')}</span>
              <Select value={task.driver ?? ''} onChange={(e) => set(task, { driver: e.target.value || null })}>
                <option value="">—</option>
                {vocabulary.drivers.map((driver) => <option key={driver} value={driver}>{t(`offer_templates.drivers.${driver}`)}</option>)}
              </Select>
            </label>
            <label className="block">
              <span className="flex items-center gap-0.5 text-[11px] text-leaf-700"><Sparkles className="h-3 w-3" aria-hidden />{t('offer_templates.edit.gain')}</span>
              <NumberInput value={task.gain_pct} unit="%" onValue={(value) => set(task, { gain_pct: value ?? 0 })} />
            </label>
            <button type="button" onClick={() => remove(task)} className="self-end justify-self-end rounded-full p-1.5 text-loam-400 hover:bg-clay-50 hover:text-clay-600" aria-label={t('offer_templates.edit.remove')} title={t('offer_templates.edit.remove')}>
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={add} className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-medium text-prune-700 hover:bg-prune-50">
        <Plus className="h-4 w-4" aria-hidden />{t('offer_templates.edit.add_task')}
      </button>
    </div>
  )
}

function ExpenseTable({ data, vocabulary, onChange }: Editor) {
  const set = (target: PricingExpense, patch: Partial<PricingExpense>) => onChange({ expenses: data.expenses.map((expense) => (expense === target ? { ...expense, ...patch } : expense)) })
  const add = () => onChange({ expenses: [...data.expenses, { key: slug('expense'), phase: 'pre_design', label: t('offer_templates.edit.new_expense'), amount: 0, when: null, option: false }] })
  return (
    <div>
      <ul className="divide-y divide-loam-100">
        {data.expenses.map((expense) => (
          <li key={`${expense.phase}.${expense.key}`} className="grid grid-cols-2 items-end gap-2 py-2.5 sm:grid-cols-[minmax(0,1.5fr)_9rem_7rem_10rem_auto]">
            <div className="col-span-2 sm:col-span-1">
              {expense.label != null ? (
                <Input aria-label={t('offer_templates.edit.expense')} value={expense.label} onChange={(e) => set(expense, { label: e.target.value })} />
              ) : (
                <p className="text-sm text-loam-900">{taskLabel(expense)}</p>
              )}
            </div>
            <Select aria-label={t('offer_templates.edit.phase')} value={expense.phase} onChange={(e) => set(expense, { phase: e.target.value as PricingExpense['phase'] })}>
              {vocabulary.phases.map((phase) => <option key={phase} value={phase}>{phaseLabel(phase)}</option>)}
            </Select>
            <NumberInput aria-label={t('offers.budget.amount')} value={expense.amount} unit="€" onValue={(value) => set(expense, { amount: value ?? 0 })} />
            <ConditionSelect value={expense.when} conditions={vocabulary.conditions} onChange={(when) => set(expense, { when })} />
            <button type="button" onClick={() => onChange({ expenses: data.expenses.filter((other) => other !== expense) })} className="justify-self-end rounded-full p-1.5 text-loam-400 hover:bg-clay-50 hover:text-clay-600" aria-label={t('offer_templates.edit.remove')}>
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={add} className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-medium text-prune-700 hover:bg-prune-50">
        <Plus className="h-4 w-4" aria-hidden />{t('offer_templates.edit.add_expense')}
      </button>
    </div>
  )
}

function Categories({ data, vocabulary, onChange }: Editor) {
  const set = (target: PlantCategory, patch: Partial<PlantCategory>) => onChange({ categories: data.categories.map((category) => (category === target ? { ...category, ...patch } : category)) })
  const add = () => onChange({ categories: [...data.categories, { key: slug('category'), label: t('offer_templates.edit.new_category'), price: 10, mulch_m2: 1, compost_l: 3, guard: 0, stake: 0 }] })
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-loam-900">{t('offer_templates.edit.categories')}</h3>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="text-left text-xs text-loam-500">
              <th className="pb-1 font-medium">{t('offers.plants.category')}</th>
              <th className="w-24 pb-1 font-medium">{t('offers.plants.price')}</th>
              {vocabulary.supplies.map((supply) => <th key={supply} className="w-20 pb-1 font-medium">{t(`offers.supplies.${supply}`)}</th>)}
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-loam-100">
            {data.categories.map((category) => (
              <tr key={category.key}>
                <td className="py-1.5 pr-2">
                  {category.label != null ? <Input value={category.label} onChange={(e) => set(category, { label: e.target.value })} /> : categoryLabel(category)}
                </td>
                <td className="py-1.5 pr-2"><NumberInput value={category.price} unit="€" onValue={(value) => set(category, { price: value ?? 0 })} /></td>
                {vocabulary.supplies.map((supply) => (
                  <td key={supply} className="py-1.5 pr-2">
                    <NumberInput value={category[supply as keyof PlantCategory] as number} onValue={(value) => set(category, { [supply]: value ?? 0 })} />
                  </td>
                ))}
                <td className="py-1.5 text-right">
                  <button type="button" onClick={() => onChange({ categories: data.categories.filter((other) => other !== category) })} className="rounded-full p-1.5 text-loam-400 hover:bg-clay-50 hover:text-clay-600" aria-label={t('offer_templates.edit.remove')}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={add} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-medium text-prune-700 hover:bg-prune-50">
        <Plus className="h-4 w-4" aria-hidden />{t('offer_templates.edit.add_category')}
      </button>
    </div>
  )
}

function PlantingTypes({ data, onChange }: Omit<Editor, 'vocabulary'>) {
  const set = (target: PlantingType, patch: Partial<PlantingType>) => onChange({ planting_types: data.planting_types.map((type) => (type === target ? { ...type, ...patch } : type)) })
  const add = () => onChange({ planting_types: [...data.planting_types, { key: slug('type'), label: t('offer_templates.edit.new_type'), measure: 'area', mix: {} }] })
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-loam-900">{t('offer_templates.edit.planting_types')}</h3>
      <p className="text-xs text-loam-500">{t('offer_templates.edit.planting_types_help')}</p>
      <ul className="space-y-3">
        {data.planting_types.map((type) => (
          <li key={type.key} className="rounded-xl bg-loam-50 p-3">
            <div className="flex flex-wrap items-center gap-2">
              {type.label != null ? <Input className="max-w-xs" value={type.label} onChange={(e) => set(type, { label: e.target.value })} /> : <span className="font-medium text-loam-900">{typeLabel(type)}</span>}
              <Select className="w-36" value={type.measure} onChange={(e) => set(type, { measure: e.target.value as PlantingType['measure'] })}>
                <option value="area">{t('offer_templates.edit.per_m2')}</option>
                <option value="length">{t('offer_templates.edit.per_m')}</option>
              </Select>
              <button type="button" onClick={() => onChange({ planting_types: data.planting_types.filter((other) => other !== type) })} className="ml-auto rounded-full p-1.5 text-loam-400 hover:bg-clay-50 hover:text-clay-600" aria-label={t('offer_templates.edit.remove')}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {data.categories.map((category) => (
                <label key={category.key} className="block">
                  <span className="block text-[11px] text-loam-500">{categoryLabel(category)}</span>
                  <NumberInput
                    value={type.mix[category.key] ?? null}
                    unit={type.measure === 'area' ? '/m²' : '/m'}
                    onValue={(value) => {
                      const mix = { ...type.mix }
                      if (value == null || value === 0) delete mix[category.key]
                      else mix[category.key] = value
                      set(type, { mix })
                    }}
                  />
                </label>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <button type="button" onClick={add} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-medium text-prune-700 hover:bg-prune-50">
        <Plus className="h-4 w-4" aria-hidden />{t('offer_templates.edit.add_type')}
      </button>
    </div>
  )
}

function Complexity({ data, onChange }: Omit<Editor, 'vocabulary'>) {
  const { criteria, levels } = data.complexity
  const setCriterion = (target: ComplexityCriterion, patch: Partial<ComplexityCriterion>) =>
    onChange({ complexity: { levels, criteria: criteria.map((criterion) => (criterion === target ? { ...criterion, ...patch } : criterion)) } })
  const setLevel = (target: ComplexityLevel, patch: Partial<ComplexityLevel>) =>
    onChange({ complexity: { criteria, levels: levels.map((level) => (level === target ? { ...level, ...patch } : level)) } })
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-loam-900">{t('offer_templates.edit.criteria')}</h3>
        {criteria.map((criterion) => (
          <div key={criterion.key} className="grid grid-cols-[minmax(0,1fr)_5rem_auto] items-center gap-2">
            {criterion.label != null ? <Input value={criterion.label} onChange={(e) => setCriterion(criterion, { label: e.target.value })} /> : <span className="text-sm">{t(`offers.complexity.criteria.${criterion.key}`)}</span>}
            <NumberInput integer value={criterion.max} unit="pts" onValue={(value) => setCriterion(criterion, { max: value ?? 1 })} />
            <button type="button" onClick={() => onChange({ complexity: { levels, criteria: criteria.filter((other) => other !== criterion) } })} className="rounded-full p-1.5 text-loam-400 hover:bg-clay-50 hover:text-clay-600" aria-label={t('offer_templates.edit.remove')}>
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ))}
        {criteria.length < 8 && (
          <button type="button" onClick={() => onChange({ complexity: { levels, criteria: [...criteria, { key: slug('criterion'), label: t('offer_templates.edit.new_criterion'), max: 6 }] } })} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-medium text-prune-700 hover:bg-prune-50">
            <Plus className="h-4 w-4" aria-hidden />{t('offer_templates.edit.add_criterion')}
          </button>
        )}
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-loam-900">{t('offer_templates.edit.levels')}</h3>
        {levels.map((level) => (
          <div key={level.key} className="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem] items-center gap-2">
            <span className="text-sm">{level.label || t(`offers.complexity.levels.${level.key}`)}</span>
            <NumberInput aria-label={t('offer_templates.edit.up_to')} title={t('offer_templates.edit.up_to')} value={level.up_to} unit="pts" onValue={(value) => setLevel(level, { up_to: value ?? 0 })} />
            <NumberInput aria-label={t('offer_templates.edit.factor')} title={t('offer_templates.edit.factor')} value={level.factor} unit="×" onValue={(value) => setLevel(level, { factor: value ?? 1 })} />
          </div>
        ))}
        <p className="text-xs text-loam-500">{t('offer_templates.edit.levels_help')}</p>
      </div>
    </div>
  )
}
