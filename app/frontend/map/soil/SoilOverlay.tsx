import type { MapGeoJSONFeature, MapMouseEvent } from 'maplibre-gl'
import { X } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { t } from '@/lib/i18n'
import { useDrawingState } from '@/map/drawing/store'
import { useEditor } from '@/map/editor/EditorContext'
import {
  highlightSample, installSoilLayers, OBSERVATION_LAYER, observationsToGeoJSON, removeSoilLayers, SAMPLE_LAYER,
  samplesToGeoJSON, setSoilLayersVisible, suggestionsToGeoJSON,
} from '@/map/soil/layers'
import { soilVisibility } from '@/map/soil/visibility'
import { getSoilState, soilActions, useSoil, type SoilPlacing } from '@/map/soil/store'

/**
 * Always mounted in the editor: loads the soil points and plant observations,
 * draws them (and the suggested positions) on the map, opens the panel when a
 * marker is clicked, and turns the next click on the map into a position
 * when the user is placing a point or a plant.
 */
export default function SoilOverlay() {
  const editor = useEditor()
  const map = editor.instance
  const state = useSoil()
  const { samples, observations, suggestions, showOnMap, openId, placing } = state
  const hiddenLayers = useDrawingState((s) => s.hiddenLayers)

  useEffect(() => {
    soilActions.load(editor.map.id)
    soilActions.loadObservations(editor.map.id)
  }, [editor.map.id])

  const sampleData = useMemo(() => samplesToGeoJSON(samples), [samples])
  const observationData = useMemo(() => observationsToGeoJSON(observations), [observations])
  const suggestionData = useMemo(() => suggestionsToGeoJSON(suggestions ?? []), [suggestions])

  // Markers. Installed after the editor's own layers so they sit on top.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      installSoilLayers(map, { samples: sampleData, observations: observationData, suggestions: suggestionData })
      setSoilLayersVisible(map, soilVisibility({ showOnMap, suggesting: suggestions != null, hiddenLayers }))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [map, sampleData, observationData, suggestionData, showOnMap, suggestions, hiddenLayers])
  useEffect(() => () => removeSoilLayers(map), [map])
  useEffect(() => { highlightSample(map, openId) }, [map, openId, sampleData])

  // Click a marker: open it in the panel.
  useEffect(() => {
    const open = (tab: 'points' | 'plants', id: number) => {
      if (editor.drawing || getSoilState().placing) return
      if (tab === 'points') soilActions.openSample(id)
      editor.openPanel('soil')
      soilActions.setTab(tab)
    }
    const onSample = (event: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
      const id = event.features?.[0]?.properties?.id
      if (id != null) open('points', Number(id))
    }
    const onObservation = (event: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
      const id = event.features?.[0]?.properties?.id
      if (id != null) open('plants', Number(id))
    }
    const pointer = () => { map.getCanvas().style.cursor = 'pointer' }
    const reset = () => { map.getCanvas().style.cursor = '' }
    map.on('click', SAMPLE_LAYER, onSample)
    map.on('click', OBSERVATION_LAYER, onObservation)
    ;[SAMPLE_LAYER, OBSERVATION_LAYER].forEach((layer) => {
      map.on('mouseenter', layer, pointer)
      map.on('mouseleave', layer, reset)
    })
    return () => {
      map.off('click', SAMPLE_LAYER, onSample)
      map.off('click', OBSERVATION_LAYER, onObservation)
      ;[SAMPLE_LAYER, OBSERVATION_LAYER].forEach((layer) => {
        map.off('mouseenter', layer, pointer)
        map.off('mouseleave', layer, reset)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, editor.drawing])

  // Placing: the next click on the map is the position. A deliberate gesture,
  // so it also works over a drawn feature, unlike passive map clicks.
  useEffect(() => {
    if (!placing) return
    const canvas = map.getCanvas()
    canvas.style.cursor = 'crosshair'
    const onClick = async (event: MapMouseEvent) => {
      if (editor.drawing) return
      const position = { lng: event.lngLat.lng, lat: event.lngLat.lat }
      const mapId = editor.map.id
      try {
        if (placing.kind === 'new-sample') {
          const label = t('soil.points.default_label', { number: getSoilState().samples.length + 1 })
          const sample = await soilActions.createSample(mapId, { label, ...position })
          soilActions.openSample(sample.id)
          soilActions.setTab('points')
          editor.notify(t('soil.points.placed'))
        } else if (placing.kind === 'sample') {
          await soilActions.saveSample(mapId, placing.id, position)
          editor.notify(t('soil.points.moved'))
        } else if (placing.kind === 'observation') {
          await soilActions.patchObservation(mapId, placing.id, position)
          editor.notify(t('soil.plants.added'))
        } else {
          await soilActions.saveObservation(mapId, placing.draft, position)
          editor.notify(t('soil.plants.added'))
        }
        soilActions.cancelPlacing()
      } catch (error) {
        editor.notify((error as Error).message, 'error')
      }
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && soilActions.cancelPlacing()
    map.on('click', onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      canvas.style.cursor = ''
      map.off('click', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [map, placing, editor])

  // On a phone the panel is a sheet over half the map: fold it away while placing, bring it back after.
  const foldedPanel = useRef(false)
  useEffect(() => {
    const phone = window.matchMedia('(max-width: 767px)').matches
    if (placing && phone && editor.activePanel === 'soil') {
      foldedPanel.current = true
      editor.openPanel(null)
    } else if (!placing && foldedPanel.current) {
      foldedPanel.current = false
      editor.openPanel('soil')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placing])

  return placing ? (
    <div role="status" className="absolute inset-x-14 top-3 z-30 mx-auto flex w-fit flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-xl bg-leaf-700 px-4 py-2 text-center text-sm text-white shadow-lg md:max-w-md">
      <span>{bannerText(placing, samples.find((s) => placing.kind === 'sample' && s.id === placing.id)?.label, observations.find((o) => placing.kind === 'observation' && o.id === placing.id)?.speciesName)}</span>
      <button type="button" onClick={() => soilActions.cancelPlacing()} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-white/15 px-2 py-1 text-xs hover:bg-white/25">
        <X className="h-3.5 w-3.5" />
        {t('common.cancel')}
      </button>
    </div>
  ) : null
}

function bannerText(placing: SoilPlacing, sampleLabel?: string, speciesName?: string): string {
  switch (placing.kind) {
    case 'new-sample': return t('soil.points.placing_new')
    case 'sample': return t('soil.points.placing_banner', { name: sampleLabel ?? '' })
    case 'observation': return t('soil.plants.placing_banner', { name: speciesName ?? '' })
    default: return t('soil.plants.placing_banner', { name: placing.draft.speciesName })
  }
}
