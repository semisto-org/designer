import type { Feature, FeatureCollection, Geometry, Position } from 'geojson'
import type { GeoJSONSource, MapMouseEvent, MapTouchEvent, Map as MapLibreMap } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { saveFeature } from '@/map/drawing/save'
import { useEditor } from '@/map/editor/EditorContext'
import { selectionMove, translateGeometry } from '@/map/selection/move'

const SOURCE = 'selection-move'
const LAYERS = ['selection-move-fill', 'selection-move-line', 'selection-move-point'] as const
// The orange of a shape being edited (editor/draw.ts), so moving reads the same.
const COLOR = '#c97b3d'
const GRAB_PX = 8

/**
 * Several elements picked with Shift+click (or « Sélectionner plusieurs »):
 * a bar says how many, and « Déplacer ensemble » lets the person drag them
 * all at once. Each keeps its place relative to the others; nothing is
 * saved until « Enregistrer la position ».
 */
export default function SelectionOverlay() {
  const editor = useEditor()
  const { instance, selection, multiSelect, features } = editor
  const [moved, setMoved] = useState<Map<number, Geometry> | null>(null)
  const [saving, setSaving] = useState(false)
  const latest = useRef(editor)
  latest.current = editor
  const pointer = useMediaQuery('(pointer: fine)')
  const active = selection.length > 0 || multiSelect
  const moving = moved != null

  // Escape cancels a move, or else lets go of the selection.
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || latest.current.drawing) return
      if (selectionMove.active) return setMoved(null)
      latest.current.setSelection([])
      latest.current.setMultiSelect(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  // An element that left the selection (deleted, taken out) leaves the move too.
  useEffect(() => {
    if (!selection.length) setMoved(null)
  }, [selection.length])

  // Dragging: the orange copies follow the cursor; the map pans everywhere else.
  useEffect(() => {
    if (!moved) return
    selectionMove.active = true
    installPreview(instance, moved)
    let current = moved
    let drag: { from: Position; base: Map<number, Geometry> } | null = null
    let frame = 0
    const onMove = (e: MapMouseEvent | MapTouchEvent) => {
      if (!drag) return
      const { from, base } = drag
      const to = [e.lngLat.lng, e.lngLat.lat]
      current = new Map([...base].map(([id, g]) => [id, translateGeometry(g, from, to)]))
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => installPreview(instance, current))
    }
    const onUp = () => {
      if (!drag) return
      drag = null
      instance.getCanvas().style.cursor = ''
      setMoved(current)
    }
    const onDown = (e: MapMouseEvent | MapTouchEvent) => {
      if ('points' in e && e.points.length > 1) return
      const { x, y } = e.point
      const grabbed = instance.queryRenderedFeatures([[x - GRAB_PX, y - GRAB_PX], [x + GRAB_PX, y + GRAB_PX]], { layers: [...LAYERS] })
      if (!grabbed.length) return
      // Stops the map from panning for this gesture.
      e.preventDefault()
      drag = { from: [e.lngLat.lng, e.lngLat.lat], base: current }
      instance.getCanvas().style.cursor = 'grabbing'
    }
    instance.on('mousedown', onDown)
    instance.on('touchstart', onDown)
    instance.on('mousemove', onMove)
    instance.on('touchmove', onMove)
    instance.on('mouseup', onUp)
    instance.on('touchend', onUp)
    return () => {
      cancelAnimationFrame(frame)
      instance.off('mousedown', onDown)
      instance.off('touchstart', onDown)
      instance.off('mousemove', onMove)
      instance.off('touchmove', onMove)
      instance.off('mouseup', onUp)
      instance.off('touchend', onUp)
    }
  }, [instance, moved])

  // Leaving the move (saved, cancelled, editor closed) clears the copies.
  useEffect(() => {
    if (moving) return
    selectionMove.active = false
    removePreview(instance)
  }, [instance, moving])
  useEffect(() => () => {
    selectionMove.active = false
    removePreview(instance)
  }, [instance])

  if (!active || !editor.canEdit) return null

  const picked = features.filter((f) => selection.includes(f.properties.id))

  function startMove() {
    setMoved(new Map(picked.map((f) => [f.properties.id, f.geometry])))
  }

  async function save() {
    if (!moved) return
    const changed = picked.filter((f) => {
      const geometry = moved.get(f.properties.id)
      return geometry && JSON.stringify(geometry) !== JSON.stringify(f.geometry)
    })
    if (!changed.length) {
      setMoved(null)
      return editor.notify(t('selection.unmoved'))
    }
    setSaving(true)
    // One after the other: each save touches the map, whose version two saves at once would fight over.
    // One ⌘Z puts them all back.
    const count = await latest.current.undoGroup(t('undo.labels.move_all', { count: changed.length }), async () => {
      let saved = 0
      for (const f of changed) {
        if (await saveFeature(latest.current, f.properties.id, { geometry: moved.get(f.properties.id) })) saved += 1
      }
      return saved
    })
    setSaving(false)
    setMoved(null)
    // saveFeature already said why an element could not be saved.
    if (count) latest.current.notify(t('selection.moved', { count }))
  }

  function clear() {
    editor.setSelection([])
    editor.setMultiSelect(false)
  }

  const text = moving
    ? t('selection.move_hint')
    : [
        selection.length ? t('selection.count', { count: selection.length }) : t('selection.empty'),
        t(multiSelect ? 'selection.tap_hint' : pointer ? 'selection.shift_hint' : 'selection.tap_hint'),
      ].join(' ')

  return (
    <div className="pointer-events-none absolute inset-x-2 top-14 z-30 md:left-1/2 md:right-auto md:w-[32rem] md:-translate-x-1/2">
      <div className="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-loam-900/90 px-3 py-2 text-sm text-white shadow-lg" role="status">
        <span className="min-w-[14rem] flex-1">{text}</span>
        <div className="flex shrink-0 gap-2">
          {moving ? (
            <>
              <Button size="sm" variant="secondary" disabled={saving} onClick={() => void save()}>{t('selection.save')}</Button>
              <Button size="sm" variant="ghost" className="text-white hover:bg-white/10" disabled={saving} onClick={() => setMoved(null)}>{t('selection.cancel')}</Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="secondary" disabled={!picked.length || editor.drawing} onClick={startMove}>{t('selection.move')}</Button>
              <Button size="sm" variant="ghost" className="text-white hover:bg-white/10" onClick={clear}>{t('selection.clear')}</Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function collection(geometries: Map<number, Geometry>): FeatureCollection {
  const features: Feature[] = [...geometries].map(([id, geometry]) => ({ type: 'Feature', id, geometry, properties: {} }))
  return { type: 'FeatureCollection', features }
}

// Installed idempotently: the first call adds the source and its layers, later ones only move the shapes.
function installPreview(map: MapLibreMap, geometries: Map<number, Geometry>) {
  const data = collection(geometries)
  const source = map.getSource(SOURCE) as GeoJSONSource | undefined
  if (source) return source.setData(data)
  map.addSource(SOURCE, { type: 'geojson', data })
  map.addLayer({ id: 'selection-move-fill', type: 'fill', source: SOURCE, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': COLOR, 'fill-opacity': 0.25 } })
  map.addLayer({ id: 'selection-move-line', type: 'line', source: SOURCE, filter: ['!=', ['geometry-type'], 'Point'], paint: { 'line-color': COLOR, 'line-width': 3 } })
  map.addLayer({
    id: 'selection-move-point', type: 'circle', source: SOURCE, filter: ['==', ['geometry-type'], 'Point'],
    paint: { 'circle-color': COLOR, 'circle-radius': 7, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 },
  })
}

function removePreview(map: MapLibreMap) {
  // The map may already be gone when the editor closes.
  try {
    LAYERS.forEach((id) => map.getLayer(id) && map.removeLayer(id))
    if (map.getSource(SOURCE)) map.removeSource(SOURCE)
  } catch {}
}
