import { Head, Link } from '@inertiajs/react'
import type { Geometry } from 'geojson'
import { ArrowLeft } from 'lucide-react'
import type { MapGeoJSONFeature, Map as MapLibreMap } from 'maplibre-gl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Dialog } from '@/components/ui/Dialog'
import { Flash } from '@/components/ui/Flash'
import { api } from '@/lib/api'
import { formatArea, t } from '@/lib/i18n'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { MapView } from '@/map/MapView'
import { useMapInstance } from '@/map/MapContext'
import { Drawer, type DrawOptions, type DrawShape } from '@/map/editor/draw'
import { EditorContext, type Editor, type FeaturePatch, type NewFeature } from '@/map/editor/EditorContext'
import { Inspector } from '@/map/editor/Inspector'
import { RecenterControl } from '@/map/editor/controls'
import { EditorBar, EditorRail } from '@/map/editor/Rail'
import { StageStepper } from '@/map/editor/StageStepper'
import { installBoundary, installBoundaryLabel } from '@/map/layers/boundary'
import { FEATURES_SOURCE, installFeatureLayers } from '@/map/layers/features'
import { HEADER_ACTIONS, OVERLAYS, PANELS } from '@/map/panels'
import { MODAL_PANEL_QUERY } from '@/map/panels/registry'
import type { EntitlementsData, MapData, MapFeature, MapStage, RegionLayerData } from '@/types'

