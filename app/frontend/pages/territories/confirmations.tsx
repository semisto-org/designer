import { Head, Link, router } from '@inertiajs/react'
import clsx from 'clsx'
import { ArrowLeft, Check, Eye, MapPin, Printer, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { CompanionEmpty } from '@/components/ui/Companion'
import { Flash } from '@/components/ui/Flash'
import { Select } from '@/components/ui/Field'
import { HandNote } from '@/components/ui/HandNote'
import { Pill } from '@/components/ui/Pill'
import { themeStyle } from '@/lib/documentTheme'
import { t } from '@/lib/i18n'
import { formatDate } from '@/lib/money'
import type { ConfirmationActor, ConfirmationEntry, ConfirmationsProps } from '@/types/territories'

const c = (key: string, options?: Record<string, string | number>) => t(`territories.confirmations.${key}`, options)
const today = () => new Date().toISOString().slice(0, 10)

/**
 * « À confirmer » — what the dossier waits to hear from each actor, one sheet
 * per actor for the meeting (A4, the team's charter, printed or saved as PDF
 * by the browser), then what only a visit can tell. After the meeting, each
 * answer is noted with one click.
 */
export default function TerritoryConfirmations(props: ConfirmationsProps) {
  const { territory, byActor, toVisit, unassigned, actors, counts, canEdit, theme, actorId } = props
  const base = `/territories/${territory.id}/confirmations`
  const empty = byActor.length === 0 && toVisit.length === 0 && unassigned.length === 0

  return (
    <div className="mx-auto max-w-[210mm]">
      <Head title={c('page_title', { name: territory.name })} />
      <Flash />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/territories/${territory.id}?tab=lead`} className="inline-flex items-center gap-1 text-sm font-medium text-prune-700 hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden />{c('back')}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {byActor.length > 0 && (
            <div className="w-full sm:w-64">
              <Select aria-label={c('one_actor')} value={actorId ?? ''} onChange={(e) => router.visit(e.target.value ? `${base}?actor=${e.target.value}` : base)}>
                <option value="">{c('all_actors')}</option>
                {(actorId ? actors : byActor.map((g) => g.actor)).map((actor) => <option key={actor.id} value={actor.id}>{actor.title}</option>)}
              </Select>
            </div>
          )}
          <Button onClick={() => window.print()} disabled={empty}>
            <Printer className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">{c('print')}</span>
            <span className="sm:hidden">{c('print_short')}</span>
          </Button>
        </div>
      </div>

      <div style={themeStyle(theme)} className="font-doc-body text-base text-doc-text">
        <header className="mb-6 print:hidden">
          <h1 className="font-doc-heading text-4xl text-doc-heading">{c('title')}</h1>
          <p className="mt-1 font-doc-heading text-2xl text-doc-accent">{territory.name}</p>
          <p className="mt-3 max-w-prose text-loam-700">{c('intro')}</p>
          <p className="mt-2 text-sm text-loam-500">{c('counts', { waiting: counts.waiting, visit: counts.toVisit, confirmed: counts.confirmed, seen: counts.seen })}</p>
        </header>

        {empty && <CompanionEmpty title={c('empty.title')} why={actors.length === 0 ? c('no_actors') : c('empty.why')} className="print:hidden" />}

        {byActor.map((group, index) => (
          <Sheet key={group.actor.id} first={index === 0} {...props}>
            <ActorHeader actor={group.actor} />
            <p className="mt-3 text-loam-700">{c('sheet_intro')}</p>
            <ol className="mt-5 grid gap-4">
              {group.items.map((entry, i) => (
                <Entry key={entry.id} entry={entry} number={i + 1} territoryId={territory.id}>
                  <Answers />
                  {canEdit && (
                    <div className="mt-3 flex flex-wrap gap-2 print:hidden">
                      <Button size="sm" onClick={() => verify(territory.id, entry, { verification: 'actor', verified_by_id: group.actor.id, verified_on: today() })}>
                        <Check className="h-4 w-4" aria-hidden />{c('confirm', { actor: group.actor.title })}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => verify(territory.id, entry, { verification: 'site', verified_on: today(), confirm_with_id: '', confirm_question: '' })}>
                        <Eye className="h-4 w-4" aria-hidden />{c('seen')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => verify(territory.id, entry, { confirm_with_id: '', confirm_question: '' })}>
                        <X className="h-4 w-4" aria-hidden />{c('unlist')}
                      </Button>
                    </div>
                  )}
                </Entry>
              ))}
            </ol>
          </Sheet>
        ))}

        {toVisit.length > 0 && (
          <Sheet first={byActor.length === 0} {...props}>
            <h2 className="font-doc-heading text-3xl text-doc-heading">{c('to_visit.title')}</h2>
            <p className="mt-2 text-loam-700">{c('to_visit.why')}</p>
            <ol className="mt-5 grid gap-4">
              {toVisit.map((entry, i) => (
                <Entry key={entry.id} entry={entry} number={i + 1} territoryId={territory.id}>
                  {canEdit && <Assign territoryId={territory.id} entry={entry} actors={actors} onSeen />}
                </Entry>
              ))}
            </ol>
          </Sheet>
        )}

        {unassigned.length > 0 && (
          <section className="mt-8 print:hidden">
            <h2 className="font-doc-heading text-2xl text-doc-heading">{c('unassigned.title')}</h2>
            <p className="mt-1 text-loam-700">{actors.length === 0 ? c('no_actors') : c('unassigned.why')}</p>
            <ol className="mt-4 grid gap-3">
              {unassigned.map((entry, i) => (
                <Entry key={entry.id} entry={entry} number={i + 1} territoryId={territory.id}>
                  {canEdit && actors.length > 0 && <Assign territoryId={territory.id} entry={entry} actors={actors} />}
                </Entry>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  )
}

function verify(territoryId: number, entry: ConfirmationEntry, data: Record<string, string | number>) {
  router.post(`/territories/${territoryId}/items/${entry.id}/verify`, { ...data, lock_version: entry.lockVersion }, { preserveScroll: true })
}

/** A page on paper: the team's logo, the territory, the date, the footer. */
function Sheet({ first, children, territory, generatedOn, theme }: ConfirmationsProps & { first: boolean; children: ReactNode }) {
  return (
    <section className={clsx('mb-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-loam-900/10 sm:p-10 print:mb-0 print:rounded-none print:p-0 print:shadow-none print:ring-0', !first && 'print:break-before-page')}>
      <div className="mb-5 flex items-start justify-between gap-4 border-b border-loam-900/10 pb-3 text-sm text-loam-500">
        <div>
          <p className="font-doc-heading text-lg text-doc-heading">{territory.name}</p>
          <p>{c('generated', { team: territory.teamName, date: formatDate(generatedOn) })}</p>
        </div>
        {theme.logoUrl && <img src={theme.logoUrl} alt="" className="max-h-12 max-w-32 object-contain" />}
      </div>
      {children}
      <p className="mt-8 whitespace-pre-line border-t border-loam-900/10 pt-3 text-sm text-loam-500">{theme.footer ? `${theme.footer}\n` : ''}{c('footer')}</p>
    </section>
  )
}

function ActorHeader({ actor }: { actor: ConfirmationActor }) {
  const details = [actor.organization, actor.function, actor.contact, actor.metOn && c('met_on', { date: formatDate(actor.metOn) })].filter(Boolean)
  return (
    <div>
      <h2 className="font-doc-heading text-3xl text-doc-heading">{c('sheet_for', { actor: actor.title })}</h2>
      {details.length > 0 && <p className="mt-1 text-loam-600">{details.join(' · ')}</p>}
    </div>
  )
}

/** One entry to check: what we read, the question, where it is on the land. */
function Entry({ entry, number, territoryId, children }: { entry: ConfirmationEntry; number: number; territoryId: number; children?: ReactNode }) {
  const [lng, lat] = entry.point ?? [0, 0]
  return (
    <li className="break-inside-avoid rounded-xl bg-loam-50/70 p-4 ring-1 ring-loam-200 print:bg-transparent print:p-0 print:ring-0">
      <p className="flex flex-wrap items-baseline gap-2">
        <span className="font-doc-heading text-xl text-doc-accent">{number}.</span>
        <Link href={`/territories/${territoryId}?tab=${entry.kind}`} className="font-doc-heading text-xl font-semibold text-doc-heading hover:underline print:no-underline">{entry.title}</Link>
        <Pill>{c(`kinds.${entry.kind}`)}</Pill>
        {entry.occurredLabel && <span className="text-loam-500">{entry.occurredLabel}</span>}
      </p>
      {entry.body && <p className="mt-1 whitespace-pre-line text-loam-700">{entry.body}</p>}
      {entry.question && <HandNote className="mt-2">{entry.question}</HandNote>}
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-loam-500">
        {entry.basin && <span>{c('basin', { basin: entry.basin })}</span>}
        {entry.point && (
          <a href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-prune-700 hover:underline print:text-loam-500 print:no-underline">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            <span className="print:hidden">{c('open_map')}</span>
            <span className="hidden print:inline">{c('point', { lat: lat.toFixed(5), lng: lng.toFixed(5) })}</span>
          </a>
        )}
      </p>
      {children}
    </li>
  )
}

/** On paper: three boxes and room for notes, to fill in during the meeting. */
function Answers() {
  return (
    <div className="mt-3 hidden print:block">
      <p className="flex flex-wrap gap-6">
        {(['answer_yes', 'answer_fix', 'answer_unknown'] as const).map((key) => (
          <span key={key} className="inline-flex items-center gap-2"><span className="inline-block h-4 w-4 rounded-sm border border-loam-500" aria-hidden />{c(key)}</span>
        ))}
      </p>
      <p className="mt-3 text-sm text-loam-500">{c('notes')}</p>
      <div className="mt-1 h-16 border-b border-dotted border-loam-400" aria-hidden />
    </div>
  )
}

/** Names who to ask, or notes that it was seen on site. */
function Assign({ territoryId, entry, actors, onSeen = false }: { territoryId: number; entry: ConfirmationEntry; actors: ConfirmationActor[]; onSeen?: boolean }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 print:hidden">
      {actors.length > 0 && (
        <div className="w-full sm:w-64">
          <Select aria-label={c('ask')} value="" onChange={(e) => e.target.value && verify(territoryId, entry, { confirm_with_id: Number(e.target.value) })}>
            <option value="">{c('ask')}</option>
            {actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.title}</option>)}
          </Select>
        </div>
      )}
      {onSeen && (
        <Button size="sm" variant="secondary" onClick={() => verify(territoryId, entry, { verification: 'site', verified_on: today() })}>
          <Eye className="h-4 w-4" aria-hidden />{c('seen')}
        </Button>
      )}
    </div>
  )
}

