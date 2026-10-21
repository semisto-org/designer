import { Head, router } from '@inertiajs/react'
import { useState, type ReactNode } from 'react'
import { AdminNav } from '@/components/admin/AdminNav'
import { Button } from '@/components/ui/Button'
import { confirmAction } from '@/components/ui/confirm'
import { Textarea } from '@/components/ui/Field'
import { Pill } from '@/components/ui/Pill'
import { droneName, STATUS_TONES } from '@/drone_pilots/catalog'
import { t } from '@/lib/i18n'
import { formatDate, formatPrice } from '@/lib/money'
import type { MissionStatus, PilotCard } from '@/types/drone_pilots'

type AdminPilot = PilotCard & {
  status: 'pending' | 'approved' | 'rejected' | 'suspended'
  email: string
  phone: string | null
  operatorNumber: string
  insurer: string
  legalForm: string
  legalName: string
  businessNumber: string | null
  vatNumber: string | null
  taxNumber: string | null
  address: string
  country: string
  birthDate: string | null
  payoutsEnabled: boolean
  stripeAccountId: string | null
  reviewNote: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  createdAt: string
}
type AdminMission = {
  id: number
  status: MissionStatus
  mapId: number
  mapName: string
  pilotName: string
  clientName: string
  totalCents: number
  commissionCents: number
  pilotShareCents: number
  paidAt: string | null
  deliveredAt: string | null
  paidOutAt: string | null
  disputed: boolean
  disputeMessage: string | null
  payoutError: string | null
  livemode: boolean | null
}

const PILOT_TONES = { pending: 'humus', approved: 'leaf', rejected: 'clay', suspended: 'clay' } as const

/** Staff « Pilotes de drone »: check applications, settle missions. */
export default function AdminDronePilots({ pilots, missions }: { pilots: AdminPilot[]; missions: AdminMission[] }) {
  return (
    <div className="mx-auto max-w-6xl">
      <Head title={t('drone_pilots.admin.title')} />
      <AdminNav />
      <h1 className="text-2xl">{t('drone_pilots.admin.title')}</h1>
      <p className="mt-1 text-loam-600">{t('drone_pilots.admin.intro')}</p>
      <div className="mt-6 space-y-3">
        {pilots.length === 0 && <p className="text-sm text-loam-500">{t('drone_pilots.admin.none')}</p>}
        {pilots.map((pilot) => <PilotRow key={pilot.id} pilot={pilot} />)}
      </div>
      <h2 className="mt-10 text-xl">{t('drone_pilots.admin.missions')}</h2>
      <div className="mt-3 space-y-2">
        {missions.length === 0 && <p className="text-sm text-loam-500">{t('drone_pilots.admin.no_mission')}</p>}
        {missions.map((mission) => <MissionRow key={mission.id} mission={mission} />)}
      </div>
    </div>
  )
}

