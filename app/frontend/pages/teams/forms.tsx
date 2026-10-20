import { Head, Link, router, useForm } from '@inertiajs/react'
import clsx from 'clsx'
import { ArrowLeft, ExternalLink, FileText, Inbox, MapPinned, PlugZap, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { CopyField } from '@/components/CopyField'
import { HelpButton } from '@/components/help/HelpButton'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, Input, Select } from '@/components/ui/Field'
import { FormAnswers } from '@/documents/FormAnswers'
import { t } from '@/lib/i18n'
import { relativeTime } from '@/lib/relativeTime'
import type { TeamForm, TeamFormResponse, TeamFormsPageProps } from '@/types/forms'

/**
 * The team's own forms (« Formulaires »): where Tally sends the answers, the
 * forms the team sends from its maps, and the answers received, with those
 * still to file in a map on top.
 */
export default function TeamForms({ team, inbox, forms, responses, maps, mapField }: TeamFormsPageProps) {
  const base = `/teams/${team.id}`
  const toFile = responses.filter((r) => r.mapId == null).length
  // Once Tally is in service, its technical card folds away below the daily work.
  const inService = forms.length > 0 && responses.length > 0

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Head title={t('forms.page.page_title', { team: team.name })} />
      <Link href={base} className="inline-flex items-center gap-1.5 text-sm text-loam-500 hover:text-loam-900">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t('forms.page.back', { team: team.name })}
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h1 className="text-3xl">{t('forms.page.title')}</h1>
          <p className="mt-1 text-loam-600">{t('forms.page.intro')}</p>
        </div>
        <HelpButton slug="brancher-ses-formulaires-tally" />
      </div>

      {inbox == null ? (
        <Connect admin={team.admin} base={base} />
      ) : (
        <>
          {!inService && team.admin && inbox.url && inbox.secret && <InboxCard url={inbox.url} secret={inbox.secret} mapField={mapField} base={base} />}
          {toFile > 0 && <Responses responses={responses} maps={maps} admin={team.admin} base={base} toFile={toFile} />}
          <Forms forms={forms} admin={team.admin} base={base} />
          {toFile === 0 && <Responses responses={responses} maps={maps} admin={team.admin} base={base} toFile={toFile} />}
          {inService && team.admin && inbox.url && inbox.secret && (
            <details>
              <summary className="cursor-pointer text-sm font-medium text-loam-600 hover:text-loam-900">{t('forms.inbox.settings')}</summary>
              <div className="mt-3"><InboxCard url={inbox.url} secret={inbox.secret} mapField={mapField} base={base} /></div>
            </details>
          )}
        </>
      )}
    </div>
  )
}

/** Before the first form: what it is for, and the one button that starts it. */
function Connect({ admin, base }: { admin: boolean; base: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="rounded-2xl bg-[#f7f3ea] p-6 ring-1 ring-loam-900/10 sm:p-8">
      <h2 className="flex items-center gap-2 font-serif text-2xl text-loam-900">
        <PlugZap className="h-5 w-5 text-prune-600" aria-hidden="true" />{t('forms.connect.title')}
      </h2>
      <p className="mt-2 max-w-xl text-loam-700">{t('forms.connect.body')}</p>
      {admin ? (
        <Button className="mt-5" disabled={busy}
          onClick={() => router.post(`${base}/forms/connect`, {}, { onStart: () => setBusy(true), onFinish: () => setBusy(false) })}>
          {t('forms.connect.button')}
        </Button>
      ) : (
        <p className="mt-4 text-sm text-loam-600">{t('forms.connect.members_only')}</p>
      )}
    </div>
  )
}