type Props = {
  map: MapData
  layers: RegionLayerData[]
  features: MapFeature[]
  mapEntitlements: EntitlementsData
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
          <h1 className="truncate text-xl leading-none text-loam-900">{map.name}</h1>
          {map.areaM2 != null && <span className="hidden shrink-0 text-[13px] text-loam-400 sm:inline">{headerArea(map.areaM2)}</span>}
        </div>
        <div className="flex-1" />
        <div id="editor-header-steps" className="hidden shrink-0 md:block" />
        <div className="flex-1" />
        {map.role && (
          <span className="hidden shrink-0 rounded-full bg-prune-100 px-2.5 py-1 text-xs text-prune-600 lg:inline">
            {t('maps.show.your_role', { role: t(`maps.roles.${map.role}`).toLocaleLowerCase('fr') })}
          </span>
        )}
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

function EditorShell({ map, setMap, layers, features: initial, mapEntitlements }: Props & { setMap: (m: MapData) => void }) {
  const instance = useMapInstance() as MapLibreMap
  const [features, setFeatures] = useState<MapFeature[]>(initial)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [activePanel, setActivePanel] = useState<string | null>(map.boundary ? null : 'terrain')
  const [pickedStage, setPickedStage] = useState<MapStage | null>(null)
  const focusStage = pickedStage ?? map.stage
  const [drawingShape, setDrawingShape] = useState<DrawShape | 'edit' | null>(null)
  const drawing = drawingShape != null
  const drawEndedAt = useRef(0)
  const [toast, setToast] = useState<{ message: string; tone: 'info' | 'error' } | null>(null)
  const drawer = useRef<Drawer | null>(null)
  const canEdit = (map.role === 'owner' || map.role === 'editor') && !map.readOnlyByPlan

  useEffect(() => {
    drawer.current = new Drawer(instance)
    return () => drawer.current?.destroy()
  }, [instance])

  useEffect(() => installBoundary(instance, map.boundary), [instance, map.boundary])
  const areaLabel = map.areaM2 != null ? headerArea(map.areaM2) : null
  useEffect(() => installBoundaryLabel(instance, map.boundary, map.name, areaLabel), [instance, map.boundary, map.name, areaLabel])

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

  // Selection highlight and click-to-select.
  useEffect(() => {
    if (selectedId == null) return
    instance.setFeatureState({ source: FEATURES_SOURCE, id: selectedId }, { selected: true })
    return () => {
      if (instance.getSource(FEATURES_SOURCE)) instance.setFeatureState({ source: FEATURES_SOURCE, id: selectedId }, { selected: false })
    }
  }, [instance, selectedId])

  useEffect(() => {
    const layerIds = ['features-point', 'features-line', 'features-fill']
    const onClick = (e: { features?: MapGeoJSONFeature[] }) => {
      // The click that ends a drawing (double-click) must not select what lies under it.
      if (drawer.current?.active || performance.now() - drawEndedAt.current < 400) return
      const hit = e.features?.[0]
      if (hit?.id != null) setSelectedId(Number(hit.id))
    }
    layerIds.forEach((id) => instance.on('click', id, onClick))
    const enter = () => { instance.getCanvas().style.cursor = 'pointer' }
    const leave = () => { instance.getCanvas().style.cursor = '' }
    layerIds.forEach((id) => { instance.on('mouseenter', id, enter); instance.on('mouseleave', id, leave) })
    return () => layerIds.forEach((id) => {
      instance.off('click', id, onClick)
      instance.off('mouseenter', id, enter)
      instance.off('mouseleave', id, leave)
    })
  }, [instance])

  const notify = useCallback((message: string, tone: 'info' | 'error' = 'info') => {
    setToast({ message, tone })
    window.setTimeout(() => setToast(null), 4000)
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
  }, [])

  const editor: Editor = useMemo(() => {
    const base = `/maps/${map.id}/features`
    return {
      map, setMap, instance, regionLayers: layers, entitlements: mapEntitlements, canEdit,
      isOwner: map.role === 'owner',
      features, selectedId,
      selected: features.find((f) => f.properties.id === selectedId) ?? null,
      select: setSelectedId,
      async createFeature(input: NewFeature) {
        const feature = await api<MapFeature>(base, { method: 'POST', body: { feature: input } })
        upsertFeatures([feature])
        return feature
      },
      async updateFeature(id: number, patch: FeaturePatch) {
        const current = features.find((f) => f.properties.id === id)
        const feature = await api<MapFeature>(`${base}/${id}`, {
          method: 'PATCH',
          body: { feature: { ...patch, lock_version: current?.properties.lockVersion } },
        })
        upsertFeatures([feature])
        return feature
      },
      async deleteFeature(id: number) {
        await api(`${base}/${id}`, { method: 'DELETE' })
        removeFeatures([id])
      },
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
      finishDraw: () => drawer.current?.commit(),
      cancelDraw: () => drawer.current?.cancel(),
      drawing,
      drawingShape,
      activePanel,
      openPanel: setActivePanel,
      focusStage,
      focusStep: setPickedStage,
      notify,
    }
  }, [map, setMap, instance, layers, mapEntitlements, canEdit, features, selectedId, drawing, drawingShape, activePanel, focusStage, notify, upsertFeatures, removeFeatures])

  const visiblePanels = PANELS.filter((p) => !p.requires || (p.requires === 'editor' ? canEdit : map.role === 'owner'))
  const panel = visiblePanels.find((p) => p.id === activePanel)
  const wideScreen = useMediaQuery(MODAL_PANEL_QUERY)
  const wideRail = useMediaQuery('(min-width: 768px)')

  return (
    <EditorContext.Provider value={editor}>
      {/* The rail beside the map from md up; a bar along the bottom on a phone. */}
      {wideRail ? <RailPortal panels={visiblePanels} /> : <EditorBar panels={visiblePanels} />}
      {panel && panel.modal && wideScreen ? (
        <Dialog open size="wide" title={t(panel.label)} onClose={() => setActivePanel(null)}>
          <panel.component />
        </Dialog>
      ) : panel && (
        <section className="absolute inset-x-2 bottom-14 z-10 max-h-[55%] overflow-y-auto rounded-xl bg-white p-4 shadow-xl ring-1 ring-loam-200 md:inset-x-auto md:bottom-auto md:left-2 md:top-2 md:max-h-[calc(100%-1rem)] md:w-80">
          <h2 className="mb-3 text-base">{t(panel.label)}</h2>
          <panel.component />
        </section>
      )}
      {editor.selected && <Inspector feature={editor.selected} />}
      {[...OVERLAYS].sort((a, b) => (a.order ?? 50) - (b.order ?? 50)).map((o) => <o.component key={o.id} />)}
      <HeaderActions />
      <HeaderSteps />
      {toast && (
        <div className={'absolute bottom-16 left-1/2 z-30 md:bottom-10 -translate-x-1/2 rounded-lg px-4 py-2 text-sm text-white shadow-lg ' + (toast.tone === 'error' ? 'bg-clay-500' : 'bg-loam-900')}>
          {toast.message}
        </div>
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