function PilotRow({ pilot }: { pilot: AdminPilot }) {
  const [note, setNote] = useState('')
  const decide = async (decision: 'approve' | 'reject' | 'suspend') => {
    if (decision !== 'approve' && !note.trim()) return
    if (decision === 'suspend' && !(await confirmAction({ title: t('drone_pilots.admin.suspend_confirm', { name: pilot.name }), confirmLabel: t('drone_pilots.admin.suspend'), tone: 'danger' }))) return
    router.patch(`/admin/drone-pilots/${pilot.id}`, { drone_pilot: { decision, note } }, { preserveScroll: true })
  }
  return (
    <article className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-loam-900/10">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-loam-900">{pilot.name} <span className="font-normal text-loam-500">· {pilot.email}</span></p>
          <p className="text-sm text-loam-600">{pilot.basePlace} · {t('drone_pilots.admin.radius', { km: pilot.radiusKm })} · {formatPrice(pilot.priceCents)}{pilot.travelFeesEnabled && ` + ${t('drone_pilots.card.plus_travel')}`}</p>
        </div>
        <div className="flex items-center gap-2">
          {pilot.payoutsEnabled && <Pill tone="leaf">{t('drone_pilots.admin.stripe_ready')}</Pill>}
          <Pill tone={PILOT_TONES[pilot.status]}>{t(`drone_pilots.statuses.${pilot.status}`)}</Pill>
        </div>
      </header>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <Item label={t('drone_pilots.profile.operator_number')}>{pilot.operatorNumber}</Item>
        <Item label={t('drone_pilots.profile.certificates')}>{pilot.certificates.map((c) => t(`drone_pilots.certificates.${c}`)).join(', ')}</Item>
        <Item label={t('drone_pilots.profile.insurer')}>{pilot.insurer}</Item>
        <Item label={t('drone_pilots.show.fleet')}>{pilot.drones.map(droneName).join(', ')}</Item>
        <Item label={t('drone_pilots.profile.legal_name')}>{pilot.legalName} ({t(`drone_pilots.legal_forms.${pilot.legalForm}`)}, {pilot.country})</Item>
        <Item label={t('drone_pilots.admin.numbers')}>{[pilot.businessNumber, pilot.taxNumber, pilot.vatNumber].filter(Boolean).join(' · ') || '—'}</Item>
        <Item label={t('drone_pilots.profile.address')}>{pilot.address}</Item>
        <Item label={t('drone_pilots.profile.phone')}>{pilot.phone ?? '—'}</Item>
      </dl>
      {pilot.reviewNote && <p className="text-sm text-clay-700">{pilot.reviewNote}</p>}
      <div className="flex flex-wrap items-end gap-2 border-t border-dashed border-loam-200 pt-3">
        <Textarea rows={1} className="min-w-0 flex-1" placeholder={t('drone_pilots.admin.note_placeholder')} value={note} onChange={(e) => setNote(e.target.value)} />
        {pilot.status !== 'approved' && <Button size="sm" variant="leaf" onClick={() => decide('approve')}>{t('drone_pilots.admin.approve')}</Button>}
        {pilot.status === 'pending' && <Button size="sm" variant="secondary" disabled={!note.trim()} onClick={() => decide('reject')}>{t('drone_pilots.admin.reject')}</Button>}
        {pilot.status === 'approved' && <Button size="sm" variant="danger" disabled={!note.trim()} onClick={() => decide('suspend')}>{t('drone_pilots.admin.suspend')}</Button>}
      </div>
    </article>
  )
}

function MissionRow({ mission }: { mission: AdminMission }) {
  const settle = async (decision: 'payout' | 'refund') => {
    const ok = await confirmAction({
      title: t(`drone_pilots.admin.${decision}_confirm`, { id: mission.id }),
      body: decision === 'payout' ? formatPrice(mission.pilotShareCents) : formatPrice(mission.totalCents),
      confirmLabel: t(`drone_pilots.admin.${decision}`),
      tone: decision === 'refund' ? 'danger' : 'default',
    })
    if (ok) router.post(`/admin/drone-pilots/missions/${mission.id}`, { decision }, { preserveScroll: true })
  }
  const settleable = (mission.status === 'paid' || mission.status === 'delivered') && !mission.paidOutAt
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-sm ring-1 ring-loam-900/10">
      <div className="min-w-0">
        <p className="font-medium text-loam-900">#{mission.id} · {mission.mapName} · {mission.clientName} → {mission.pilotName}{mission.livemode === false && ` · ${t('drone_pilots.admin.test_mode')}`}</p>
        <p className="text-loam-600">
          {formatPrice(mission.totalCents)} · {t('drone_pilots.admin.commission', { amount: formatPrice(mission.commissionCents) })}
          {mission.paidAt && ` · ${t('drone_pilots.admin.paid_on', { date: formatDate(mission.paidAt) })}`}
          {mission.paidOutAt && ` · ${t('drone_pilots.admin.paid_out_on', { date: formatDate(mission.paidOutAt) })}`}
        </p>
        {mission.disputeMessage && mission.disputed && <p className="mt-1 text-clay-700">« {mission.disputeMessage} »</p>}
        {mission.payoutError && <p className="mt-1 text-clay-700">{t('drone_pilots.admin.payout_error', { error: mission.payoutError })}</p>}
      </div>
      <div className="flex items-center gap-2">
        <Pill tone={mission.disputed ? 'clay' : STATUS_TONES[mission.status]}>{mission.disputed ? t('drone_missions.disputed') : t(`drone_missions.statuses.${mission.status}`)}</Pill>
        {settleable && mission.status === 'delivered' && <Button size="sm" variant="leaf" onClick={() => settle('payout')}>{t('drone_pilots.admin.payout')}</Button>}
        {settleable && <Button size="sm" variant="secondary" onClick={() => settle('refund')}>{t('drone_pilots.admin.refund')}</Button>}
      </div>
    </div>
  )
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-loam-500">{label}</dt>
      <dd className="min-w-0 text-loam-800">{children}</dd>
    </div>
  )
}
