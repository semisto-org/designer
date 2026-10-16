import { BookOpenCheck, ExternalLink, Sprout } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { strataLabel } from '@/components/plants/format'
import { api, ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { setPlanting } from '@/map/plants/store'
import { StrataDot } from '@/map/plants/strata'
import { STRATA, type PlantingState, type SpeciesSummary } from '@/types/plants'

type GbifMatch = {
  status: 'accepted' | 'synonym' | 'fuzzy' | 'unknown' | 'unavailable'
  name?: string | null
  suggestedName?: string | null
  family?: string | null
  url?: string | null
}
type Check = { gbif: GbifMatch; existing: SpeciesSummary[] }

/** A latin name typed in the search box: two words, the first capitalised or not. */
const looksLatin = (q: string) => /^[a-z×-]+ [a-z×-]+/i.test(q.trim()) && !/[éèêàçùô]/i.test(q)
const capitalise = (q: string) => q.trim().replace(/\s+/g, ' ').replace(/^./, (c) => c.toUpperCase())

/**
 * « Ta plante n'est pas dans le catalogue ? » under the palette search: adds
 * a species the catalogue lacks. Its name is checked against GBIF as it is
 * typed (typo, old name, already in the catalogue); it joins the palette at
 * once and waits for Semisto's review before other gardens see it.
 */
export function ProposeSpecies({ query, inPalette, onAdd, onDone }: {
  query: string; inPalette: Set<number>; onAdd: (species: SpeciesSummary) => void; onDone: () => void
}) {
  const editor = useEditor()
  const mapId = editor.map.id
  const [open, setOpen] = useState(false)
  const [latinName, setLatinName] = useState('')
  const [commonName, setCommonName] = useState('')
  const [strata, setStrata] = useState('')
  const [height, setHeight] = useState('')
  const [spread, setSpread] = useState('')
  const [check, setCheck] = useState<Check | null>(null)
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function start() {
    if (looksLatin(query)) setLatinName(capitalise(query))
    else setCommonName(query.trim())
    setOpen(true)
  }

  // The name is checked as it is typed, debounced.
  useEffect(() => {
    const name = latinName.trim()
    if (!open || name.length < 3) { setCheck(null); return }
    const controller = new AbortController()
    setChecking(true)
    const timer = window.setTimeout(() => {
      api<Check>(`/maps/${mapId}/plant_proposals/check?${new URLSearchParams({ name })}`, { signal: controller.signal })
        .then(setCheck)
        .catch(() => undefined)
        .finally(() => setChecking(false))
    }, 400)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [latinName, open, mapId])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const r = await api<{ species: SpeciesSummary; created: boolean; planting: PlantingState }>(`/maps/${mapId}/plant_proposals`, {
        method: 'POST',
        body: { plant_proposal: { latin_name: latinName, common_name: commonName, strata, height_max_m: height, spread_max_m: spread } },
      })
      setPlanting(mapId, r.planting)
      const name = r.species.commonName ?? r.species.latinName
      editor.notify(t(r.created ? 'plants.proposal.added' : 'plants.proposal.joined', { name }))
      setOpen(false)
      onDone()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-dashed border-loam-300 px-3 py-2 text-sm text-loam-600">
        <Sprout className="h-4 w-4 text-leaf-600" aria-hidden />
        <span>{query.trim().length >= 2 ? t('plants.proposal.missing', { query: query.trim() }) : t('plants.proposal.missing_any')}</span>
        <button type="button" onClick={start} className="font-medium text-prune-700 underline-offset-2 hover:underline">
          {t('plants.proposal.start')}
        </button>
      </div>
    )
  }

  const gbif = check?.gbif
  const suggestion = gbif && (gbif.status === 'synonym' || gbif.status === 'fuzzy') ? gbif.suggestedName : null

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl bg-loam-50 p-3 ring-1 ring-loam-200">
      <div>
        <h3 className="font-serif text-lg text-loam-900">{t('plants.proposal.title')}</h3>
        <p className="mt-1 text-sm text-loam-600">{t('plants.proposal.intro')}</p>
      </div>

      <Field label={t('plants.proposal.latin_name')} hint={t('plants.proposal.latin_name_hint')}>
        <Input value={latinName} onChange={(e) => setLatinName(e.target.value)} required autoFocus lang="la" className="italic" />
      </Field>

      {checking && <p className="text-sm text-loam-500">{t('plants.proposal.checking')}</p>}
      {!checking && gbif && (
        <div className="space-y-2 text-sm" aria-live="polite">
          <p className={gbif.status === 'accepted' ? 'flex items-start gap-1.5 text-leaf-800' : 'flex items-start gap-1.5 text-humus-800'}>
            <BookOpenCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              {t(`plants.proposal.gbif.${gbif.status}`, {
                name: gbif.suggestedName ?? '',
                family: gbif.family ? t('plants.proposal.gbif.family', { family: gbif.family }) : '',
              })}
              {gbif.url && (
                <a href={gbif.url} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-prune-700 hover:underline">
                  {t('plants.proposal.gbif.link')}<ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              )}
            </span>
          </p>
          {suggestion && suggestion !== latinName && (
            <Button size="sm" variant="secondary" onClick={() => setLatinName(suggestion)}>
              {t('plants.proposal.gbif.use', { name: suggestion })}
            </Button>
          )}
          {check.existing.length > 0 && (
            <div className="rounded-lg bg-white p-2 ring-1 ring-leaf-200">
              <p className="text-loam-700">{t('plants.proposal.existing')}</p>
              <ul className="mt-1 space-y-1">
                {check.existing.map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <StrataDot strata={s.strata} />
                    <span className="min-w-0 flex-1 truncate">{s.commonName ?? s.latinName} <i className="text-loam-500">{s.latinName}</i></span>
                    {inPalette.has(s.id)
                      ? <span className="text-leaf-700">{t('palette.in_palette')}</span>
                      : <Button size="sm" onClick={() => { onAdd(s); setOpen(false); onDone() }}>{t('plants.proposal.existing_add')}</Button>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <Field label={t('plants.proposal.common_name')}>
        <Input value={commonName} onChange={(e) => setCommonName(e.target.value)} maxLength={120} />
      </Field>
      <Field label={t('plants.proposal.strata')}>
        <Select value={strata} onChange={(e) => setStrata(e.target.value)}>
          <option value="">{t('plants.proposal.strata_none')}</option>
          {STRATA.map((s) => <option key={s} value={s}>{strataLabel(s)}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('plants.proposal.height')}>
          <Input type="number" inputMode="decimal" min="0.01" max="150" step="0.01" value={height} onChange={(e) => setHeight(e.target.value)} />
        </Field>
        <Field label={t('plants.proposal.spread')}>
          <Input type="number" inputMode="decimal" min="0.01" max="150" step="0.01" value={spread} onChange={(e) => setSpread(e.target.value)} />
        </Field>
      </div>
      <p className="text-sm text-loam-500">{t('plants.proposal.size_hint')}</p>

      {error && <p className="text-sm text-clay-600" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving || latinName.trim().length < 3}>{t('plants.proposal.submit')}</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>{t('plants.proposal.cancel')}</Button>
      </div>
    </form>
  )
}
