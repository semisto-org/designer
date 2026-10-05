import { circle } from '@turf/turf'
import type { Feature, FeatureCollection, Point, Polygon } from 'geojson'
import { MapPin, X } from 'lucide-react'
import type { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent } from 'maplibre-gl'
import { useEffect, useMemo, useRef } from 'react'
import { t } from '@/lib/i18n'
import { useEditor, type Editor } from '@/map/editor/EditorContext'
import { isPatch, isPlant, numberProperty } from '@/map/plants/properties'
import { scheduleReload, setPlacing, usePlanting } from '@/map/plants/store'
import { STRATA_COLORS } from '@/map/plants/strata'
import { inScenario, isPlannedPlant, setScenario, useScenario, type Scenario } from '@/map/scenario'
import type { PlantingState } from '@/types/plants'

const CROWNS = 'plant-crowns'
const LABELS = 'plant-labels'
const FEATURE_LAYERS = ['features-fill', 'features-line', 'features-point']

type CrownProps = { featureId: number; color: string; planted: boolean; selected: boolean }

const PLANTED = ['get', 'planted'] as unknown as boolean

/**
 * Adult crowns as real-size circles (metres), from each plant's species.
 * Planned plants (not planted yet) are left out of the current situation.
 */
function crownsOf(editor: Editor, data: PlantingState | null, scenario: Scenario) {
  const crowns: Feature<Polygon, CrownProps>[] = []
  const labels: Feature<Point, { label: string }>[] = []
  for (const feature of editor.features) {
    if (!isPlant(feature) || feature.geometry.type !== 'Point' || feature.properties.status === 'rejected') continue
    if (!inScenario(feature.properties, scenario)) continue
    const speciesId = numberProperty(feature, 'species_id')
    const species = speciesId != null ? data?.species[String(speciesId)] : undefined
    if (!species) continue
    const varietyId = numberProperty(feature, 'variety_id')
    const item = data?.palette.find((i) => i.speciesId === speciesId && i.varietyId === varietyId) ??
      data?.palette.find((i) => i.speciesId === speciesId && i.varietyId == null)
    const strata = item?.effectiveStrata ?? species.strata
    const radiusM = Math.max(species.crownM / 2, 0.15)
    const polygon = circle(feature.geometry.coordinates, radiusM / 1000, { steps: 40, units: 'kilometers' })
    crowns.push({
      ...polygon,
      properties: {
        featureId: feature.properties.id,
        color: STRATA_COLORS[strata],
        planted: !isPlannedPlant(feature.properties),
        selected: editor.selectedId === feature.properties.id,
      },
    })
    const variety = varietyId != null ? data?.varieties[String(varietyId)] : undefined
    labels.push({
      type: 'Feature',
      geometry: feature.geometry,
      properties: { label: variety ? `${species.commonName ?? species.latinName} '${variety.name}'` : species.commonName ?? species.latinName },
    })
  }
  return {
    crowns: { type: 'FeatureCollection', features: crowns } as FeatureCollection<Polygon, CrownProps>,
    labels: { type: 'FeatureCollection', features: labels } as FeatureCollection<Point, { label: string }>,
  }
}

function install(map: MapLibreMap, data: ReturnType<typeof crownsOf>) {
  const crowns = map.getSource(CROWNS) as GeoJSONSource | undefined
  if (crowns) {
    crowns.setData(data.crowns)
    ;(map.getSource(LABELS) as GeoJSONSource | undefined)?.setData(data.labels)
    return
  }
  // Under the feature lines and points, so plants stay clickable.
  const before = map.getLayer('features-line') ? 'features-line' : undefined
  map.addSource(CROWNS, { type: 'geojson', data: data.crowns })
  map.addSource(LABELS, { type: 'geojson', data: data.labels })
  // Planted: solid crown. Planned: faint fill and a white dashed outline,
  // readable on aerial photos as on plans.
  map.addLayer({
    id: `${CROWNS}-fill`,
    type: 'fill',
    source: CROWNS,
    paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['case', PLANTED, 0.45, 0.1] },
  }, before)
  map.addLayer({
    id: `${CROWNS}-line`,
    type: 'line',
    source: CROWNS,
    paint: {
      'line-color': ['case', PLANTED, ['get', 'color'], '#ffffff'],
      'line-width': ['case', ['get', 'selected'], 3, 2],
      'line-opacity': 0.95,
      'line-dasharray': ['case', PLANTED, ['literal', [1, 0]], ['literal', [2, 1.5]]] as never,
    },
  }, before)
  map.addLayer({
    id: `${LABELS}-text`,
    type: 'symbol',
    source: LABELS,
    minzoom: 18,
    layout: {
      'text-field': ['get', 'label'], 'text-size': 11, 'text-offset': [0, 1.1], 'text-anchor': 'top',
      'text-font': ['Noto Sans Regular'], 'text-optional': true,
    },
    paint: { 'text-color': '#264f2b', 'text-halo-color': '#ffffff', 'text-halo-width': 1.2 },
  })
}

// A style being swapped (basemap change) refuses sources until it loaded;
// its `styledata` event brings us back.
function safeInstall(map: MapLibreMap, data: ReturnType<typeof crownsOf>) {
  try {
    install(map, data)
  } catch {
    /* style not ready yet */
  }
}

/**
 * The « plants » layer on the map: crowns at adult spread with labels,
 * click-on-crown to select, the click-to-place loop from the palette, and
 * the planting refresh when plants or patches change.
 */
export default function PlantsOverlay() {
  const editor = useEditor()
  const mapId = editor.map.id
  const { data, placing } = usePlanting(mapId)
  const scenario = useScenario()
  const editorRef = useRef(editor)
  editorRef.current = editor
  const map = editor.instance

  const layers = useMemo(() => crownsOf(editor, data, scenario), [editor.features, editor.selectedId, data, scenario]) // eslint-disable-line react-hooks/exhaustive-deps

  // Install the crowns, and again after a basemap style change.
  const latest = useRef(layers)
  latest.current = layers
  useEffect(() => {
    const apply = () => safeInstall(map, latest.current)
    apply()
    map.on('styledata', apply)
    return () => { map.off('styledata', apply) }
  }, [map])
  useEffect(() => safeInstall(map, layers), [map, layers])

  // A click on a crown selects its plant, unless drawing or a feature is under the cursor.
  useEffect(() => {
    const onClick = (e: MapLayerMouseEvent) => {
      const current = editorRef.current
      if (current.drawing) return
      const present = FEATURE_LAYERS.filter((id) => map.getLayer(id))
      if (present.length && map.queryRenderedFeatures(e.point, { layers: present }).length > 0) return
      const id = e.features?.[0]?.properties?.featureId
      if (id != null) current.select(Number(id))
    }
    const layer = `${CROWNS}-fill`
    map.on('click', layer, onClick)
    return () => { map.off('click', layer, onClick) }
  }, [map])

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
  // New plants are planned ones: show the projected situation to see them.
  useEffect(() => {
    if (!placing || !editorRef.current.canEdit) return
    setScenario('projected')
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
