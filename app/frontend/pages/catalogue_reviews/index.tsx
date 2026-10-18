import { Head, Link, router } from '@inertiajs/react'
import { ArrowLeft, Check, ExternalLink, GitMerge, Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { gbifCheck, type GbifCheck } from '@/components/plants/gbifQueue'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/Card'
import { Field, Input, Select } from '@/components/ui/Field'
import { MONTH_KEYS, countryNames, formatDecimal, metres, strataLabel, vocab } from '@/components/plants/format'
import { api } from '@/lib/api'
import { t, translations } from '@/lib/i18n'
import { relativeTime } from '@/lib/relativeTime'
import { StrataDot } from '@/map/plants/strata'
import type { PlantSearchResult, SpeciesSummary, Strata } from '@/types/plants'

type Proposal = SpeciesSummary & {
  family: string | null
  gbifUrl: string | null
  proposedBy: string | null
  proposedAt: string
  maps: { id: number; name: string }[]
  values: { field: string; value: unknown; source: string }[]
}

type Props = { proposals: Proposal[]; vocabulary: { strata: Strata[] } }

const MONTH_FIELDS = ['flowering_months', 'fruiting_months', 'harvest_months', 'pruning_months']
const RATING_FIELDS = ['watering_need', 'edible_rating', 'medicinal_rating', 'taste_rating', 'productivity', 'disease_resistance']

/** The field as the species sheet names it (« Feuillage »), not its column (« foliage_type »). */
function fieldLabel(field: string): string {
  if (field === 'height_max_m') return t('plants.fields.height')
  if (field === 'spread_max_m') return t('plants.fields.spread')
  return typeof translations('plants.fields')[field] === 'string' ? t(`plants.fields.${field}`) : field
}

/** A value as the species sheet writes it: vocabulary in French, months by name, sizes in metres. */
function formatValue(field: string, value: unknown): string {
  const values = Array.isArray(value) ? value : [value]
  if (field === 'strata') return strataLabel(String(value))
  if (MONTH_FIELDS.includes(field)) return values.map((m) => t(`plants.vocabulary.months_short.${MONTH_KEYS[Number(m) - 1]}`)).join(', ')
  if (field.endsWith('_countries')) return countryNames(values.map(String))
  if (field.endsWith('_m')) return metres(Number(value))
  if (field === 'min_temperature_c') return t('plants.units.celsius', { value: formatDecimal(Number(value)) })
  if (field === 'hardiness_zone') return t('plants.units.zone', { zone: String(value) })
  if (RATING_FIELDS.includes(field)) return t('plants.units.rating', { value: String(value) })
  if (field.endsWith('_years') || field.endsWith('_year')) return t('plants.units.years', { count: Number(value) })
  const facet = translations(`plants.vocabulary.${field}`)
  if (Object.keys(facet).length > 0) return values.map((v) => (typeof facet[String(v)] === 'string' ? vocab(field, String(v)) : String(v))).join(', ')
  if (typeof value === 'number' || (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value))) return formatDecimal(Number(value))
  return values.join(', ')
}

/** The species people added from their palettes, waiting for a catalogue reviewer. */
export default function CatalogueReviews({ proposals, vocabulary }: Props) {
  return (
    <>
      <Head title={t('plants.review.title')} />
      <Link href="/plants" className="inline-flex items-center gap-1 text-sm text-loam-500 hover:text-loam-800">
        <ArrowLeft className="h-4 w-4" />{t('plants.show.back')}
      </Link>
      <div className="mt-4 max-w-2xl">
        <h1 className="text-2xl">{t('plants.review.title')}</h1>
        <p className="mt-1 text-sm text-loam-500">{t('plants.review.intro')}</p>
      </div>
      {proposals.length === 0 ? (
        <div className="mt-8"><EmptyState title={t('plants.review.empty')} /></div>
      ) : (
        <ul className="mt-6 space-y-4">
          {proposals.map((p) => <ProposalCard key={p.id} proposal={p} strata={vocabulary.strata} />)}
        </ul>
      )}
    </>
  )
}

