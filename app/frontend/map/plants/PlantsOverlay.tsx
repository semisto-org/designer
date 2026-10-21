import { circle } from '@turf/turf'
import type { Feature, FeatureCollection, Point, Polygon } from 'geojson'
import { MapPin, X } from 'lucide-react'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import { useEffect, useMemo, useRef } from 'react'
import { t } from '@/lib/i18n'
import { strataKey } from '@/map/drawing/hidden'
import { drawingStore, useDrawingState } from '@/map/drawing/store'
import { setBaseFilter } from '@/map/drawing/style'
import { useEditor, type Editor } from '@/map/editor/EditorContext'
import { ensureLabelBackground, markerLabel } from '@/map/layers/labels'
import { graftProperty, isPatch, isPlant, numberProperty, trainedCrown, trainingProperty } from '@/map/plants/properties'
import { scheduleReload, setPlacing, usePlanting } from '@/map/plants/store'
import { FEATURES_SOURCE, featureLabelFilter } from '@/map/layers/features'
import { plantLabelRank, plantLabelText, plantLabelZoom, type PlantLabelStyle } from '@/map/plants/labelRank'
import { plantLabelStyleStore, usePlantLabelStyle } from '@/map/plants/labelStyle'
import { drawsCrown, plantIsSupport, plantStrata, STRATA_COLORS } from '@/map/plants/strata'
import { ensureSupportHatch, SUPPORT_HATCH } from '@/map/plants/supportHatch'
import { inkOn } from '@/map/plants/strataColors'
import { applyPlantsVisibility } from '@/map/plants/visibility'
import { isPlannedPlant, PLANNED_OPACITY } from '@/map/scenario'
import { inMoment } from '@/map/time/moment'
import { growingPlant, sizeAtMoment } from '@/map/time/plants'
import type { PlantingState } from '@/types/plants'

const CROWNS = 'plant-crowns'
const LABELS = 'plant-labels'
const NUMBERS = 'plant-numbers'

// `reach`: the hatched disc of a support plant, the ground it feeds (not a crown).
type CrownProps = { featureId: number; color: string; planted: boolean; selected: boolean; support: boolean; reach?: boolean }
// `featureId` makes crowns and names select their plant (see map/featurePick).
type LabelProps = { featureId: number; label: string; planted: boolean; minZoom: number; rank: number }
// A plant's number written inside its point (« Numéro » mode).
type NumberProps = { featureId: number; number: string; color: string; ink: string; planted: boolean; selected: boolean }
/** Each plant's strata colour, for its point in the features source. */
type PointColors = Map<number, string>

const PLANTED = ['get', 'planted'] as unknown as boolean
const NOT_REACH = ['!', ['to-boolean', ['get', 'reach']]] as never

/**
 * The ground a support plant feeds (m, radius): its cuttings are dropped and
 * its roots shed nitrogen around it, further than its crown when it is cut
 * back every year.
 */
const SUPPORT_REACH_M = 2

/**
 * Crowns as real-size circles (metres), at the moment of the time strip:
 * each plant's spread at its age then, from its species' adult size and
 * years to maturity (the 3D view's growth model, map/time); the adult crown
 * while that is unknown. What the moment leaves out (the plan on arrival,
 * drafts until the future, a support plant that gave way) has no crown,
 * and plants of a hidden strata are left out altogether.
 */
