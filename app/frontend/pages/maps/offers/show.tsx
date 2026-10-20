import { Head, Link } from '@inertiajs/react'
import { Eye, Printer, X } from 'lucide-react'
import { Component, useState, type ReactNode } from 'react'
import { HelpButton } from '@/components/help/HelpButton'
import { MapViewHeader } from '@/components/map_views/MapViews'
import { InternalCard } from '@/components/offers/InternalCard'
import { PhaseCard } from '@/components/offers/PhaseCard'
import { PlantsCard } from '@/components/offers/PlantsCard'
import { PrecisionCard } from '@/components/offers/PrecisionCard'
import { TerrainCard } from '@/components/offers/TerrainCard'
import { TotalsCard, Warnings } from '@/components/offers/TotalsCard'
import { VersionsCard } from '@/components/offers/VersionsCard'
import { euros, SaveIndicator } from '@/components/offers/shared'
import { useOfferAutosave } from '@/components/offers/useOfferAutosave'
import { Button, ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/Card'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import type { OfferData, OfferMeasures, OfferPageProps, OfferResult, OfferVersionSummary } from '@/types/offers'

/**
 * The offer builder of a team map: what the map measures, the team's
 * internal sheet, the budget phase by phase with every computed line open
 * to correction, the plants, the total and the saved versions.
 */
export default function OffersShow(props: OfferPageProps) {
  const { map, team } = props
  if (!props.canUseOffers || !props.offer || !props.measures || !props.result || !props.catalog) {
    return (
      <div className="space-y-6">
        <Head title={`${t('offers.page.title')} · ${map.name}`} />
        <EmptyState
          title={t('offers.unavailable.title')}
          action={<ButtonLink href={`/maps/${map.id}`} variant="secondary">{t('offers.unavailable.back')}</ButtonLink>}
        >
          {props.unavailableReason === 'not_member' && team
            ? t('offers.unavailable.not_member', { team: team.name })
            : t(`offers.unavailable.${props.unavailableReason ?? 'not_owner'}`)}
        </EmptyState>
      </div>
    )
  }
  return (
    <BuilderGuard>
      <Builder {...props} offer={props.offer} measures={props.measures} result={props.result} catalog={props.catalog} />
    </BuilderGuard>
  )
}

/** A rendering error must not blank the whole builder without a word. */
class BuilderGuard extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false }
  static getDerivedStateFromError() { return { crashed: true } }
  render() {
    if (!this.state.crashed) return this.props.children
    return (
      <EmptyState title={t('offers.page.title')} action={<Button variant="secondary" onClick={() => window.location.reload()}>{t('offers.page.reload')}</Button>}>
        {t('offers.page.crashed')}
      </EmptyState>
    )
  }
}

