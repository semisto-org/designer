import { Head, Link, router } from '@inertiajs/react'
import clsx from 'clsx'
import { ArrowLeft, Printer, Snowflake } from 'lucide-react'
import type { Geometry } from 'geojson'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Field'
import { Pill } from '@/components/ui/Pill'
import { t } from '@/lib/i18n'
import { formatDate } from '@/lib/money'
import { useMapInstance } from '@/map/MapContext'
import { MapView } from '@/map/MapView'
import { installBoundary } from '@/map/layers/boundary'
import { syncRegionLayers } from '@/map/layers/region'
import { formatKm2 } from '@/territories/format'
import { installTerritoryItems, type MapItem } from '@/territories/layers'
import type { NotebookLead, NotebookMarker, NotebookProps } from '@/types/territories'

const n = (key: string, options?: Record<string, string | number>) => t(`territories.notebook.${key}`, options)
const v = (group: string, key: string) => t(`territories.show.values.${group}.${key}`)
const date = (iso?: string | null) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? formatDate(iso) : iso ?? '')

/**
 * The « carnet du territoire », in five parts, for the collège communal
 * (working version) or for anyone (public version: no hypotheses, no
 * outline on private land). Printed or saved as PDF from the browser.
 */
export default function TerritoryNotebook(props: NotebookProps) {
  const { territory, version, canEdit } = props
  const working = version === 'working'
  const stamp = working ? n('working_stamp', { date: formatDate(props.generatedOn) }) : n('public_stamp', { date: formatDate(props.generatedOn) })
  const decided = [...props.leads, ...props.hypotheses]

  return (
    <article className="mx-auto max-w-3xl print:max-w-none">
      <Head title={`${n('title')} · ${territory.name}`} />
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`/territories/${territory.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-prune-700 hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden />{n('back')}
        </Link>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/territories/${territory.id}/notebook${working ? '?version=public' : ''}`} size="sm" variant="secondary">
            {working ? n('switch_public') : n('switch_working')}
          </ButtonLink>
          <Button size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden />{n('print')}</Button>
        </div>
      </div>

      <p className={clsx('mt-6 inline-block rounded-full px-3 py-1 text-sm font-medium', working ? 'bg-humus-100 text-humus-800' : 'bg-leaf-100 text-leaf-800')}>{stamp}</p>
      <h1 className="mt-3 text-4xl">{n('title')}</h1>
      <p className="mt-1 font-serif text-2xl text-prune-800">{territory.name}</p>
      <p className="mt-1 text-sm text-loam-500">{[territory.teamName, formatKm2(territory.areaM2), working ? n('working') : n('public')].join(' · ')}</p>

      <Editable territoryId={territory.id} field="intro" value={props.intro} canEdit={canEdit && working} placeholder={n('intro_placeholder')} className="mt-6" />
      <p className="mt-4 rounded-xl bg-loam-50 p-4 text-sm text-loam-700 ring-1 ring-loam-200">{n('disclaimer')}</p>

      <Part title={n('parts.says')}>
        <h3 className="text-lg">{n('actors')}</h3>
        {props.says.actors.length === 0 ? <Empty>{n('no_actors')}</Empty> : (
          <ul className="mt-2 grid gap-2">
            {props.says.actors.map((actor) => (
              <li key={actor.id}>
                <span className="font-medium">{actor.title}</span>
                {[actor.organization, actor.function, actor.metOn && date(actor.metOn)].filter(Boolean).length > 0 && (
                  <span className="text-loam-500"> · {[actor.organization, actor.function, actor.metOn && date(actor.metOn)].filter(Boolean).join(' · ')}</span>
                )}
                {actor.body && <p className="text-sm text-loam-700">{actor.body}</p>}
              </li>
            ))}
          </ul>
        )}
        <h3 className="mt-5 text-lg">{n('expectations')}</h3>
        {props.says.expectations.length === 0 ? <Empty>{n('no_expectations')}</Empty> : (
          <ul className="mt-2 grid gap-3">
            {props.says.expectations.map((expectation) => (
              <li key={expectation.id}>
                <p>
                  <span className="font-medium">{expectation.title}</span>
                  {expectation.year && <span className="text-loam-500"> · {expectation.year}</span>}
                  {!expectation.validated && <span className="text-humus-700"> · {n('expectation_not_validated')}</span>}
                </p>
                {expectation.body && <p className="text-sm text-loam-700">{expectation.body}</p>}
                {expectation.sources.length > 0 && <p className="text-sm text-loam-500">{expectation.sources.map((s) => s.title).join(' · ')}</p>}
              </li>
            ))}
          </ul>
        )}
      </Part>

      <Part title={n('parts.shows')}>
        <div className="relative h-80 overflow-hidden rounded-2xl ring-1 ring-loam-200 print:h-[12cm]">
          <MapView className="absolute inset-0" center={[(territory.bbox[0] + territory.bbox[2]) / 2, (territory.bbox[1] + territory.bbox[3]) / 2]} bbox={territory.bbox} compact>
            <NotebookMap {...props} />
          </MapView>
        </div>
        <Markers markers={props.shows.markers} empty={n('no_markers')} />
      </Part>

      <Part title={n('parts.seen')}>
        {props.seen.markers.length === 0 && props.seen.leads.length === 0 ? <Empty>{n('no_seen')}</Empty> : (
          <>
            <Markers markers={props.seen.markers} empty="" />
            {props.seen.leads.length > 0 && (
              <ul className="mt-2 grid gap-1 text-sm">
                {props.seen.leads.map((lead) => <li key={lead.id}>{lead.title}{lead.seenOn && <span className="text-loam-500"> · {n('lead.seen_on', { date: date(lead.seenOn) })}</span>}</li>)}
              </ul>
            )}
          </>
        )}
      </Part>

      <Part title={n('parts.leads')}>
        {props.leads.length === 0 ? <Empty>{n('no_leads')}</Empty> : (
          <ol className="grid gap-4">{props.leads.map((lead) => <Lead key={lead.id} lead={lead} working={working} />)}</ol>
        )}
        {working && props.hypotheses.length > 0 && (
          <div className="mt-6 rounded-2xl bg-humus-50/60 p-4 ring-1 ring-humus-200">
            <h3 className="text-lg">{n('hypotheses')}</h3>
            <p className="text-sm text-loam-600">{n('hypotheses_why')}</p>
            <ol className="mt-3 grid gap-4">{props.hypotheses.map((lead) => <Lead key={lead.id} lead={lead} working />)}</ol>
          </div>
        )}
        {props.waitingForFarmer > 0 && <p className="mt-4 text-sm text-humus-800">{n('waiting_farmer', { count: props.waitingForFarmer })}</p>}
      </Part>

      <Part title={n('parts.start')}>
        {props.firstSteps.length === 0 ? <Empty>{n('no_start')}</Empty> : (
          <ol className="grid gap-2">
            {props.firstSteps.map((step) => (
              <li key={step.id} className="flex flex-wrap items-center gap-2">
                <span className="font-serif text-xl font-semibold text-prune-800">{step.order}.</span>
                <span className="font-medium">{step.title}</span>
                {step.thisWinter && <Pill tone="leaf" icon={<Snowflake aria-hidden />}>{t('territories.show.badges.this_winter')}</Pill>}
              </li>
            ))}
          </ol>
        )}
      </Part>

      <Part title={n('parts.decision')}>
        {decided.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-loam-500">
                <tr><th className="py-1 pr-3 font-medium">{n('decision_table.lead')}</th><th className="py-1 pr-3 font-medium">{n('decision_table.status')}</th><th className="py-1 pr-3 font-medium">{n('decision_table.reason')}</th><th className="py-1 font-medium">{n('decision_table.date')}</th></tr>
              </thead>
              <tbody className="divide-y divide-loam-100">
                {decided.map((lead) => (
                  <tr key={lead.id}>
                    <td className="py-1.5 pr-3">{lead.title}</td>
                    <td className="py-1.5 pr-3">{lead.decision?.status ? v('decision', lead.decision.status) : <span className="text-loam-400">{n('decision_table.undecided')}</span>}</td>
                    <td className="py-1.5 pr-3">{lead.decision?.reason}</td>
                    <td className="py-1.5">{date(lead.decision?.decided_on)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <h3 className="mt-5 text-lg">{n('next_step')}</h3>
        <Editable territoryId={territory.id} field="next_step" value={props.decision.nextStep} canEdit={canEdit && working} placeholder={n('next_step_placeholder')} />
        <h3 className="mt-4 text-lg">{n('next_step_budget')}</h3>
        <Editable territoryId={territory.id} field="next_step_budget" value={props.decision.budget} canEdit={canEdit && working} placeholder={n('budget_placeholder')} />
      </Part>

      {props.sources.length > 0 && (
        <Part title={n('parts.sources')}>
          <ol className="grid list-decimal gap-1 pl-5 text-sm">
            {props.sources.map((source) => (
              <li key={source.id}>
                {source.url ? <a href={source.url} className="text-prune-700 hover:underline print:text-loam-900">{source.title}</a> : source.title}
                <span className="text-loam-500">{[source.author, source.publishedOn && date(source.publishedOn), n('sources_rights', { rights: v('rights', source.rights) })].filter(Boolean).map((x) => ` · ${x}`).join('')}</span>
              </li>
            ))}
          </ol>
        </Part>
      )}

      {territory.boundarySource.label && (
        <p className="mt-10 text-sm text-loam-500">{n('boundary_source', { label: territory.boundarySource.label, licence: territory.boundarySource.licence ?? '' })}</p>
      )}
      <p className="mt-2 text-sm text-loam-500">{stamp}</p>
    </article>
  )
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10 break-inside-avoid-page">
      <h2 className="border-b border-loam-200 pb-1 text-2xl">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

const Empty = ({ children }: { children: ReactNode }) => <p className="text-sm text-loam-500">{children}</p>

function Markers({ markers, empty }: { markers: NotebookMarker[]; empty: string }) {
  if (markers.length === 0) return empty ? <p className="mt-3 text-sm text-loam-500">{empty}</p> : null
  return (
    <ul className="mt-3 grid gap-2">
      {markers.map((marker) => (
        <li key={marker.id}>
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium">{marker.title}</span>
            {marker.occurredOn && <span className="text-loam-500">· {date(marker.occurredOn)}</span>}
            <Pill tone={marker.proof === 'confirmed' ? 'prune' : marker.proof === 'seen' ? 'leaf' : 'humus'}>{v('proof', marker.proof)}</Pill>
            {marker.proof === 'computed' && <Pill tone="humus">{t('territories.show.badges.concordance')}</Pill>}
          </p>
          {marker.body && <p className="text-sm text-loam-700">{marker.body}</p>}
          {marker.sources.length > 0 && <p className="text-sm text-loam-500">{marker.sources.map((s) => s.title).join(' · ')}</p>}
        </li>
      ))}
    </ul>
  )
}

function Lead({ lead, working }: { lead: NotebookLead; working: boolean }) {
  const keeper = lead.keeper
  return (
    <li className="break-inside-avoid rounded-2xl bg-white p-4 ring-1 ring-loam-200">
      <p className="flex flex-wrap items-center gap-1.5">
        <span className="font-serif text-lg font-semibold text-prune-900">{lead.title}</span>
        {lead.rank && <Pill tone="lichen">{v('rank', lead.rank)}</Pill>}
        {lead.theme && <Pill>{v('theme', lead.theme)}</Pill>}
        {lead.orphan && <Pill tone="clay">{t('territories.show.badges.orphan')}</Pill>}
      </p>
      <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-[10rem_1fr]">
        <dt className="text-loam-500">{n('lead.where')}</dt><dd>{v('land', lead.land)}</dd>
        {lead.body && <><dt className="text-loam-500">{n('lead.why')}</dt><dd className="whitespace-pre-line">{lead.body}</dd></>}
        {lead.answers.length > 0 && <><dt className="text-loam-500">{n('lead.answers')}</dt><dd>{lead.answers.join(' · ')}</dd></>}
        {lead.magnitude && <><dt className="text-loam-500">{n('lead.magnitude')}</dt><dd>{lead.magnitude}</dd></>}
        {working && (lead.land === 'agricultural' || lead.land === 'private') && (
          <><dt className="text-loam-500">{n('lead.agreement')}</dt><dd>
            {lead.farmer?.answer ? n('lead.farmer_answer', { answer: v('farmer_answer', lead.farmer.answer), date: date(lead.farmer.contacted_on) }) : n('lead.farmer_missing')}
          </dd></>
        )}
        <dt className="text-loam-500">{n('lead.keeper')}</dt>
        <dd>{keeper?.role
          ? <>{n('lead.keeper_line', { role: keeper.role, hours: keeper.hours_per_year ?? '?', lifespan: keeper.lifespan_years ?? '?' })}{keeper.gestures && <span className="text-loam-600"> · {keeper.gestures}</span>}{keeper.agreement && <span className="text-loam-600"> · {keeper.agreement}</span>}</>
          : <span className="text-clay-700">{n('lead.no_keeper')}</span>}
        </dd>
        {lead.seenOn && <><dt className="text-loam-500" /><dd className="text-loam-500">{n('lead.seen_on', { date: date(lead.seenOn) })}</dd></>}
      </dl>
    </li>
  )
}

/** A notebook's own words (introduction, next step, budget), written in the working version. */
function Editable({ territoryId, field, value, canEdit, placeholder, className }: {
  territoryId: number; field: 'intro' | 'next_step' | 'next_step_budget'; value: string; canEdit: boolean; placeholder: string; className?: string
}) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  if (!canEdit) return value ? <p className={clsx('whitespace-pre-line text-loam-800', className)}>{value}</p> : null
  const save = () => {
    if (text === value) return
    router.patch(`/territories/${territoryId}`, { notebook: { [field]: text } }, { preserveScroll: true, preserveState: true })
  }
  return (
    <div className={className}>
      <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} onBlur={save} placeholder={placeholder} className="print:hidden" />
      {text && <p className="hidden whitespace-pre-line print:block">{text}</p>}
    </div>
  )
}

function NotebookMap({ territory, mapFeatures, baseLayer, overlays }: NotebookProps) {
  const instance = useMapInstance()
  const items: MapItem[] = useMemo(() => mapFeatures.map((feature) => {
    const p = (feature.properties ?? {}) as { kind: 'marker' | 'lead'; id: number; title: string; proof?: string; sharp?: boolean }
    return { id: p.id, kind: p.kind, status: 'active', geometry: feature.geometry as Geometry, proof: p.proof, sharp: p.sharp, title: p.title }
  }), [mapFeatures])
  const framed = useRef(false)
  useEffect(() => {
    if (!instance) return
    if (baseLayer) {
      syncRegionLayers(instance, [baseLayer, ...overlays], {
        base: baseLayer.key, overlays: overlays.map((layer) => layer.key), opacity: {}, bounds: territory.region?.bounds ?? null,
      }, () => undefined)
    }
    const apply = () => {
      installBoundary(instance, territory.boundary)
      installTerritoryItems(instance, items, null)
      if (!framed.current) {
        framed.current = true
        instance.resize()
        // Once the container has its printed size.
        requestAnimationFrame(() => instance.fitBounds(territory.bbox, { padding: 24, duration: 0 }))
      }
    }
    // The children mount once the style is loaded; tiles still loading
    // (isStyleLoaded() is then false) do not stop sources from being added.
    apply()
  }, [instance, territory, items, baseLayer, overlays])
  return null
}
