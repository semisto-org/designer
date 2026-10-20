import { Head, Link, router } from '@inertiajs/react'
import clsx from 'clsx'
import { Check, Copy, ExternalLink, Map as MapIcon, Phone, Plus } from 'lucide-react'
import { useState } from 'react'
import { HelpButton } from '@/components/help/HelpButton'
import { Button } from '@/components/ui/Button'
import { Card, EmptyState } from '@/components/ui/Card'
import { Field, Textarea } from '@/components/ui/Field'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { relativeTime } from '@/lib/relativeTime'
import type { RequestAccount, RequestFormData, RequestStatus, RequestSummary } from '@/types/request_forms'

export const STATUS_TONE: Record<RequestStatus, string> = {
  new: 'bg-humus-100 text-humus-800',
  called: 'bg-prune-50 text-prune-700',
  visited: 'bg-prune-100 text-prune-800',
  offer_sent: 'bg-leaf-50 text-leaf-700',
  accepted: 'bg-leaf-100 text-leaf-800',
  declined: 'bg-loam-100 text-loam-600',
}

/**
 * « Demandes de projet »: for each account I work for, its public request
 * form (open it, share its link, write its welcome) and the requests it
 * brought in, those still to handle first, each with what comes next.
 */
export default function RequestFormsIndex({ accounts }: { accounts: RequestAccount[] }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Head title={t('request_forms.index.title')} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl">{t('request_forms.index.title')}</h1>
        <HelpButton slug="formulaire-de-demande" />
      </div>
      <p className="max-w-2xl text-sm text-loam-600">{t('request_forms.index.intro')}</p>
      {accounts.length === 0 && <EmptyState title={t('request_forms.index.title')}>{t('request_forms.index.none')}</EmptyState>}
      {accounts.map((account) => <AccountCard key={account.key} account={account} />)}
    </div>
  )
}

function AccountCard({ account }: { account: RequestAccount }) {
  const open = account.requests.filter((r) => !['accepted', 'declined'].includes(r.status))
  const closed = account.requests.filter((r) => ['accepted', 'declined'].includes(r.status))
  return (
    <Card className="space-y-5">
      <h2 className="font-serif text-xl font-semibold text-prune-800">
        {account.name ? t('request_forms.index.team', { name: account.name }) : t('request_forms.index.mine')}
      </h2>
      {account.form ? (
        <FormSettings form={account.form} canEdit={account.canEdit} />
      ) : account.canEdit ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-loam-50 p-4">
          <p className="text-sm text-loam-600">{t('request_forms.index.closed')}</p>
          <Button size="sm" onClick={() => router.post('/request_forms', { account: account.key })}>
            <Plus className="h-4 w-4" aria-hidden />{t('request_forms.index.open_form')}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-loam-500">{t('request_forms.index.closed_reader')}</p>
      )}

      {account.form && (
        <section className="space-y-3">
          <h3 className="font-medium text-loam-900">{t('request_forms.index.requests')}</h3>
          {account.requests.length === 0 && <p className="text-sm text-loam-500">{t('request_forms.index.no_requests')}</p>}
          {open.length > 0 && <RequestList title={t('request_forms.index.open_group')} requests={open} />}
          {closed.length > 0 && <RequestList title={t('request_forms.index.closed_group')} requests={closed} />}
        </section>
      )}
    </Card>
  )
}

