import { Head, Link, router } from '@inertiajs/react'
import { ExternalLink, Landmark, Mail, Phone } from 'lucide-react'
import clsx from 'clsx'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, EmptyState } from '@/components/ui/Card'
import { Field, Select, Textarea } from '@/components/ui/Field'
import { formatArea, formatNumber, translations, t } from '@/lib/i18n'
import { relativeTime } from '@/lib/relativeTime'
import type { AdminRequest, RequestKind, RequestStatus } from '@/types/journey'

type Props = {
  requests: AdminRequest[]
  counts: Record<'open' | 'new' | 'contacted' | 'closed' | 'all', number>
  filters: { status: string; kind: RequestKind | null }
}

const FILTERS = ['open', 'new', 'contacted', 'closed', 'all'] as const
const KINDS: RequestKind[] = ['order_plants', 'implementation', 'co_management']
const STATUSES: RequestStatus[] = ['new', 'contacted', 'closed']

const STATUS_STYLES: Record<RequestStatus, string> = {
  new: 'bg-prune-100 text-prune-700',
  contacted: 'bg-humus-100 text-humus-700',
  closed: 'bg-loam-100 text-loam-600',
}

function visit(status: string, kind: RequestKind | null) {
  router.get('/admin/requests', { status, ...(kind ? { kind } : {}) }, { preserveScroll: true, preserveState: true })
}

/** Semisto staff: requests sent from the maps, with their status. */
export default function AdminRequests({ requests, counts, filters }: Props) {
  return (
    <div>
      <Head title={t('journey.admin.title')} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl">{t('journey.admin.title')}</h1>
          <p className="mt-1 text-loam-500">{t('journey.admin.intro')}</p>
        </div>
        <Link href="/admin/invoice-requests" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-loam-800 ring-1 ring-inset ring-loam-200 hover:bg-loam-100">
          <Landmark className="h-4 w-4 text-leaf-600" aria-hidden />{t('invoicing.admin.link')}
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="tablist">
          {FILTERS.map((f) => (
            <button
              key={f} type="button" role="tab" aria-selected={filters.status === f} onClick={() => visit(f, filters.kind)}
              className={clsx(
                'rounded-full px-3 py-1.5 text-sm transition-colors',
                filters.status === f ? 'bg-prune-600 text-white' : 'bg-white text-loam-700 ring-1 ring-inset ring-loam-200 hover:bg-loam-50',
              )}
            >
              {t(`journey.admin.filters.${f}`)} <span className={filters.status === f ? 'text-prune-200' : 'text-loam-500'}>{counts[f]}</span>
            </button>
          ))}
        </div>
        <Select
          aria-label={t('journey.admin.all_kinds')} className="w-auto!" value={filters.kind ?? ''}
          onChange={(e) => visit(filters.status, (e.target.value || null) as RequestKind | null)}
        >
          <option value="">{t('journey.admin.all_kinds')}</option>
          {KINDS.map((k) => <option key={k} value={k}>{t(`journey.requests.kinds.${k}.title`)}</option>)}
        </Select>
      </div>

      {requests.length === 0 ? (
        <div className="mt-6"><EmptyState title={t('journey.admin.empty')} /></div>
      ) : (
        <ul className="mt-6 space-y-4">
          {requests.map((request) => <li key={request.id}><RequestCard request={request} /></li>)}
        </ul>
      )}
    </div>
  )
}

type Texts = { label?: string; unit?: string; options?: Record<string, string>; item?: Record<string, { label?: string }> }

/** The payload as label / value rows, read with the same locale keys as the forms. */
function payloadRows(request: AdminRequest): { label: string; value: string }[] {
  const base = `journey.requests.kinds.${request.kind}.fields`
  return Object.entries(request.payload)
    .filter(([key]) => key !== 'include_plant_list')
    .map(([key, value]) => {
      const texts = translations(`${base}.${key}`) as Texts
      const option = (v: unknown) => texts.options?.[String(v)] ?? String(v)
      let text: string
      if (Array.isArray(value)) {
        text = value
          .map((entry) => {
            if (entry && typeof entry === 'object') {
              const row = entry as Record<string, unknown>
              return [String(row.name ?? ''), row.quantity ? `× ${row.quantity}` : '', row.note ? `(${row.note})` : ''].filter(Boolean).join(' ')
            }
            return option(entry)
          })
          .join(typeof value[0] === 'object' ? '\n' : ', ')
      } else if (typeof value === 'number') {
        text = [formatNumber(value), texts.unit].filter(Boolean).join(' ')
      } else if (typeof value === 'boolean') {
        text = t('journey.affirmative')
      } else {
        text = option(value)
      }
      return { label: texts.label ?? key, value: text }
    })
}

