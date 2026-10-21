import { Link, router } from '@inertiajs/react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { Map as MapIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from '@/components/ui/toast'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { EditorContext, type Editor, type FeaturePatch, type NewFeature, type SavedFeature } from '@/map/editor/EditorContext'
import { Inspector } from '@/map/editor/Inspector'
import { featureName } from '@/map/earthworks/model'
import { installBoundary } from '@/map/layers/boundary'
import { installFeatureLayers } from '@/map/layers/features'
import { useMapInstance } from '@/map/MapContext'
import { MapView } from '@/map/MapView'
import { PhotoHostContext, type PhotoHost } from '@/map/photos/host'
import { PhotoLightbox } from '@/map/photos/PhotoLightbox'
import { photoActions } from '@/map/photos/store'
import { installPlantFocus } from '@/palette/plantFocus'
import type { EntitlementsData, MapData, MapFeature } from '@/types'

type Props = {
  map: MapData
  entitlements: EntitlementsData
  canEdit: boolean
  featureId: number
  onClose: () => void
  /** The plant changed or left the map: the palette reloads its tables. */
  onChanged: () => void
}

/**
 * The editor's own sheet of a plant (Inspector and its sections), opened
 * from its name in « Plant par plant »: what the person sees on the map,
 * without leaving the table. The sections go through the same Editor
 * actions as on the map; what needs the map itself (drawing, multiple
 * selection) is left to it, one click away. A small map shows where the
 * plant stands on the land.
 */
