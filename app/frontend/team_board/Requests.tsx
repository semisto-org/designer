import { Link, router } from '@inertiajs/react'
import clsx from 'clsx'
import { Camera, Check, Mail, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Avatar } from '@/collab/Avatar'
import { Button, buttonClass } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Select, Textarea } from '@/components/ui/Field'
import { api } from '@/lib/api'
import { formatArea, t } from '@/lib/i18n'
import { relativeTime } from '@/lib/relativeTime'
import { drawSketch } from '@/my_maps/sketch'
import type { SketchGeometry } from '@/types/myMaps'
import type { BoardRequest, RequestStatus } from '@/types/teamBoard'
import { BoardSection, boardBase, daysBetween, useBoard } from './board'

const STATUSES: RequestStatus[] = ['new', 'called', 'visited', 'offer_sent']
const UNANSWERED_DAYS = 7
const SHEET_OPTIONS: Record<string, string> = {
  profile: 'journey.project.sections.who.fields.profile.options',
  water: 'journey.project.sections.constraints.fields.water.options',
}

/**
 * The new requests of the team's form, the oldest first: what the meeting
 * deals with before anything else. Each one leaves with a decision:
 * « Qualifier » (a team map with its lead), « Répondre », « Refuser ».
 */
export function Requests({ requests: initial, form }: { requests: BoardRequest[]; form: { id: number; active: boolean } | null }) {
  const [requests, setRequests] = useState(initial)
  useEffect(() => setRequests(initial), [initial])
  const [qualifying, setQualifying] = useState<BoardRequest | null>(null)
  const [declining, setDeclining] = useState<BoardRequest | null>(null)
  const { teamId, notify } = useBoard()

  async function setStatus(request: BoardRequest, status: RequestStatus) {
    const before = request.status
    setRequests((list) => list.map((r) => (r.id === request.id ? { ...r, status } : r)))
    try {
      await api(`${boardBase(teamId)}/requests/${request.id}`, { method: 'PATCH', body: { request: { status } } })
      notify(t('team_board.frieze.saved'))
    } catch {
      setRequests((list) => list.map((r) => (r.id === request.id ? { ...r, status: before } : r)))
      notify(t('team_board.frieze.error'), 'error')
    }
  }

  return (
    <BoardSection
      id="board-requests"
      title={<>{t('team_board.requests.title')}{requests.length > 0 && <span className="ml-2 align-middle font-sans text-base font-semibold text-humus-700">{requests.length}</span>}</>}
    >
      {!form ? (
        <EmptyNote>
          {t('team_board.requests.no_form')}{' '}
          <Link href="/request_forms" className="font-semibold text-prune-700 underline-offset-2 hover:underline">{t('team_board.requests.open_form')}</Link>
        </EmptyNote>
      ) : requests.length === 0 ? (
        <EmptyNote>{t('team_board.requests.empty')}</EmptyNote>
      ) : (
        <ol className="space-y-3">
          {requests.map((request) => (
            <RequestCard key={request.id} request={request} onStatus={(s) => void setStatus(request, s)} onQualify={() => setQualifying(request)} onDecline={() => setDeclining(request)} />
          ))}
        </ol>
      )}
      <QualifyDialog request={qualifying} onClose={() => setQualifying(null)} />
      <DeclineDialog
        request={declining}
        onClose={() => setDeclining(null)}
        onDeclined={(id) => setRequests((list) => list.filter((r) => r.id !== id))}
      />
    </BoardSection>
  )
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-loam-300 bg-[#fffdf7] px-5 py-4 font-hand text-xl leading-snug text-loam-500">{children}</p>
}

function RequestCard({ request, onStatus, onQualify, onDecline }: {
  request: BoardRequest
  onStatus: (status: RequestStatus) => void
  onQualify: () => void
  onDecline: () => void
}) {
  const { today } = useBoard()
  const age = daysBetween(request.createdAt.slice(0, 10), today)
  const late = request.status === 'new' && age > UNANSWERED_DAYS
  const label = (field: string, value?: string) => (value ? t(`${SHEET_OPTIONS[field]}.${value}`) : null)
  const facts = [
    label('profile', request.answers.profile),
    request.areaM2 != null ? formatArea(request.areaM2) : null,
    request.answers.water ? `${t('team_board.requests.water')} : ${label('water', request.answers.water)?.toLocaleLowerCase('fr')}` : null,
  ].filter(Boolean)
  const services = (request.answers.services ?? []).map((s) => t(`team_board.requests.services.${s}`))
  const subject = encodeURIComponent(t('team_board.requests.reply_subject'))

  return (
    <li className={clsx(
      'grid gap-4 rounded-2xl border bg-[#fffdf7] p-4 shadow-[0_1px_0_var(--color-loam-200)] sm:grid-cols-[8rem_minmax(0,1fr)] lg:grid-cols-[8rem_minmax(0,1fr)_auto]',
      late ? 'border-clay-300' : 'border-loam-200',
    )}>
      <PlaceSketch request={request} />
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="font-serif text-xl leading-tight text-loam-900">{request.name}</h3>
          <span className={clsx('rounded-full px-2.5 py-0.5 text-sm font-semibold', late ? 'bg-clay-50 text-clay-700' : 'bg-leaf-50 text-leaf-800')}>
            {t('team_board.requests.received', { when: relativeTime(request.createdAt) })}
          </span>
        </div>
        {request.address && <p className="truncate text-sm text-loam-600">{request.address}</p>}
        {facts.length > 0 && <p className="text-sm text-loam-600">{facts.join(' · ')}</p>}
        {request.message && <p className="line-clamp-3 text-sm leading-relaxed text-loam-800">« {request.message} »</p>}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-loam-500">
          {services.length > 0 && <span>{t('team_board.requests.wants', { list: services.join(', ') })}</span>}
          {request.photos > 0 && <span className="inline-flex items-center gap-1"><Camera className="h-4 w-4" aria-hidden />{t('team_board.requests.photos', { count: request.photos })}</span>}
          <Link href={`/request_forms/${request.formId}/requests/${request.id}`} className="font-semibold text-prune-700 underline-offset-2 hover:underline">{t('team_board.requests.details')}</Link>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-1 lg:w-52 lg:flex-col lg:items-stretch">
        <Button onClick={onQualify} className="lg:w-full"><Check className="h-4 w-4" aria-hidden />{t('team_board.requests.qualify')}</Button>
        <a href={`mailto:${request.email}?subject=${subject}`} className={buttonClass('secondary', 'md', 'lg:w-full')}>
          <Mail className="h-4 w-4" aria-hidden />{t('team_board.requests.reply')}
        </a>
        <Button variant="danger-ghost" onClick={onDecline} className="lg:w-full"><X className="h-4 w-4" aria-hidden />{t('team_board.requests.decline')}</Button>
        <label className="flex items-center gap-2 text-sm text-loam-600 lg:mt-1">
          <span className="sr-only lg:not-sr-only lg:shrink-0">{t('team_board.requests.status_label')}</span>
          <Select value={request.status} onChange={(e) => onStatus(e.target.value as RequestStatus)} className="w-auto py-1.5 lg:flex-1">
            {STATUSES.map((s) => <option key={s} value={s}>{t(`team_board.requests.statuses.${s}`)}</option>)}
          </Select>
        </label>
      </div>
    </li>
  )
}

/** The parcels the person picked, sketched like a map card (or « lieu à situer »). */
function PlaceSketch({ request }: { request: BoardRequest }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const paint = () => drawSketch(el, { id: request.id, boundary: request.boundary as SketchGeometry | null, areaLabel: formatArea(request.areaM2) }, 0.3, {
      noOutline: t('team_board.requests.no_outline'),
      noOutlineHint: '',
      growthLabel: null,
    })
    paint()
    document.fonts?.ready.then(paint)
    const observer = new ResizeObserver(paint)
    observer.observe(el)
    return () => observer.disconnect()
  }, [request])
  return <canvas ref={canvas} aria-hidden="true" className="hidden aspect-square w-full rounded-xl border border-dashed border-loam-200 sm:block" />
}

