import { Compass, ShieldCheck, Wind } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { formatNumber, t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { rangeText } from '@/map/sectors/labels'
import type { MapFeature } from '@/types'

type Shelter = { id: number; name: string | null; kind: string; heightM: number; distanceM: number; reachM: number }
type Exposure = { type: 'wind' | 'cold_wind'; fromDeg: number; toDeg: number; season: string; source: 'sector' | 'climate'; name: string | null; shelter: Shelter | null }

const SHELTER_KINDS = ['sector', 'hedge', 'windbreak', 'existing_hedge', 'wall', 'hedge_bank']

/**
 * « À l'abri du vent ? » on a tree's sheet: for each wind of the place (the
 * map's wind sectors, else the observed climate's prevailing wind and cold
 * spring wind), the hedge, windbreak or wall that shelters it, within ten
 * times its height (Wind::Shelter), or the wind it stays open to.
 */
export default function WindShelterSection({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const [winds, setWinds] = useState<Exposure[] | null | 'none'>(null)
  // Computed again when a hedge, a wind sector or the tree itself moves.
  const version = useMemo(() => editor.features
    .filter((f) => SHELTER_KINDS.includes(f.properties.kind) && f.properties.status === 'active')
    .map((f) => `${f.properties.id}:${f.properties.lockVersion ?? ''}`).join(',') + `|${feature.properties.lockVersion ?? ''}`,
  [editor.features, feature.properties.lockVersion])

  useEffect(() => {
    const controller = new AbortController()
    api<{ shelter: { winds: Exposure[] } | null }>(`/maps/${editor.map.id}/wind/shelter?feature_id=${feature.properties.id}`, { signal: controller.signal })
      .then((r) => setWinds(r.shelter ? r.shelter.winds : 'none'))
      .catch(() => undefined)
    return () => controller.abort()
  }, [editor.map.id, feature.properties.id, version])

  if (winds === 'none') return null
  return (
    <section className="space-y-2 border-t border-loam-100 pt-3 text-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-loam-500">{t('wind.shelter.title')}</h3>
      {winds == null && <p className="text-loam-500">{t('wind.shelter.loading')}</p>}
      {Array.isArray(winds) && winds.length === 0 && <p className="text-loam-600">{t('wind.shelter.none')}</p>}
      {Array.isArray(winds) && winds.length > 0 && (
        <ul className="space-y-1.5">
          {winds.map((w, i) => {
            const range = rangeText(w.fromDeg, w.toDeg)
            const wind = w.name ?? t(`wind.shelter.${w.type}`)
            return (
              <li key={i} className="flex gap-2">
                {w.shelter
                  ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" aria-hidden />
                  : <Wind className="mt-0.5 h-4 w-4 shrink-0 text-humus-600" aria-hidden />}
                <span className="text-loam-800">
                  {w.shelter
                    ? t('wind.shelter.sheltered', {
                      wind, range, by: w.shelter.name ? `« ${w.shelter.name} »` : t(`wind.shelter.kinds.${w.shelter.kind}`),
                      distance: formatNumber(Math.round(w.shelter.distanceM)), reach: formatNumber(w.shelter.reachM),
                    })
                    : t(w.type === 'cold_wind' ? 'wind.shelter.exposed_cold' : 'wind.shelter.exposed', { wind, range })}
                  {w.source === 'climate' && <span className="text-loam-500">{` (${t('wind.shelter.from_climate')})`}</span>}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {Array.isArray(winds) && winds.some((w) => w.source === 'climate') && (
        <Button size="sm" variant="ghost" onClick={() => editor.openPanel('sectors')}>
          <Compass className="h-4 w-4" aria-hidden />{t('wind.shelter.open_sectors')}
        </Button>
      )}
    </section>
  )
}
