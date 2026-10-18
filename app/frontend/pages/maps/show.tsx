import { Head, Link } from '@inertiajs/react'
import type { Geometry } from 'geojson'
import { ArrowLeft } from 'lucide-react'
import { area, polygon, bbox as turfBbox } from '@turf/turf'
import type { MapMouseEvent, Map as MapLibreMap } from 'maplibre-gl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MapViewMenu } from '@/components/map_views/MapViews'
import { Dialog } from '@/components/ui/Dialog'
import { Flash } from '@/components/ui/Flash'
import { api } from '@/lib/api'
import { formatArea, t } from '@/lib/i18n'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { MapView } from '@/map/MapView'
import { boxSelect } from '@/map/boxSelect'
import { featureAt, hitsAt, hitsIn } from '@/map/featurePick'
import { useMapInstance } from '@/map/MapContext'
import { Drawer, type DrawOptions, type DrawShape, type PointTool } from '@/map/editor/draw'
import { EditorContext, type Editor, type FeaturePatch, type NewFeature, type NotifyAction, type SavedFeature } from '@/map/editor/EditorContext'
import { featureHistory, UndoRefused } from '@/map/editor/featureHistory'
import { historyShortcut, isTextTarget, UndoHistory } from '@/map/editor/history'
import { Inspector } from '@/map/editor/Inspector'
import { MapName } from '@/map/editor/MapName'
import { RecenterControl } from '@/map/editor/controls'
import { EditorBar, EditorRail } from '@/map/editor/Rail'
import { StageStepper } from '@/map/editor/StageStepper'
import { installBoundary } from '@/map/layers/boundary'
import { FEATURES_SOURCE, installFeatureLayers } from '@/map/layers/features'
import { HEADER_ACTIONS, OVERLAYS, PANELS } from '@/map/panels'
import { MODAL_PANEL_QUERY } from '@/map/panels/registry'
import { featureName } from '@/map/earthworks/model'
import { plantPeek } from '@/map/plants/peek'
import { isPlant } from '@/map/plants/properties'
import { idsWithin, selectionMove, toggled } from '@/map/selection/move'
import type { EntitlementsData, MapData, MapFeature, MapStage, RegionLayerData } from '@/types'
import { OPEN_EDITOR_PANEL } from '@/components/help/actions'

type Props = {
  map: MapData
  layers: RegionLayerData[]
  features: MapFeature[]
  mapEntitlements: EntitlementsData
  /** The « Offre » panel: for teams and professional accounts only. */
  offerBuilder?: boolean
}

/** The map editor: full-screen map, panel rail, inspector of the selection. */
export default function MapShow(props: Props) {
  const [map, setMap] = useState(props.map)
  return (
    <div className="flex h-dvh flex-col bg-loam-100">
      <Head title={map.name} />
      <Flash />
      <header className="flex h-[52px] shrink-0 items-center gap-3.5 border-b border-loam-900/10 bg-white px-3 md:px-4">
        <Link href="/maps" className="rounded-md p-1.5 text-loam-600 hover:bg-loam-100" aria-label={t('maps.show.back')}>
          <ArrowLeft className="h-[18px] w-[18px]" />
        </Link>
        <div className="flex min-w-0 shrink items-baseline gap-2.5">
          <MapName map={map} setMap={setMap} />
          {map.areaM2 != null && <span className="hidden shrink-0 text-[13px] text-loam-400 sm:inline">{headerArea(map.areaM2)}</span>}
        </div>
        <MapViewMenu mapId={map.id} teamId={map.teamId} offerBuilder={props.offerBuilder} />
        <div className="flex-1" />
        <div id="editor-header-steps" className="hidden shrink-0 md:block" />
        <div className="flex-1" />
        <div id="editor-header-actions" className="flex shrink-0 items-center gap-1 sm:gap-2" />
      </header>
      <div className="flex min-h-0 flex-1">
        <div id="editor-rail" className="hidden md:block" />
        <div className="relative min-w-0 flex-1">
          <MapView
            className="editor-map absolute inset-0"
            center={map.center ?? map.region.center}
            zoom={map.zoom ?? (map.center ? 17 : map.region.defaultZoom)}
            bbox={map.bbox}
            scalePosition="bottom-right"
          >
            <EditorShell {...props} map={map} setMap={setMap} />
          </MapView>
        </div>
      </div>
    </div>
  )
}

/** The terrain's size in the header: ares, the unit of a garden (hectares beyond). */
function headerArea(m2: number): string {
  if (m2 < 100 || m2 >= 10_000) return formatArea(m2)
  return t('maps.show.area_ares', { count: Math.round(m2 / 100) })
}

function panelFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  const url = new URL(window.location.href)
  const id = url.searchParams.get('panel')
  if (!id) return null
  url.searchParams.delete('panel')
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  return PANELS.some((p) => p.id === id) ? id : null
}

/** `?feature=12` (a plant from the catalogue's map) selects that element on arrival. */
function featureFromUrl(features: MapFeature[]): MapFeature | null {
  if (typeof window === 'undefined') return null
  const url = new URL(window.location.href)
  const id = Number(url.searchParams.get('feature'))
  if (!url.searchParams.has('feature')) return null
  url.searchParams.delete('feature')
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  return features.find((f) => f.properties.id === id) ?? null
}

function EditorShell({ map, setMap, layers, features: initial, mapEntitlements, offerBuilder = false }: Props & { setMap: (m: MapData) => void }) {
  const instance = useMapInstance() as MapLibreMap
  const [features, setFeatures] = useState<MapFeature[]>(initial)
  const [arrival] = useState(() => featureFromUrl(initial))
  const [selectedId, setSelectedId] = useState<number | null>(arrival?.properties.id ?? null)
  const [selection, setSelection] = useState<number[]>([])
  const [multiSelect, setMultiSelect] = useState(false)
  // `?panel=palette` opens a panel on arrival (links from the « Tâches » view).
  const [activePanel, setActivePanel] = useState<string | null>(() => panelFromUrl() ?? (map.boundary ? null : 'terrain'))
  // A guide's « Ouvrir le panneau… » button asks for a panel (components/help/actions).
  useEffect(() => {
    const onOpen = (event: Event) => {
      const panel = (event as CustomEvent<{ panel: string }>).detail?.panel
      if (panel) setActivePanel(panel)
    }
    window.addEventListener(OPEN_EDITOR_PANEL, onOpen)
    return () => window.removeEventListener(OPEN_EDITOR_PANEL, onOpen)
  }, [])
  const [pickedStage, setPickedStage] = useState<MapStage | null>(null)
  const focusStage = pickedStage ?? map.stage
  const [drawingShape, setDrawingShape] = useState<DrawShape | 'edit' | null>(null)
  const drawing = drawingShape != null
  const drawEndedAt = useRef(0)
  const [toast, setToast] = useState<{ message: string; tone: 'info' | 'error'; action?: NotifyAction } | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const drawer = useRef<Drawer | null>(null)
  const canEdit = (map.role === 'owner' || map.role === 'editor') && !map.readOnlyByPlan

  useEffect(() => {
    drawer.current = new Drawer(instance)
    return () => drawer.current?.destroy()
  }, [instance])

  useEffect(() => installBoundary(instance, map.boundary), [instance, map.boundary])

  // A step declared on the map takes the focus back.
  useEffect(() => setPickedStage(null), [map.stage])

  // "Recentrer sur la parcelle", under the zoom (above the "locate me" button).
  const bbox = map.bbox
  useEffect(() => {
    if (!bbox) return
    const control = new RecenterControl(t('editor.controls.recenter'), () => {
      instance.fitBounds(bbox as [number, number, number, number], { padding: 60, maxZoom: 19, duration: 600 })
    })
    instance.addControl(control, 'top-right')
    const element = instance.getContainer().querySelector('.editor-recenter')
    const locate = element?.parentElement?.querySelector('.maplibregl-ctrl-geolocate')?.closest('.maplibregl-ctrl')
    if (element && locate) element.parentElement?.insertBefore(element, locate)
    return () => void instance.removeControl(control)
  }, [instance, bbox])

  // The attribution folds to a « Sources de la carte » button (CSS shows data-label).
  useEffect(() => {
    const fold = () => {
      const attribution = instance.getContainer().querySelector('.maplibregl-ctrl-attrib')
      attribution?.querySelector('.maplibregl-ctrl-attrib-button')?.setAttribute('data-label', t('editor.controls.sources'))
      if (attribution?.classList.contains('maplibregl-compact')) attribution.classList.remove('maplibregl-compact-show')
    }
    fold()
    instance.once('idle', fold)
    return () => void instance.off('idle', fold)
  }, [instance])
  useEffect(() => installFeatureLayers(instance, { type: 'FeatureCollection', features }), [instance, features])

  // Frame the element opened from a link (after the map's own framing).
  useEffect(() => {
    if (!arrival) return
    const [minX, minY, maxX, maxY] = turfBbox(arrival)
    instance.fitBounds([[minX, minY], [maxX, maxY]], { padding: 120, maxZoom: 19, duration: 0 })
  }, [instance, arrival])

  // Selection highlight (one element, or several picked together) and click-to-select.
  useEffect(() => {
    const ids = selection.length ? selection : selectedId != null ? [selectedId] : []
    ids.forEach((id) => instance.setFeatureState({ source: FEATURES_SOURCE, id }, { selected: true }))
    return () => {
      if (!instance.getSource(FEATURES_SOURCE)) return
      ids.forEach((id) => instance.setFeatureState({ source: FEATURES_SOURCE, id }, { selected: false }))
    }
  }, [instance, selectedId, selection])

  // One listener for the whole map: the most precise element under the
  // cursor wins (a plant over the zone it sits in), see `featurePick`.
  const featuresRef = useRef(features)
  featuresRef.current = features
  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId
  const multiSelectRef = useRef(multiSelect)
  multiSelectRef.current = multiSelect
  useEffect(() => {
    const areaOf = (id: number) => {
      const feature = featuresRef.current.find((f) => f.properties.id === id)
      return feature ? area(feature) : Infinity
    }
    // The click that ends a drawing (double-click) must not select what lies under it.
    const busy = () => drawer.current?.active || selectionMove.active || performance.now() - drawEndedAt.current < 400
    // Shift+click (or a tap while « Sélectionner plusieurs » is on) adds the
    // element to the selection, or takes it out, to move them together.
    const toggleAt = (point: { x: number; y: number }) => {
      const id = featureAt(instance, point, areaOf)
      if (id == null) return
      plantPeek.close()
      const already = selectedIdRef.current
      setSelection((current) => toggled(current, id, already))
      setSelectedId(null)
    }
    const onClick = (e: MapMouseEvent) => {
      if (busy()) return
      if (canEdit && (e.originalEvent.shiftKey || multiSelectRef.current)) return toggleAt(e.point)
      const id = featureAt(instance, e.point, areaOf)
      if (id == null) return plantPeek.close()
      setSelection([])
      setMultiSelect(false)
      // A plant opens its card first; the card opens the inspector. An AI
      // draft goes straight to the inspector, where it is reviewed.
      const feature = featuresRef.current.find((f) => f.properties.id === id)
      if (feature && isPlant(feature) && feature.properties.status !== 'draft') {
        setSelectedId(null)
        plantPeek.open(id)
        return
      }
      plantPeek.close()
      setSelectedId(id)
    }
    // MapLibre's box zoom swallows a Shift+click: it comes back as a box cancelled on the spot.
    const onBoxCancel = (e: { originalEvent?: Event }) => {
      const original = e.originalEvent
      if (!canEdit || !(original instanceof MouseEvent) || busy()) return
      const rect = instance.getCanvas().getBoundingClientRect()
      toggleAt({ x: original.clientX - rect.left, y: original.clientY - rect.top })
    }
    // Shift+drag selects every element drawn entirely inside the box.
    if (canEdit) {
      boxSelect.handler = (from, to) => {
        if (busy()) return
        const corners = [[from.x, from.y], [to.x, from.y], [to.x, to.y], [from.x, to.y], [from.x, from.y]]
          .map(([x, y]) => instance.unproject([x, y]).toArray())
        const box = polygon([corners])
        const ids = idsWithin(featuresRef.current, hitsIn(instance, from, to), box)
        if (!ids.length) return
        plantPeek.close()
        const already = selectedIdRef.current
        setSelection((current) => [...new Set([...(current.length || already == null ? current : [already]), ...ids])])
        setSelectedId(null)
      }
    }
    // Like mouseenter/mouseleave: the cursor only changes when it crosses an
    // element's edge, so other tools' cursors (crosshair) are left alone.
    let over = false
    const onMove = (e: MapMouseEvent) => {
      const now = hitsAt(instance, e.point).some((hit) => hit.id != null)
      if (now === over) return
      over = now
      instance.getCanvas().style.cursor = now ? 'pointer' : ''
    }
    instance.on('click', onClick)
    instance.on('boxzoomcancel', onBoxCancel)
    instance.on('mousemove', onMove)
    return () => {
      instance.off('click', onClick)
      instance.off('boxzoomcancel', onBoxCancel)
      instance.off('mousemove', onMove)
      boxSelect.handler = null
    }
  }, [instance, canEdit])

  const notify = useCallback((message: string, tone: 'info' | 'error' = 'info', action?: NotifyAction) => {
    setToast({ message, tone, action })
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), action ? 7000 : 4000)
  }, [])

  const upsertFeatures = useCallback((incoming: MapFeature[]) => {
    setFeatures((current) => {
      const byId = new Map(current.map((f) => [f.properties.id, f]))
      incoming.forEach((f) => byId.set(f.properties.id, f))
      return [...byId.values()]
    })
  }, [])
  const removeFeatures = useCallback((ids: number[]) => {
    setFeatures((current) => current.filter((f) => !ids.includes(f.properties.id)))
    setSelectedId((id) => (id != null && ids.includes(id) ? null : id))
    setSelection((current) => (current.some((id) => ids.includes(id)) ? current.filter((id) => !ids.includes(id)) : current))
  }, [])

  // « Annuler » / « Rétablir » (⌘Z, ⌘⇧Z): one history per open map.
  const [history] = useState(() => new UndoHistory())
  const tracked = useMemo(() => featureHistory({
    base: `/maps/${map.id}/features`,
    history,
    current: (id) => featuresRef.current.find((f) => f.properties.id === id),
    upsert: upsertFeatures,
    remove: removeFeatures,
  }), [map.id, history, upsertFeatures, removeFeatures])
  const step = useCallback(async (direction: 'undo' | 'redo') => {
    if (history.running) return
    if (!(direction === 'undo' ? history.canUndo : history.canRedo)) return notify(t(`undo.nothing_to_${direction}`))
    try {
      const entry = await history[direction]()
      if (entry) notify(t(direction === 'undo' ? 'undo.undone' : 'undo.redone', { label: entry.label }))
    } catch (error) {
      notify(error instanceof UndoRefused ? error.message : t('undo.failed', { message: (error as Error).message }), 'error')
    }
  }, [history, notify])

  // While a shape is drawn or edited, the steps are its points and drags.
  const shapeStep = useCallback((direction: 'undo' | 'redo') => {
    const shape = drawer.current
    if (shape && !(direction === 'undo' ? shape.undo() : shape.redo())) notify(t(`undo.shape_nothing_to_${direction}`))
  }, [notify])

  useEffect(() => {
    if (!canEdit) return
    const onKey = (event: KeyboardEvent) => {
      const direction = historyShortcut(event)
      if (!direction || event.defaultPrevented || isTextTarget(event.target)) return
      // A dialog over the map (photo viewer, settings…) keeps the keys.
      if (document.querySelector('[aria-modal="true"]')) return
      event.preventDefault()
      if (drawer.current?.active) return shapeStep(direction)
      void step(direction)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canEdit, step, shapeStep])

  const editor: Editor = useMemo(() => {
    const base = `/maps/${map.id}/features`
    return {
      map, setMap, instance, regionLayers: layers, entitlements: mapEntitlements, canEdit,
      isOwner: map.role === 'owner',
      features, selectedId,
      selected: features.find((f) => f.properties.id === selectedId) ?? null,
      select(id: number | null) {
        setSelectedId(id)
        if (id == null) return
        setSelection([])
        setMultiSelect(false)
      },
      selection,
      setSelection,
      multiSelect,
      setMultiSelect,
      async createFeature(input: NewFeature) {
        const feature = await api<MapFeature>(base, { method: 'POST', body: { feature: input } })
        upsertFeatures([feature])
        tracked.create(feature)
        return feature
      },
      async updateFeature(id: number, patch: FeaturePatch) {
        const current = features.find((f) => f.properties.id === id)
        const feature = await api<SavedFeature>(`${base}/${id}`, {
          method: 'PATCH',
          body: { feature: { ...patch, lock_version: current?.properties.lockVersion } },
        })
        const { swapped, ...saved } = feature
        upsertFeatures(swapped ? [saved, swapped] : [saved])
        if (current) tracked.update(current, patch, saved)
        return feature
      },
      async deleteFeature(id: number) {
        const current = features.find((f) => f.properties.id === id)
        await api(`${base}/${id}`, { method: 'DELETE' })
        removeFeatures([id])
        if (!current) return
        tracked.remove(current)
        // No keyboard on a phone: the toast offers the undo too.
        notify(t('undo.deleted', { name: featureName(current) }), 'info', { label: t('undo.action'), run: () => void step('undo') })
      },
      recordDraftReview: tracked.reviewed,
      recordRemoval: tracked.remove,
      undoGroup: (label, run) => history.group(label, run),
      upsertFeatures,
      removeFeatures,
      async reloadFeatures() {
        const data = await api<{ features: MapFeature[] }>(base)
        setFeatures(data.features)
      },
      async draw(shape: DrawShape, options?: DrawOptions) {
        setDrawingShape(shape)
        try {
          return (await drawer.current?.draw(shape, options)) ?? null
        } finally {
          drawEndedAt.current = performance.now()
          setDrawingShape(null)
        }
      },
      async editGeometry(geometry: Geometry, options?: DrawOptions) {
        setDrawingShape('edit')
        try {
          return (await drawer.current?.edit(geometry, options)) ?? null
        } finally {
          drawEndedAt.current = performance.now()
          setDrawingShape(null)
        }
      },
      setPointTool: (tool: PointTool) => drawer.current?.setPointTool(tool),
      finishDraw: () => drawer.current?.commit(),
      undoDrawStep: () => shapeStep('undo'),
      cancelDraw: () => drawer.current?.cancel(),
      drawing,
      drawingShape,
      activePanel,
      openPanel: setActivePanel,
      focusStage,
      focusStep: setPickedStage,
      notify,
    }
  }, [map, setMap, instance, layers, mapEntitlements, canEdit, features, selectedId, selection, multiSelect, drawing, drawingShape, activePanel, focusStage, notify, upsertFeatures, removeFeatures, tracked, history, step, shapeStep])

  const visiblePanels = PANELS.filter((p) => !p.requires || (p.requires === 'editor' ? canEdit : p.requires === 'offers' ? canEdit && offerBuilder : map.role === 'owner'))
  const panel = visiblePanels.find((p) => p.id === activePanel)
  const wideScreen = useMediaQuery(MODAL_PANEL_QUERY)
  const wideRail = useMediaQuery('(min-width: 768px)')

  return (
    <EditorContext.Provider value={editor}>
      {/* The rail beside the map from md up; a bar along the bottom on a phone. */}
      {wideRail ? <RailPortal panels={visiblePanels} /> : <EditorBar panels={visiblePanels} />}
      {panel && panel.modal && wideScreen ? (
        <Dialog open size="wide" title={t(panel.label)} onClose={() => setActivePanel(null)}>
          <div data-editor-panel={panel.id}><panel.component /></div>
        </Dialog>
      ) : panel && (
        <section data-editor-panel={panel.id} className="absolute inset-x-2 bottom-14 z-10 max-h-[55%] overflow-y-auto rounded-xl bg-white p-4 shadow-xl ring-1 ring-loam-200 md:inset-x-auto md:bottom-auto md:left-2 md:top-2 md:max-h-[calc(100%-1rem)] md:w-80">
          <h2 className="mb-3 text-base">{t(panel.label)}</h2>
          <panel.component />
        </section>
      )}
      {editor.selected && <Inspector feature={editor.selected} />}
      {[...OVERLAYS].sort((a, b) => (a.order ?? 50) - (b.order ?? 50)).map((o) => <o.component key={o.id} />)}
      <HeaderActions />
      <HeaderSteps />
      {/* On the body and above every overlay: a message sent from the photo viewer (z-[60]) or one of its dialogs must show over it. */}
      {toast && createPortal(
        <div role="status" className={'fixed bottom-16 left-1/2 z-[90] flex items-center gap-3 md:bottom-10 -translate-x-1/2 rounded-lg px-4 py-2 text-sm text-white shadow-lg ' + (toast.tone === 'error' ? 'bg-clay-500' : 'bg-loam-900')}>
          <span>{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              className="shrink-0 rounded-full px-3 py-1 font-medium text-white ring-1 ring-white/40 hover:bg-white/10"
              onClick={() => {
                const action = toast.action
                setToast(null)
                action?.run()
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>,
        document.body,
      )}
    </EditorContext.Provider>
  )
}

function HeaderActions() {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  useEffect(() => setTarget(document.getElementById('editor-header-actions')), [])
  if (!target || HEADER_ACTIONS.length === 0) return null
  return createPortal(
    <>{[...HEADER_ACTIONS].sort((a, b) => (a.order ?? 50) - (b.order ?? 50)).map((a) => <a.component key={a.id} />)}</>,
    target,
  )
}

function HeaderSteps() {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  useEffect(() => setTarget(document.getElementById('editor-header-steps')), [])
  return target ? createPortal(<StageStepper />, target) : null
}

function RailPortal({ panels }: { panels: Parameters<typeof EditorRail>[0]['panels'] }) {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  useEffect(() => setTarget(document.getElementById('editor-rail')), [])
  return target ? createPortal(<EditorRail panels={panels} />, target) : null
}
