import { Head, Link, router } from '@inertiajs/react'
import clsx from 'clsx'
import { Check, Mail, Sprout, X } from 'lucide-react'
import { useState } from 'react'
import { Avatar } from '@/collab/Avatar'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/Card'
import { Field, Textarea } from '@/components/ui/Field'
import { t } from '@/lib/i18n'

type Status = 'pending' | 'accepted' | 'declined' | 'withdrawn'
type Base = {
  id: number
  plant: { speciesId: number; name: string; latinName: string }
  material: string
  message: string
  status: Status
  answer: string | null
  answeredBy: string | null
  createdAt: string
  answeredAt: string | null
}
type Received = Base & { map: { id: number; name: string }; requester: { name: string; avatarUrl: string | null; email: string | null }; canAnswer: boolean }
type Sent = Base & { region: string | null; owner: { name: string; email: string } | null }
type Place = { id: number; name: string; sharesPlantedPalette: boolean; acceptsPropagationRequests: boolean }
type Props = { received: Received[]; sent: Sent[]; places: Place[] }

const date = (iso: string) => new Date(iso).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })

/**
 * « Demandes de multiplication »: the requests for scions, cuttings or seeds
 * that reached the places I own, to answer, and the ones I sent.
 */
export default function PropagationRequests({ received, sent, places }: Props) {
  const [tab, setTab] = useState<'received' | 'sent'>(received.length === 0 && sent.length > 0 ? 'sent' : 'received')
  const waiting = received.filter((r) => r.status === 'pending').length
  const pill = (active: boolean) => clsx(
    'shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium',
    active ? 'bg-prune-600 text-white' : 'bg-loam-100 text-loam-700 hover:bg-loam-200',
  )

  return (
    <div className="mx-auto max-w-3xl">
      <Head title={t('propagation.title')} />
      <h1 className="text-2xl">{t('propagation.title')}</h1>
      <p className="mt-1 text-loam-600">{t('propagation.intro')}</p>

      <Places places={places} />

      <nav className="mt-6 flex gap-1.5" aria-label={t('propagation.title')}>
        <button type="button" className={pill(tab === 'received')} onClick={() => setTab('received')}>
          {t('propagation.page.received')}{waiting > 0 && <span className="ml-1.5 tabular-nums">· {waiting}</span>}
        </button>
        <button type="button" className={pill(tab === 'sent')} onClick={() => setTab('sent')}>{t('propagation.page.sent')}</button>
      </nav>

      <div className="mt-4 space-y-3">
        {tab === 'received' && (received.length === 0
          ? <EmptyState title={t('propagation.page.received')}>{t(places.length ? 'propagation.page.received_empty' : 'propagation.page.no_place')}</EmptyState>
          : received.map((request) => <ReceivedCard key={request.id} request={request} />))}
        {tab === 'sent' && (sent.length === 0
          ? <EmptyState title={t('propagation.page.sent')} action={<Link href="/plants" className="text-sm font-medium text-prune-700 hover:underline">{t('nav.plants')}</Link>}>{t('propagation.page.sent_empty')}</EmptyState>
          : sent.map((request) => <SentCard key={request.id} request={request} />))}
      </div>
      <p className="mt-6 text-sm text-loam-500">{t('propagation.page.privacy')}</p>
    </div>
  )
}