function QualifyDialog({ request, onClose }: { request: BoardRequest | null; onClose: () => void }) {
  const { teamId, members } = useBoard()
  const you = members.find((m) => m.you)
  const [lead, setLead] = useState<number | null>(you?.id ?? null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (request) { setLead(you?.id ?? null); setBusy(false) } }, [request, you?.id])

  function submit() {
    if (!request) return
    setBusy(true)
    router.post(`${boardBase(teamId)}/requests/${request.id}/qualify`, { lead_id: lead }, {
      preserveScroll: true,
      onSuccess: onClose,
      onFinish: () => setBusy(false),
    })
  }

  return (
    <Dialog
      open={request != null}
      onClose={onClose}
      dismissOnBackdrop={false}
      title={request ? t('team_board.requests.qualify_title', { name: request.name }) : ''}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
        <Button onClick={submit} disabled={busy || lead == null}>{t('team_board.requests.qualify_submit')}</Button>
      </>}
    >
      <p className="text-sm text-loam-600">{t('team_board.requests.qualify_hint')}</p>
      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-loam-700">{t('team_board.requests.qualify_lead')}</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {members.map((member) => (
            <label key={member.id} className={clsx(
              'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 ring-1 ring-inset transition',
              lead === member.id ? 'bg-prune-50 ring-prune-500' : 'ring-loam-200 hover:ring-loam-400',
            )}>
              <input type="radio" name="lead" className="sr-only" checked={lead === member.id} onChange={() => setLead(member.id)} />
              <Avatar name={member.name} url={member.avatarUrl} className="h-8 w-8" />
              <span className="min-w-0 truncate text-sm font-medium text-loam-900">{member.name}{member.you && <span className="ml-1.5 font-normal text-loam-400">{t('team_board.people.you')}</span>}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </Dialog>
  )
}

function DeclineDialog({ request, onClose, onDeclined }: { request: BoardRequest | null; onClose: () => void; onDeclined: (id: number) => void }) {
  const { teamId, notify } = useBoard()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (request) { setNote(''); setBusy(false) } }, [request])

  async function submit() {
    if (!request) return
    setBusy(true)
    try {
      await api(`${boardBase(teamId)}/requests/${request.id}`, { method: 'PATCH', body: { request: { status: 'declined', decline_note: note } } })
      onDeclined(request.id)
      notify(t('team_board.requests.declined', { name: request.name }))
      onClose()
    } catch (e) {
      notify((e as Error).message || t('team_board.frieze.error'), 'error')
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={request != null}
      onClose={onClose}
      dismissOnBackdrop={false}
      title={request ? t('team_board.requests.decline_title', { name: request.name }) : ''}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="danger" onClick={() => void submit()} disabled={busy}>{t('team_board.requests.decline_submit')}</Button>
      </>}
    >
      <p className="text-sm text-loam-600">{t('team_board.requests.decline_hint')}</p>
      <Field label={t('team_board.requests.decline_note')} className="mt-4">
        <Textarea rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('team_board.requests.decline_placeholder')} />
      </Field>
    </Dialog>
  )
}

