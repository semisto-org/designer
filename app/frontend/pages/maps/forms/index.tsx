import { Head, Link } from '@inertiajs/react'
import clsx from 'clsx'
import { ChevronDown, ExternalLink, FileText, MessageSquareText, Settings2 } from 'lucide-react'
import { useState } from 'react'
import { CopyField } from '@/components/CopyField'
import { HelpButton } from '@/components/help/HelpButton'
import { MapViewHeader } from '@/components/map_views/MapViews'
import { Card, EmptyState } from '@/components/ui/Card'
import { FormAnswers } from '@/documents/FormAnswers'
import { t } from '@/lib/i18n'
import { relativeTime } from '@/lib/relativeTime'
import type { MapFormLink, MapFormResponse, MapFormsPageProps } from '@/types/forms'

const longDate = (iso: string) => new Date(iso).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })

/**
 * A team map's « Formulaires »: the team's Tally forms with the link already
 * filled for this place (for editors, who send them to the client), and the
 * answers this place received, newest first, each one a page of the notebook.
 */
export default function MapForms({ map, team, connected, canEdit, forms, responses }: MapFormsPageProps) {
  // ?open=ID (from the team's page) opens that answer; otherwise the newest.
  const [openId, setOpenId] = useState<number | null>(() => {
    const asked = typeof window === 'undefined' ? null : Number(new URLSearchParams(window.location.search).get('open')) || null
    return asked ?? responses[0]?.id ?? null
  })
  const manage = team ? `/teams/${team.id}/forms` : '/teams'

  return (
    <div>
      <Head title={t('forms.map.page_title', { map: map.name })} />
      <MapViewHeader map={map} current="forms" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h1 className="text-3xl">{t('forms.map.title')}</h1>
          <p className="mt-1 text-loam-600">{team ? t('forms.map.intro', { team: team.name }) : t('forms.map.no_team')}</p>
        </div>
        <HelpButton slug="brancher-ses-formulaires-tally" />
      </div>

      {team && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          {canEdit && (
            <aside className="lg:order-2 lg:sticky lg:top-4 lg:self-start">
              <SendPanel connected={connected} admin={team.admin} forms={forms} manage={manage} />
            </aside>
          )}
          <section className={clsx('min-w-0', !canEdit && 'lg:col-span-2')} aria-labelledby="answers-title">
            <h2 id="answers-title" className="flex items-baseline gap-2 text-xl">
              {t('forms.map.answers')}
              {responses.length > 0 && <span className="font-sans text-sm text-loam-500">{responses.length}</span>}
            </h2>
            {responses.length === 0 ? (
              <div className="mt-3">
                <EmptyState title={t('forms.map.empty_title')}>{t(canEdit ? 'forms.map.empty_editor' : 'forms.map.empty_viewer')}</EmptyState>
              </div>
            ) : (
              <ol className="mt-3 space-y-3">
                {responses.map((response) => (
                  <Answer key={response.id} mapId={map.id} response={response} open={openId === response.id}
                    onToggle={() => setOpenId((id) => (id === response.id ? null : response.id))} />
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

/** The forms to send: each one's link, already filled for this place. */
function SendPanel({ connected, admin, forms, manage }: { connected: boolean; admin: boolean; forms: MapFormLink[]; manage: string }) {
  return (
    <Card>
      <h2 className="flex items-center gap-2 text-xl"><MessageSquareText className="h-5 w-5 text-prune-600" aria-hidden />{t('forms.map.send_title')}</h2>
      {!connected || forms.length === 0 ? (
        <>
          <p className="mt-2 text-sm text-loam-600">
            {!connected ? t(admin ? 'forms.map.not_connected_admin' : 'forms.map.not_connected') : t('forms.map.no_forms')}
          </p>
          {(admin || connected) && (
            <Link href={manage} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-prune-600 px-4 py-2 text-sm font-medium text-white hover:bg-prune-700">
              {!connected ? t('forms.connect.title') : t('forms.list.add_title')}
            </Link>
          )}
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-loam-600">{t('forms.map.send_hint')}</p>
          <ul className="mt-4 space-y-4">
            {forms.map((form) => (
              <li key={form.id}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-medium text-loam-900">{form.name}</p>
                  <a href={form.url} target="_blank" rel="noopener" className="inline-flex shrink-0 items-center gap-1 text-sm text-loam-500 hover:text-prune-700">
                    {t('forms.map.preview')}<ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </a>
                </div>
                <CopyField value={form.link} />
                <p className="mt-1 text-sm text-loam-500">{t('forms.map.received_here', { count: form.responsesCount })}</p>
              </li>
            ))}
          </ul>
        </>
      )}
      {connected && (
        <Link href={manage} className="mt-4 inline-flex items-center gap-1.5 border-t border-dashed border-loam-200 pt-3 text-sm text-prune-700 hover:underline">
          <Settings2 className="h-4 w-4" aria-hidden />{t('forms.send.manage')}
        </Link>
      )}
    </Card>
  )
}

/** One answer: the form and its date, then, opened, each question and what was said. */
function Answer({ mapId, response, open, onToggle }: { mapId: number; response: MapFormResponse; open: boolean; onToggle: () => void }) {
  return (
    <li className="overflow-hidden rounded-2xl bg-white ring-1 ring-loam-900/10">
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-loam-50">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-lichen-100 text-lichen-700"><FileText className="h-4 w-4" aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-loam-900">{response.formName}</span>
          <span className="block text-sm text-loam-500">
            {t('forms.map.received_on', { date: longDate(response.submittedAt), when: relativeTime(response.submittedAt) })}
          </span>
        </span>
        <ChevronDown className={clsx('h-4 w-4 shrink-0 text-loam-400 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="border-t border-loam-100 px-4 pb-4 pt-3">
          <FormAnswers fields={response.fields} />
          {response.documentId && (
            <Link href={`/maps/${mapId}/documents?open=${response.documentId}`} className="mt-3 inline-block text-sm text-prune-700 hover:underline">
              {t('forms.map.in_documents')}
            </Link>
          )}
        </div>
      )}
    </li>
  )
}
