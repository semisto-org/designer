import { bbox as turfBbox } from '@turf/turf'
import clsx from 'clsx'
import { BookOpen, ChevronDown, RotateCcw, X } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { ZoneCard } from '@/map/layout/ZoneLayer'
import { PRIORITY } from '@/map/layout/zones'
import { takeFromPhase } from './api'
import { closePhase, pickPhaseElement, setPhaseFade, showPhaseVariant, usePhases } from './store'
import { phaseDate, phaseStateOf, type OpenPhase, type PhaseCompare, type PhaseFeature } from './types'

const LISTED = 6

function elementLabel(feature: PhaseFeature): string {
  const name = typeof feature.properties.name === 'string' ? feature.properties.name.trim() : ''
  return name || t(`editor.kinds.${feature.properties.kind}`)
}

/**
 * At the top of the map while a phase put away is reopened: which phase,
 * read-only; a fade from today's plan to the phase alone on its paper;
 * what was dropped or changed since, each element ready to be taken back.
 */
export default function PhaseCard({ phase, compare }: { phase: OpenPhase; compare: PhaseCompare }) {
  const editor = useEditor()
  const fade = usePhases((s) => s.fade)
  const picked = usePhases((s) => s.picked)
  const variant = usePhases((s) => s.variant)
  const kept = phase.variants ?? []
  const [listOpen, setListOpen] = useState(false)
  const [busy, setBusy] = useState<number | null>(null)
  // Taken back in this visit: the copy is on the map, a second click would make another.
  const [taken, setTaken] = useState<number[]>([])
  const sliderId = useId()
  const byId = useMemo(() => new Map(phase.snapshot.features.map((f) => [Number(f.properties.id), f])), [phase])
  const removed = compare.removed.map((id) => byId.get(id)).filter((f): f is PhaseFeature => !!f)
  const changed = compare.changed.map((id) => byId.get(id)).filter((f): f is PhaseFeature => !!f)
  const pickedFeature = picked != null ? byId.get(picked) ?? null : null

  function show(feature: PhaseFeature) {
    pickPhaseElement(Number(feature.properties.id))
    const [w, s, e, n] = turfBbox(feature)
    editor.instance.fitBounds([[w, s], [e, n]], { padding: 120, maxZoom: 20, duration: 600 })
  }

  async function take(feature: PhaseFeature) {
    const id = Number(feature.properties.id)
    setBusy(id)
    try {
      const copy = await takeFromPhase(editor, phase.id, id)
      setTaken((list) => [...list, id])
      editor.notify(t('design_phases.taken', { name: elementLabel(feature) }))
      editor.select(copy.properties.id)
      pickPhaseElement(null)
    } catch (error) {
      editor.notify((error as Error).message || t('design_phases.error'), 'error')
    } finally {
      setBusy(null)
    }
  }

  const row = (feature: PhaseFeature) => {
    const id = Number(feature.properties.id)
    const state = phaseStateOf(compare, id)
    return (
      <li key={id} className="flex items-center gap-2">
        <span className={clsx('h-2.5 w-2.5 shrink-0 rounded-full', state === 'removed' ? 'bg-clay-500' : 'bg-humus-600')} aria-hidden />
        <Button variant="ghost" size="sm" className="min-w-0 flex-1 !justify-start truncate" onClick={() => show(feature)}>
          <span className="truncate">{elementLabel(feature)}</span>
        </Button>
        {editor.canEdit && (
          <IconButton size="sm" label={taken.includes(id) ? t('design_phases.taken_short') : t('design_phases.take')} disabled={busy === id || taken.includes(id)} onClick={() => void take(feature)}>
            <RotateCcw aria-hidden />
          </IconButton>
        )}
      </li>
    )
  }

  return (
    <ZoneCard id="design-phase" zone="top" priority={PRIORITY.notice} className="w-full md:w-[30rem]">
      <section aria-label={t('design_phases.viewing', { name: phase.name })} className="pointer-events-auto rounded-2xl bg-loam-50/95 p-3 shadow-lg ring-1 ring-prune-200 backdrop-blur">
        <div className="flex items-start gap-2">
          <BookOpen className="mt-1 h-4 w-4 shrink-0 text-prune-700" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-serif text-lg leading-tight text-loam-900">{t('design_phases.viewing', { name: phase.name })}</p>
            <p className="text-sm text-loam-600">{t('design_phases.put_away_on', { date: phaseDate(phase.putAwayAt) })} · {t('design_phases.read_only')}</p>
          </div>
          <IconButton size="sm" label={t('design_phases.close')} onClick={closePhase}><X aria-hidden /></IconButton>
        </div>

        {phase.notes && <p className="mt-2 hidden font-hand text-xl leading-tight text-prune-700 md:block">{phase.notes}</p>}

        {/* A phase keeps every sketch and proposal of its time: one is laid on the table at a time. */}
        {kept.length > 1 && (
          <div className="mt-2">
            <Select value={variant ?? ''} onChange={(e) => showPhaseVariant(e.target.value ? Number(e.target.value) : null)} aria-label={t('design_phases.variant_label')}>
              {kept.map((v) => (
                <option key={v.id} value={v.id}>
                  {[v.retained ? t('variants.option_retained', { name: v.name }) : v.name, v.author && t('variants.by', { name: v.author })].filter(Boolean).join(' · ')}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div className="mt-2">
          <label htmlFor={sliderId} className="sr-only">{t('design_phases.fade')}</label>
          <div className="flex items-center gap-2 text-sm text-loam-600">
            <span>{t('design_phases.today')}</span>
            <input
              id={sliderId}
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={fade}
              onChange={(event) => setPhaseFade(Number(event.target.value))}
              className="min-w-0 flex-1 accent-prune-600"
            />
            <span className="max-w-[8rem] truncate">{phase.name}</span>
          </div>
        </div>

        <p className="mt-2 text-sm text-loam-700">
          {removed.length + changed.length + compare.added.length === 0
            ? t('design_phases.unchanged')
            : `${t('design_phases.since')} : ` + [
              removed.length > 0 && t('design_phases.since_removed', { count: removed.length }),
              changed.length > 0 && t('design_phases.since_changed', { count: changed.length }),
              compare.added.length > 0 && t('design_phases.since_added', { count: compare.added.length }),
            ].filter(Boolean).join(', ')}
        </p>

        {pickedFeature && (
          <div className="mt-2 flex items-center gap-2 rounded-xl bg-white p-2 ring-1 ring-loam-200">
            <span className="min-w-0 flex-1 truncate text-sm text-loam-800">
              {elementLabel(pickedFeature)} · {t(`design_phases.states.${phaseStateOf(compare, Number(pickedFeature.properties.id))}`)}
            </span>
            {editor.canEdit && (
              <Button size="sm" variant="secondary" disabled={busy != null || taken.includes(Number(pickedFeature.properties.id))} onClick={() => void take(pickedFeature)}>
                <RotateCcw className="h-4 w-4" aria-hidden />{t('design_phases.take')}
              </Button>
            )}
          </div>
        )}

        {removed.length + changed.length > 0 && (
          <div className="mt-1">
            <Button variant="ghost" size="sm" aria-expanded={listOpen} onClick={() => setListOpen(!listOpen)}>
              {t('design_phases.list')}
              <ChevronDown className={clsx('h-4 w-4 transition-transform', listOpen && 'rotate-180')} aria-hidden />
            </Button>
            {listOpen && (
              <ul className="mt-1 max-h-[30dvh] space-y-1 overflow-y-auto">
                {[...removed, ...changed].slice(0, LISTED * 3).map(row)}
              </ul>
            )}
          </div>
        )}
      </section>
    </ZoneCard>
  )
}