function RequestList({ title, requests }: { title: string; requests: RequestSummary[] }) {
  return (
    <div>
      <p className="text-sm font-medium text-loam-500">{title}</p>
      <ul className="mt-1 divide-y divide-loam-100">
        {requests.map((request) => (
          <li key={request.id}>
            <Link href={`/request_forms/${request.formId}/requests/${request.id}`} className="-mx-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-2.5 hover:bg-loam-50">
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-loam-900">{request.name}</span>
                <span className="block text-sm text-loam-500">
                  {[request.address, request.parcels > 0 ? t('request_forms.index.parcels', { count: request.parcels }) : null,
                    request.areaM2 ? t('request_forms.requests.area', { area: (request.areaM2 / 10_000).toLocaleString('fr-BE', { maximumFractionDigits: 2 }) }) : null,
                    relativeTime(request.createdAt)].filter(Boolean).join(' · ')}
                </span>
                {['new', 'called', 'visited'].includes(request.status) && !request.mapId && (
                  <span className="mt-0.5 flex items-center gap-1 text-sm text-loam-600">
                    <Phone className="h-3.5 w-3.5 text-leaf-600" aria-hidden />{t(`request_forms.status_hints.${request.status}`)}
                  </span>
                )}
              </span>
              {request.mapId && <span className="inline-flex items-center gap-1 text-sm text-leaf-700"><MapIcon className="h-3.5 w-3.5" aria-hidden />{t('request_forms.index.with_map')}</span>}
              <span className={clsx('rounded-full px-2.5 py-0.5 text-sm font-medium', STATUS_TONE[request.status])}>{t(`request_forms.statuses.${request.status}`)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function FormSettings({ form: initial, canEdit }: { form: RequestFormData; canEdit: boolean }) {
  const [form, setForm] = useState(initial)
  const [intro, setIntro] = useState(initial.intro ?? '')
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(patch: { active?: boolean; intro?: string }) {
    setError(null)
    try {
      const data = await api<{ form: RequestFormData }>(`/request_forms/${form.id}`, { method: 'PATCH', body: { form: patch } })
      setForm(data.form)
      if (patch.intro !== undefined) {
        setSaved(true)
        window.setTimeout(() => setSaved(false), 2000)
      }
    } catch (failure) {
      // The text stays in the field: nothing typed is lost.
      setError((failure as Error).message || t('request_forms.index.save_error'))
    }
  }

  async function copy() {
    await navigator.clipboard?.writeText(form.url)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4 rounded-xl bg-loam-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={clsx('inline-flex items-center gap-1.5 text-sm font-medium', form.active ? 'text-leaf-700' : 'text-loam-500')}>
          <span className={clsx('h-2 w-2 rounded-full', form.active ? 'bg-leaf-500' : 'bg-loam-300')} aria-hidden />
          {form.active ? t('request_forms.index.active') : t('request_forms.index.inactive')}
        </span>
        {canEdit && (
          <Button size="sm" variant="secondary" onClick={() => save({ active: !form.active })}>
            {form.active ? t('request_forms.index.deactivate') : t('request_forms.index.activate')}
          </Button>
        )}
      </div>
      <div>
        <p className="text-sm font-medium text-loam-700">{t('request_forms.index.link')}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-3 py-2 text-sm text-loam-800 ring-1 ring-loam-200">{form.url}</code>
          <Button size="sm" variant="secondary" onClick={copy}>
            {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            {copied ? t('request_forms.index.copied') : t('request_forms.index.copy')}
          </Button>
          <a href={form.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-prune-700 hover:bg-prune-50">
            <ExternalLink className="h-4 w-4" aria-hidden />{t('request_forms.index.preview')}
          </a>
        </div>
      </div>
      {canEdit && (
        <Field label={t('request_forms.index.intro_label')} hint={t('request_forms.index.intro_help')}>
          <Textarea rows={3} maxLength={1500} value={intro} placeholder={t('request_forms.index.intro_placeholder')}
            onChange={(e) => setIntro(e.target.value)} onBlur={() => intro !== (form.intro ?? '') && save({ intro })} />
          {!intro.trim() && (
            <p className="mt-1 text-sm text-loam-500">{t('request_forms.index.intro_default', { text: t('request_forms.public.default_intro', { account: form.displayName }) })}</p>
          )}
        </Field>
      )}
      {saved && <p className="text-sm text-leaf-700">{t('request_forms.index.saved')}</p>}
      {error && <p role="alert" className="text-sm text-clay-700">{error}</p>}
    </div>
  )
}