function Places({ places }: { places: Place[] }) {
  if (places.length === 0) return null
  return (
    <section className="mt-5 rounded-2xl bg-leaf-50/60 p-4 ring-1 ring-leaf-100" aria-labelledby="places">
      <h2 id="places" className="flex items-center gap-1.5 text-base"><Sprout className="h-4 w-4 text-leaf-600" />{t('propagation.page.places')}</h2>
      <ul className="mt-2 space-y-1.5 text-sm">
        {places.map((place) => (
          <li key={place.id} className="flex flex-wrap items-baseline gap-x-2">
            <Link href={`/maps/${place.id}`} className="font-medium text-loam-900 hover:underline">{place.name}</Link>
            <span className="text-loam-600">
              {place.sharesPlantedPalette ? t('propagation.page.place_state_shared') : t('propagation.page.place_state_private')}
              {place.acceptsPropagationRequests && <> · {t('propagation.page.place_state_requests')}</>}
            </span>
            <span className="text-loam-500">({t('propagation.page.place_settings')})</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Header({ request, title }: { request: Base; title: string }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <Link href={`/plants/${request.plant.speciesId}`} className="font-serif text-lg font-semibold text-prune-800 hover:underline">{request.plant.name}</Link>
        <p className="text-sm text-loam-600">{title}</p>
      </div>
      <StatusBadge status={request.status} />
    </header>
  )
}

function StatusBadge({ status }: { status: Status }) {
  const tone = { pending: 'bg-humus-50 text-humus-800', accepted: 'bg-leaf-50 text-leaf-800', declined: 'bg-loam-100 text-loam-600', withdrawn: 'bg-loam-100 text-loam-500' }[status]
  return <span className={clsx('shrink-0 rounded-full px-2.5 py-0.5 text-sm', tone)}>{t(`propagation.statuses.${status}`)}</span>
}

function Quote({ children }: { children: string }) {
  return <p className="whitespace-pre-line border-l-2 border-loam-200 pl-3 text-sm text-loam-800">{children}</p>
}

function ReceivedCard({ request }: { request: Received }) {
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const decide = (decision: 'accept' | 'decline') => {
    if (decision === 'decline' && !window.confirm(t('propagation.page.decline_confirm'))) return
    router.patch(`/propagation/${request.id}`, { propagation_request: { decision, answer } }, {
      preserveScroll: true, onStart: () => setBusy(true), onFinish: () => setBusy(false),
    })
  }

  return (
    <article className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-loam-900/10 sm:p-5">
      <Header request={request} title={`${t(`propagation.materials.${request.material}`)} · ${t('propagation.page.asked_on', { date: date(request.createdAt) })}`} />
      <div className="flex items-center gap-2 text-sm text-loam-700">
        <Avatar name={request.requester.name} url={request.requester.avatarUrl} className="h-7 w-7" />
        {t('propagation.page.from', { name: request.requester.name, map: request.map.name })}
      </div>
      <Quote>{request.message}</Quote>
      {request.canAnswer ? (
        <div className="space-y-3 border-t border-dashed border-loam-200 pt-3">
          <Field label={t('propagation.page.answer_label')}>
            <Textarea rows={3} maxLength={2000} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={t('propagation.page.answer_placeholder')} />
          </Field>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => decide('decline')}><X className="h-4 w-4" />{t('propagation.page.decline')}</Button>
            <Button disabled={busy} onClick={() => decide('accept')}><Check className="h-4 w-4" />{t('propagation.page.accept')}</Button>
          </div>
        </div>
      ) : (
        <>
          {request.answer && <div className="space-y-1"><p className="text-sm text-loam-500">{t('propagation.page.answered_by', { name: request.answeredBy ?? '' })}</p><Quote>{request.answer}</Quote></div>}
          {request.requester.email && (
            <p className="flex items-center gap-1.5 text-sm text-leaf-800">
              <Mail className="h-4 w-4" />
              <a href={`mailto:${request.requester.email}`} className="hover:underline">{t('propagation.page.requester_contact', { email: request.requester.email })}</a>
            </p>
          )}
        </>
      )}
    </article>
  )
}

function SentCard({ request }: { request: Sent }) {
  const withdraw = () => {
    if (window.confirm(t('propagation.page.withdraw_confirm'))) router.delete(`/propagation/${request.id}`, { preserveScroll: true })
  }
  const place = request.region ? t('propagation.page.to_place', { region: request.region }) : t('propagation.page.to_place_unknown')

  return (
    <article className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-loam-900/10 sm:p-5">
      <Header request={request} title={`${t(`propagation.materials.${request.material}`)} · ${place} · ${t('propagation.page.asked_on', { date: date(request.createdAt) })}`} />
      <Quote>{request.message}</Quote>
      {request.answer && <div className="space-y-1"><p className="text-sm text-loam-500">{t('propagation.page.answered_by', { name: request.answeredBy ?? '' })}</p><Quote>{request.answer}</Quote></div>}
      {request.owner && (
        <p className="flex items-center gap-1.5 text-sm text-leaf-800">
          <Mail className="h-4 w-4" />
          <a href={`mailto:${request.owner.email}`} className="hover:underline">{t('propagation.page.contact', { name: request.owner.name, email: request.owner.email })}</a>
        </p>
      )}
      {request.status === 'pending' && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={withdraw}>{t('propagation.page.withdraw')}</Button>
        </div>
      )}
    </article>
  )
}
