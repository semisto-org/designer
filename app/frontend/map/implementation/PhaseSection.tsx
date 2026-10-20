import { CalendarRange } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ImplementationPlan } from '@/implementation/types'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { storedProperties } from '@/map/drawing/catalog'
import { saveFeature } from '@/map/drawing/save'
import { useEditor } from '@/map/editor/EditorContext'
import { isPlanned } from '@/map/scenario'
import type { MapFeature } from '@/types'

const DESIGN_LAYERS = new Set(['water', 'access', 'structures', 'plants', 'animals', 'networks'])

type PhaseOption = { id: number; name: string }

/** Work still to do (or already given a phase) on a design layer. */
export function appliesToPhase(feature: MapFeature): boolean {
  const p = feature.properties
  return p.status === 'active' && DESIGN_LAYERS.has(p.layer) && (isPlanned(p) || typeof p.phase_id === 'number')
}

// The phases of a map, fetched once per map and shared by every selection.
const cache = new Map<number, Promise<PhaseOption[]>>()
function loadPhases(mapId: number, fresh = false): Promise<PhaseOption[]> {
  if (fresh || !cache.has(mapId)) {
    cache.set(mapId, api<{ plan: ImplementationPlan }>(`/maps/${mapId}/implementation`)
      .then(({ plan }) => plan.phases.map(({ id, name }) => ({ id, name })))
      .catch(() => { cache.delete(mapId); return [] }))
  }
  return cache.get(mapId)!
}

/**
 * Inspector section « Mise en œuvre »: the phase of the implementation plan
 * this element is built or planted in, chosen from the plan's phases.
 */
export default function PhaseSection({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const mapId = editor.map.id
  const [phases, setPhases] = useState<PhaseOption[] | null>(null)
  const phaseId = typeof feature.properties.phase_id === 'number' ? feature.properties.phase_id : null

  useEffect(() => {
    let live = true
    void loadPhases(mapId).then((list) => live && setPhases(list))
    return () => { live = false }
  }, [mapId])

  async function choose(value: string) {
    const next = { ...storedProperties(feature) }
    if (value === '') delete next.phase_id
    else next.phase_id = Number(value)
    await saveFeature(editor, feature.properties.id, { properties: next })
  }

  return (
    <section className="space-y-2 border-t border-loam-100 pt-3">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-loam-600">
        <CalendarRange className="h-4 w-4" aria-hidden />{t('implementation.section.title')}
      </h3>
      {phases && phases.length === 0 && phaseId == null ? (
        <p className="text-sm text-loam-500">{t('implementation.section.no_phases')}</p>
      ) : (
        <label className="block text-sm">
          <span className="text-loam-600">{t('implementation.section.phase')}</span>
          <select
            className="mt-1 block w-full rounded-lg border-0 bg-white py-1.5 text-sm ring-1 ring-inset ring-loam-200 focus:ring-2 focus:ring-prune-300 disabled:opacity-60"
            value={phaseId ?? ''} disabled={!editor.canEdit || phases == null}
            onFocus={() => void loadPhases(mapId, true).then(setPhases)}
            onChange={(e) => void choose(e.target.value)}
          >
            <option value="">{t('implementation.section.none')}</option>
            {(phases ?? []).map((phase, i) => <option key={phase.id} value={phase.id}>{i + 1}. {phase.name}</option>)}
          </select>
        </label>
      )}
      <a href={`/maps/${mapId}/implementation`} className="inline-block text-sm font-medium text-prune-700 hover:underline">{t('implementation.section.open')}</a>
    </section>
  )
}
