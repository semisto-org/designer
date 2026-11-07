import clsx from 'clsx'
import { ChevronDown, Eye, EyeOff, ListTree } from 'lucide-react'
import { useEffect, useState } from 'react'
import { hasLegend, LayerLegend } from '@/components/legend/LayerLegend'
import { strataLabel } from '@/components/plants/format'
import { t } from '@/lib/i18n'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { useEditor } from '@/map/editor/EditorContext'
import { useLayerState, visibleOverlays } from '@/map/data/store'
import { strataKey, UNKNOWN_STRATA } from '@/map/drawing/hidden'
import { setHiddenStrata, toggled, useDrawingState } from '@/map/drawing/store'
import { numberRanges } from '@/map/plants/labelRank'
import { isPlant, numberProperty } from '@/map/plants/properties'
import { drawsCrown, plantIsSupport, plantStrata, STRATA_COLORS, strataCounts, type StrataCount } from '@/map/plants/strata'
import { PLAN_COLORS, PLAN_STRATA_COLORS } from '@/map/plants/strataColors'
import { usePresentRender } from '@/map/presentation/render'
import { isHiddenInRender, RIBBON_KINDS } from '@/map/presentation/renderRules'
import { setPlantLabelStyle, usePlantLabelStyle } from '@/map/plants/labelStyle'
import { usePlanting } from '@/map/plants/store'
import { isPlannedPlant, PLANNED_OPACITY } from '@/map/scenario'
import { inMoment } from '@/map/time/moment'
import type { Strata } from '@/types/plants'
import { ZoneCard, useZoneOccupied } from '@/map/layout/ZoneLayer'

const OPEN_KEY = 'designer.legend.open'

function storedOpen(): boolean | null {
  try {
    const value = window.localStorage.getItem(OPEN_KEY)
    return value == null ? null : value === '1'
  } catch {
    return null
  }
}

/** The plant numbers of one species (and variety) on the map, for the « Numéro » legend. */
type NumberedGroup = { key: string; name: string; strata: Strata | null; numbers: number[] }

type PlantLegend = { counts: StrataCount[]; unknown: number; planned: boolean; support: boolean; numbered: NumberedGroup[] }

/**
 * The strata of the plants on the map, from the highest down (hidden ones
 * too, so they can be shown again), how many plants have no known strata,
 * whether some of the shown ones are still to plant (dashed), and their
 * numbers by species, first number first.
 */
function usePlantStrata(): PlantLegend {
  const { features, map, moment, timeline, mode } = useEditor()
  const { data } = usePlanting(map.id)
  const hidden = useDrawingState((s) => s.hiddenLayers)
  const hiddenStrata = useDrawingState((s) => s.hiddenStrata)
  if (hidden.includes('plants')) return { counts: [], unknown: 0, planned: false, support: false, numbered: [] }
  const strata: Strata[] = []
  let unknown = 0
  const groups = new Map<string, NumberedGroup>()
  let planned = false
  let support = false
  for (const feature of features) {
    if (!isPlant(feature) || feature.properties.status === 'rejected' || !inMoment(feature.properties, moment, timeline.arrival, mode)) continue
    const s = plantStrata(feature, data)
    if (data && !s) unknown += 1
    if (hiddenStrata.includes(strataKey(s))) {
      if (s) strata.push(s)
      continue
    }
    const number = numberProperty(feature, 'number')
    const speciesId = numberProperty(feature, 'species_id')
    const species = speciesId != null ? data?.species[String(speciesId)] : undefined
    if (number != null && number > 0 && species) {
      const varietyId = numberProperty(feature, 'variety_id')
      const variety = varietyId != null ? data?.varieties[String(varietyId)] : undefined
      const key = `${speciesId}:${varietyId ?? ''}`
      const speciesName = species.commonName ?? species.latinName
      const group = groups.get(key) ?? { key, name: variety ? `${speciesName} '${variety.name}'` : speciesName, strata: s, numbers: [] }
      group.numbers.push(number)
      groups.set(key, group)
    }
    if (!s) continue
    strata.push(s)
    planned ||= isPlannedPlant(feature.properties)
    support ||= drawsCrown(s) && plantIsSupport(feature, data)
  }
  const numbered = [...groups.values()].sort((a, b) => Math.min(...a.numbers) - Math.min(...b.numbers))
  return { counts: strataCounts(strata), unknown, planned, support, numbered }
}

