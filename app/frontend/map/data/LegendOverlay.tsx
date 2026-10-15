import clsx from 'clsx'
import { ChevronDown, ListTree } from 'lucide-react'
import { useState } from 'react'
import { hasLegend, LayerLegend } from '@/components/legend/LayerLegend'
import { strataLabel } from '@/components/plants/format'
import { t } from '@/lib/i18n'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { useEditor } from '@/map/editor/EditorContext'
import { useLayerState, visibleOverlays } from '@/map/data/store'
import { useDrawingState } from '@/map/drawing/store'
import { isPlant } from '@/map/plants/properties'
import { plantStrata, STRATA_COLORS, strataCounts, type StrataCount } from '@/map/plants/strata'
import { setPlantLabelStyle, usePlantLabelStyle } from '@/map/plants/labelStyle'
import { usePlanting } from '@/map/plants/store'
import { inScenario, isPlannedPlant, PLANNED_OPACITY, useScenario } from '@/map/scenario'
import type { Strata } from '@/types/plants'

const OPEN_KEY = 'designer.legend.open'

function storedOpen(): boolean | null {
  try {
    const value = window.localStorage.getItem(OPEN_KEY)
    return value == null ? null : value === '1'
  } catch {
    return null
  }
}

/**
 * The strata of the plants shown on the map, from the highest down, and
 * whether some of them are still to plant (dashed).
 */
function usePlantStrata(): { counts: StrataCount[]; planned: boolean } {
  const { features, map } = useEditor()
  const { data } = usePlanting(map.id)
  const scenario = useScenario()
  const hidden = useDrawingState((s) => s.hiddenLayers)
  if (hidden.includes('plants')) return { counts: [], planned: false }
  const strata: Strata[] = []
  let planned = false
  for (const feature of features) {
    if (!isPlant(feature) || feature.properties.status === 'rejected' || !inScenario(feature.properties, scenario)) continue
    const s = plantStrata(feature, data)
    if (!s) continue
    strata.push(s)
    planned ||= isPlannedPlant(feature.properties)
  }
  return { counts: strataCounts(strata), planned }
}

/**
 * The legend of the plant strata and of the data layers shown on the map,
 * over the map: a card in
 * the lower right corner on a computer, a « Légende » button that opens it
 * on a phone. The « Couches » panel shows the same legends under each layer,
 * so the card steps aside while it is open, and on a phone it leaves the
 * bottom of the screen to any open panel or selection.
 */
export default function LegendOverlay() {
  const { regionLayers, activePanel, selected } = useEditor()
  const state = useLayerState()
  const wide = useMediaQuery('(min-width: 768px)')
  const [choice, setChoice] = useState<boolean | null>(storedOpen)
  const open = choice ?? wide

  const plants = usePlantStrata()
  const shown = visibleOverlays(state)
  // The « Couches » panel shows the data legends itself; the strata stay here.
  const layers = activePanel === 'layers' ? [] : regionLayers
    .filter((layer) => layer.category === 'overlay' && shown.includes(layer.key) && hasLegend(layer))
    .sort((a, b) => (b.position ?? 0) - (a.position ?? 0))
  const sections = layers.length + (plants.counts.length > 0 ? 1 : 0)
  if (sections === 0 || (!wide && (activePanel || selected))) return null

  const toggle = () => {
    const next = !open
    setChoice(next)
    try {
      window.localStorage.setItem(OPEN_KEY, next ? '1' : '0')
    } catch {
      // Private browsing: the choice lasts until the page closes.
    }
  }

  return (
    <section
      aria-label={t('map_data.legend.title')}
      className={clsx(
        'absolute bottom-[5.5rem] left-2 z-10 md:bottom-11 md:left-auto md:right-2',
        open && 'right-2 md:w-72',
      )}
    >
      <div className={clsx('rounded-xl bg-white/95 shadow-lg ring-1 ring-loam-900/10 backdrop-blur', open && 'flex max-h-[42dvh] flex-col md:max-h-[min(28rem,55dvh)]')}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className={clsx(
            'flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-medium text-loam-800 hover:bg-loam-50',
            open && 'rounded-b-none border-b border-loam-100',
          )}
        >
          <ListTree className="h-4 w-4 shrink-0 text-prune-600" aria-hidden="true" />
          <span className="flex-1">{t('map_data.legend.title')}</span>
          {!open && sections > 1 && <span className="rounded-full bg-prune-100 px-1.5 text-sm tabular-nums text-prune-700">{sections}</span>}
          <ChevronDown className={clsx('h-4 w-4 shrink-0 text-loam-400 transition-transform', open ? '' : 'rotate-180')} aria-hidden="true" />
        </button>
        {open && (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-3 pt-2">
            {plants.counts.length > 0 && <StrataLegend {...plants} />}
            {layers.map((layer) => (
              <div key={layer.key}>
                <h3 className="mb-1.5 text-sm font-semibold text-loam-800">{layer.name}</h3>
                <LayerLegend layer={layer} />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

/** One line per strata on the map: its colour, its name and how many plants. */
function StrataLegend({ counts, planned }: { counts: StrataCount[]; planned: boolean }) {
  return (
    <div data-testid="strata-legend">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-loam-800">{t('plants.legend.title')}</h3>
        <PlantLabelSwitch />
      </div>
      <ul className="space-y-1">
        {counts.map(({ strata, count }) => (
          <li key={strata} className="flex items-center gap-2 text-sm leading-tight text-loam-700">
            <CrownSwatch color={STRATA_COLORS[strata]} />
            <span className="min-w-0 flex-1">{strataLabel(strata)}</span>
            <span className="tabular-nums text-loam-500">{count}</span>
          </li>
        ))}
      </ul>
      {planned && (
        <p className="mt-2 flex items-center gap-2 text-sm leading-tight text-loam-600">
          <CrownSwatch color="#6b665c" planned />
          {t('plants.legend.planned')}
        </p>
      )}
    </div>
  )
}

/** « Nom » or « Code »: how plants are named on the map (« 12 · Pommier » or « 12 · Ma do »). */
function PlantLabelSwitch() {
  const style = usePlantLabelStyle()
  return (
    <div role="radiogroup" aria-label={t('plants.legend.labels')} className="flex rounded-full bg-loam-100 p-0.5 text-sm">
      {(['name', 'code'] as const).map((value) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={style === value}
          title={t(`plants.legend.labels_${value}_hint`)}
          onClick={() => setPlantLabelStyle(value)}
          className={clsx('rounded-full px-2.5 py-0.5', style === value ? 'bg-white font-medium text-loam-900 shadow-sm' : 'text-loam-600 hover:text-loam-800')}
        >
          {t(`plants.legend.labels_${value}`)}
        </button>
      ))}
    </div>
  )
}

/** A crown as the map draws it: tinted disc, white ring, outline (dashed when still to plant). */
function CrownSwatch({ color, planned = false }: { color: string; planned?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0" aria-hidden="true" style={{ opacity: planned ? PLANNED_OPACITY : 1 }}>
      <circle cx="9" cy="9" r="7" fill={color} fillOpacity={planned ? 0.15 : 0.45} stroke="#ffffff" strokeWidth="3.5" />
      <circle cx="9" cy="9" r="7" fill="none" stroke={color} strokeWidth="1.75" strokeDasharray={planned ? '3 2.2' : undefined} />
      <circle cx="9" cy="9" r="2.2" fill={planned ? '#ffffff' : color} stroke={planned ? color : '#ffffff'} strokeWidth="1" />
    </svg>
  )
}
