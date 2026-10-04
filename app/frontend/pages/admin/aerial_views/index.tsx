import { Head, Link, router, useForm } from '@inertiajs/react'
import clsx from 'clsx'
import { ArrowLeft, Drone, Info, Mail, Map as MapIcon, Plus, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, EmptyState } from '@/components/ui/Card'
import { Field, Input, Select } from '@/components/ui/Field'
import { aerialViewLabel, formatCaptureDate } from '@/drone/format'
import { formatArea, t } from '@/lib/i18n'
import { formatDate, formatMoney } from '@/lib/money'
import type { AdminAerialView, AdminDroneOrder, AerialViewKind, DroneOrderFilter } from '@/types/drone'

type Props = {
  orders: AdminDroneOrder[]
  otherViews: AdminAerialView[]
  counts: Record<DroneOrderFilter, number>
  filters: { status: DroneOrderFilter }
}

const FILTERS: DroneOrderFilter[] = ['todo', 'done', 'all']
const KINDS: AerialViewKind[] = ['pmtiles', 'xyz']
const PATH = '/admin/drone-views'

/** Semisto staff: paid drone missions and the aerial views put on maps. */
export default function AdminAerialViews({ orders, otherViews, counts, filters }: Props) {
  return (
    <div>
      <Head title={t('drone.admin.title')} />
      <Link href="/admin/requests" className="inline-flex items-center gap-1.5 text-sm text-loam-500 hover:text-loam-800">
        <ArrowLeft className="h-4 w-4" aria-hidden />{t('drone.admin.back')}
      </Link>
      <h1 className="mt-3 text-2xl">{t('drone.admin.title')}</h1>
      <p className="mt-1 max-w-3xl text-loam-500">{t('drone.admin.intro')}</p>
      <p className="mt-4 flex max-w-3xl gap-2 rounded-lg bg-white p-3 text-sm text-loam-600 ring-1 ring-loam-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-loam-400" aria-hidden />
        {t('drone.admin.hosting_note')}
      </p>

      <div className="mt-6 flex flex-wrap gap-1.5" role="tablist">
        {FILTERS.map((f) => (
          <button
            key={f} type="button" role="tab" aria-selected={filters.status === f}
            onClick={() => router.get(PATH, { status: f }, { preserveScroll: true, preserveState: true })}
            className={clsx(
              'rounded-full px-3 py-1.5 text-sm transition-colors',
              filters.status === f ? 'bg-prune-600 text-white' : 'bg-white text-loam-700 ring-1 ring-inset ring-loam-200 hover:bg-loam-50',
            )}
          >
            {t(`drone.admin.filters.${f}`)} <span className={filters.status === f ? 'text-prune-200' : 'text-loam-500'}>{counts[f]}</span>
          </button>
        ))}
      </div>

      {orders.length === 0 ? (
        <div className="mt-6"><EmptyState title={t('drone.admin.empty')} /></div>
      ) : (
        <ul className="mt-6 space-y-4">
          {orders.map((order) => <li key={order.id}><OrderCard order={order} /></li>)}
        </ul>
      )}

      <section className="mt-12" aria-labelledby="other-views-title">
        <h2 id="other-views-title" className="text-lg">{t('drone.admin.other_title')}</h2>
        <p className="mt-1 max-w-3xl text-sm text-loam-500">{t('drone.admin.other_intro')}</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="text-base">{t('drone.admin.form.title_any')}</h3>
            <div className="mt-4"><ViewForm /></div>
          </Card>
          <Card>
            {otherViews.length === 0 ? (
              <p className="text-sm text-loam-500">{t('drone.admin.other_empty')}</p>
            ) : (
              <ul className="divide-y divide-loam-100">
                {otherViews.map((view) => <ViewRow key={view.id} view={view} showOwner />)}
              </ul>
            )}
          </Card>
        </div>
      </section>
    </div>
  )
}