function crownsOf(editor: Editor, data: PlantingState | null, labelStyle: PlantLabelStyle, hiddenStrata: string[]) {
  const crowns: Feature<Polygon, CrownProps>[] = []
  const labels: Feature<Point, LabelProps>[] = []
  const points: PointColors = new Map()
  const numbers: Feature<Point, NumberProps>[] = []
  for (const feature of editor.features) {
    if (!isPlant(feature) || feature.geometry.type !== 'Point' || feature.properties.status === 'rejected') continue
    if (!inMoment(feature.properties, editor.moment, editor.timeline.arrival)) continue
    const strata = plantStrata(feature, data)
    // « Calques » or the legend hid this strata: no crown, name or number.
    if (data && hiddenStrata.includes(strataKey(strata))) continue
    const species = data?.species[String(numberProperty(feature, 'species_id'))]
    const variety = species ? data?.varieties[String(numberProperty(feature, 'variety_id'))] : undefined
    // Its number, then the name the person gave it (else its species and
    // variety), or the short latin code when the viewer asked for it.
    const label = plantLabelText({
      number: numberProperty(feature, 'number'),
      ownName: feature.properties.name,
      speciesName: species ? (species.commonName ?? species.latinName) : null,
      varietyName: variety?.name,
      latinName: variety?.latinName ?? species?.latinName,
    }, labelStyle)
    if (label) {
      // A climber has no crown on the plan: named like a small plant.
      const crownM = drawsCrown(strata) ? species?.crownM : null
      labels.push({
        type: 'Feature',
        geometry: feature.geometry,
        properties: {
          featureId: feature.properties.id,
          planted: !isPlannedPlant(feature.properties),
          label,
          minZoom: plantLabelZoom(crownM),
          rank: plantLabelRank(crownM),
        },
      })
    }
    const number = numberProperty(feature, 'number')
    if (number != null && number > 0) {
      const color = strata ? STRATA_COLORS[strata] : '#3d7d42'
      numbers.push({
        type: 'Feature',
        geometry: feature.geometry,
        properties: {
          featureId: feature.properties.id,
          number: String(number),
          color,
          ink: inkOn(color),
          planted: !isPlannedPlant(feature.properties),
          selected: editor.selectedId === feature.properties.id || editor.selection.includes(feature.properties.id),
        },
      })
    }
    if (!strata || !species) continue
    points.set(feature.properties.id, STRATA_COLORS[strata])
    if (!drawsCrown(strata)) continue
    const size = sizeAtMoment(feature, growingPlant(feature, data, strata), editor.moment, editor.timeline)
    if (size === null) continue
    const crownM = size ? size.spread : trainedCrown(species.crownM, trainingProperty(feature), strata, graftProperty(feature, strata))
    const radiusM = Math.max(crownM / 2, 0.15)
    const polygon = circle(feature.geometry.coordinates, radiusM / 1000, { steps: 40, units: 'kilometers' })
    const support = plantIsSupport(feature, data)
    if (support) {
      const reach = circle(feature.geometry.coordinates, Math.max(radiusM, SUPPORT_REACH_M) / 1000, { steps: 40, units: 'kilometers' })
      crowns.push({
        ...reach,
        properties: { featureId: feature.properties.id, color: STRATA_COLORS[strata], planted: !isPlannedPlant(feature.properties), selected: false, support, reach: true },
      })
    }
    crowns.push({
      ...polygon,
      properties: {
        featureId: feature.properties.id,
        color: STRATA_COLORS[strata],
        planted: !isPlannedPlant(feature.properties),
        selected: editor.selectedId === feature.properties.id || editor.selection.includes(feature.properties.id),
        support,
      },
    })
  }
  return {
    crowns: { type: 'FeatureCollection', features: crowns } as FeatureCollection<Polygon, CrownProps>,
    labels: { type: 'FeatureCollection', features: labels } as FeatureCollection<Point, LabelProps>,
    numbers: { type: 'FeatureCollection', features: numbers } as FeatureCollection<Point, NumberProps>,
    points,
  }
}

// Names of planned plants fade with their crowns. Big crowns are named
// first (from zoom 17) and win collisions; small plants follow as one zooms in.
const plantLabel = (() => {
  const { layout, paint } = markerLabel(['get', 'label'], { 'symbol-sort-key': ['get', 'rank'], 'text-padding': 6 })
  const opacity = ['case', PLANTED, 1, PLANNED_OPACITY] as never
  return { layout, paint: { ...paint, 'text-opacity': opacity, 'icon-opacity': opacity } }
})()

