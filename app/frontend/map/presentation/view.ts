import { drawingStore, setHiddenKinds, setHiddenLayers, setHiddenStrata, setVersion } from '@/map/drawing/store'
import type { Editor } from '@/map/editor/EditorContext'
import { SECTOR_GROUPS } from '@/map/sectors/sectors'
import { sectorView } from '@/map/sectors/store'
import type { PresentationView } from './types'

const round = (value: number, digits: number) => Number(value.toFixed(digits))

/** The view the person is looking at now, as a step keeps it. */
export function captureView(editor: Editor): PresentationView {
  const { instance } = editor
  const center = instance.getCenter()
  const drawing = drawingStore.get()
  const sectors = sectorView.get()
  const view: PresentationView = {
    camera: {
      center: [round(center.lng, 7), round(center.lat, 7)],
      zoom: round(instance.getZoom(), 2),
      bearing: round(instance.getBearing(), 1),
      pitch: round(instance.getPitch(), 1),
    },
    hiddenLayers: [...drawing.hiddenLayers],
    hiddenKinds: [...drawing.hiddenKinds],
    hiddenStrata: [...drawing.hiddenStrata],
    moment: editor.moment,
  }
  if (editor.activePanel && editor.activePanel !== 'present') view.panel = editor.activePanel
  if (drawing.version) view.version = drawing.version
  if (sectors.onMap) view.sectors = SECTOR_GROUPS.filter((g) => !sectors.hiddenGroups.includes(g))
  if (editor.shade) view.shade = editor.shade
  if (editor.selectedId != null) view.featureId = editor.selectedId
  return view
}

/**
 * Brings a step's view back: layers, kinds and strata, version, sectors,
 * time and shade, the panel, the selected element, then the framing (the
 * terrain as a whole when the step has none of its own).
 */
export function applyView(editor: Editor, view: PresentationView) {
  setHiddenLayers(view.hiddenLayers ?? [])
  setHiddenKinds(view.hiddenKinds ?? [])
  setHiddenStrata(view.hiddenStrata ?? [])
  setVersion(view.version ?? null)
  if (view.sectors && view.sectors.length > 0) {
    sectorView.setHiddenGroups(SECTOR_GROUPS.filter((g) => !view.sectors?.includes(g)))
    sectorView.setOnMap(true)
  } else {
    sectorView.setOnMap(false)
  }
  editor.setMoment(view.moment ?? 'today')
  editor.setShade(view.shade ?? null)
  const feature = view.featureId != null ? editor.features.find((f) => f.properties.id === view.featureId) : null
  editor.select(feature ? feature.properties.id : null)
  const panel = view.panel ?? null
  if (panel !== editor.activePanel) editor.openPanel(panel)

  const { instance } = editor
  if (view.camera) {
    instance.easeTo({ center: view.camera.center, zoom: view.camera.zoom, bearing: view.camera.bearing, pitch: view.camera.pitch, duration: 1200 })
  } else if (editor.map.bbox) {
    instance.fitBounds(editor.map.bbox as [number, number, number, number], { padding: 60, maxZoom: 19, bearing: 0, pitch: 0, duration: 1200 })
  }
}
