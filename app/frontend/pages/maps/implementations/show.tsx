import { Head, Link } from '@inertiajs/react'
import clsx from 'clsx'
import { CalendarRange, Check, Clock, Hammer, Leaf, Plus, Shovel, Sparkles, Sprout, Trash2, Truck, Wallet, X } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { MapViewHeader } from '@/components/map_views/MapViews'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/Card'
import { confirmAction } from '@/components/ui/confirm'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { phaseColor } from '@/implementation/colors'
import type { Advice, DraftPhase, ImplementationPlan, Phase, WorkGroup } from '@/implementation/types'
import { api, ApiError } from '@/lib/api'
import { formatNumber, t } from '@/lib/i18n'
import { formatPrice } from '@/lib/money'
import { formatMonth, formatMonthShort, isPlantingMonth, seasonOf } from '@/tasks/dates'
import { SEASON_TINT } from '@/tasks/parts'

type Props = {
  map: { id: number; name: string; role: string; teamId?: number | null; offerBuilder?: boolean }
  plan: ImplementationPlan
  canEdit: boolean
  today: string
}

const BUDGET_CAPS: Record<string, number> = { under_500: 50_000, up_to_2000: 200_000, up_to_5000: 500_000, up_to_15000: 1_500_000 }

const parseDay = (day: string) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const monthLabel = (day: string) => {
  const date = parseDay(day)
  return `${formatMonth(date.getFullYear(), date.getMonth())} ${date.getFullYear()}`
}
const hours = (n: number) => formatNumber(Math.round(n))

/**
 * « Mise en œuvre » of a map: the design built phase by phase, each in its
 * season, with its workload and cost set against the time and budget of the
 * project sheet. Semisto's phasing (Implementation::Proposal) fills an
 * empty plan in one click; everything stays editable. Everyone on the map
 * reads it; editors change it.
 */