function install(map: MapLibreMap, data: ReturnType<typeof crownsOf>) {
  ensureLabelBackground(map)
  ensureSupportHatch(map)
  colorPoints(map, data.points)
  // Plants are named here, by crown size: not a second time by the features layer.
  setBaseFilter(map, 'features-label', featureLabelFilter({ withPlants: false }))
  const crowns = map.getSource(CROWNS) as GeoJSONSource | undefined
  if (crowns) {
    crowns.setData(data.crowns)
    ;(map.getSource(LABELS) as GeoJSONSource | undefined)?.setData(data.labels)
    ;(map.getSource(NUMBERS) as GeoJSONSource | undefined)?.setData(data.numbers)
    raiseNumbers(map)
    return
  }
  // Under the feature lines and points, so plants stay clickable.
  const before = map.getLayer('features-line') ? 'features-line' : undefined
  map.addSource(CROWNS, { type: 'geojson', data: data.crowns })
  map.addSource(LABELS, { type: 'geojson', data: data.labels })
  map.addSource(NUMBERS, { type: 'geojson', data: data.numbers })
  // Every crown wears its strata colour over a white ring, readable on aerial
  // photos as on plans. Planted: solid crown. Planned: faint fill and a
  // dashed outline at 75 % opacity.
  map.addLayer({
    id: `${CROWNS}-fill`,
    type: 'fill',
    source: CROWNS,
    filter: NOT_REACH,
    paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['case', PLANTED, 0.45, 0.15] },
  }, before)
  // Support plants: the ground they feed is hatched in their strata colour,
  // as a planting plan marks what is there for a while: they build the
  // soil around the fruit trees, then give way.
  map.addLayer({
    id: `${CROWNS}-reach`,
    type: 'fill',
    source: CROWNS,
    filter: ['to-boolean', ['get', 'reach']],
    paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['case', PLANTED, 0.3, 0.12] },
  }, before)
  map.addLayer({
    id: `${CROWNS}-support`,
    type: 'fill',
    source: CROWNS,
    filter: ['to-boolean', ['get', 'reach']],
    paint: { 'fill-pattern': SUPPORT_HATCH, 'fill-opacity': ['case', PLANTED, 0.9, 0.5] },
  }, before)
  map.addLayer({
    id: `${CROWNS}-reach-line`,
    type: 'line',
    source: CROWNS,
    filter: ['to-boolean', ['get', 'reach']],
    // design-lint-ok: MapLibre paint takes colour values, not theme classes
    paint: { 'line-color': '#ffffff', 'line-width': 1.5, 'line-opacity': ['case', PLANTED, 0.9, 0.5], 'line-dasharray': ['literal', [2, 2]] },
  }, before)
  map.addLayer({
    id: `${CROWNS}-casing`,
    type: 'line',
    source: CROWNS,
    filter: NOT_REACH,
    paint: {
      'line-color': '#ffffff',
      'line-width': ['case', ['get', 'selected'], 5.5, 4],
      'line-opacity': ['case', PLANTED, 0.7, 0.45],
    },
  }, before)
  map.addLayer({
    id: `${CROWNS}-line`,
    type: 'line',
    source: CROWNS,
    filter: NOT_REACH,
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['case', ['get', 'selected'], 3, 2],
      'line-opacity': ['case', PLANTED, 0.95, PLANNED_OPACITY],
      'line-dasharray': ['case', PLANTED, ['literal', [1, 0]], ['literal', [2, 1.5]]] as never,
    },
  }, before)
  // Under the other names (zones, pond, buildings), which MapLibre places first.
  map.addLayer({
    id: `${LABELS}-text`,
    type: 'symbol',
    source: LABELS,
    minzoom: 17,
    filter: ['>=', ['zoom'], ['get', 'minZoom']],
    ...plantLabel,
  }, map.getLayer('features-label') ? 'features-label' : undefined)
  // « Numéro »: the number inside a pastille in the strata colour, over the
  // plant's point, as on a hand-drawn planting plan (hidden otherwise).
  map.addLayer({
    id: `${NUMBERS}-disc`,
    type: 'circle',
    source: NUMBERS,
    minzoom: 15,
    layout: { visibility: 'none' },
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, 6, 17, 9, 20, 13],
      'circle-color': ['case', PLANTED, ['get', 'color'], '#ffffff'],
      'circle-stroke-color': ['case', PLANTED, '#ffffff', ['get', 'color']],
      'circle-stroke-width': ['case', ['get', 'selected'], 3, PLANTED, 1.5, 2.5],
      'circle-opacity': ['case', PLANTED, 1, 0.9],
    },
  })
  map.addLayer({
    id: `${NUMBERS}-text`,
    type: 'symbol',
    source: NUMBERS,
    minzoom: 16,
    layout: {
      visibility: 'none',
      'text-field': ['get', 'number'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 16, 8, 17, 10, 20, 13],
      'text-font': ['Noto Sans Regular'],
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: { 'text-color': ['case', PLANTED, ['get', 'ink'], '#1b1712'] },
  })
  raiseNumbers(map)
}

/** The pastilles cover the plant's point, which the features layers may have drawn later. */
function raiseNumbers(map: MapLibreMap) {
  for (const id of [`${NUMBERS}-disc`, `${NUMBERS}-text`]) if (map.getLayer(id)) map.moveLayer(id)
}

/**
 * Gives each plant's point (in the features source) its strata colour,
 * read by the `features-point` layer. Plants without one keep the colour
 * of the plants layer.
 */
function colorPoints(map: MapLibreMap, colors: PointColors) {
  if (!map.getSource(FEATURES_SOURCE)) return
  for (const [id, color] of colors) map.setFeatureState({ source: FEATURES_SOURCE, id }, { strataColor: color })
}

