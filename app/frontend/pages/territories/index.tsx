import { Head, Link, router } from '@inertiajs/react'
import { Loader2, Search } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { CompanionEmpty } from '@/components/ui/Companion'
import { Field, Input, Select } from '@/components/ui/Field'
import { Pill } from '@/components/ui/Pill'
import { PlaceSketch } from '@/components/ui/PlaceSketch'
import { ApiError, api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { formatDate } from '@/lib/money'
import { formatKm2 } from '@/territories/format'
import type { CommuneCandidate, TerritorySummary } from '@/types/territories'

type Props = {
  territories: TerritorySummary[]
  teams: { id: number; name: string }[]
  communesAvailable: boolean
}

/** « Territoires »: the communes my teams read whole, and opening a new one by its name. */
export default function TerritoriesIndex({ territories, teams, communesAvailable }: Props) {
  const active = territories.filter((territory) => !territory.archived)
  const archived = territories.filter((territory) => territory.archived)
  const [creating, setCreating] = useState(active.length === 0 && teams.length > 0)

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Head title={t('territories.index.title')} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">{t('territories.index.title')}</h1>
          <p className="mt-1 max-w-2xl text-loam-600">{t('territories.index.intro')}</p>
        </div>
        {teams.length > 0 && !creating && <Button onClick={() => setCreating(true)}>{t('territories.index.new')}</Button>}
      </div>

      {creating && teams.length > 0 && (
        <NewTerritory teams={teams} available={communesAvailable} onCancel={active.length > 0 ? () => setCreating(false) : undefined} />
      )}

      {teams.length === 0 && active.length === 0 && (
        <CompanionEmpty className="mt-8" title={t('territories.index.locked_title')} why={t('territories.index.locked_why')} />
      )}

      {active.length === 0 && teams.length > 0 && !creating && (
        <CompanionEmpty className="mt-8" title={t('territories.index.empty_title')} why={t('territories.index.empty_why')} />
      )}

      {active.length > 0 && (
        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((territory) => <TerritoryCard key={territory.id} territory={territory} />)}
        </ul>
      )}

      {archived.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl">{t('territories.index.archived')}</h2>
          <ul className="mt-4 grid gap-5 opacity-80 sm:grid-cols-2 lg:grid-cols-3">
            {archived.map((territory) => <TerritoryCard key={territory.id} territory={territory} />)}
          </ul>
        </section>
      )}
    </div>
  )
}

function TerritoryCard({ territory }: { territory: TerritorySummary }) {
  const count = (kind: keyof TerritorySummary['counts']) => territory.counts[kind]?.active ?? 0
  const drafts = Object.values(territory.counts).reduce((sum, c) => sum + (c?.draft ?? 0), 0)
  return (
    <li>
      <Link href={`/territories/${territory.id}`} className="group block rounded-2xl bg-white p-3 ring-1 ring-loam-200 transition hover:ring-prune-300">
        <PlaceSketch id={territory.id} name={territory.name} boundary={territory.boundary} />
        <div className="px-1 pb-1 pt-3">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-serif text-xl font-semibold text-prune-900 group-hover:underline">{territory.name}</span>
            {territory.archived && <Pill>{t('territories.index.archived_badge')}</Pill>}
          </p>
          <p className="mt-0.5 text-sm text-loam-500">
            {[territory.teamName, formatKm2(territory.areaM2), t('territories.index.updated', { date: formatDate(territory.updatedAt) })].join(' · ')}
          </p>
          <p className="mt-2 text-sm text-loam-700">
            {t('territories.index.counts', { leads: count('lead'), markers: count('marker'), sources: count('source') })}
          </p>
          {drafts > 0 && <Pill tone="humus" className="mt-2">{t('territories.index.drafts', { count: drafts })}</Pill>}
        </div>
      </Link>
    </li>
  )
}

function NewTerritory({ teams, available, onCancel }: { teams: Props['teams']; available: boolean; onCancel?: () => void }) {
  const [teamId, setTeamId] = useState(teams[0].id)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CommuneCandidate[] | null>(null)
  const [picked, setPicked] = useState<CommuneCandidate | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(available ? null : t('territories.errors.communes_unavailable'))

  // Nominatim's usage policy: search on submit, never as you type.
  const search = async (event: FormEvent) => {
    event.preventDefault()
    if (query.trim().length < 2) return
    setBusy(true)
    setError(null)
    try {
      const data = await api<{ communes: CommuneCandidate[] }>(`/territories/communes?q=${encodeURIComponent(query.trim())}`)
      setResults(data.communes)
      setPicked(data.communes.length === 1 ? data.communes[0] : null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('territories.errors.communes_unavailable'))
    } finally {
      setBusy(false)
    }
  }

  const create = () => {
    if (!picked) return
    setBusy(true)
    router.post('/territories', { team_id: teamId, commune_id: picked.id, name: name.trim() || picked.name }, { onFinish: () => setBusy(false) })
  }

  return (
    <Card className="mt-6 max-w-2xl">
      <h2 className="text-xl">{t('territories.index.create.title')}</h2>
      <p className="mt-1 text-sm text-loam-600">{t('territories.index.create.why')}</p>
      {teams.length > 1 && (
        <Field label={t('territories.index.create.team')} className="mt-4">
          <Select value={teamId} onChange={(e) => setTeamId(Number(e.target.value))}>
            {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </Select>
        </Field>
      )}
      <form onSubmit={search} className="mt-4 flex items-end gap-2">
        <Field label={t('territories.index.create.commune')} className="flex-1">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('territories.index.create.commune_placeholder')} autoFocus disabled={!available} />
        </Field>
        <Button type="submit" variant="secondary" disabled={busy || !available || query.trim().length < 2}>
          {busy && !picked ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
          {t('territories.index.create.search')}
        </Button>
      </form>
      {error && <p className="mt-3 text-sm text-clay-700">{error}</p>}
      {results && results.length === 0 && <p className="mt-3 text-sm text-loam-600">{t('territories.index.create.none')}</p>}
      {results && results.length > 1 && <p className="mt-4 text-sm font-medium text-loam-700">{t('territories.index.create.pick')}</p>}
      {results && results.length > 0 && (
        <ul className="mt-2 grid gap-2">
          {results.map((commune) => (
            <li key={commune.id}>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2 ring-1 ring-loam-200 has-[:checked]:bg-prune-50 has-[:checked]:ring-prune-300">
                <input type="radio" name="commune" className="mt-1" checked={picked?.id === commune.id} onChange={() => setPicked(commune)} />
                <span>
                  <span className="block font-medium text-loam-900">{commune.name}</span>
                  {commune.detail && <span className="block text-sm text-loam-500">{commune.detail}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {picked && (
        <Field label={t('territories.index.create.name')} hint={t('territories.index.create.name_hint')} className="mt-4">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={picked.name} maxLength={120} />
        </Field>
      )}
      <p className="mt-4 text-sm text-loam-500">{t('territories.index.create.boundary_note')}</p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {onCancel && <Button variant="ghost" onClick={onCancel}>{t('territories.show.cancel')}</Button>}
        <Button onClick={create} disabled={!picked || busy}>{t('territories.index.create.submit')}</Button>
      </div>
    </Card>
  )
}