/** The webhook address and its secret, with the three steps in Tally. */
function InboxCard({ url, secret, mapField, base }: { url: string; secret: string; mapField: string; base: string }) {
  const [shown, setShown] = useState(false)
  return (
    <Card>
      <h2 className="flex items-center gap-2 text-base"><Inbox className="h-4 w-4 text-prune-500" aria-hidden="true" />{t('forms.inbox.title')}</h2>
      <div className="mt-4 space-y-3">
        <div>
          <p className="mb-1 text-sm font-medium text-loam-700">{t('forms.inbox.url')}</p>
          <CopyField value={url} mono />
        </div>
        <div>
          <p className="mb-1 text-sm font-medium text-loam-700">{t('forms.inbox.secret')}</p>
          {shown ? <CopyField value={secret} mono /> : (
            <Button variant="ghost" size="sm" onClick={() => setShown(true)}>{t('forms.inbox.show_secret')}</Button>
          )}
        </div>
      </div>
      <ol className="mt-5 space-y-2 text-sm text-loam-700">
        {[1, 2, 3].map((n) => (
          <li key={n} className="flex gap-3 border-b border-dashed border-loam-200 pb-2 last:border-0">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-prune-50 font-serif text-prune-700">{n}</span>
            <span>{t(`forms.inbox.step_${n}`, { field: mapField })}</span>
          </li>
        ))}
      </ol>
      <Button variant="ghost" size="sm" className="mt-3 text-loam-600" onClick={() => {
        if (window.confirm(t('forms.inbox.reset_confirm'))) router.post(`${base}/forms/reset`, {}, { preserveScroll: true })
      }}>
        <RefreshCw className="h-4 w-4" aria-hidden="true" />{t('forms.inbox.reset')}
      </Button>
    </Card>
  )
}