/**
 * The legend of the plant strata and of the data layers shown on the map,
 * over the map: a card at the end of the foot of the map on a computer, a
 * « Légende » button that opens it on a phone. The « Couches » panel shows
 * the same legends under each layer, so the card steps aside while it is open.
 */
export default function LegendOverlay() {
  const { regionLayers, activePanel } = useEditor()
  const state = useLayerState()
  const wide = useMediaQuery('(min-width: 768px)')
  const [choice, setChoice] = useState<boolean | null>(storedOpen)
  // A panel and an element's sheet both open: the foot of the map is narrow,
  // the card folds to its button (unfolded on demand, without changing the stored choice).
  const left = useZoneOccupied('left')
  const right = useZoneOccupied('right')
  const crowded = wide && left && right
  const [unfolded, setUnfolded] = useState(false)
  useEffect(() => setUnfolded(false), [crowded])
  const open = crowded ? unfolded : choice ?? wide

  const plants = usePlantStrata()
  const render = usePresentRender()
  const shown = visibleOverlays(state)
  // The « Couches » panel shows the data legends itself; the strata stay here.
  const layers = activePanel === 'layers' ? [] : regionLayers
    .filter((layer) => layer.category === 'overlay' && shown.includes(layer.key) && hasLegend(layer))
    .sort((a, b) => (b.position ?? 0) - (a.position ?? 0))
  const sections = layers.length + (plants.counts.length > 0 || plants.unknown > 0 ? 1 : 0)
  // « Rendu présentation »: the plan's own legend, without the working controls.
  if (render) return <PlanLegend counts={plants.counts} />
  if (sections === 0) return null

  const toggle = () => {
    const next = !open
    if (crowded) return setUnfolded(next)
    setChoice(next)
    try {
      window.localStorage.setItem(OPEN_KEY, next ? '1' : '0')
    } catch {
      // Private browsing: the choice lasts until the page closes.
    }
  }

  return (
    // The end of the foot of the map, beside the time strip; on a phone, above it, and away while a sheet is open (map/layout/zones).
    <ZoneCard id="legend" zone="bottom" order={2} className={clsx('md:ml-auto', open && 'w-full md:w-72')}>
    <section aria-label={t('map_data.legend.title')}>
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
            {(plants.counts.length > 0 || plants.unknown > 0) && <StrataLegend {...plants} />}
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
    </ZoneCard>
  )
}

/**
 * One line per strata on the map: its colour, its name and how many plants.
 * A click hides or shows that strata (crowns, points, names and numbers),
 * remembered per map like the « Calques ».
 */
function StrataLegend({ counts, unknown, planned, support, numbered }: PlantLegend) {
  const style = usePlantLabelStyle()
  const hidden = useDrawingState((s) => s.hiddenStrata)
  const rows = [
    ...counts.map(({ strata, count }) => ({ key: strata as string, label: strataLabel(strata), color: STRATA_COLORS[strata] as string, crown: drawsCrown(strata), count })),
    ...(unknown > 0 ? [{ key: UNKNOWN_STRATA, label: t('plants.legend.unknown_strata'), color: '#6b665c', crown: true, count: unknown }] : []),
  ]
  return (
    <div data-testid="strata-legend">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-loam-800">{t('plants.legend.title')}</h3>
        <PlantLabelSwitch />
      </div>
      {/* The numbers are what the map shows now: read them first. */}
      {style === 'number' && numbered.length > 0 && <NumberLegend groups={numbered} />}
      <ul className="-mx-1.5 space-y-0.5">
        {rows.map(({ key, label, color, crown, count }) => {
          const shown = !hidden.includes(key)
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => setHiddenStrata(toggled(hidden, key))}
                aria-pressed={shown}
                aria-label={t(shown ? 'plants.legend.hide_strata' : 'plants.legend.show_strata', { strata: label })}
                title={t(shown ? 'plants.legend.hide_strata' : 'plants.legend.show_strata', { strata: label })}
                className="group flex w-full items-center gap-2 rounded-md px-1.5 py-0.5 text-left text-sm leading-tight text-loam-700 hover:bg-loam-50"
              >
                <span className={clsx('shrink-0', !shown && 'opacity-30')}><CrownSwatch color={color} crown={crown} /></span>
                <span className={clsx('min-w-0 flex-1', !shown && 'text-loam-400 line-through decoration-loam-300')}>{label}</span>
                <span className={clsx('tabular-nums', shown ? 'text-loam-500' : 'text-loam-400')}>{count}</span>
                {shown
                  ? <Eye className="h-4 w-4 shrink-0 text-loam-300 group-hover:text-loam-500" aria-hidden="true" />
                  : <EyeOff className="h-4 w-4 shrink-0 text-loam-400" aria-hidden="true" />}
              </button>
            </li>
          )
        })}
      </ul>
      {planned && (
        <p className="mt-2 flex items-center gap-2 text-sm leading-tight text-loam-600">
          <CrownSwatch color="#6b665c" planned />
          {t('plants.legend.planned')}
        </p>
      )}
      {support && (
        <p className="mt-2 flex items-center gap-2 text-sm leading-tight text-loam-600">
          {/* design-lint-ok: the swatch takes the same colour as the support-plant crowns drawn on the map */}
          <CrownSwatch color="#6b665c" support />
          {t('plants.legend.support')}
        </p>
      )}
    </div>
  )
}