function ProposalCard({ proposal: p, strata: strataKeys }: { proposal: Proposal; strata: Strata[] }) {
  const [latinName, setLatinName] = useState(p.latinName)
  const [commonName, setCommonName] = useState(p.commonName ?? '')
  const [strata, setStrata] = useState<string>(p.values.find((v) => v.field === 'strata') ? p.strata : '')
  const [merging, setMerging] = useState(false)
  const [gbif, setGbif] = useState<GbifCheck | null>(null)
  useEffect(() => { gbifCheck(p.id).then(setGbif) }, [p.id])
  const family = p.family ?? (gbif?.match.status === 'accepted' ? gbif.match.family : null)
  const when = relativeTime(p.proposedAt)

  const accept = () => router.patch(`/plants/review/${p.id}`, { review: { latin_name: latinName, common_name: commonName, strata } }, { preserveScroll: true })
  const reject = () => {
    if (window.confirm(t('plants.review.confirm_reject', { name: p.latinName }))) router.post(`/plants/review/${p.id}/reject`, {}, { preserveScroll: true })
  }

  return (
    <li className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-loam-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-serif text-xl text-loam-900">
            <StrataDot strata={p.strata} /><span className="truncate">{p.commonName ?? p.latinName}</span>
          </p>
          <p className="text-sm italic text-loam-600">{p.latinName}{family && <span className="not-italic text-loam-500"> · {family}</span>}</p>
          <p className="mt-1 text-sm text-loam-500">
            {p.proposedBy ? t('plants.review.proposed_by', { name: p.proposedBy, date: when }) : t('plants.review.proposed_by_unknown', { date: when })}
          </p>
        </div>
        <GbifBadge check={gbif} fallbackUrl={p.gbifUrl} />
      </div>

      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="font-medium text-loam-700">{t('plants.review.maps')}</p>
          {p.maps.length === 0 ? <p className="text-loam-500">{t('plants.review.no_maps')}</p> : (
            <ul className="mt-0.5 space-y-0.5">
              {p.maps.map((m) => <li key={m.id}><a href={`/maps/${m.id}`} className="text-prune-700 hover:underline">{m.name}</a></li>)}
            </ul>
          )}
        </div>
        <div>
          <p className="font-medium text-loam-700">{t('plants.review.values')}</p>
          {p.values.length === 0 ? <p className="text-loam-500">{t('plants.review.no_values')}</p> : (
            <dl className="mt-0.5 space-y-0.5">
              {p.values.map((v) => (
                <div key={v.field} className="flex gap-2">
                  <dt className="text-loam-500">{fieldLabel(v.field)}</dt>
                  <dd className="text-loam-800">{formatValue(v.field, v.value)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 border-t border-loam-100 pt-4 sm:grid-cols-3">
        <Field label={t('plants.review.latin_name')}>
          <Input value={latinName} onChange={(e) => setLatinName(e.target.value)} className="italic" />
          <LatinSuggestion check={gbif} current={latinName} onUse={setLatinName} />
        </Field>
        <Field label={t('plants.review.common_name')}>
          <Input value={commonName} onChange={(e) => setCommonName(e.target.value)} />
          <CommonNameSuggestions check={gbif} current={commonName} onUse={setCommonName} />
        </Field>
        <Field label={t('plants.review.strata')}>
          <Select value={strata} onChange={(e) => setStrata(e.target.value)}>
            <option value="">{t('plants.proposal.strata_none')}</option>
            {strataKeys.map((s) => <option key={s} value={s}>{strataLabel(s)}</option>)}
          </Select>
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={accept}><Check className="h-4 w-4" aria-hidden />{t('plants.review.accept')}</Button>
        <Button size="sm" variant="secondary" onClick={() => setMerging(!merging)} aria-expanded={merging}>
          <GitMerge className="h-4 w-4" aria-hidden />{t('plants.review.merge')}
        </Button>
        <Button size="sm" variant="ghost" onClick={reject}><X className="h-4 w-4" aria-hidden />{t('plants.review.reject')}</Button>
      </div>
      {merging && <MergePicker proposal={p} />}
    </li>
  )
}

/** What GBIF says about the name, once asked: the link to its sheet, or why there is none. */
function GbifBadge({ check, fallbackUrl }: { check: GbifCheck | null; fallbackUrl: string | null }) {
  const status = check?.match.status
  const url = check?.match.url ?? fallbackUrl
  if (!check) return <span className="text-sm text-loam-500">{t('plants.review.gbif_checking')}</span>
  if (status === 'accepted' && url) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-prune-700 hover:underline">
        {t('plants.review.gbif')}<ExternalLink className="h-3.5 w-3.5" aria-hidden />
      </a>
    )
  }
  const label = status === 'synonym' ? t('plants.review.gbif_synonym') : status === 'fuzzy' ? t('plants.review.gbif_fuzzy')
    : status === 'unavailable' ? t('plants.review.gbif_unavailable') : t('plants.review.gbif_none')
  const tone = status === 'unavailable' ? 'bg-loam-100 text-loam-700' : 'bg-humus-100 text-humus-800'
  return <span className={`rounded-full px-2.5 py-1 text-sm ${tone}`}>{label}</span>
}

const suggestionButton = 'inline-flex items-center gap-1 rounded-full bg-leaf-50 px-2.5 py-0.5 text-sm text-leaf-800 ring-1 ring-leaf-200 hover:bg-leaf-100'

/** GBIF's name when it files the typed one under another (an outdated name, a misspelling). */
function LatinSuggestion({ check, current, onUse }: { check: GbifCheck | null; current: string; onUse: (name: string) => void }) {
  const status = check?.match.status
  const name = check?.match.suggestedName
  if ((status !== 'synonym' && status !== 'fuzzy') || !name || name === current.trim()) return null
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-loam-600">
      {t(status === 'synonym' ? 'plants.review.gbif_accepted_name' : 'plants.review.gbif_spelling')}
      <button type="button" onClick={() => onUse(name)} className={`${suggestionButton} italic`}>{t('plants.review.use', { name })}</button>
    </p>
  )
}

/** The common names GBIF knows in the reviewer's language, each with the datasets it comes from. */
function CommonNameSuggestions({ check, current, onUse }: { check: GbifCheck | null; current: string; onUse: (name: string) => void }) {
  const names = (check?.commonNames ?? []).filter((n) => n.name.toLowerCase() !== current.trim().toLowerCase())
  if (names.length === 0) return null
  return (
    <div className="mt-1.5 text-sm text-loam-600">
      <p>{t('plants.review.gbif_common_names')}</p>
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {names.map((n) => (
          <li key={n.name}>
            <button type="button" onClick={() => onUse(n.name)} className={suggestionButton}
              title={n.sources.length ? t('plants.review.gbif_sources', { sources: n.sources.join(', ') }) : undefined}>
              {n.name}
            </button>
          </li>
        ))}
      </ul>
      {names[0].sources.length > 0 && <p className="mt-1 text-loam-500">{t('plants.review.gbif_sources', { sources: names[0].sources.join(', ') })}</p>}
    </div>
  )
}

function MergePicker({ proposal }: { proposal: Proposal }) {
  const [query, setQuery] = useState(proposal.latinName.split(' ')[0] ?? '')
  const [results, setResults] = useState<SpeciesSummary[]>([])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults([]); return }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      api<PlantSearchResult>(`/plants?${new URLSearchParams({ q })}`, { signal: controller.signal })
        .then((r) => setResults(r.results.filter((s) => s.id !== proposal.id && (s.reviewStatus ?? 'reviewed') === 'reviewed').slice(0, 8)))
        .catch(() => undefined)
    }, 250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [query, proposal.id])

  const merge = (target: SpeciesSummary) => {
    const message = t('plants.review.confirm_merge', { source: proposal.latinName, target: target.latinName })
    if (window.confirm(message)) router.post(`/plants/review/${proposal.id}/merge`, { target_id: target.id }, { preserveScroll: true })
  }

  return (
    <div className="mt-3 space-y-2 rounded-lg bg-loam-50 p-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-loam-400" />
        <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('plants.review.merge_search')}
          aria-label={t('plants.review.merge_search')} className="pl-9" />
      </div>
      <ul className="divide-y divide-loam-100">
        {results.map((s) => (
          <li key={s.id} className="flex items-center gap-2 py-1.5 text-sm">
            <StrataDot strata={s.strata} />
            <span className="min-w-0 flex-1 truncate">{s.commonName ?? s.latinName} <i className="text-loam-500">{s.latinName}</i></span>
            <Button size="sm" variant="secondary" onClick={() => merge(s)}>{t('plants.review.merge_into', { name: s.latinName })}</Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
