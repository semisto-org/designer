import { Head, Link, router, usePage } from '@inertiajs/react'
import clsx from 'clsx'
import { Car, Clock } from 'lucide-react'
import { PlanGate } from '@/components/billing/PlanGate'
import { EmptyState } from '@/components/ui/Card'
import { HandNote } from '@/components/ui/HandNote'
import { MapViewHeader } from '@/components/map_views/MapViews'
import { HelpButton } from '@/components/help/HelpButton'
import { tf } from '@/lib/content'
import { formatNumber, t } from '@/lib/i18n'
import { EntryForm } from '@/time_entries/EntryForm'
import { EntryList } from '@/time_entries/EntryList'
import { formatDuration, formatHours } from '@/time_entries/format'
import type { Catalog, Envelopes, PhaseEnvelope, ProjectChoice, TimeEntry } from '@/time_entries/types'
import type { CurrentUser } from '@/types'
import type { SketchGeometry } from '@/types/myMaps'

type Props = {
  map: { id: number; name: string; role: string; teamId: number | null; offerBuilder: boolean }
  place: { id: number; name: string; boundary?: SketchGeometry | null; areaM2?: number | null }
  canUse: boolean
  canUpgrade: boolean
  canWrite?: boolean
  envelopes?: Envelopes
  entries?: TimeEntry[]
  me?: ProjectChoice
  billToSuggestions?: string[]
  catalog?: Catalog
  today?: string
}

/**
 * « Temps et dépenses » of a project: each phase against the hours of the
 * accepted offer, who did what, and a line to note one's own time. For the
 * team that runs the project, never for its client.
 */
