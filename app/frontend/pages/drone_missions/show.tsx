import { Head, Link, router, useForm } from '@inertiajs/react'
import clsx from 'clsx'
import { ArrowLeft, Check, Download, Footprints, Map as MapIcon, Phone } from 'lucide-react'
import type { FormEvent, ReactNode } from 'react'
import { Avatar } from '@/collab/Avatar'
import { Button, ButtonLink } from '@/components/ui/Button'
import { confirmAction } from '@/components/ui/confirm'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { HandNote } from '@/components/ui/HandNote'
import { Pill } from '@/components/ui/Pill'
import { Breakdown } from '@/drone_pilots/Breakdown'
import { Delivery } from '@/drone_pilots/Delivery'
import { STATUS_TONES } from '@/drone_pilots/catalog'
import { t, translations } from '@/lib/i18n'
import { formatBytes, formatDate, formatPrice } from '@/lib/money'
import type { MissionDetail, MissionStatus } from '@/types/drone_pilots'

const STEPS: MissionStatus[] = ['requested', 'accepted', 'paid', 'delivered', 'completed']

/**
 * A drone mission, for its client and its pilot: where it stands, what was
 * asked, and the next step for whoever has it (answer, pay, fly and
 * deliver, confirm). Around the flight day, it sends both outside.
 */
