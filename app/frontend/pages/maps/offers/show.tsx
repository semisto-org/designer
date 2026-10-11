import { Head, Link } from '@inertiajs/react'
import { ArrowLeft, Lock, Printer, X } from 'lucide-react'
import { useState } from 'react'
import { InternalCard } from '@/components/offers/InternalCard'
import { PhaseCard } from '@/components/offers/PhaseCard'
import { PlantsCard } from '@/components/offers/PlantsCard'
import { TerrainCard } from '@/components/offers/TerrainCard'
import { TotalsCard, Warnings } from '@/components/offers/TotalsCard'
import { VersionsCard } from '@/components/offers/VersionsCard'
import { SaveIndicator } from '@/components/offers/shared'
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
  return <Builder {...props} offer={props.offer} measures={props.measures} result={props.result} catalog={props.catalog} />
}

function Builder({ map, team, offer, measures: initialMeasures, result: initialResult, versions: initialVersions, catalog, templates, canEdit }: OfferPageProps & Required<Pick<OfferPageProps, 'offer' | 'measures' | 'result' | 'catalog'>>) {
  const readOnly = !canEdit
  const autosave = useOfferAutosave(map.id, offer, initialMeasures, initialResult, !readOnly)
  const { inputs, setInputs, measures, result, status } = autosave
  const [versions, setVersions] = useState<OfferVersionSummary[]>(initialVersions ?? [])
  const [notice, setNotice] = useState<string | null>(null)

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
    <div className="space-y-6">
      <Head title={`${t('offers.page.title')} · ${map.name}`} />

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href={`/maps/${map.id}`} className="inline-flex items-center gap-1 text-sm text-loam-500 hover:text-loam-900 print:hidden">
            <ArrowLeft className="h-4 w-4" />{t('offers.page.back')}
          </Link>
          <h1 className="mt-1 text-2xl">{t('offers.page.title')}</h1>
          <p className="truncate text-loam-500">{map.name}{team && ` · ${team.name}`}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <span className="inline-flex items-center gap-1 rounded-full bg-humus-50 px-2.5 py-1 text-xs font-medium text-humus-700 ring-1 ring-inset ring-humus-200">
            <Lock className="h-3 w-3" aria-hidden />{t('offers.page.internal_badge')}
          </span>
          {!readOnly && <SaveIndicator status={status} />}
          <Button variant="ghost" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" />{t('offers.page.print')}</Button>
        </div>
      </header>

      <p className="max-w-3xl text-sm text-loam-600">{t('offers.page.intro')}</p>
      {readOnly && <p className="text-sm text-loam-500">{t('offers.page.read_only')}</p>}
      {(autosave.conflict || notice) && (
        <div role="status" className="flex items-start justify-between gap-3 rounded-xl bg-loam-50 p-3 text-sm text-loam-800 ring-1 ring-inset ring-loam-200">
          <span>{autosave.conflict ?? notice}</span>
          <button type="button" aria-label={t('offers.page.close')} onClick={() => { autosave.clearConflict(); setNotice(null) }} className="text-loam-400 hover:text-loam-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <TerrainCard map={map} inputs={inputs} measures={measures} pricing={autosave.pricing} readOnly={readOnly} onChange={setInputs} />
          <InternalCard
            inputs={inputs} measures={measures} result={result} catalog={catalog} pricing={autosave.pricing}
            templates={templates ?? []} templateId={autosave.templateId} onTemplate={autosave.setTemplate}
            readOnly={readOnly} onChange={setInputs}
          />
          {result.phases.map((phase) => (
            <PhaseCard key={phase.key} phase={phase} inputs={inputs} readOnly={readOnly} onChange={setInputs} />
          ))}
          <PlantsCard inputs={inputs} result={result} readOnly={readOnly} onChange={setInputs} />
        </div>
        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <Warnings warnings={result.warnings} />
          <TotalsCard result={result} />
          <VersionsCard
            mapId={map.id}
            versions={versions}
            readOnly={readOnly}
            beforeSave={autosave.flush}
            onVersions={setVersions}
            onRestore={restore}
            notify={setNotice}
          />
        </aside>
      </div>
    </div>
  )
}
