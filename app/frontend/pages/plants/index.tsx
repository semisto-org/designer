import { Head, Link, router } from '@inertiajs/react'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal, Snowflake } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/Card'
import { Input, Select } from '@/components/ui/Field'
import { SpeciesTags } from '@/components/plants/SpeciesTags'
import { formatDecimal, strataLabel, vocab } from '@/components/plants/format'
import { t } from '@/lib/i18n'
import { STRATA_COLORS } from '@/map/plants/strata'
import type { CatalogueRegion, PlantSearchFilters, PlantSearchResult, SpeciesSummary, Strata } from '@/types/plants'

type Props = {
  search: PlantSearchResult
  vocabulary: { strata: Strata[]; plantType: string[]; exposures: string[]; soilMoisture: string[] }
  region: CatalogueRegion | null
  catalogueSize: number
}

type ListFacet = 'strata' | 'plant_type' | 'exposures' | 'soil_moisture'
type Flag = 'edible' | 'nitrogen' | 'mellifere' | 'native' | 'no_invasive'
const FLAGS: Flag[] = ['edible', 'nitrogen', 'mellifere', 'native', 'no_invasive']

function toParams(filters: PlantSearchFilters, page = 1): Record<string, string | number | string[]> {
  const params: Record<string, string | number | string[]> = {}
  if (filters.q) params.q = filters.q
  if (filters.zone) params.zone = filters.zone
  ;(['strata', 'plant_type', 'exposures', 'soil_moisture'] as ListFacet[]).forEach((f) => { if (filters[f].length) params[f] = filters[f] })
  FLAGS.forEach((f) => { if (filters[f]) params[f] = '1' })
  if (page > 1) params.page = page
  return params
}