export default function DroneMission({ mission }: { mission: MissionDetail }) {
  const pilotSide = mission.role === 'pilot'
  const decide = (decision: string, extra: Record<string, string> = {}) =>
    router.patch(`/missions-drone/${mission.id}`, { drone_mission: { decision, ...extra } }, { preserveScroll: true })

  return (
    <div className="mx-auto max-w-4xl">
      <Head title={t('drone_missions.show.title', { map: mission.map.name })} />
      <Link href="/missions-drone" className="inline-flex items-center gap-1 text-sm font-medium text-prune-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden />{t('drone_missions.title')}
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl">{t('drone_missions.show.title', { map: mission.map.name })}</h1>
        <Pill tone={mission.disputed ? 'clay' : STATUS_TONES[mission.status]}>
          {mission.disputed ? t('drone_missions.disputed') : t(`drone_missions.statuses.${mission.status}`)}
        </Pill>
      </div>

      <Steps mission={mission} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <div className="space-y-6">
          <NextStep mission={mission} decide={decide} />
          {mission.canDeliver && <Delivery mission={mission} />}
          {(mission.status === 'accepted' || mission.status === 'paid') && <FlightDay pilotSide={pilotSide} />}
          <Delivered mission={mission} />

          <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-loam-900/10 sm:p-6">
            <h2 className="text-xl">{t('drone_missions.show.request')}</h2>
            <div className="flex flex-wrap gap-1.5">
              {mission.dataTypes.map((type) => <Pill key={type} tone="lichen">{t(`drone_pilots.data_types.${type}.name`)}</Pill>)}
            </div>
            {mission.desiredPeriod && <p className="text-sm text-loam-700">{t('drone_missions.show.period', { period: mission.desiredPeriod })}</p>}
            <Quote>{mission.message}</Quote>
            {mission.pilotReply && (
              <div className="space-y-1">
                <p className="text-sm text-loam-500">{t('drone_missions.show.reply', { name: mission.pilot.name })}</p>
                <Quote>{mission.pilotReply}</Quote>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <Person
            title={pilotSide ? t('drone_missions.show.client') : t('drone_missions.show.pilot')}
            name={pilotSide ? mission.client.name : mission.pilot.name}
            avatarUrl={pilotSide ? mission.client.avatarUrl : mission.pilot.avatarUrl}
            email={pilotSide ? mission.client.email : mission.pilot.email}
            phone={pilotSide ? null : mission.pilot.phone}
            href={pilotSide ? undefined : `/pilotes-drone/${mission.pilot.id}`}
          />
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-loam-900/10">
            <p className="flex items-center gap-1.5 font-medium text-loam-900"><MapIcon className="h-4 w-4" aria-hidden />{mission.map.name}</p>
            {mission.map.address && <p className="mt-0.5 text-sm text-loam-600">{mission.map.address}</p>}
            <ButtonLink href={`/maps/${mission.map.id}`} size="sm" variant="ghost" className="mt-2">{t('drone_missions.show.open_map')}</ButtonLink>
          </div>
          <Breakdown quote={mission.quote} />
          {pilotSide && <p className="px-1 text-sm font-medium text-loam-800">{t('drone_missions.show.your_share', { amount: formatPrice(mission.quote.pilotShareCents) })}</p>}
        </aside>
      </div>
    </div>
  )
}

function Steps({ mission }: { mission: MissionDetail }) {
  const closed = ['declined', 'cancelled', 'refunded'].includes(mission.status)
  const reached = STEPS.indexOf(mission.status)
  if (closed) return <p className="mt-4 rounded-xl bg-loam-100 px-4 py-3 text-sm text-loam-700">{t(`drone_missions.show.closed.${mission.status}`)}</p>
  return (
    <ol className="mt-5 grid grid-cols-5 gap-1" aria-label={t('drone_missions.show.steps')}>
      {STEPS.map((step, index) => (
        <li key={step} className="space-y-1.5">
          <div className={clsx('h-1.5 rounded-full', index <= reached ? 'bg-leaf-500' : 'bg-loam-200')} />
          <p className={clsx('text-sm', index === reached ? 'font-medium text-loam-900' : 'text-loam-500')}>{t(`drone_missions.steps.${step}`)}</p>
        </li>
      ))}
    </ol>
  )
}

/** The one thing to do now, for whoever has it. */
function NextStep({ mission, decide }: { mission: MissionDetail; decide: (decision: string, extra?: Record<string, string>) => void }) {
  const pilotSide = mission.role === 'pilot'
  const answer = useForm({ flight_on: '', text: '' })
  const cancel = async () => {
    if (await confirmAction({ title: t('drone_missions.show.cancel_confirm'), body: t('drone_missions.show.cancel_body'), confirmLabel: t('drone_missions.show.cancel'), tone: 'danger' })) decide('cancel')
  }

  if (pilotSide && mission.status === 'requested') {
    const accept = (event: FormEvent) => {
      event.preventDefault()
      decide('accept', { flight_on: answer.data.flight_on, text: answer.data.text })
    }
    return (
      <Card title={t('drone_missions.show.answer_title')} lead={t('drone_missions.show.answer_lead', { client: mission.client.name })}>
        <form onSubmit={accept} className="space-y-3">
          <Field label={t('drone_missions.show.flight_on')} hint={t('drone_missions.show.flight_on_hint')}>
            <Input type="date" value={answer.data.flight_on} onChange={(e) => answer.setData('flight_on', e.target.value)} />
          </Field>
          <Field label={t('drone_missions.show.answer_text')}>
            <Textarea rows={3} maxLength={3000} value={answer.data.text} onChange={(e) => answer.setData('text', e.target.value)} />
          </Field>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={async () => {
              if (await confirmAction({ title: t('drone_missions.show.decline_confirm'), confirmLabel: t('drone_missions.show.decline'), tone: 'danger' })) decide('decline', { text: answer.data.text })
            }}>{t('drone_missions.show.decline')}</Button>
            <Button type="submit"><Check className="h-4 w-4" />{t('drone_missions.show.accept')}</Button>
          </div>
        </form>
      </Card>
    )
  }
  if (!pilotSide && mission.status === 'requested') {
    return (
      <Card title={t('drone_missions.show.waiting_title')} lead={t('drone_missions.show.waiting_lead', { pilot: mission.pilot.name })}>
        <Button variant="ghost" size="sm" onClick={cancel}>{t('drone_missions.show.cancel')}</Button>
      </Card>
    )
  }
  if (!pilotSide && mission.status === 'accepted') {
    return (
      <Card title={t('drone_missions.show.pay_title')} lead={mission.flightOn ? t('drone_missions.show.pay_lead_date', { date: formatDate(mission.flightOn) }) : t('drone_missions.show.pay_lead')}>
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={!mission.paymentOpen} onClick={() => router.post(`/missions-drone/${mission.id}/checkout`)}>{t('drone_missions.show.pay')}</Button>
          <Button variant="ghost" size="sm" onClick={cancel}>{t('drone_missions.show.cancel')}</Button>
        </div>
        <p className="text-sm text-loam-500">{mission.paymentOpen ? t('drone_missions.show.pay_note') : t('drone_missions.errors.payment_unavailable')}</p>
      </Card>
    )
  }
  if (pilotSide && mission.status === 'accepted') {
    return <Card title={t('drone_missions.show.awaiting_payment_title')} lead={t('drone_missions.show.awaiting_payment_lead', { client: mission.client.name })} />
  }
  if (pilotSide && mission.status === 'paid') {
    return <DeliverCard onDeliver={(note) => decide('deliver', { text: note })} deliverBy={mission.deliverBy} empty={mission.delivered.views.length + mission.delivered.photosCount + mission.delivered.files.length === 0} />
  }
  if (!pilotSide && mission.status === 'paid') {
    return (
      <Card title={t('drone_missions.show.paid_title')} lead={t('drone_missions.show.paid_lead', { pilot: mission.pilot.name })}>
        {mission.deliverBy && <p className="text-sm text-loam-500">{t('drone_missions.show.paid_deadline', { date: formatDate(mission.deliverBy) })}</p>}
      </Card>
    )
  }
  if (mission.status === 'delivered' && !pilotSide) return <ConfirmCard mission={mission} decide={decide} />
  if (mission.status === 'delivered' && pilotSide) {
    return <Card title={t('drone_missions.show.delivered_pilot_title')} lead={mission.disputed ? t('drone_missions.show.disputed_pilot') : t('drone_missions.show.delivered_pilot_lead', { date: mission.confirmBy ? formatDate(mission.confirmBy) : '' })} />
  }
  if (mission.status === 'completed') {
    return <Card title={t('drone_missions.show.completed_title')} lead={t(pilotSide ? 'drone_missions.show.completed_pilot' : 'drone_missions.show.completed_client')} />
  }
  return null
}

function DeliverCard({ onDeliver, empty, deliverBy }: { onDeliver: (note: string) => void; empty: boolean; deliverBy: string | null }) {
  const form = useForm({ note: '' })
  return (
    <Card title={t('drone_missions.show.deliver_title')} lead={t('drone_missions.show.deliver_lead')}>
      <Field label={t('drone_missions.show.deliver_note')}>
        <Textarea rows={3} maxLength={3000} value={form.data.note} onChange={(e) => form.setData('note', e.target.value)} />
      </Field>
      <Button disabled={empty} onClick={async () => {
        if (await confirmAction({ title: t('drone_missions.show.deliver_confirm'), body: t('drone_missions.show.deliver_body'), confirmLabel: t('drone_missions.show.deliver') })) onDeliver(form.data.note)
      }}>{t('drone_missions.show.deliver')}</Button>
      {empty && <p className="text-sm text-loam-500">{t('drone_missions.show.deliver_empty')}</p>}
      {deliverBy && <p className="text-sm text-loam-500">{t('drone_missions.show.deliver_deadline', { date: formatDate(deliverBy) })}</p>}
    </Card>
  )
}

function ConfirmCard({ mission, decide }: { mission: MissionDetail; decide: (decision: string, extra?: Record<string, string>) => void }) {
  const form = useForm({ text: '' })
  if (mission.disputed) return <Card title={t('drone_missions.show.disputed_title')} lead={t('drone_missions.show.disputed_lead')} />
  return (
    <Card title={t('drone_missions.show.confirm_title')} lead={t('drone_missions.show.confirm_lead', { date: mission.confirmBy ? formatDate(mission.confirmBy) : '' })}>
      <HandNote tone="leaf">{t('drone_missions.show.confirm_note')}</HandNote>
      <div className="flex flex-wrap gap-2">
        <Button variant="leaf" onClick={async () => {
          if (await confirmAction({ title: t('drone_missions.show.confirm_confirm'), confirmLabel: t('drone_missions.show.confirm') })) decide('confirm')
        }}><Check className="h-4 w-4" />{t('drone_missions.show.confirm')}</Button>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-loam-600 hover:text-loam-800">{t('drone_missions.show.dispute')}</summary>
        <div className="mt-2 space-y-2">
          <Textarea rows={3} maxLength={3000} value={form.data.text} placeholder={t('drone_missions.show.dispute_placeholder')} onChange={(e) => form.setData('text', e.target.value)} />
          <Button variant="secondary" size="sm" disabled={form.data.text.trim().length < 10} onClick={() => decide('dispute', { text: form.data.text })}>{t('drone_missions.show.dispute_send')}</Button>
        </div>
      </details>
    </Card>
  )
}

/** The flight day: both go outside, together. */
function FlightDay({ pilotSide }: { pilotSide: boolean }) {
  const items = translations(pilotSide ? 'drone_missions.flight_day.pilot' : 'drone_missions.flight_day.client') as unknown as string[]
  return (
    <section className="rounded-2xl bg-leaf-50/70 p-5 ring-1 ring-leaf-100 sm:p-6">
      <h2 className="flex items-center gap-2 text-xl"><Footprints className="h-5 w-5 text-leaf-700" aria-hidden />{t('drone_missions.flight_day.title')}</h2>
      <ul className="mt-3 space-y-2">
        {(Array.isArray(items) ? items : []).map((item) => <li key={item} className="flex gap-2 text-pretty text-sm text-loam-800"><Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" aria-hidden />{item}</li>)}
      </ul>
    </section>
  )
}

/** What the pilot put on the map and with the mission. */
function Delivered({ mission }: { mission: MissionDetail }) {
  const { views, photosCount, files } = mission.delivered
  if (views.length === 0 && photosCount === 0 && files.length === 0) return null
  return (
    <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-loam-900/10 sm:p-6">
      <h2 className="text-xl">{t('drone_missions.show.delivered_title')}</h2>
      <ul className="space-y-1.5 text-sm">
        {views.map((view) => (
          <li key={view.id} className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-loam-900">{view.name}</span>
            <span className="text-loam-500">{formatDate(view.capturedOn)}</span>
            {view.status !== 'ready' && <Pill tone={view.status === 'failed' ? 'clay' : 'humus'}>{t(`drone_missions.show.view_status.${view.status}`)}</Pill>}
          </li>
        ))}
        {photosCount > 0 && <li className="text-loam-700">{t('drone_missions.show.photos_count', { count: photosCount })}</li>}
        {files.map((file) => (
          <li key={file.id}>
            <a href={file.url} className="inline-flex items-center gap-1.5 font-medium text-prune-700 hover:underline">
              <Download className="h-4 w-4" aria-hidden />{file.filename}
            </a>
            <span className="ml-2 text-loam-500">{formatBytes(file.byteSize)}</span>
          </li>
        ))}
      </ul>
      {mission.role === 'client' && <ButtonLink href={`/maps/${mission.map.id}`} size="sm" variant="secondary">{t('drone_missions.show.see_on_map')}</ButtonLink>}
    </section>
  )
}

function Card({ title, lead, children }: { title: string; lead: string; children?: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl bg-prune-50/70 p-5 ring-1 ring-prune-100 sm:p-6">
      <h2 className="text-xl">{title}</h2>
      <p className="text-pretty text-sm text-loam-700">{lead}</p>
      {children}
    </section>
  )
}

function Person({ title, name, avatarUrl, email, phone, href }: { title: string; name: string; avatarUrl: string | null; email: string | null; phone: string | null; href?: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-loam-900/10">
      <p className="text-sm text-loam-500">{title}</p>
      <div className="mt-2 flex items-center gap-3">
        <Avatar name={name} url={avatarUrl} className="h-10 w-10" />
        {href ? <Link href={href} className="font-medium text-loam-900 hover:underline">{name}</Link> : <span className="font-medium text-loam-900">{name}</span>}
      </div>
      {email && <a href={`mailto:${email}`} className="mt-2 block text-sm text-prune-700 hover:underline">{email}</a>}
      {phone && <a href={`tel:${phone}`} className="mt-1 flex items-center gap-1 text-sm text-prune-700 hover:underline"><Phone className="h-4 w-4" aria-hidden />{phone}</a>}
      {!email && <p className="mt-2 text-sm text-loam-500">{t('drone_missions.show.contact_after_payment')}</p>}
    </div>
  )
}

function Quote({ children }: { children: string }) {
  return <p className="whitespace-pre-line border-l-2 border-loam-200 pl-3 text-sm text-loam-800">{children}</p>
}