export default function ProjectTime(props: Props) {
  const { currentUser } = usePage().props as unknown as { currentUser: CurrentUser }
  const { map } = props
  const header = <MapViewHeader map={{ ...map, timeEntries: true }} current="time" />

  if (!props.canUse || !props.envelopes || !props.entries || !props.me || !props.catalog || !props.today) {
    return (
      <div className="mx-auto max-w-4xl">
        <Head title={t('time_entries.project.page_title', { map: map.name })} />
        {header}
        <PlanGate feature="time" place={props.place} canUpgrade={props.canUpgrade} />
      </div>
    )
  }

  const { envelopes, entries, me, catalog, today } = props
  const reload = () => router.reload({ only: ['envelopes', 'entries', 'me', 'billToSuggestions'] })
  const overHours = Object.fromEntries(envelopes.phases.map((p) => [p.key, p.overHours]))
  const shown = envelopes.phases.filter((p) => p.envelopeHours != null || p.hours > 0)

  return (
    <div className="mx-auto max-w-4xl">
      <Head title={t('time_entries.project.page_title', { map: map.name })} />
      {header}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl">{t('time_entries.project.title')}</h1>
        <HelpButton slug="suivre-son-temps-et-ses-kilometres" />
      </div>
      <p className="mt-1 text-loam-600">{tf('time_entries.project.intro')}</p>

      <section aria-labelledby="phases" className="mt-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-loam-900/10 sm:p-5">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="phases" className="font-serif text-xl font-semibold text-prune-800">
            {envelopes.version ? t('time_entries.project.from_version', { version: envelopes.version.label }) : t('time_entries.project.title')}
          </h2>
          <p className="text-sm text-loam-600">{t('time_entries.project.totals', { duration: formatHours(envelopes.totals.hours), km: formatNumber(envelopes.totals.km) })}</p>
        </header>
        {!envelopes.version && (
          <p className="mt-2 text-sm text-loam-600">
            {tf('time_entries.project.no_offer')}{' '}
            {map.offerBuilder && <Link href={`/maps/${map.id}/offer`} className="font-medium text-prune-700 hover:underline">{t('time_entries.project.to_offer')}</Link>}
          </p>
        )}
        {shown.length > 0 && <ul className="mt-4 space-y-4">{shown.map((phase) => <PhaseBar key={phase.key} phase={phase} />)}</ul>}
      </section>

      {props.canWrite ? (
        <section aria-labelledby="note-time" className="mt-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-loam-900/10 sm:p-5">
          <h2 id="note-time" className="font-serif text-xl font-semibold text-prune-800">{t('time_entries.form.title')}</h2>
          <div className="mt-3">
            <EntryForm projects={[me]} catalog={catalog} billToSuggestions={props.billToSuggestions ?? []} today={today} overHours={overHours} onDone={reload} />
          </div>
        </section>
      ) : (
        <p className="mt-6 rounded-xl bg-loam-50 px-4 py-3 text-sm text-loam-700 ring-1 ring-loam-900/10">{t('time_entries.project.read_only')}</p>
      )}

      {envelopes.people.length > 0 && (
        <section aria-labelledby="people" className="mt-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-loam-900/10 sm:p-5">
          <h2 id="people" className="font-serif text-xl font-semibold text-prune-800">{t('time_entries.project.people_title')}</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="text-left text-loam-500">
                  <th className="py-1.5 pr-3 font-medium" scope="col"><span className="sr-only">{t('time_entries.form.project')}</span></th>
                  {catalog.phases.map((p) => <th key={p} scope="col" className="px-2 py-1.5 text-right font-medium">{t(`time_entries.phases.${p}`)}</th>)}
                  <th scope="col" className="px-2 py-1.5 text-right font-medium">{t('time_entries.project.people_hours')}</th>
                  <th scope="col" className="py-1.5 pl-2 text-right font-medium">{t('time_entries.project.people_km')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-loam-900/5">
                {envelopes.people.map((person) => (
                  <tr key={person.userId}>
                    <th scope="row" className="py-2 pr-3 text-left font-medium text-loam-900">{person.name}</th>
                    {catalog.phases.map((p) => <td key={p} className="px-2 py-2 text-right tabular-nums text-loam-700">{person.byPhase[p] ? formatHours(person.byPhase[p]) : '—'}</td>)}
                    <td className="px-2 py-2 text-right font-semibold tabular-nums">{formatHours(person.hours)}</td>
                    <td className="py-2 pl-2 text-right tabular-nums text-loam-700">
                      {person.km > 0 ? <span className="inline-flex items-center gap-1"><Car className="h-3.5 w-3.5 text-loam-400" aria-hidden />{formatNumber(person.km)}</span> : '—'}
                      {person.trips > 0 && <span className="block text-loam-500">{t('time_entries.project.people_trips', { count: person.trips })}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section aria-labelledby="entries" className="mt-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-loam-900/10 sm:p-5">
        <h2 id="entries" className="font-serif text-xl font-semibold text-prune-800">{t('time_entries.project.entries_title')}</h2>
        {entries.length === 0 ? (
          <div className="mt-3"><EmptyState title={tf('time_entries.project.empty_title')}>{tf('time_entries.project.empty')}</EmptyState></div>
        ) : (
          <div className="mt-2">
            <EntryList entries={entries} userId={currentUser.id} show="person" projects={[me]} catalog={catalog} billToSuggestions={props.billToSuggestions ?? []} today={today} onChanged={reload} />
          </div>
        )}
      </section>

      <p className="mt-6 text-sm text-loam-500">{tf('time_entries.project.expenses_soon')}</p>
    </div>
  )
}

/** One phase: what was noted (billable full, the rest hatched) against its envelope. */
function PhaseBar({ phase }: { phase: PhaseEnvelope }) {
  const envelope = phase.envelopeHours
  const scale = Math.max(envelope ?? 0, phase.hours, 0.01)
  const billablePct = (phase.billableHours / scale) * 100
  const otherPct = (phase.nonBillableHours / scale) * 100
  const envelopePct = envelope != null ? (envelope / scale) * 100 : null
  const over = phase.overHours != null && phase.overHours > 0
  const remaining = envelope != null && !over ? envelope - phase.hours : null
  return (
    <li>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="font-medium text-loam-900">
          {t(`time_entries.phases.${phase.key}`)}
          {phase.enabledInOffer === false && <span className="ml-2 text-sm font-normal text-loam-500">{t('time_entries.project.out_of_offer')}</span>}
        </p>
        <p className="text-sm tabular-nums text-loam-700">
          {envelope != null
            ? t('time_entries.project.phase_line', { spent: formatHours(phase.hours), envelope: formatHours(envelope) })
            : t('time_entries.project.phase_no_envelope', { spent: formatHours(phase.hours) })}
        </p>
      </div>
      <div className="relative mt-1.5 h-3 overflow-hidden rounded-full bg-loam-100" aria-hidden>
        <div className={clsx('absolute inset-y-0 left-0', over ? 'bg-clay-500' : envelope == null ? 'bg-loam-400' : 'bg-leaf-500')} style={{ width: `${billablePct}%` }} />
        <div
          className="absolute inset-y-0 bg-humus-300"
          style={{ left: `${billablePct}%`, width: `${otherPct}%`, backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 3px, rgb(255 255 255 / 0.6) 3px 6px)' }}
        />
        {envelopePct != null && envelopePct < 100 && <div className="absolute inset-y-0 w-0.5 bg-loam-900/60" style={{ left: `${envelopePct}%` }} />}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-loam-500">
        {phase.nonBillableHours > 0 && <span>{t('time_entries.project.non_billable', { hours: formatHours(phase.nonBillableHours) })}</span>}
        {(phase.km > 0 || (phase.envelopeKm ?? 0) > 0) && (
          <span className="inline-flex items-center gap-1">
            <Car className="h-3.5 w-3.5" aria-hidden />
            {phase.envelopeKm ? t('time_entries.project.km_line', { km: formatNumber(phase.km), envelope: formatNumber(phase.envelopeKm) }) : t('time_entries.project.km_no_envelope', { km: formatNumber(phase.km) })}
          </span>
        )}
      </div>
      {over && <p className="mt-1 -rotate-1 font-hand text-xl leading-tight text-clay-700">{t('time_entries.project.over', { hours: formatHours(phase.overHours!) })}</p>}
      {remaining != null && remaining > 0 && phase.hours > 0 && (
        <HandNote tone="leaf" className="mt-1"><Clock className="mr-1 inline h-4 w-4" aria-hidden />{t('time_entries.project.remaining', { hours: formatDuration(remaining * 60) })}</HandNote>
      )}
    </li>
  )
}