// A style being swapped (basemap change) refuses sources until it loaded;
// its `styledata` event brings us back.
function safeInstall(map: MapLibreMap, data: ReturnType<typeof crownsOf>) {
  try {
    install(map, data)
    applyPlantsVisibility(map, drawingStore.get().hiddenLayers, plantLabelStyleStore.get())
  } catch {
    /* style not ready yet */
  }
}

/**
 * The « plants » layer on the map: crowns at adult spread with labels,
 * the click-to-place loop from the palette, and
 * the planting refresh when plants or patches change.
 */
export default function PlantsOverlay() {
  const editor = useEditor()
  const mapId = editor.map.id
  const { data, placing } = usePlanting(mapId)
  const hidden = useDrawingState((s) => s.hiddenLayers)
  const hiddenStrata = useDrawingState((s) => s.hiddenStrata)
  const editorRef = useRef(editor)
  editorRef.current = editor
  const map = editor.instance

  const labelStyle = usePlantLabelStyle()
  const layers = useMemo(() => crownsOf(editor, data, labelStyle, hiddenStrata), [editor.features, editor.selectedId, editor.selection, data, editor.moment, editor.timeline, labelStyle, hiddenStrata]) // eslint-disable-line react-hooks/exhaustive-deps

  // Install the crowns, and again after a basemap style change.
  const latest = useRef(layers)
  latest.current = layers
  useEffect(() => {
    const apply = () => safeInstall(map, latest.current)
    // The features source comes back after a style change: colour its points again.
    const onSource = (e: { sourceId?: string; sourceDataType?: string }) => {
      if (e.sourceId === FEATURES_SOURCE && e.sourceDataType === 'metadata') colorPoints(map, latest.current.points)
    }
    apply()
    map.on('styledata', apply)
    map.on('sourcedata', onSource)
    return () => {
      map.off('styledata', apply)
      map.off('sourcedata', onSource)
    }
  }, [map])
  useEffect(() => safeInstall(map, layers), [map, layers])
  // « Calques »: hiding the plants layer hides the crowns and their names too.
  useEffect(() => applyPlantsVisibility(map, hidden, labelStyle), [map, hidden, labelStyle])

  // Planting quantities follow plants and patches: reload when they change.
  const signature = editor.features
    .filter((f) => isPlant(f) || isPatch(f))
    .map((f) => `${f.properties.id}:${f.properties.lockVersion}:${f.properties.status}`)
    .join('|')
  const previous = useRef<string | null>(null)
  useEffect(() => {
    if (previous.current !== null && previous.current !== signature) scheduleReload(mapId)
    previous.current = signature
  }, [signature, mapId])

  // Click-to-place loop: one plant per click until Escape or « Terminer ».
  // New plants are planned ones: the land on arrival would hide them, today shows the plan.
  useEffect(() => {
    if (!placing || !editorRef.current.canEdit) return
    if (editorRef.current.moment === 'arrival') editorRef.current.setMoment('today')
    // A distinct cursor while placing (application.css, .placing-plant).
    const container = editorRef.current.instance.getContainer()
    container.classList.add('placing-plant')
    let stopped = false
    void (async () => {
      while (!stopped) {
        const geometry = await editorRef.current.draw('point')
        if (!geometry || stopped) break
        try {
          await editorRef.current.createFeature({
            layer: 'plants', kind: 'plant', geometry,
            properties: { species_id: placing.speciesId, ...(placing.varietyId ? { variety_id: placing.varietyId } : {}) },
          })
        } catch (e) {
          editorRef.current.notify(e instanceof Error ? e.message : String(e), 'error')
          break
        }
      }
      if (!stopped) setPlacing(null)
    })()
    return () => {
      stopped = true
      container.classList.remove('placing-plant')
      editorRef.current.cancelDraw()
    }
  }, [placing])

  if (!placing) return null
  return (
    <div className="pointer-events-none absolute left-14 right-2 top-2 z-30 flex justify-center md:left-1/2 md:right-auto md:-translate-x-1/2">
      <div className="pointer-events-auto flex max-w-md items-center gap-2 rounded-xl bg-leaf-700 px-3 py-2 text-sm text-white shadow-lg">
        <MapPin className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1">{t('palette.placing', { name: placing.name })}</span>
        <button
          type="button"
          onClick={() => { setPlacing(null); editor.cancelDraw() }}
          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-white/15 px-2 py-1 text-xs hover:bg-white/25"
        >
          <X className="h-3.5 w-3.5" />{t('palette.stop_placing')}
        </button>
      </div>
    </div>
  )
}
