import { Head, Link } from '@inertiajs/react'
import { ArrowLeft, Snowflake, Sprout } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import { MonthsCalendar } from '@/components/plants/MonthsCalendar'
import { ProvenanceBadge, sourceLabel } from '@/components/plants/ProvenanceBadge'
import { SpeciesTags } from '@/components/plants/SpeciesTags'
import { countryNames, formatDecimal, metres, strataLabel, vocab } from '@/components/plants/format'
import { t } from '@/lib/i18n'
import { STRATA_COLORS } from '@/map/plants/strata'
import type { CatalogueRegion, ObservationStats, Provenance, SpeciesSheet } from '@/types/plants'

type Props = { species: SpeciesSheet; observations: ObservationStats | null; region: CatalogueRegion | null }

const camel = (field: string) => field.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())

/** Species sheet: values with units and their provenance, calendar, varieties, garden observations. */
export default function PlantShow({ species: s, observations, region }: Props) {
  const p = (field: string): Provenance | undefined => s.provenance[camel(field)]
  const list = (facet: string, keys: string[]) => (keys.length ? keys.map((k) => vocab(facet, k)).join(', ') : null)
  const range = (min: number | null, max: number | null) =>
    min != null && max != null && min !== max
      ? t('plants.units.metres_range', { min: formatDecimal(min), max: formatDecimal(max) })
      : max != null || min != null ? metres(max ?? min) : null
  const rating = (v: number | null) => (v == null ? null : t('plants.units.rating', { value: v }))
  const years = (v: number | null) => (v == null ? null : t('plants.units.years', { count: v }))

  return (
    <>
      <Head title={s.commonName ?? s.latinName} />
      <Link href="/plants" className="inline-flex items-center gap-1 text-sm text-loam-500 hover:text-loam-800">
        <ArrowLeft className="h-4 w-4" />{t('plants.show.back')}
      </Link>

      <header className="mt-4">
        <h1 className="text-2xl">{s.commonName ?? s.latinName}</h1>
        <p className="mt-0.5 text-lg italic text-loam-600">{s.latinName}</p>
        {s.commonNames.length > 1 && (
          <p className="mt-1 text-sm text-loam-500">
            {t('plants.show.common_names')} : {s.commonNames.slice(1).join(', ')} <ProvenanceBadge provenance={p('common_names')} />
          </p>
        )}
        {s.genus && <p className="mt-1 text-sm text-loam-500">{t('plants.show.genus', { genus: s.genus })}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 ring-1 ring-loam-200">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: STRATA_COLORS[s.strata] }} />
            {strataLabel(s.strata)}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 ring-1 ring-loam-200">
            <Snowflake className="h-3.5 w-3.5 text-loam-400" />
            {s.hardinessZone ? t('plants.card.zone', { zone: s.hardinessZone }) : t('plants.card.unknown_zone')}
            {s.minTemperatureC != null && <span className="text-loam-500">· {t('plants.units.celsius', { value: formatDecimal(s.minTemperatureC) })}</span>}
          </span>
          <SpeciesTags species={s} country={region?.country} />
        </div>
        <p className="mt-2 text-xs text-loam-500">
          {t('plants.show.crown_hint', { value: formatDecimal(s.crownM) })}
          {s.crownIndicative && <> ({t('plants.show.crown_indicative')})</>}
        </p>
      </header>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Section list title={t('plants.show.sections.habit')}>
          <Row label={t('plants.fields.plant_type')} value={s.plantType && vocab('plant_type', s.plantType)} provenance={p('plant_type')} />
          <Row label={t('plants.fields.strata')} value={strataLabel(s.strata)} provenance={p('strata')} />
          <Row label={t('plants.fields.height')} value={range(s.heightMinM, s.heightMaxM)} provenance={p('height_max_m')} />
          <Row label={t('plants.fields.spread')} value={range(s.spreadMinM, s.spreadMaxM)} provenance={p('spread_max_m')} />
          <Row label={t('plants.fields.foliage_type')} value={s.foliageType && vocab('foliage_type', s.foliageType)} provenance={p('foliage_type')} />
          <Row label={t('plants.fields.life_cycle')} value={s.lifeCycle && vocab('life_cycle', s.lifeCycle)} provenance={p('life_cycle')} />
          <Row label={t('plants.fields.growth_rate')} value={s.growthRate && vocab('growth_rate', s.growthRate)} provenance={p('growth_rate')} />
          <Row label={t('plants.fields.root_system')} value={s.rootSystem && vocab('root_system', s.rootSystem)} provenance={p('root_system')} />
          <Row label={t('plants.fields.maturity_years')} value={years(s.maturityYears)} provenance={p('maturity_years')} />
          <Row label={t('plants.fields.production_start_year')} value={s.productionStartYear == null ? null : t('plants.units.after_years', { count: s.productionStartYear })} provenance={p('production_start_year')} />
          <Row label={t('plants.fields.fertility')} value={s.fertility && vocab('fertility', s.fertility)} provenance={p('fertility')} />
        </Section>

        <div className="space-y-4">
          <Section list title={t('plants.show.sections.climate')}>
            <Row label={t('plants.fields.hardiness_zone')} value={s.hardinessZone && t('plants.units.zone', { zone: s.hardinessZone })} provenance={p('hardiness_zone')} />
            <Row label={t('plants.fields.min_temperature_c')} value={s.minTemperatureC == null ? null : t('plants.units.celsius', { value: formatDecimal(s.minTemperatureC) })} provenance={p('min_temperature_c')} />
            <Row label={t('plants.fields.exposures')} value={list('exposures', s.exposures)} provenance={p('exposures')} />
          </Section>
          <Section list title={t('plants.show.sections.soil')}>
            <Row label={t('plants.fields.soil_moisture')} value={list('soil_moisture', s.soilMoisture)} provenance={p('soil_moisture')} />
            <Row label={t('plants.fields.soil_types')} value={list('soil_types', s.soilTypes)} provenance={p('soil_types')} />
            <Row label={t('plants.fields.soil_ph')} value={list('soil_ph', s.soilPh)} provenance={p('soil_ph')} />
            <Row label={t('plants.fields.soil_richness')} value={s.soilRichness && vocab('soil_richness', s.soilRichness)} provenance={p('soil_richness')} />
            <Row label={t('plants.fields.watering_need')} value={rating(s.wateringNeed)} provenance={p('watering_need')} />
          </Section>
        </div>

        <Section list title={t('plants.show.sections.uses')}>
          <Row label={t('plants.fields.edible_rating')} value={rating(s.edibleRating)} provenance={p('edible_rating')} />
          <Row label={t('plants.fields.edible_parts')} value={list('edible_parts', s.edibleParts)} provenance={p('edible_parts')} />
          <Row label={t('plants.fields.medicinal_rating')} value={rating(s.medicinalRating)} provenance={p('medicinal_rating')} />
          {s.toxicFor.length > 0 && <Row label={t('plants.fields.toxic_for')} value={list('toxic_for', s.toxicFor)} provenance={p('toxic_for')} tone="warning" />}
        </Section>

        <Section list title={t('plants.show.sections.ecosystem')}>
          <Row label={t('plants.fields.eco_services')} value={list('eco_services', s.ecoServices)} provenance={p('eco_services')} />
          <Row label={t('plants.fields.native_countries')} value={s.nativeCountries.length ? countryNames(s.nativeCountries) : null} provenance={p('native_countries')} />
          {s.invasiveCountries.length > 0 && <Row label={t('plants.fields.invasive_countries')} value={countryNames(s.invasiveCountries)} provenance={p('invasive_countries')} tone="warning" />}
        </Section>

        <Section title={t('plants.show.sections.calendar')} className="lg:col-span-2">
          <MonthsCalendar rows={[
            { key: 'flowering', label: t('plants.fields.flowering_months'), months: s.floweringMonths, color: '#b4acce' },
            { key: 'fruiting', label: t('plants.fields.fruiting_months'), months: s.fruitingMonths, color: '#87b88a' },
            { key: 'harvest', label: t('plants.fields.harvest_months'), months: s.harvestMonths, color: '#d9a527' },
            { key: 'pruning', label: t('plants.fields.pruning_months'), months: s.pruningMonths, color: '#899e79' },
          ]} />
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-loam-500">
            {(['flowering_months', 'fruiting_months', 'harvest_months', 'pruning_months'] as const).filter((f) => p(f)).map((f) => (
              <span key={f} className="inline-flex items-center gap-1">{t(`plants.fields.${f}`)} <ProvenanceBadge provenance={p(f)} /></span>
            ))}
          </p>
        </Section>

        <Section title={t('plants.show.sections.varieties')} className="lg:col-span-2">
          {s.varieties.length === 0 ? (
            <p className="text-sm text-loam-400">{t('plants.show.no_varieties')}</p>
          ) : (
            <ul className="divide-y divide-loam-100">
              {s.varieties.map((v) => (
                <li key={v.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-sm">
                  <span className="font-medium text-loam-800">{v.name}</span>
                  {v.commonName && <span className="text-loam-500">{v.commonName}</span>}
                  {v.fertility && <span className="text-loam-600">{vocab('fertility', v.fertility)} <ProvenanceBadge provenance={v.provenance.fertility} /></span>}
                  {v.tasteRating != null && <span className="text-loam-600">{t('plants.fields.taste_rating')} {t('plants.units.rating', { value: v.tasteRating })} <ProvenanceBadge provenance={v.provenance.tasteRating} /></span>}
                  {v.ripening && <span className="text-loam-600">{t('plants.fields.ripening')} : {v.ripening} <ProvenanceBadge provenance={v.provenance.ripening} /></span>}
                  {v.productivity && <span className="text-loam-600">{t('plants.fields.productivity')} : {v.productivity}</span>}
                  {v.diseaseResistance && <span className="text-loam-600">{t('plants.fields.disease_resistance')} : {v.diseaseResistance}</span>}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={t('plants.show.sections.observations')}>
          <p className="text-xs text-loam-500">{t('plants.show.observations_intro')}</p>
          {observations ? (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-loam-700">
                {t('plants.show.observations_counts', { count: observations.plants })} {t('plants.show.observations_gardens', { count: observations.gardens })}
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Stat label={t('plants.show.survival_rate')} value={`${observations.survivalRate} %`} />
                <Stat label={t('plants.show.average_vigor')} value={observations.averageVigor == null ? '—' : `${formatDecimal(observations.averageVigor)}/5`} />
              </div>
              <SurvivalBar stats={observations} />
            </div>
          ) : (
            <p className="mt-3 flex gap-2 rounded-lg bg-leaf-50 p-3 text-sm text-leaf-800">
              <Sprout className="mt-0.5 h-4 w-4 shrink-0" />{t('plants.show.observations_empty')}
            </p>
          )}
        </Section>

        <Section title={t('plants.show.sections.sources')}>
          <SourcesSummary species={s} />
        </Section>
      </div>
    </>
  )
}

function Section({ title, children, className = '', list = false }: { title: string; children: ReactNode; className?: string; list?: boolean }) {
  return (
    <Card className={className}>
      <h2 className="mb-2 text-base">{title}</h2>
      {list ? <dl className="divide-y divide-loam-100">{children}</dl> : children}
    </Card>
  )
}

function Row({ label, value, provenance, tone }: { label: string; value: ReactNode | null; provenance?: Provenance; tone?: 'warning' }) {
  const empty = value == null || value === ''
  return (
    <div className="grid grid-cols-[minmax(7rem,40%)_1fr] items-baseline gap-3 py-1.5 text-sm">
      <dt className="text-loam-500">{label}</dt>
      <dd className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={empty ? 'text-loam-400' : tone === 'warning' ? 'text-clay-700' : 'text-loam-800'}>{empty ? t('plants.show.no_value') : value}</span>
        {!empty && <ProvenanceBadge provenance={provenance} />}
      </dd>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-loam-50 p-3">
      <p className="text-xs text-loam-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-loam-900">{value}</p>
    </div>
  )
}

function SurvivalBar({ stats }: { stats: ObservationStats }) {
  const parts = [
    { key: 'established', value: stats.established, color: 'var(--color-leaf-500)' },
    { key: 'struggling', value: stats.struggling, color: 'var(--color-humus-400)' },
    { key: 'dead', value: stats.dead, color: 'var(--color-clay-500)' },
  ]
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-loam-100">
        {parts.map((part) => part.value > 0 && <span key={part.key} style={{ width: `${(part.value / stats.plants) * 100}%`, background: part.color }} />)}
      </div>
      <p className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-loam-600">
        {parts.map((part) => (
          <span key={part.key} className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: part.color }} />
            {t(`plant_observations.survivals.${part.key}`)} : {part.value}
          </span>
        ))}
      </p>
    </div>
  )
}

function SourcesSummary({ species }: { species: SpeciesSheet }) {
  const rows = Object.values(species.provenance)
  const count = (status: string) => rows.filter((r) => r.status === status).length
  const sources = [...new Set(rows.filter((r) => r.status !== 'empty').map((r) => r.source))]
  return (
    <div className="space-y-2 text-sm">
      <p className="text-xs text-loam-500">{t('plants.show.sources_intro')}</p>
      <p className="text-loam-700">{t('plants.show.sources_summary', { sourced: count('sourced'), to_verify: count('to_verify'), empty: count('empty') })}</p>
      {sources.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {sources.map((source) => {
            const sample = rows.find((r) => r.source === source)
            return (
              <li key={source} className="rounded-full bg-loam-50 px-2.5 py-1 text-xs text-loam-700 ring-1 ring-loam-200">
                {t('plants.provenance.source', { source: sourceLabel(source) })}
                {sample?.license && <span className="text-loam-500"> · {sample.license}</span>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