export function PlantFeatureSheet({ map, entitlements, canEdit, featureId, onClose, onChanged }: Props) {
  const [features, setFeatures] = useState<MapFeature[] | null>(null)
  const [failed, setFailed] = useState(false)
  const featuresRef = useRef<MapFeature[]>([])
  featuresRef.current = features ?? []
  const changed = useRef(onChanged)
  changed.current = onChanged
  const close = useRef(onClose)
  close.current = onClose
  const base = `/maps/${map.id}/features`

  useEffect(() => {
    let live = true
    api<{ features: MapFeature[] }>(base)
      .then((data) => { if (live) setFeatures(data.features) })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [base])

  // The photos store feeds the plant's gallery and its lightbox.
  useEffect(() => { void photoActions.load(map.id) }, [map.id])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // A photo opened over the sheet closes first.
      if (event.key === 'Escape' && document.querySelectorAll('[aria-modal="true"]').length < 2) close.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const feature = features?.find((f) => f.properties.id === featureId) ?? null

  const editor: Editor = useMemo(() => {
    const upsert = (incoming: MapFeature[]) => setFeatures((current) => {
      const byId = new Map((current ?? []).map((f) => [f.properties.id, f]))
      incoming.forEach((f) => byId.set(f.properties.id, f))
      return [...byId.values()]
    })
    const remove = (ids: number[]) => setFeatures((current) => (current ?? []).filter((f) => !ids.includes(f.properties.id)))
    const notify = (message: string, tone: 'info' | 'error' = 'info') => toast(message, { tone })
    const toMap = () => router.visit(`/maps/${map.id}?feature=${featureId}`)
    return {
      map, setMap: () => {},
      // No map instance here: what needs one (« Déplacer ») checks and stays out.
      instance: null as unknown as MapLibreMap,
      regionLayers: [], entitlements, canEdit, isOwner: map.role === 'owner',
      features: features ?? [],
      selectedId: featureId,
      selected: feature,
      select: (id) => { if (id == null) close.current() },
      selection: [], setSelection: () => {}, multiSelect: false, setMultiSelect: () => {},
      async createFeature(input: NewFeature) {
        const created = await api<MapFeature>(base, { method: 'POST', body: { feature: input } })
        upsert([created])
        return created
      },
      async updateFeature(id: number, patch: FeaturePatch) {
        const current = featuresRef.current.find((f) => f.properties.id === id)
        const saved = await api<SavedFeature>(`${base}/${id}`, {
          method: 'PATCH', body: { feature: { ...patch, lock_version: current?.properties.lockVersion } },
        })
        const { swapped, ...own } = saved
        upsert(swapped ? [own, swapped] : [own])
        changed.current()
        return saved
      },
      async deleteFeature(id: number) {
        const current = featuresRef.current.find((f) => f.properties.id === id)
        await api(`${base}/${id}`, { method: 'DELETE' })
        remove([id])
        changed.current()
        close.current()
        if (current) {
          toast(t('undo.deleted', { name: featureName(current) }), {
            action: { label: t('undo.action'), run: () => void restore(current) },
          })
        }
      },
      recordDraftReview: () => changed.current(),
      recordRemoval: () => changed.current(),
      undoGroup: (_label, run) => run(),
      undo: () => {},
      upsertFeatures: (incoming) => { upsert(incoming); changed.current() },
      removeFeatures: (ids) => { remove(ids); changed.current() },
      async reloadFeatures() {
        const data = await api<{ features: MapFeature[] }>(base)
        setFeatures(data.features)
      },
      // Drawing happens on the map: the sheet sends the person there.
      async draw() { toMap(); return null },
      async editGeometry() { toMap(); return null },
      setPointTool: () => {}, finishDraw: () => {}, undoDrawStep: () => {}, cancelDraw: () => {},
      drawing: false, drawingShape: null,
      activePanel: null,
      // The upload shows in the gallery once sent; no « Photos » panel here.
      openPanel: () => {},
      focusStage: map.stage, focusStep: () => {},
      notify,
    }

    // « Annuler » after a deletion: the feature comes back from the trash.
    async function restore(removed: MapFeature) {
      try {
        const back = await api<MapFeature>(`${base}/${removed.properties.id}/restore`, { method: 'POST' })
        upsert([back])
        changed.current()
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), { tone: 'error' })
      }
    }
  }, [map, entitlements, canEdit, features, feature, featureId, base])

  const host: PhotoHost = useMemo(() => ({
    mapId: map.id, canEdit,
    notify: (message, tone) => toast(message, { tone }),
    locate: (photo) => router.visit(`/maps/${map.id}?photo=${photo.id}`),
    place: (photo) => router.visit(`/maps/${map.id}?place=${photo.id}`),
  }), [map.id, canEdit])

  const coordinates = feature?.geometry.type === 'Point' ? (feature.geometry.coordinates as [number, number]) : null
  const [lng, lat] = coordinates ?? []
  const point = useMemo<[number, number] | null>(() => (lng != null && lat != null ? [lng, lat] : null), [lng, lat])

  return (
    <div className="fixed inset-0 z-50 flex justify-end print:hidden" role="dialog" aria-modal="true" aria-label={t('plant_palette.plants.sheet_label')}>
      <div aria-hidden className="absolute inset-0 bg-loam-900/25" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        {failed && <p className="m-5 rounded-lg bg-clay-50 p-3 text-sm text-clay-700">{t('plant_palette.sheet.load_error')}</p>}
        {!failed && !features && <p className="m-5 text-sm text-loam-500">{t('plant_palette.sheet.loading')}</p>}
        {features && !feature && <p className="m-5 text-sm text-loam-500">{t('plant_palette.plants.sheet_gone')}</p>}
        {feature && (
          <EditorContext.Provider value={editor}>
            <PhotoHostContext.Provider value={host}>
              <Inspector
                feature={feature}
                frame="page"
                lead={point && <PlantLocation map={map} features={features ?? []} featureId={featureId} point={point} />}
              />
              <PhotoLightbox />
            </PhotoHostContext.Provider>
          </EditorContext.Provider>
        )}
      </div>
    </div>
  )
}

/** Where the plant stands: the land's outline, what is drawn on it, the plant ringed. */
function PlantLocation({ map, features, featureId, point }: { map: MapData; features: MapFeature[]; featureId: number; point: [number, number] }) {
  return (
    <figure className="space-y-1.5">
      <div className="relative h-44 overflow-hidden rounded-xl ring-1 ring-loam-200">
        <MapView className="absolute inset-0" center={point} zoom={18.5} scalePosition="bottom-left" compact>
          <LocationLayers map={map} features={features} point={point} />
        </MapView>
      </div>
      <figcaption className="flex justify-end">
        <Link href={`/maps/${map.id}?feature=${featureId}`} className="inline-flex items-center gap-1 text-sm font-medium text-prune-700 hover:text-prune-900">
          <MapIcon className="h-4 w-4" aria-hidden />
          {t('plant_palette.plants.show_on_map')}
        </Link>
      </figcaption>
    </figure>
  )
}

function LocationLayers({ map, features, point }: { map: MapData; features: MapFeature[]; point: [number, number] }) {
  const instance = useMapInstance()

  useEffect(() => {
    if (!instance) return
    installBoundary(instance, map.boundary)
    installFeatureLayers(instance, { type: 'FeatureCollection', features })
    installPlantFocus(instance, point)
    instance.jumpTo({ center: point })
  }, [instance, map.boundary, features, point])

  return null
}