function RequestCard({ request }: { request: AdminRequest }) {
  const [status, setStatus] = useState<RequestStatus>(request.status)
  const [notes, setNotes] = useState(request.adminNotes ?? '')
  const [saving, setSaving] = useState(false)
  const dirty = status !== request.status || notes !== (request.adminNotes ?? '')
  const phone = request.payload.phone as string | undefined
  const snapshot = request.snapshot
  const facts = t('journey.admin.map_facts', {
    area: formatArea(snapshot.area_m2 ?? request.map.areaM2),
    plants: snapshot.plants_count ?? 0,
    percent: snapshot.project_percent ?? 0,
  })

  function save() {
    setSaving(true)
    router.patch(`/admin/requests/${request.id}`, { service_request: { status, admin_notes: notes } }, {
      preserveScroll: true, onFinish: () => setSaving(false),
    })
  }

  return (
    <Card className="p-0!">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-loam-100 px-5 py-4">
        <div>
          <h2 className="text-base">{t(`journey.requests.kinds.${request.kind}.title`)}</h2>
          <p className="text-sm text-loam-500">{t('journey.admin.received', { when: relativeTime(request.createdAt) })}</p>
        </div>
        <span className={clsx('rounded-full px-2.5 py-1 text-xs font-medium', STATUS_STYLES[request.status])}>
          {t(`journey.admin.status_options.${request.status}`)}
        </span>
      </div>
      <div className="grid gap-6 px-5 py-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-loam-500">{t('journey.admin.from')}</p>
            <p className="mt-1 font-medium text-loam-900">{request.user.name}</p>
            <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-loam-600">
              <a href={`mailto:${request.user.email}`} className="inline-flex items-center gap-1.5 hover:underline"><Mail className="h-4 w-4" aria-hidden />{request.user.email}</a>
              {phone ? <a href={`tel:${phone}`} className="inline-flex items-center gap-1.5 hover:underline"><Phone className="h-4 w-4" aria-hidden />{phone}</a> : <span className="text-loam-500">{t('journey.admin.no_phone')}</span>}
            </p>
            {request.contactConsent && <p className="mt-1 text-xs text-leaf-700">{t('journey.admin.consent_ok')}</p>}
          </div>
          <div>
            <Link href={`/maps/${request.map.id}`} className="inline-flex items-center gap-1.5 font-medium text-prune-700 hover:underline">
              <ExternalLink className="h-4 w-4" aria-hidden />{request.map.name} · {t('journey.admin.open_map')}
            </Link>
            <p className="mt-1 text-sm text-loam-500">{[request.map.address, facts].filter(Boolean).join(' · ')}</p>
            {request.map.archived && <p className="text-xs text-humus-700">{t('journey.admin.archived')}</p>}
          </div>
          <dl className="space-y-2 text-sm">
            {payloadRows(request).map((row) => (
              <div key={row.label}>
                <dt className="text-xs text-loam-500">{row.label}</dt>
                <dd className="whitespace-pre-line text-loam-800">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="space-y-3 lg:border-l lg:border-loam-100 lg:pl-6">
          <Field label={t('journey.admin.status')}>
            <Select value={status} onChange={(e) => setStatus(e.target.value as RequestStatus)}>
              {STATUSES.map((s) => <option key={s} value={s}>{t(`journey.admin.status_options.${s}`)}</option>)}
            </Select>
          </Field>
          <Field label={t('journey.admin.notes')}>
            <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-loam-500">{request.handledBy ? t('journey.admin.handled_by', { name: request.handledBy }) : ''}</p>
            <Button onClick={save} disabled={!dirty || saving}>{t('journey.admin.save')}</Button>
          </div>
        </div>
      </div>
    </Card>
  )
}
