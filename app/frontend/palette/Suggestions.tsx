import { ExternalLink, Plus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import { StrataDot } from '@/map/plants/strata'
import { FitChips, SiteSummary } from '@/palette/Fit'
import type { PaletteSuggestion, PaletteSuggestions } from '@/types/plants'

/**
 * « Suggestions pour ce terrain », beside the table: what the land tells
 * (climate, patches, soil, project sheet), what known facts rule out, then
 * species that fit, best first, each with its verdicts. An editor adds one
 * to the palette in a click; the table follows.
 */
export function SuggestionsSheet({ mapId, canEdit, inPalette, onAdded, onClose }: {
  mapId: number
  canEdit: boolean
  inPalette: Set<number>
  onAdded: (name: string) => Promise<void>
  onClose: () => void
}) {
  const [data, setData] = useState<PaletteSuggestions | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState<number | null>(null)
  const panel = useRef<HTMLElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    api<PaletteSuggestions>(`/maps/${mapId}/palette_items/suggestions`, { signal: controller.signal })
      .then(setData)
      .catch((e) => { if (!controller.signal.aborted) setError(e instanceof ApiError ? e.message : t('plant_palette.suggestions.load_error')) })
    return () => controller.abort()
  }, [mapId, inPalette.size])

  useEffect(() => {
    panel.current?.focus()
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])

  async function add(species: PaletteSuggestion) {
    setAdding(species.id)
    try {
      await api(`/maps/${mapId}/palette_items`, { method: 'POST', body: { palette_item: { species_id: species.id } } })
      await onAdded(species.commonName ?? species.latinName)
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('plant_palette.errors.generic'))
    } finally {
      setAdding(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end print:hidden" role="dialog" aria-modal="true" aria-labelledby="suggestions-title">
      <button type="button" className="absolute inset-0 bg-loam-900/25" onClick={onClose} aria-label={t('plant_palette.suggestions.close')} tabIndex={-1} />
      <aside ref={panel} tabIndex={-1} className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto bg-loam-50 shadow-2xl outline-none">
        <header className="sticky top-0 z-10 flex items-start gap-3 border-b border-loam-900/10 bg-loam-50/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0 flex-1">
            <h2 id="suggestions-title" className="font-serif text-2xl font-semibold text-prune-800">{t('plant_palette.suggestions.title')}</h2>
            <p className="mt-1 text-sm text-loam-600">{t('plant_palette.suggestions.intro')}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-loam-600 hover:bg-loam-200/60" aria-label={t('plant_palette.suggestions.close')}>
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-4 px-5 py-5">
          {error && <p className="rounded-lg bg-clay-50 p-3 text-sm text-clay-700">{error}</p>}
          {!error && !data && <p className="text-sm text-loam-500">{t('plant_palette.suggestions.loading')}</p>}

          {data?.site && (
            <div className="rounded-2xl bg-white p-4 ring-1 ring-loam-900/10">
              <SiteSummary data={{ site: data.site, excluded: data.excluded }} />
              <p className="text-sm text-loam-500">{t('plant_palette.suggestions.legend')}</p>
            </div>
          )}

          {data && data.suggestions.length === 0 && (
            <p className="rounded-2xl border border-dashed border-loam-300 bg-white/60 px-5 py-8 text-center text-sm text-loam-500">{t('plant_palette.suggestions.empty')}</p>
          )}

          {data && data.suggestions.length > 0 && (
            <ul className="divide-y divide-loam-100 overflow-hidden rounded-2xl bg-white ring-1 ring-loam-900/10">
              {data.suggestions.map((s) => (
                <li key={s.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="mt-1.5"><StrataDot strata={s.strata} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-loam-900">
                      {s.commonName ?? s.latinName}
                      {s.commonName && <span className="ml-1.5 font-normal italic text-loam-500">{s.latinName}</span>}
                    </p>
                    <p className="text-sm text-loam-600">{t(`palette.reasons.${s.reason}`)}</p>
                    {s.fit && <FitChips fit={s.fit} className="mt-1.5" />}
                  </div>
                  <a
                    href={`/plants/${s.slug}`} target="_blank" rel="noreferrer"
                    className="rounded-full p-2 text-loam-500 hover:bg-loam-100" title={t('palette.open_sheet')} aria-label={t('palette.open_sheet')}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  {inPalette.has(s.id) ? (
                    <span className="whitespace-nowrap py-2 text-sm text-leaf-700">{t('palette.in_palette')}</span>
                  ) : canEdit && (
                    <button
                      type="button" onClick={() => void add(s)} disabled={adding != null}
                      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-prune-50 px-3 py-1.5 text-sm font-medium text-prune-700 hover:bg-prune-100 disabled:opacity-50"
                    >
                      <Plus className="h-4 w-4" aria-hidden />{t('plant_palette.suggestions.add')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  )
}