function Builder({ map, team, offer, measures: initialMeasures, result: initialResult, versions: initialVersions, catalog, templates, canEdit }: OfferPageProps & Required<Pick<OfferPageProps, 'offer' | 'measures' | 'result' | 'catalog'>>) {
  const readOnly = !canEdit
  const autosave = useOfferAutosave(map.id, offer, initialMeasures, initialResult, !readOnly)
  const { inputs, setInputs, measures, result, status } = autosave
  const [versions, setVersions] = useState<OfferVersionSummary[]>(initialVersions ?? [])
  const [notice, setNotice] = useState<string | null>(null)
  const latest = versions.reduce<OfferVersionSummary | null>((best, version) => (!best || version.number > best.number ? version : best), null)

  async function restore(number: number) {
    await autosave.save()
    try {
      const data = await api<{ offer: OfferData; measures: OfferMeasures; result: OfferResult }>(`/maps/${map.id}/offer/versions/${number}/restore`, { method: 'POST' })
      autosave.adopt(data, true)
      setNotice(t('offers.versions.restored', { number }))
    } catch (error) {
      setNotice((error as Error).message)
    }
  }

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      <Head title={`${t('offers.page.title')} · ${map.name}`} />

      <div className="print:hidden"><MapViewHeader map={map} current="offer" /></div>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl">{t('offers.page.title')}</h1>
          {/* The tabs above name the map on screen; on paper, the subtitle does. */}
          {team && <p className="truncate text-loam-500 print:hidden">{team.name}</p>}
          <p className="hidden truncate text-loam-500 print:block">{map.name}{team && ` · ${team.name}`}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {latest && (
            <Link href={`/maps/${map.id}/offer/versions/${latest.number}`} className="inline-flex items-center gap-1 text-sm font-medium text-prune-700 hover:text-prune-900">
              <Eye className="h-4 w-4" aria-hidden />{t('offers.page.client_view', { label: latest.label })}
            </Link>
          )}
          {!readOnly && <span className="hidden lg:inline"><SaveIndicator status={status} /></span>}
          <Button variant="ghost" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" />{t('offers.page.print_internal')}</Button>
          <HelpButton slug="chiffrer-une-offre" />
        </div>
      </header>

      <p className="max-w-3xl text-sm text-loam-600">{t('offers.page.intro')}</p>
      {readOnly && <p className="text-sm text-loam-500">{t('offers.page.read_only')}</p>}
      {status === 'error' && !readOnly && (
        <p role="alert" className="rounded-xl bg-clay-50 p-3 text-sm text-clay-700 ring-1 ring-inset ring-clay-200">{t('offers.page.save_error')}</p>
      )}
      {(autosave.conflict || notice) && (
        <div role="status" className="flex items-start justify-between gap-3 rounded-xl bg-loam-50 p-3 text-sm text-loam-800 ring-1 ring-inset ring-loam-200">
          <span>{autosave.conflict ?? notice}</span>
          <button type="button" aria-label={t('offers.page.close')} onClick={() => { autosave.clearConflict(); setNotice(null) }} className="text-loam-400 hover:text-loam-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* On a phone the gauge comes first: it says what to fill in before the numbers mean much. */}
      <div className="lg:hidden"><PrecisionCard mapId={map.id} precision={result.precision} /></div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <TerrainCard map={map} inputs={inputs} measures={measures} pricing={autosave.pricing} readOnly={readOnly} onChange={setInputs} />
          <div id="internal" className="scroll-mt-6">
            <InternalCard
              mapId={map.id} inputs={inputs} measures={measures} result={result} catalog={catalog} pricing={autosave.pricing}
              templates={templates ?? []} templateId={autosave.templateId} onTemplate={autosave.setTemplate}
              readOnly={readOnly} onChange={setInputs}
            />
          </div>
          {result.phases.map((phase) => (
            <PhaseCard key={phase.key} phase={phase} inputs={inputs} readOnly={readOnly} onChange={setInputs} />
          ))}
          <PlantsCard inputs={inputs} result={result} readOnly={readOnly} onChange={setInputs} />
        </div>
        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <div className="hidden lg:block"><PrecisionCard mapId={map.id} precision={result.precision} /></div>
          <Warnings warnings={result.warnings} />
          <TotalsCard result={result} />
          <div id="versions" className="scroll-mt-6">
            <VersionsCard
              mapId={map.id}
              versions={versions}
              readOnly={readOnly}
              beforeSave={autosave.flush}
              onVersions={setVersions}
              onRestore={restore}
              notify={setNotice}
            />
          </div>
        </aside>
      </div>

      {/* On a phone the total sits at the end of a long page: keep it in sight. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-loam-200 bg-white/95 px-4 py-2.5 backdrop-blur lg:hidden print:hidden">
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-sm text-loam-500">{t('offers.totals.total')}</span>
            <span className="font-serif text-xl font-semibold tabular-nums text-prune-900">{euros(result.totals.total_tvac)}</span>
          </span>
          <span className="flex items-center gap-3">
            {!readOnly && <SaveIndicator status={status} />}
            <a href="#versions" className="rounded-full px-3 py-1.5 text-sm font-medium text-prune-700 ring-1 ring-inset ring-prune-200 hover:bg-prune-50">{t('offers.page.versions_link')}</a>
          </span>
        </div>
      </div>
    </div>
  )
}