/** « Numéro »: which species each number on the map stands for, as on a planting plan. */
function NumberLegend({ groups }: { groups: NumberedGroup[] }) {
  return (
    <div className="mb-3 border-b border-loam-100 pb-3" data-testid="number-legend">
      <h4 className="mb-1.5 text-sm font-medium text-loam-600">{t('plants.legend.numbers')}</h4>
      <ul className="space-y-1">
        {groups.map((group) => (
          <li key={group.key} className="flex items-baseline gap-2 text-sm leading-tight text-loam-700">
            <span
              className="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 self-start rounded-full"
              style={{ background: group.strata ? STRATA_COLORS[group.strata] : '#3d7d42' }}
              aria-hidden="true"
            />
            <span className="shrink-0 font-medium tabular-nums text-loam-900">{numberRanges(group.numbers)}</span>
            <span className="min-w-0 flex-1">{group.name}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** « Nom », « Code » or « Numéro »: how plants are named on the map (« 12 · Pommier », « 12 · Ma do » or « 12 » in the point). */
function PlantLabelSwitch() {
  const style = usePlantLabelStyle()
  return (
    <div role="radiogroup" aria-label={t('plants.legend.labels')} className="flex rounded-full bg-loam-100 p-0.5 text-sm">
      {(['name', 'code', 'number'] as const).map((value) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={style === value}
          title={t(`plants.legend.labels_${value}_hint`)}
          onClick={() => setPlantLabelStyle(value)}
          className={clsx('rounded-full px-2 py-0.5', style === value ? 'bg-white font-medium text-loam-900 shadow-sm' : 'text-loam-600 hover:text-loam-800')}
        >
          {t(`plants.legend.labels_${value}`)}
        </button>
      ))}
    </div>
  )
}

/**
 * A crown as the map draws it: tinted disc, white ring, outline (dashed when
 * still to plant). Climbers have no crown on the map: their point alone.
 */
function CrownSwatch({ color, planned = false, crown = true, support = false }: { color: string; planned?: boolean; crown?: boolean; support?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0" aria-hidden="true" style={{ opacity: planned ? PLANNED_OPACITY : 1 }}>
      {crown && <circle cx="9" cy="9" r="7" fill={color} fillOpacity={planned ? 0.15 : 0.45} stroke="#ffffff" strokeWidth="3.5" />}
      {/* Support plants: white hatching over the strata colour, as on the map. */}
      {crown && support && ( // design-lint-ok: SVG stroke attribute, white hatching as on the map
        <g style={{ clipPath: 'circle(6px at 9px 9px)' }} stroke="#ffffff" strokeWidth="1.2" strokeOpacity="0.9">
          {[-8, -4, 0, 4, 8].map((d) => <line key={d} x1={2 + d} y1={16} x2={16 + d} y2={2} />)}
        </g>
      )}
      {crown && <circle cx="9" cy="9" r="7" fill="none" stroke={color} strokeWidth="1.75" strokeDasharray={planned ? '3 2.2' : undefined} />}
      <circle cx="9" cy="9" r={crown ? 2.2 : 4} fill={planned ? '#ffffff' : color} stroke={planned ? color : '#ffffff'} strokeWidth="1" />
    </svg>
  )
}

/**
 * The legend of the plan while presenting the project, as a designer draws
 * it in the corner of a sheet: the strata in their watercolour washes, the
 * trees already there, the water and the paths, only what the plan shows.
 */
function PlanLegend({ counts }: { counts: StrataCount[] }) {
  const { features, mode, moment, timeline } = useEditor()
  const hidden = useDrawingState((s) => s.hiddenLayers)
  const hiddenKinds = useDrawingState((s) => s.hiddenKinds)
  const hiddenStrata = useDrawingState((s) => s.hiddenStrata)
  const shows = (layer: string, test: (kind: string, geometry: string) => boolean) => !hidden.includes(layer) && features.some((f) =>
    f.properties.layer === layer && f.properties.status !== 'rejected' && !hiddenKinds.includes(f.properties.kind)
    && test(f.properties.kind, f.geometry.type) && inMoment(f.properties, moment, timeline.arrival, mode))
  const rows: { key: string; label: string; count?: number; swatch: React.ReactNode }[] = [
    ...counts.filter(({ strata }) => drawsCrown(strata) && !hidden.includes('plants') && !hiddenStrata.includes(strataKey(strata))).map(({ strata, count }) => ({
      key: strata as string, label: strataLabel(strata), count,
      swatch: <Wash color={PLAN_STRATA_COLORS[strata]} trunk={strata === 'canopy' || strata === 'sub_canopy'} />,
    })),
    ...(shows('existing', (kind) => kind === 'existing_tree') ? [{ key: 'existing', label: t('presentations.plan_legend.existing_trees'), swatch: <Wash color={PLAN_COLORS.existingCrown} opacity={0.25} edge={PLAN_COLORS.existingEdge} shadow={false} /> }] : []),
    ...(shows('water', (kind, geometry) => geometry === 'Polygon' && !isHiddenInRender(kind)) ? [{ key: 'water', label: t('presentations.plan_legend.water'), swatch: <Wash color={PLAN_COLORS.water} round={false} edge={PLAN_COLORS.waterEdge} /> }] : []),
    ...(shows('access', (kind, geometry) => geometry === 'LineString' && RIBBON_KINDS.includes(kind)) ? [{ key: 'paths', label: t('presentations.plan_legend.paths'), swatch: <Ribbon /> }] : []),
  ]
  if (rows.length === 0) return null
  return (
    <ZoneCard id="legend" zone="bottom" order={2} className="md:ml-auto">
      <section aria-label={t('presentations.plan_legend.title')} className="rounded-2xl bg-loam-50/95 px-4 py-3 shadow-lg ring-1 ring-loam-900/10 backdrop-blur">
        <h3 className="mb-2 font-serif text-lg text-loam-900">{t('presentations.plan_legend.title')}</h3>
        <ul className="space-y-1.5">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center gap-2.5 text-sm text-loam-800">
              {row.swatch}
              <span className="flex-1">{row.label}</span>
              {row.count !== undefined && <span className="tabular-nums text-loam-500">{row.count}</span>}
            </li>
          ))}
        </ul>
      </section>
    </ZoneCard>
  )
}

/** A watercolour wash: a crown (round) or a pond. */
function Wash({ color, round = true, edge, opacity = 0.85, shadow = round, trunk = false }: { color: string; round?: boolean; edge?: string; opacity?: number; shadow?: boolean; trunk?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" className="shrink-0" aria-hidden="true">
      {shadow && <circle cx="9.5" cy="8.5" r="7.5" fill={PLAN_COLORS.shadow} fillOpacity="0.18" />}
      {round
        ? <circle cx="10" cy="10.5" r="7.5" fill={color} fillOpacity={opacity} stroke={edge} strokeWidth={edge ? 1.2 : 0} />
        : <path d="M3 11c0-4 4-7 8-6.5s6 3 5.5 6.5-4 5-8 4.5S3 14 3 11z" fill={color} fillOpacity={opacity} stroke={edge} strokeWidth={edge ? 1.4 : 0} />}
      {trunk && <circle cx="10" cy="10.5" r="1.4" fill={PLAN_COLORS.trunk} />}
    </svg>
  )
}

/** A path as the plan draws it: a pale ribbon with a soft edge. */
function Ribbon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" className="shrink-0" aria-hidden="true">
      <path d="M2 15c5-1 6-9 16-10" fill="none" stroke={PLAN_COLORS.pathEdge} strokeWidth="6" strokeLinecap="round" strokeOpacity="0.55" />
      <path d="M2 15c5-1 6-9 16-10" fill="none" stroke={PLAN_COLORS.pathFill} strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}