function Forms({ forms, admin, base }: { forms: TeamForm[]; admin: boolean; base: string }) {
  const form = useForm({ link: '', name: '' })
  return (
    <Card>
      <h2 className="text-base">{t('forms.list.title')}</h2>
      {forms.length === 0 ? (
        <p className="mt-3 text-sm text-loam-500">{t('forms.list.empty')}</p>
      ) : (
        <ul className="mt-3 divide-y divide-loam-100">
          {forms.map((f) => (
            <li key={f.id} className="flex items-center gap-3 py-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-lichen-100 text-lichen-700"><FileText className="h-4 w-4" aria-hidden="true" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-loam-900">{f.name}</p>
                <p className="text-sm text-loam-500">{t('forms.list.responses', { count: f.responsesCount })}</p>
              </div>
              <a href={f.url} target="_blank" rel="noopener" className="rounded-md p-2 text-loam-500 hover:bg-loam-100" title={t('forms.list.open')} aria-label={t('forms.list.open')}>
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
              {admin && (
                <button type="button" className="rounded-md p-2 text-loam-400 hover:bg-clay-50 hover:text-clay-500"
                  title={t('forms.list.remove', { name: f.name })} aria-label={t('forms.list.remove', { name: f.name })}
                  onClick={() => window.confirm(t('forms.list.remove_confirm', { name: f.name })) && router.delete(`${base}/forms/${f.id}`, { preserveScroll: true })}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {admin && (
        <form
          className="mt-4 rounded-xl bg-loam-50 p-4"
          onSubmit={(event) => {
            event.preventDefault()
            form.transform((data) => ({ form: data }))
            form.post(`${base}/forms`, { preserveScroll: true, onSuccess: () => form.reset() })
          }}
        >
          <h3 className="text-sm font-semibold text-loam-700">{t('forms.list.add_title')}</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <Field label={t('forms.list.link')} error={form.errors.link}>
              <Input value={form.data.link} onChange={(e) => form.setData('link', e.target.value)} placeholder={t('forms.list.link_placeholder')} required />
            </Field>
            <Field label={t('forms.list.name')} error={form.errors.name} hint={t('forms.list.name_hint')}>
              <Input value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} placeholder={t('forms.list.name_placeholder')} maxLength={120} />
            </Field>
          </div>
          <Button type="submit" size="sm" className="mt-3" disabled={form.processing || form.data.link.trim() === ''}>{t('forms.list.add')}</Button>
        </form>
      )}
    </Card>
  )
}

function Responses({ responses, maps, admin, base, toFile }: { responses: TeamFormResponse[]; maps: TeamFormsPageProps['maps']; admin: boolean; base: string; toFile: number }) {
  return (
    <Card>
      <h2 className="flex items-center justify-between gap-2 text-base">
        <span>{t('forms.responses.title')}</span>
        {toFile > 0 && <span className="rounded-full bg-humus-100 px-2.5 py-0.5 font-sans text-sm font-medium text-humus-800">{t('forms.responses.to_file', { count: toFile })}</span>}
      </h2>
      {responses.length === 0 ? (
        <p className="mt-3 text-sm text-loam-500">{t('forms.responses.empty')}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {responses.map((r) => <ResponseRow key={r.id} response={r} maps={maps} admin={admin} base={base} />)}
        </ul>
      )}
    </Card>
  )
}

function ResponseRow({ response, maps, admin, base }: { response: TeamFormResponse; maps: TeamFormsPageProps['maps']; admin: boolean; base: string }) {
  const unfiled = response.mapId == null
  const [mapId, setMapId] = useState('')
  const [moving, setMoving] = useState(false)
  const [busy, setBusy] = useState(false)
  const options = { preserveScroll: true, onStart: () => setBusy(true), onFinish: () => setBusy(false) }
  const choosing = unfiled || moving

  return (
    <li className={clsx('rounded-xl p-3 ring-1', unfiled ? 'bg-humus-50/60 ring-humus-200' : 'bg-white ring-loam-200')}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1 basis-56">
          <p className="text-sm font-medium text-loam-900">
            {response.formName}
            <span className="ml-2 font-normal text-loam-500">{relativeTime(response.submittedAt)}</span>
          </p>
          {unfiled ? (
            <p className="mt-0.5 text-sm text-humus-800">
              <span className="font-medium">{t('forms.responses.unfiled')}</span>
              {' · '}
              {response.mapReference ? t('forms.responses.unfiled_reference', { reference: response.mapReference }) : t('forms.responses.unfiled_hint')}
            </p>
          ) : (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-loam-600">
              <MapPinned className="h-4 w-4 text-leaf-600" aria-hidden="true" />
              {t('forms.responses.filed_in')}
              <Link href={`/maps/${response.mapId}/forms?open=${response.id}`} className="font-medium text-prune-700 hover:underline">
                {response.mapName}
              </Link>
              {!moving && (
                <button type="button" className="text-loam-500 underline-offset-2 hover:underline" onClick={() => setMoving(true)}>{t('forms.responses.move')}</button>
              )}
            </p>
          )}
        </div>
        {admin && (
          <button type="button" disabled={busy} className="rounded-md p-2 text-loam-400 hover:bg-clay-50 hover:text-clay-500 disabled:opacity-50"
            title={t('forms.responses.delete')} aria-label={t('forms.responses.delete')}
            onClick={() => window.confirm(t('forms.responses.delete_confirm')) && router.delete(`${base}/form_responses/${response.id}`, options)}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {choosing && (
        <form className="mt-2 flex flex-wrap gap-2" onSubmit={(event) => {
          event.preventDefault()
          router.patch(`${base}/form_responses/${response.id}`, { response: { map_id: mapId } }, { ...options, onSuccess: () => setMoving(false) })
        }}>
          <Select value={mapId} onChange={(e) => setMapId(e.target.value)} aria-label={t('forms.responses.choose_map')} className="min-w-0 flex-1 basis-48" required>
            <option value="">{t('forms.responses.choose_map')}</option>
            {maps.filter((m) => m.id !== response.mapId).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
          <Button type="submit" size="sm" disabled={busy || mapId === ''}>{t('forms.responses.file')}</Button>
          {moving && <Button variant="ghost" size="sm" onClick={() => setMoving(false)}>{t('common.cancel')}</Button>}
        </form>
      )}

      <details className="group mt-2" open={unfiled}>
        <summary className="cursor-pointer text-sm text-prune-700 hover:underline">{t('forms.responses.show_answers')}</summary>
        <FormAnswers fields={response.fields} className="mt-2" />
      </details>
    </li>
  )
}
