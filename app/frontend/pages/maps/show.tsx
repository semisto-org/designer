import { Head, Link } from '@inertiajs/react'
import type { Geometry } from 'geojson'
import { ArrowLeft } from 'lucide-react'
import type { MapGeoJSONFeature, Map as MapLibreMap } from 'maplibre-gl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Flash } from '@/components/ui/Flash'
import { api } from '@/lib/api'
import { formatArea, t } from '@/lib/i18n'
import { MapView } from '@/map/MapView'
import { useMapInstance } from '@/map/MapContext'
import { Drawer, type DrawOptions, type DrawShape } from '@/map/editor/draw'
import { EditorContext, type Editor, type FeaturePatch, type NewFeature } from '@/map/editor/EditorContext'
import { Inspector } from '@/map/editor/Inspector'
import { installBoundary } from '@/map/layers/boundary'
import { FEATURES_SOURCE, installFeatureLayers } from '@/map/layers/features'
import { HEADER_ACTIONS, OVERLAYS, PANELS } from '@/map/panels'
import type { PanelGroup } from '@/map/panels/registry'
import type { EntitlementsData, MapData, MapFeature, RegionLayerData } from '@/types'

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
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-loam-200 bg-white px-3">
        <Link href="/maps" className="rounded-md p-1.5 text-loam-500 hover:bg-loam-100" aria-label={t('maps.show.back')}>
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="truncate text-base">{map.name}</h1>
        <span className="hidden text-sm text-loam-400 sm:inline">{formatArea(map.areaM2)}</span>
        <span className="ml-auto hidden rounded-full bg-loam-100 px-2 py-0.5 text-xs text-loam-600 sm:inline">{t(`maps.roles.${map.role}`)}</span>
        <div id="editor-header-actions" className="ml-auto flex shrink-0 items-center gap-1 sm:ml-0 sm:gap-2" />
      </header>
      <div className="relative min-h-0 flex-1">
        <MapView
          className="editor-map absolute inset-0"
          center={map.center ?? map.region.center}
          zoom={map.zoom ?? (map.center ? 17 : map.region.defaultZoom)}
          bbox={map.bbox}
        >
          <EditorShell {...props} map={map} setMap={setMap} />
        </MapView>
      </div>
    </div>
  )
}

const GROUPS: PanelGroup[] = ['map', 'understand', 'design', 'share']

function EditorShell({ map, setMap, layers, features: initial, mapEntitlements }: Props & { setMap: (m: MapData) => void }) {
  const instance = useMapInstance() as MapLibreMap
  const [features, setFeatures] = useState<MapFeature[]>(initial)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [activePanel, setActivePanel] = useState<string | null>(map.boundary ? null : 'terrain')
  const [drawing, setDrawing] = useState(false)
  const drawEndedAt = useRef(0)
  const [toast, setToast] = useState<{ message: string; tone: 'info' | 'error' } | null>(null)
  const drawer = useRef<Drawer | null>(null)
  const canEdit = (map.role === 'owner' || map.role === 'editor') && !map.readOnlyByPlan

  useEffect(() => {
    drawer.current = new Drawer(instance)
    return () => drawer.current?.destroy()
  }, [instance])

  useEffect(() => installBoundary(instance, map.boundary), [instance, map.boundary])
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
        setDrawing(true)
        try {
          return (await drawer.current?.draw(shape, options)) ?? null
        } finally {
          drawEndedAt.current = performance.now()
          setDrawing(false)
        }
      },
      async editGeometry(geometry: Geometry, options?: DrawOptions) {
        setDrawing(true)
        try {
          return (await drawer.current?.edit(geometry, options)) ?? null
        } finally {
          drawEndedAt.current = performance.now()
          setDrawing(false)
        }
      },
      finishDraw: () => drawer.current?.commit(),
      cancelDraw: () => drawer.current?.cancel(),
      drawing,
      activePanel,
      openPanel: setActivePanel,
      notify,
    }
  }, [map, setMap, instance, layers, mapEntitlements, canEdit, features, selectedId, drawing, activePanel, notify, upsertFeatures, removeFeatures])

  // Keep the open panel's button in view in the scrolling bar on a phone.
  const nav = useRef<HTMLElement>(null)
  useEffect(() => {
    nav.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activePanel])

  const visiblePanels = PANELS.filter((p) => !p.requires || (p.requires === 'editor' ? canEdit : map.role === 'owner'))
  const panel = visiblePanels.find((p) => p.id === activePanel)

  return (
    <EditorContext.Provider value={editor}>
      {/* Panel rail: a scrolling bar along the bottom on phones, a column on the left from md up. */}
      <nav
        ref={nav}
        className="absolute inset-x-2 bottom-2 z-20 flex gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-lg ring-1 ring-loam-200 md:inset-x-auto md:bottom-auto md:left-2 md:top-2 md:max-h-[calc(100%-1rem)] md:flex-col md:overflow-y-auto md:overflow-x-visible"
        aria-label={t('editor.panels_nav')}
      >
        {GROUPS.map((group, gi) => {
          const items = visiblePanels.filter((p) => p.group === group).sort((a, b) => (a.order ?? 50) - (b.order ?? 50))
          if (items.length === 0) return null
          return (
            <div key={group} className={'flex shrink-0 md:flex-col ' + (gi > 0 ? 'border-l border-loam-100 pl-1 md:border-l-0 md:border-t md:pl-0 md:pt-1' : '')}>
              {items.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  title={t(p.label)}
                  aria-label={t(p.label)}
                  aria-pressed={activePanel === p.id}
                  onClick={() => setActivePanel(activePanel === p.id ? null : p.id)}
                  className={
                    'grid h-9 w-9 shrink-0 place-items-center rounded-lg ' +
                    (activePanel === p.id ? 'bg-prune-600 text-white' : 'text-loam-600 hover:bg-loam-100')
                  }
                >
                  <p.icon className="h-[18px] w-[18px]" />
                </button>
              ))}
            </div>
          )
        })}
      </nav>
      {panel && (
        <section className="absolute inset-x-2 bottom-14 z-10 max-h-[55%] overflow-y-auto rounded-xl bg-white p-4 shadow-xl ring-1 ring-loam-200 md:inset-x-auto md:bottom-auto md:left-14 md:top-2 md:max-h-[calc(100%-1rem)] md:w-80">
          <h2 className="mb-3 text-base">{t(panel.label)}</h2>
          <panel.component />
        </section>
      )}
      {editor.selected && <Inspector feature={editor.selected} />}
      {[...OVERLAYS].sort((a, b) => (a.order ?? 50) - (b.order ?? 50)).map((o) => <o.component key={o.id} />)}
      <HeaderActions />
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