export default function MapImplementation({ map, plan: initialPlan, canEdit, today }: Props) {
  const [plan, setPlan] = useState(initialPlan)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const base = `/maps/${map.id}/implementation`

  async function run<T extends { plan: ImplementationPlan }>(request: Promise<T>): Promise<T | null> {
    setBusy(true)
    try {
      const res = await request
      setPlan(res.plan)
      setError(null)
      return res
    } catch (e) {
      if (e instanceof ApiError && e.data.plan) setPlan(e.data.plan as ImplementationPlan)
      setError(e instanceof ApiError ? e.message : t('implementation.errors.generic'))
      return null
    } finally {
      setBusy(false)
    }
  }

  async function propose() {
    const res = await run(api<{ plan: ImplementationPlan; created: number; assigned: number }>(`${base}/proposal`, { method: 'POST' }))
    if (res) setNotice(t(res.created > 0 ? 'implementation.proposed' : 'implementation.proposed_none', { created: res.created, assigned: res.assigned }))
  }

  function addPhase() {
    const last = plan.phases[plan.phases.length - 1]
    const start = last ? parseDay(last.endsOn) : parseDay(today)
    const from = new Date(start.getFullYear(), start.getMonth() + (last ? 1 : 0), 1)
    const to = new Date(from.getFullYear(), from.getMonth() + 3, 0)
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    void run(api<{ plan: ImplementationPlan }>(`${base}/phases`, { method: 'POST', body: { phase: { name: t('implementation.new_phase_name'), starts_on: iso(from), ends_on: iso(to) } } }))
  }

  const updatePhase = (phase: Phase, attrs: Record<string, unknown>) =>
    run(api<{ plan: ImplementationPlan }>(`${base}/phases/${phase.id}`, { method: 'PATCH', body: { phase: { ...attrs, lock_version: phase.lockVersion } } }))
  const deletePhase = async (phase: Phase) => {
    const confirmed = await confirmAction({
      title: t('implementation.phase.delete_confirm', { name: phase.name }),
      body: t('implementation.phase.delete_body'),
      confirmLabel: t('implementation.phase.delete'),
      tone: 'danger',
    })
    if (!confirmed) return
    void run(api<{ plan: ImplementationPlan }>(`${base}/phases/${phase.id}`, { method: 'DELETE' }))
  }
  const review = (draft: DraftPhase, verdict: 'accept' | 'reject') => void run(api<{ plan: ImplementationPlan }>(`${base}/phases/${draft.id}/${verdict}`, { method: 'POST' }))
  const assign = (featureIds: number[], phaseId: number | null, planned = false) =>
    run(api<{ plan: ImplementationPlan }>(`${base}/assign`, { method: 'POST', body: { feature_ids: featureIds, phase_id: phaseId, planned } }))

  const empty = plan.totals.count === 0 && plan.phases.length === 0

  return (
    <div className="mx-auto max-w-4xl">
      <Head title={t('implementation.page_title', { map: map.name })} />
      <MapViewHeader map={map} current="implementation" />
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <h1 className="text-2xl">{t('implementation.title')}</h1>
        {plan.totals.count > 0 && (
          <p className="text-sm font-medium text-loam-700">{t('implementation.totals.progress', { done: plan.totals.done, count: plan.totals.count })}</p>
        )}
      </div>
      <p className="mt-2 max-w-2xl text-loam-600">{t('implementation.intro')}</p>
      {!canEdit && <p className="mt-2 text-sm text-loam-500">{t('implementation.read_only')}</p>}

      {error && <p role="alert" className="mt-4 rounded-xl bg-clay-50 px-4 py-2 text-sm text-clay-700">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-xl bg-leaf-50 px-4 py-2 text-sm text-leaf-800">{notice}</p>}

      <Summary plan={plan} mapId={map.id} />

      {plan.advice.length > 0 && (
        <ul className="mt-4 space-y-2">
          {plan.advice.map((advice) => (
            <li key={advice.code} className="rounded-2xl bg-humus-50 px-4 py-3 text-sm text-loam-800 ring-1 ring-humus-200">
              <AdviceText advice={advice} />
              {advice.code === 'drawn_as_existing' && canEdit && (
                <Button size="sm" variant="secondary" className="mt-2" disabled={busy} onClick={() => void assign(plan.drawnAsExisting, null, true)}>
                  <Hammer className="h-4 w-4" />{t('implementation.advice.drawn_as_existing_action')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {plan.drafts.length > 0 && (
        <section aria-labelledby="drafts-title" className="mt-6 space-y-3">
          <h2 id="drafts-title" className="flex items-center gap-2 font-serif text-lg font-semibold text-prune-800">
            <Sparkles className="h-5 w-5" aria-hidden />{t('implementation.drafts.title')}
          </h2>
          {plan.drafts.map((draft) => (
            <article key={draft.id} className="rounded-2xl border border-dashed border-prune-300 bg-prune-50/60 p-4">
              <p className="text-sm text-loam-500">{t('implementation.phase.from_to', { from: monthLabel(draft.startsOn), to: monthLabel(draft.endsOn) })}</p>
              <h3 className="font-serif text-xl text-prune-800">{draft.name}</h3>
              {draft.rationale && <p className="mt-2 text-sm text-loam-800"><span className="font-medium">{t('implementation.drafts.why')}</span> {draft.rationale}</p>}
              {draft.notes && <p className="mt-1 whitespace-pre-line text-sm text-loam-600">{draft.notes}</p>}
              <p className="mt-2 text-sm text-loam-700">
                {t('implementation.phase.hours_estimate', { hours: hours(draft.hours.estimated) })}
                {draft.costCents > 0 && <> · {formatPrice(draft.costCents)}</>}
              </p>
              {draft.groups.length > 0 && <Groups groups={draft.groups} phases={[]} current={null} canEdit={false} onMove={() => {}} />}
              {canEdit && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="leaf" disabled={busy} onClick={() => review(draft, 'accept')}><Check className="h-4 w-4" />{t('implementation.drafts.accept')}</Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => review(draft, 'reject')}><X className="h-4 w-4" />{t('implementation.drafts.reject')}</Button>
                </div>
              )}
            </article>
          ))}
        </section>
      )}

      {plan.phases.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={t('implementation.empty.title')}
            action={canEdit && (
              <div className="flex flex-wrap justify-center gap-2">
                {!empty && <Button disabled={busy} onClick={() => void propose()}><Sprout className="h-4 w-4" />{t('implementation.empty.propose')}</Button>}
                <Button variant="secondary" disabled={busy} onClick={addPhase}>{t('implementation.empty.add')}</Button>
              </div>
            )}
          >
            <p className="max-w-xl">{empty ? t('implementation.empty.nothing') : t('implementation.empty.body')}</p>
          </EmptyState>
        </div>
      ) : (
        <>
          <Timeline phases={plan.phases} today={today} />
          <ol className="mt-6 space-y-4">
            {plan.phases.map((phase, index) => (
              <li key={phase.id}>
                <PhaseCard
                  phase={phase} index={index} phases={plan.phases} canEdit={canEdit} busy={busy}
                  onUpdate={(attrs) => updatePhase(phase, attrs)} onDelete={() => deletePhase(phase)}
                  onMove={(ids, phaseId) => void assign(ids, phaseId)}
                />
              </li>
            ))}
          </ol>
          {canEdit && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" disabled={busy} onClick={addPhase}><Plus className="h-4 w-4" />{t('implementation.add_phase')}</Button>
              {plan.unassigned.groups.length > 0 && (
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => void propose()}><Sprout className="h-4 w-4" />{t('implementation.propose_again')}</Button>
              )}
            </div>
          )}
        </>
      )}

      {plan.unassigned.groups.length > 0 && (
        <section className="mt-8 rounded-2xl bg-white/70 p-4 ring-1 ring-loam-900/10">
          <h2 className="font-serif text-lg font-semibold text-prune-800">{t('implementation.unassigned.title')}</h2>
          <p className="mt-1 text-sm text-loam-600">{t('implementation.unassigned.body')}</p>
          <Groups groups={plan.unassigned.groups} phases={plan.phases} current={null} canEdit={canEdit && plan.phases.length > 0} onMove={(ids, id) => void assign(ids, id)} />
        </section>
      )}
    </div>
  )
}

function Summary({ plan, mapId }: { plan: ImplementationPlan; mapId: number }) {
  const { sheet } = plan
  const cap = sheet.budgetInitial ? BUDGET_CAPS[sheet.budgetInitial] : undefined
  return (
    <section className="mt-6 grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl bg-white/70 p-4 ring-1 ring-loam-900/10">
        <p className="flex items-center gap-2 text-sm text-loam-500"><Clock className="h-4 w-4" aria-hidden />{t('implementation.phase.hours')}</p>
        <p className="mt-1 font-serif text-2xl text-prune-800">{t('implementation.totals.hours', { hours: hours(plan.totals.hours) })}</p>
      </div>
      <div className="rounded-2xl bg-white/70 p-4 ring-1 ring-loam-900/10">
        <p className="flex items-center gap-2 text-sm text-loam-500"><Wallet className="h-4 w-4" aria-hidden />{t('implementation.phase.cost')}</p>
        <p className="mt-1 font-serif text-2xl text-prune-800">{t('implementation.totals.cost', { cost: formatPrice(plan.totals.costCents) })}</p>
        {cap && <p className="mt-1 text-sm text-loam-500">{t('implementation.sheet.budget', { cap: formatPrice(cap) })}</p>}
      </div>
      <div className="rounded-2xl bg-white/70 p-4 text-sm text-loam-700 ring-1 ring-loam-900/10">
        {sheet.hoursPerWeek != null ? (
          <>
            <p>{t('implementation.sheet.hours_per_week', { hours: sheet.hoursPerWeek })}</p>
            {sheet.seasons.length > 0 && (
              <p className="mt-1 text-loam-500">{t('implementation.sheet.seasons', { seasons: sheet.seasons.map((s) => t(`implementation.seasons.${s}`)).join(', ') })}</p>
            )}
          </>
        ) : (
          <p>{t('implementation.sheet.missing')}</p>
        )}
        <Link href={`/maps/${mapId}/project`} className="mt-1 inline-block font-medium text-prune-700 hover:underline">{t('implementation.sheet.open')}</Link>
      </div>
    </section>
  )
}

/** The months covered by the phases, tinted by season, with each phase as a bar. */
function Timeline({ phases, today }: { phases: Phase[]; today: string }) {
  const months = useMemo(() => {
    const first = parseDay(phases.reduce((min, p) => (p.startsOn < min ? p.startsOn : min), phases[0].startsOn))
    const last = parseDay(phases.reduce((max, p) => (p.endsOn > max ? p.endsOn : max), phases[0].endsOn))
    const count = Math.min(48, (last.getFullYear() - first.getFullYear()) * 12 + last.getMonth() - first.getMonth() + 1)
    return Array.from({ length: Math.max(count, 1) }, (_, i) => new Date(first.getFullYear(), first.getMonth() + i, 1))
  }, [phases])
  const index = (day: string) => {
    const d = parseDay(day)
    return (d.getFullYear() - months[0].getFullYear()) * 12 + d.getMonth() - months[0].getMonth()
  }
  const todayIndex = index(today)
  const columns = { gridTemplateColumns: `repeat(${months.length}, minmax(2.25rem, 1fr))` }
  return (
    <section aria-labelledby="timeline-title" className="mt-6 rounded-2xl bg-white/70 px-4 py-3 ring-1 ring-loam-900/10">
      <h2 id="timeline-title" className="flex items-center gap-2 font-serif text-lg font-semibold text-prune-800">
        <CalendarRange className="h-5 w-5" aria-hidden />{t('implementation.timeline.title')}
      </h2>
      <div className="-mx-1 mt-2 overflow-x-auto px-1 pb-1">
        <div className="grid gap-y-1" style={{ ...columns, minWidth: `${months.length * 2.25}rem` }}>
          {months.map((month, i) => (
            <div key={`m${i}`} className="flex flex-col items-center">
              <span className="h-5 whitespace-nowrap text-sm text-loam-500">{month.getMonth() === 0 || i === 0 ? month.getFullYear() : ''}</span>
              <span className={clsx('flex h-9 w-full items-center justify-center rounded-lg text-sm capitalize text-loam-700', SEASON_TINT[seasonOf(month.getMonth())], i === todayIndex && 'ring-[1.5px] ring-prune-400')}>
                {formatMonthShort(month.getFullYear(), month.getMonth())}
              </span>
              <span className={clsx('mt-1 h-1 w-full rounded-full', isPlantingMonth(month.getMonth()) ? 'bg-leaf-500' : 'bg-transparent')} aria-hidden />
            </div>
          ))}
          {phases.map((phase, i) => {
            const from = Math.max(0, index(phase.startsOn))
            const to = Math.min(months.length - 1, index(phase.endsOn))
            return (
              <div
                key={phase.id} className="truncate rounded-full px-3 py-1 text-sm font-medium text-white"
                style={{ gridColumn: `${from + 1} / ${to + 2}`, backgroundColor: phaseColor(i) }}
                title={phase.name}
              >
                {i + 1}. {phase.name}
              </div>
            )
          })}
        </div>
      </div>
      <p className="mt-2 flex items-center gap-2 text-sm text-loam-500">
        <span className="inline-block h-1 w-6 rounded-full bg-leaf-500" aria-hidden />{t('implementation.timeline.planting_window')}
      </p>
    </section>
  )
}

function PhaseCard({ phase, index, phases, canEdit, busy, onUpdate, onDelete, onMove }: {
  phase: Phase; index: number; phases: Phase[]; canEdit: boolean; busy: boolean
  onUpdate: (attrs: Record<string, unknown>) => Promise<unknown>; onDelete: () => void; onMove: (ids: number[], phaseId: number | null) => void
}) {
  const [open, setOpen] = useState(false)
  const over = phase.available != null && phase.hours.total > phase.available.hours
  const progress = phase.count > 0 ? Math.round((phase.done / phase.count) * 100) : 0
  return (
    <article className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-loam-900/10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-loam-500">{t('implementation.phase.from_to', { from: monthLabel(phase.startsOn), to: monthLabel(phase.endsOn) })}</p>
          <h2 className="mt-0.5 flex items-center gap-2 font-serif text-xl text-prune-800">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-sans text-sm font-semibold text-white" style={{ backgroundColor: phaseColor(index) }}>{index + 1}</span>
            {canEdit ? (
              <input
                aria-label={t('implementation.phase.rename')} defaultValue={phase.name} key={`${phase.id}-${phase.lockVersion}`}
                className="min-w-0 flex-1 rounded-md border-0 bg-transparent px-1 py-0 font-serif text-xl text-prune-800 hover:bg-loam-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-prune-300"
                onBlur={(e) => { const name = e.target.value.trim(); if (name && name !== phase.name) void onUpdate({ name }) }}
              />
            ) : phase.name}
          </h2>
        </div>
        {phase.count > 0 && <p className="text-sm font-medium text-loam-700">{t('implementation.phase.progress', { done: phase.done, count: phase.count })}</p>}
      </header>
      {phase.count > 0 && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-loam-100" aria-hidden>
          <div className="h-full rounded-full bg-leaf-500" style={{ width: `${progress}%` }} />
        </div>
      )}
      {phase.notes && <p className="mt-3 whitespace-pre-line text-sm text-loam-600">{phase.notes}</p>}

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">{t('implementation.phase.hours')}</dt>
          <Clock className="h-4 w-4 text-loam-400" aria-hidden />
          <dd className={clsx(over ? 'font-semibold text-clay-700' : 'text-loam-700')}>
            {phase.hoursOverride != null ? `${hours(phase.hoursOverride)} h` : t('implementation.phase.hours_estimate', { hours: hours(phase.hours.estimated) })}
            {phase.available && <span className="font-normal text-loam-500"> · {t('implementation.phase.available', { hours: hours(phase.available.hours) })}</span>}
          </dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">{t('implementation.phase.cost')}</dt>
          <Wallet className="h-4 w-4 text-loam-400" aria-hidden />
          <dd className="text-loam-700">
            {formatPrice(phase.costCents)}
            {phase.plantsCostCents > 0 && <span className="text-loam-500"> · {t('implementation.phase.plants_cost', { cost: formatPrice(phase.plantsCostCents) })}</span>}
          </dd>
        </div>
        {phase.unpricedPlants > 0 && <p className="text-loam-500">{t('implementation.phase.unpriced', { count: phase.unpricedPlants })}</p>}
      </dl>

      {phase.advice.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {phase.advice.map((advice, i) => (
            <li key={i} className="flex gap-2 rounded-xl bg-humus-50 px-3 py-2 text-sm text-loam-800">
              <Leaf className="mt-0.5 h-4 w-4 shrink-0 text-humus-600" aria-hidden />
              <AdviceText advice={advice} />
            </li>
          ))}
        </ul>
      )}

      {phase.groups.length > 0
        ? <Groups groups={phase.groups} phases={phases} current={phase.id} canEdit={canEdit} onMove={onMove} />
        : <p className="mt-3 text-sm text-loam-500">{t('implementation.phase.empty')}</p>}

      {canEdit && (
        <div className="mt-3 border-t border-loam-100 pt-3">
          <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {t('implementation.phase.details')}
          </Button>
          {open && <PhaseForm phase={phase} busy={busy} onUpdate={onUpdate} onDelete={onDelete} />}
        </div>
      )}
    </article>
  )
}

function PhaseForm({ phase, busy, onUpdate, onDelete }: {
  phase: Phase; busy: boolean; onUpdate: (attrs: Record<string, unknown>) => Promise<unknown>; onDelete: () => void
}) {
  const [startsOn, setStartsOn] = useState(phase.startsOn)
  const [endsOn, setEndsOn] = useState(phase.endsOn)
  const [notes, setNotes] = useState(phase.notes ?? '')
  const [override, setOverride] = useState(phase.hoursOverride?.toString() ?? '')
  const [other, setOther] = useState(phase.otherCostsCents != null ? String(phase.otherCostsCents / 100) : '')
  function save(event: FormEvent) {
    event.preventDefault()
    void onUpdate({
      starts_on: startsOn, ends_on: endsOn, notes,
      hours_override: override === '' ? null : Math.round(Number(override)),
      other_costs_cents: other === '' ? null : Math.round(Number(other.replace(',', '.')) * 100),
    })
  }
  return (
    <form onSubmit={save} className="mt-3 grid gap-3 sm:grid-cols-2">
      <Field label={t('implementation.phase.starts_on')}><Input type="date" required value={startsOn} onChange={(e) => setStartsOn(e.target.value)} /></Field>
      <Field label={t('implementation.phase.ends_on')}><Input type="date" required value={endsOn} min={startsOn} onChange={(e) => setEndsOn(e.target.value)} /></Field>
      <Field label={t('implementation.phase.hours_override')} hint={t('implementation.phase.hours_override_hint')}>
        <Input type="number" min={0} step={1} inputMode="numeric" value={override} placeholder={hours(phase.hours.estimated)} onChange={(e) => setOverride(e.target.value)} />
      </Field>
      <Field label={t('implementation.phase.other_costs')} hint={t('implementation.phase.other_costs_hint')}>
        <Input type="number" min={0} step="any" inputMode="decimal" value={other} onChange={(e) => setOther(e.target.value)} />
      </Field>
      <Field label={t('implementation.phase.notes')} className="sm:col-span-2">
        <Textarea rows={3} value={notes} placeholder={t('implementation.phase.notes_placeholder')} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex flex-wrap justify-between gap-2 sm:col-span-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDelete}><Trash2 className="h-4 w-4" />{t('implementation.phase.delete')}</Button>
        <Button type="submit" size="sm" disabled={busy}>{t('common.save')}</Button>
      </div>
    </form>
  )
}

const LAYER_ICON = { water: Shovel, access: Truck, structures: Hammer, plants: Sprout, animals: Leaf, networks: Hammer } as const

function Groups({ groups, phases, current, canEdit, onMove }: {
  groups: WorkGroup[]; phases: Phase[]; current: number | null; canEdit: boolean; onMove: (ids: number[], phaseId: number | null) => void
}) {
  return (
    <ul className="mt-3 divide-y divide-loam-100">
      {groups.map((group) => {
        const Icon = LAYER_ICON[group.layer as keyof typeof LAYER_ICON] ?? Hammer
        const name = group.label ?? (group.kind === 'plant' ? t('implementation.groups.unknown_plant') : t(`editor.kinds.${group.kind}`))
        return (
          <li key={group.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
            <Icon className="h-4 w-4 shrink-0 text-loam-400" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="font-medium text-loam-800">{name}</span>
              {group.count > 1 && <span className="text-loam-500"> × {group.count}</span>}
              {group.per !== 'each' && group.quantity > 0 && <span className="text-loam-500"> · {t(`implementation.groups.per.${group.per}`, { quantity: formatNumber(Math.round(group.quantity)) })}</span>}
              {group.names.length > 0 && group.label == null && <span className="block truncate text-loam-500">{group.names.join(', ')}</span>}
            </span>
            {group.done > 0 && <span className="text-leaf-700">{t('implementation.groups.done', { done: group.done })}</span>}
            <span className={clsx('tabular-nums', group.machine ? 'text-humus-700' : 'text-loam-600')}>
              {group.machine ? t('implementation.groups.machine') : group.unknown ? t('implementation.groups.unknown') : t('implementation.groups.hours', { hours: formatNumber(group.hours) })}
            </span>
            {canEdit && (
              <select
                aria-label={t(current ? 'implementation.groups.move' : 'implementation.groups.put')}
                className="max-w-44 rounded-full border-0 bg-loam-50 py-1 pl-3 pr-8 text-sm text-loam-700 ring-1 ring-inset ring-loam-200 focus:ring-2 focus:ring-prune-300"
                value="" onChange={(e) => onMove(group.featureIds, e.target.value === 'none' ? null : Number(e.target.value))}
              >
                <option value="" disabled>{t(current ? 'implementation.groups.move' : 'implementation.groups.put')}</option>
                {phases.filter((p) => p.id !== current).map((p) => <option key={p.id} value={p.id}>{phases.indexOf(p) + 1}. {p.name}</option>)}
                {current != null && <option value="none">{t('implementation.groups.none')}</option>}
              </select>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function AdviceText({ advice }: { advice: Advice }) {
  switch (advice.code) {
    case 'season': return <span>{t(`implementation.advice.season.${advice.season}`, { count: advice.count })}</span>
    case 'machine': return <span>{t('implementation.advice.machine', { count: advice.count })}</span>
    case 'time': return <span>{t('implementation.advice.time', { weeks: advice.weeks, available: hours(advice.available) })}</span>
    case 'availability': return <span>{t('implementation.advice.availability', { seasons: advice.seasons.map((s) => t(`implementation.seasons.${s}`)).join(', ') })}</span>
    case 'drawn_as_existing': return <span>{t('implementation.advice.drawn_as_existing', { count: advice.count })}</span>
    case 'budget': return <span>{t('implementation.advice.budget', { cost: formatPrice(advice.costCents), cap: formatPrice(advice.capCents) })}</span>
  }
}