function OrderCard({ order }: { order: AdminDroneOrder }) {
  const done = order.views.length > 0
  return (
    <Card className="p-0!">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-loam-100 px-5 py-4">
        <div className="min-w-0">
          <h2 className="break-words text-base">{order.user.name}</h2>
          <p className="text-sm text-loam-500">
            {t('drone.admin.ordered', { date: formatDate(order.paidAt) })}
            {order.amountCents != null && <> · {t('drone.admin.amount', { amount: formatMoney(order.amountCents, order.currency ?? 'EUR') })}</>}
          </p>
        </div>
        <span className={clsx('rounded-full px-2.5 py-1 text-xs font-medium', done ? 'bg-leaf-100 text-leaf-700' : 'bg-humus-100 text-humus-700')}>
          {t(`drone.admin.statuses.${done ? 'done' : 'todo'}`)}
        </span>
      </div>

      <div className="grid gap-6 px-5 py-4 lg:grid-cols-2">
        <div className="space-y-4 text-sm">
          <div>
            <p className="text-xs text-loam-500">{t('drone.admin.buyer')}</p>
            <p className="text-loam-800">
              {order.user.name} · <a href={`mailto:${order.user.email}`} className="inline-flex items-center gap-1 break-all hover:underline"><Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />{order.user.email}</a>
            </p>
          </div>
          <div>
            <p className="text-xs text-loam-500">{t('drone.admin.maps_title', { name: order.user.name })}</p>
            {order.maps.length === 0 ? (
              <p className="mt-1 text-humus-700">{t('drone.admin.no_maps', { name: order.user.name })}</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {order.maps.map((map) => (
                  <li key={map.id} className="flex items-start gap-1.5 text-loam-800">
                    <MapIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-loam-400" aria-hidden />
                    <span className="min-w-0 break-words">
                      {map.name} <span className="text-loam-500">· {t('drone.admin.map_number', { id: map.id })}{map.areaM2 ? ` · ${formatArea(map.areaM2)}` : ''}</span>
                      {map.address && <span className="block text-xs text-loam-500">{map.address}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-xs text-loam-500">{t('drone.admin.views_title')}</p>
            {order.views.length === 0 ? (
              <p className="mt-1 text-loam-500">{t('drone.admin.no_views')}</p>
            ) : (
              <ul className="divide-y divide-loam-100">
                {order.views.map((view) => <ViewRow key={view.id} view={view} />)}
              </ul>
            )}
          </div>
        </div>

        {order.maps.length > 0 && (
          <div className="lg:border-l lg:border-loam-100 lg:pl-6">
            {done ? (
              // Delivered: another view (a second flight, a corrected file) stays one click away.
              <details className="group">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-prune-700 hover:text-prune-900 [&::-webkit-details-marker]:hidden">
                  <Plus className="h-4 w-4" aria-hidden />{t('drone.admin.form.add_another')}
                </summary>
                <div className="mt-3"><ViewForm order={order} /></div>
              </details>
            ) : (
              <>
                <h3 className="text-sm font-medium text-loam-800">{t('drone.admin.form.title_order')}</h3>
                <div className="mt-3"><ViewForm order={order} /></div>
              </>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

function ViewRow({ view, showOwner = false }: { view: AdminAerialView; showOwner?: boolean }) {
  const [busy, setBusy] = useState(false)
  function remove() {
    const question = t('drone.admin.confirm_remove', { name: view.name, date: formatCaptureDate(view.capturedOn), map: view.mapName })
    if (!window.confirm(question)) return
    router.delete(`${PATH}/${view.id}`, { preserveScroll: true, onStart: () => setBusy(true), onFinish: () => setBusy(false) })
  }
  return (
    <li className="flex items-start justify-between gap-3 py-2.5 text-sm">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 font-medium text-loam-800">
          <Drone className="h-4 w-4 shrink-0 text-prune-500" aria-hidden />{aerialViewLabel(view)}
        </p>
        <p className="mt-0.5 break-words text-xs text-loam-500">
          {[
            `« ${view.mapName} » (${t('drone.admin.map_number', { id: view.mapId })})`,
            showOwner ? view.ownerName : null,
            t(`drone.admin.form.kinds.${view.kind}`),
            view.host,
          ].filter(Boolean).join(' · ')}
        </p>
        {view.createdBy && <p className="text-xs text-loam-400">{t('drone.admin.added_by', { name: view.createdBy })}</p>}
      </div>
      <Button variant="ghost" size="sm" disabled={busy} onClick={remove} className="shrink-0 text-clay-700">
        <Trash2 className="h-4 w-4" aria-hidden />{t('drone.admin.remove')}
      </Button>
    </li>
  )
}

type FormData = {
  map_id: string
  plan_purchase_id: string
  name: string
  captured_on: string
  kind: AerialViewKind
  url: string
  attribution: string
  min_zoom: string
  max_zoom: string
}

/** Adds a view: to one of the buyer's maps for an order, else to any map by its number. */
function ViewForm({ order }: { order?: AdminDroneOrder }) {
  const form = useForm<FormData>({
    map_id: order?.maps.length === 1 ? String(order.maps[0].id) : '',
    plan_purchase_id: order ? String(order.id) : '',
    name: '',
    captured_on: '',
    kind: 'pmtiles',
    url: '',
    attribution: '',
    min_zoom: '',
    max_zoom: '',
  })
  const errors = form.errors as Partial<Record<keyof FormData | 'map' | 'plan_purchase', string>>
  const ready = form.data.map_id !== '' && form.data.captured_on !== '' && form.data.url.trim() !== ''

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        form.transform((data) => ({ aerial_view: data }))
        form.post(PATH, { preserveScroll: true, onSuccess: () => form.reset() })
      }}
    >
      {order ? (
        <Field label={t('drone.admin.form.map')} error={errors.map ?? errors.plan_purchase}>
          <Select required value={form.data.map_id} onChange={(e) => form.setData('map_id', e.target.value)}>
            {order.maps.length > 1 && <option value="">—</option>}
            {order.maps.map((map) => <option key={map.id} value={map.id}>{map.name} ({t('drone.admin.map_number', { id: map.id })})</option>)}
          </Select>
        </Field>
      ) : (
        <Field label={t('drone.admin.form.map_id')} error={errors.map}>
          <Input type="number" min={1} inputMode="numeric" required value={form.data.map_id} onChange={(e) => form.setData('map_id', e.target.value)} className="w-32!" />
        </Field>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('drone.admin.form.name')} error={errors.name}>
          <Input value={form.data.name} maxLength={80} placeholder={t('drone.default_name')} onChange={(e) => form.setData('name', e.target.value)} />
        </Field>
        <Field label={t('drone.admin.form.captured_on')} error={errors.captured_on}>
          <Input type="date" required value={form.data.captured_on} onChange={(e) => form.setData('captured_on', e.target.value)} />
        </Field>
      </div>
      <fieldset>
        <legend className="text-sm font-medium text-loam-700">{t('drone.admin.form.kind')}</legend>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {KINDS.map((kind) => (
            <label key={kind} className="flex items-center gap-2 text-sm text-loam-700">
              <input type="radio" name={`kind-${order?.id ?? 'any'}`} value={kind} checked={form.data.kind === kind} onChange={() => form.setData('kind', kind)} className="border-loam-300 text-prune-600" />
              {t(`drone.admin.form.kinds.${kind}`)}
            </label>
          ))}
        </div>
        {errors.kind && <p className="mt-1 text-xs text-clay-500">{errors.kind}</p>}
      </fieldset>
      <Field label={t('drone.admin.form.url')} error={errors.url}>
        <Input
          type="url" required inputMode="url" spellCheck={false} value={form.data.url}
          placeholder={t(`drone.admin.form.url_placeholders.${form.data.kind}`)}
          onChange={(e) => form.setData('url', e.target.value)}
        />
      </Field>
      <Field label={t('drone.admin.form.attribution')} hint={t('drone.admin.form.attribution_hint')} error={errors.attribution}>
        <Input value={form.data.attribution} maxLength={300} onChange={(e) => form.setData('attribution', e.target.value)} />
      </Field>
      <details className="group rounded-lg ring-1 ring-loam-200" open={Boolean(errors.min_zoom || errors.max_zoom)}>
        <summary className="cursor-pointer list-none rounded-lg px-3 py-2 text-sm text-loam-700 hover:bg-loam-50 [&::-webkit-details-marker]:hidden">
          {t('drone.admin.form.more')}
        </summary>
        <div className="space-y-2 border-t border-loam-100 px-3 py-3">
          <div className="grid grid-cols-2 gap-3">
            <ZoomField label={t('drone.admin.form.min_zoom')} value={form.data.min_zoom} error={errors.min_zoom} onChange={(v) => form.setData('min_zoom', v)} />
            <ZoomField label={t('drone.admin.form.max_zoom')} value={form.data.max_zoom} error={errors.max_zoom} onChange={(v) => form.setData('max_zoom', v)} />
          </div>
          <p className="text-xs text-loam-500">{t('drone.admin.form.zoom_hint')}</p>
        </div>
      </details>
      <Button type="submit" variant={order ? 'leaf' : 'primary'} disabled={form.processing || !ready} className="w-full sm:w-auto">
        <Drone className="h-4 w-4" aria-hidden />
        {form.processing
          ? t('drone.admin.form.working')
          : order ? t('drone.admin.form.submit_order', { name: order.user.name }) : t('drone.admin.form.submit_any')}
      </Button>
    </form>
  )
}

function ZoomField({ label, value, error, onChange }: { label: string; value: string; error?: string; onChange: (value: string) => void }): ReactNode {
  return (
    <Field label={label} error={error}>
      <Input type="number" min={0} max={24} step={1} inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  )
}