/** The plant catalogue: accent-insensitive search, design filters, cards. */
export default function PlantsIndex({ search, vocabulary, region, catalogueSize }: Props) {
  const [filters, setFilters] = useState<PlantSearchFilters>(search.filters)
  const [query, setQuery] = useState(search.filters.q ?? '')
  const [showFilters, setShowFilters] = useState(false)
  const first = useRef(true)

  useEffect(() => setFilters(search.filters), [search.filters])

  function visit(next: PlantSearchFilters, page = 1) {
    setFilters(next)
    router.get('/plants', toParams(next, page), { preserveState: true, preserveScroll: page === 1, replace: true, only: ['search'] })
  }

  useEffect(() => {
    if (first.current) { first.current = false; return }
    const timer = window.setTimeout(() => visit({ ...filters, q: query.trim() || null }), 300)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const toggle = (facet: ListFacet, key: string) => {
    const values = filters[facet].includes(key) ? filters[facet].filter((v) => v !== key) : [...filters[facet], key]
    visit({ ...filters, [facet]: values })
  }
  const active = filters.zone != null || FLAGS.some((f) => filters[f]) ||
    (['strata', 'plant_type', 'exposures', 'soil_moisture'] as ListFacet[]).some((f) => filters[f].length > 0)
  const country = region?.country ?? null

  return (
    <>
      <Head title={t('plants.index.title')} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-2xl">{t('plants.index.title')}</h1>
          <p className="mt-1 text-sm text-loam-500">{t('plants.index.intro')}</p>
        </div>
      </div>

      <form className="mt-6 flex gap-2" onSubmit={(e) => { e.preventDefault(); visit({ ...filters, q: query.trim() || null }) }} role="search">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-loam-400" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('plants.index.search_placeholder')}
            aria-label={t('plants.index.search')}
            className="pl-9"
          />
        </div>
        <Button variant="secondary" className="lg:hidden" onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}>
          <SlidersHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">{t('plants.index.filters')}</span>
        </Button>
      </form>

      <div className="mt-6 grid gap-6 lg:grid-cols-[15rem_1fr]">
        <aside className={clsx('space-y-5 text-sm', showFilters ? 'block' : 'hidden lg:block')} aria-label={t('plants.index.filters')}>
          <FilterGroup title={t('plants.filters.strata')}>
            {vocabulary.strata.map((s) => (
              <Chip key={s} on={filters.strata.includes(s)} onClick={() => toggle('strata', s)}>
                <span className="h-2 w-2 rounded-full" style={{ background: STRATA_COLORS[s] }} />
                {strataLabel(s)}
              </Chip>
            ))}
          </FilterGroup>
          <FilterGroup title={t('plants.filters.plant_type')}>
            {vocabulary.plantType.map((k) => <Chip key={k} on={filters.plant_type.includes(k)} onClick={() => toggle('plant_type', k)}>{vocab('plant_type', k)}</Chip>)}
          </FilterGroup>
          <div>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-loam-500">{t('plants.filters.zone')}</span>
              <Select value={filters.zone ?? ''} onChange={(e) => visit({ ...filters, zone: e.target.value ? Number(e.target.value) : null })}>
                <option value="">{t('plants.filters.zone_any')}</option>
                {Array.from({ length: 13 }, (_, i) => i + 1).map((z) => (
                  <option key={z} value={z}>
                    {t('plants.units.zone', { zone: z })}{region?.zone === z ? ` · ${region.name}` : ''}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <FilterGroup title={t('plants.filters.exposures')}>
            {vocabulary.exposures.map((k) => <Chip key={k} on={filters.exposures.includes(k)} onClick={() => toggle('exposures', k)}>{vocab('exposures', k)}</Chip>)}
          </FilterGroup>
          <FilterGroup title={t('plants.filters.soil_moisture')}>
            {vocabulary.soilMoisture.map((k) => <Chip key={k} on={filters.soil_moisture.includes(k)} onClick={() => toggle('soil_moisture', k)}>{vocab('soil_moisture', k)}</Chip>)}
          </FilterGroup>
          <FilterGroup title={t('plants.filters.uses')} column>
            {FLAGS.filter((f) => country || (f !== 'native' && f !== 'no_invasive')).map((f) => (
              <label key={f} className="flex items-center gap-2 text-loam-700">
                <input type="checkbox" checked={filters[f]} onChange={() => visit({ ...filters, [f]: !filters[f] })} className="rounded border-loam-300 text-prune-600 focus:ring-prune-500" />
                {f === 'native' ? t('plants.filters.native', { country: t(`plants.countries.${country}`) }) : t(`plants.filters.${f}`)}
              </label>
            ))}
          </FilterGroup>
          {active && (
            <Button variant="ghost" size="sm" onClick={() => { setQuery(''); visit({ ...search.filters, q: null, zone: null, strata: [], plant_type: [], exposures: [], soil_moisture: [], edible: false, nitrogen: false, mellifere: false, native: false, no_invasive: false }) }}>
              {t('plants.index.clear')}
            </Button>
          )}
        </aside>

        <section aria-live="polite">
          <p className="mb-3 text-sm text-loam-500">{t('plants.index.results', { count: search.total })}</p>
          {catalogueSize === 0 ? (
            <EmptyState title={t('plants.index.catalogue_empty_title')}>{t('plants.index.catalogue_empty_body')}</EmptyState>
          ) : search.results.length === 0 ? (
            <EmptyState title={t('plants.index.empty_title')}>{t('plants.index.empty_body')}</EmptyState>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {search.results.map((species) => <li key={species.id}><SpeciesCard species={species} country={country} /></li>)}
            </ul>
          )}
          {search.pages > 1 && (
            <nav className="mt-6 flex items-center justify-between text-sm" aria-label={t('plants.index.page', { page: search.page, pages: search.pages })}>
              <Button variant="secondary" size="sm" disabled={search.page <= 1} onClick={() => visit(filters, search.page - 1)}>
                <ChevronLeft className="h-4 w-4" />{t('plants.index.previous')}
              </Button>
              <span className="text-loam-500">{t('plants.index.page', { page: search.page, pages: search.pages })}</span>
              <Button variant="secondary" size="sm" disabled={search.page >= search.pages} onClick={() => visit(filters, search.page + 1)}>
                {t('plants.index.next')}<ChevronRight className="h-4 w-4" />
              </Button>
            </nav>
          )}
        </section>
      </div>
    </>
  )
}

function FilterGroup({ title, children, column }: { title: string; children: ReactNode; column?: boolean }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-loam-500">{title}</legend>
      <div className={column ? 'space-y-1.5' : 'flex flex-wrap gap-1.5'}>{children}</div>
    </fieldset>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 ring-inset transition-colors',
        on ? 'bg-prune-600 text-white ring-prune-600' : 'bg-white text-loam-700 ring-loam-200 hover:bg-loam-100',
      )}
    >
      {children}
    </button>
  )
}

function SpeciesCard({ species, country }: { species: SpeciesSummary; country: string | null }) {
  return (
    <Link href={`/plants/${species.slug}`} className="flex h-full flex-col gap-2 rounded-xl bg-white p-4 shadow-sm ring-1 ring-loam-200/70 transition hover:ring-prune-300">
      <div>
        <p className="font-medium text-loam-900">{species.commonName ?? species.latinName}</p>
        <p className="text-sm italic text-loam-500">{species.latinName}</p>
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-loam-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: STRATA_COLORS[species.strata] }} />
          {strataLabel(species.strata)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Snowflake className="h-3 w-3 text-loam-400" />
          {species.hardinessZone ? t('plants.card.zone', { zone: species.hardinessZone }) : t('plants.card.unknown_zone')}
        </span>
        {species.heightMaxM != null && <span>{t('plants.card.height', { value: formatDecimal(species.heightMaxM) })}</span>}
      </p>
      <SpeciesTags species={species} country={country} />
    </Link>
  )
}
