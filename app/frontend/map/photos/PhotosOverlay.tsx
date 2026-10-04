import type { MapGeoJSONFeature, MapMouseEvent } from 'maplibre-gl'
import * as maplibregl from 'maplibre-gl'
import { X } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { photoLabel, photoUrl } from '@/map/photos/format'
import {
  highlightPhoto, installPhotoLayers, PHOTO_CLUSTER_LAYER, PHOTO_POINT_LAYER, photosToGeoJSON, PHOTOS_SOURCE,
  removePhotoLayers, setPhotoLayersVisible,
} from '@/map/photos/layers'
import { PhotoCompare } from '@/map/photos/PhotoCompare'
import { PhotoLightbox } from '@/map/photos/PhotoLightbox'
import { getPhotosState, photoActions, usePhotos } from '@/map/photos/store'
import type { MapPhotoData } from '@/types/soil_photos'

/**
 * Always mounted in the editor: loads the photos, draws their markers on the
 * map (camera icons that cluster, a wedge for the viewing direction), opens
 * the lightbox on click, places a photo on a click of the map, and hosts the
 * lightbox and the before/after dialogs so every part of the editor can open
 * them.
 */
export default function PhotosOverlay() {
  const editor = useEditor()
  const map = editor.instance
  const state = usePhotos()
  const { photos, placingId, showOnMap, openId } = state

  useEffect(() => { photoActions.load(editor.map.id) }, [editor.map.id])

  const data = useMemo(() => photosToGeoJSON(photos), [photos])

  // Markers. Installed after the editor's own layers so they sit on top.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      installPhotoLayers(map, data)
      setPhotoLayersVisible(map, showOnMap)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [map, data, showOnMap])
  useEffect(() => () => removePhotoLayers(map), [map])
  useEffect(() => { highlightPhoto(map, openId) }, [map, openId, data])

  // Click a marker: open the photo; click a cluster: zoom into it. Hover: a small preview.
  useEffect(() => {
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 18, className: 'photo-preview', maxWidth: '200px' })
    const onPointClick = (event: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
      if (editor.drawing || getPhotosState().placingId != null) return
      const id = event.features?.[0]?.properties?.id
      if (id != null) photoActions.open(Number(id))
    }
    const onClusterClick = async (event: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
      const feature = event.features?.[0]
      const source = map.getSource(PHOTOS_SOURCE) as maplibregl.GeoJSONSource | undefined
      if (!feature || !source) return
      const zoom = await source.getClusterExpansionZoom(Number(feature.properties?.cluster_id))
      map.easeTo({ center: (feature.geometry as GeoJSON.Point).coordinates as [number, number], zoom: zoom + 0.5 })
    }
    const onEnter = (event: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
      map.getCanvas().style.cursor = 'pointer'
      const id = Number(event.features?.[0]?.properties?.id)
      const photo = getPhoto(id)
      if (!photo) return
      const box = document.createElement('div')
      const img = document.createElement('img')
      img.src = photoUrl(editor.map.id, photo.id, 'thumb')
      img.alt = ''
      img.style.cssText = 'display:block;width:180px;max-height:140px;object-fit:cover;border-radius:6px'
      const label = document.createElement('p')
      label.textContent = photoLabel(photo)
      label.style.cssText = 'margin:4px 0 0;font-size:12px;color:#332d25'
      box.append(img, label)
      popup.setLngLat((event.features?.[0].geometry as GeoJSON.Point).coordinates as [number, number]).setDOMContent(box).addTo(map)
    }
    const onLeave = () => { map.getCanvas().style.cursor = ''; popup.remove() }
    const pointer = () => { map.getCanvas().style.cursor = 'pointer' }
    const reset = () => { map.getCanvas().style.cursor = '' }
    map.on('click', PHOTO_POINT_LAYER, onPointClick)
    map.on('click', PHOTO_CLUSTER_LAYER, onClusterClick)
    map.on('mouseenter', PHOTO_POINT_LAYER, onEnter)
    map.on('mouseleave', PHOTO_POINT_LAYER, onLeave)
    map.on('mouseenter', PHOTO_CLUSTER_LAYER, pointer)
    map.on('mouseleave', PHOTO_CLUSTER_LAYER, reset)
    return () => {
      map.off('click', PHOTO_POINT_LAYER, onPointClick)
      map.off('click', PHOTO_CLUSTER_LAYER, onClusterClick)
      map.off('mouseenter', PHOTO_POINT_LAYER, onEnter)
      map.off('mouseleave', PHOTO_POINT_LAYER, onLeave)
      map.off('mouseenter', PHOTO_CLUSTER_LAYER, pointer)
      map.off('mouseleave', PHOTO_CLUSTER_LAYER, reset)
      popup.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, editor.map.id, editor.drawing])

  // Placing a photo: the next click on the map is its position. (A deliberate
  // gesture: it also works over a drawn feature, unlike passive map clicks.)
  useEffect(() => {
    if (placingId == null) return
    const canvas = map.getCanvas()
    canvas.style.cursor = 'crosshair'
    const onClick = async (event: MapMouseEvent) => {
      if (editor.drawing) return
      try {
        const saved = await api<MapPhotoData>(`/maps/${editor.map.id}/photos/${placingId}`, {
          method: 'PATCH',
          body: { photo: { lng: event.lngLat.lng, lat: event.lngLat.lat, location_source: 'map' } },
        })
        photoActions.upsert(saved)
        photoActions.cancelPlacing()
        editor.notify(t('soil_photos.placing.done'))
      } catch (error) {
        editor.notify((error as Error).message, 'error')
      }
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && photoActions.cancelPlacing()
    map.on('click', onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      canvas.style.cursor = ''
      map.off('click', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [map, placingId, editor])

  // On a phone the panel is a sheet over half the map: fold it away while placing, bring it back after.
  const foldedPanel = useRef(false)
  useEffect(() => {
    const phone = window.matchMedia('(max-width: 767px)').matches
    if (placingId != null && phone && editor.activePanel === 'photos') {
      foldedPanel.current = true
      editor.openPanel(null)
    } else if (placingId == null && foldedPanel.current) {
      foldedPanel.current = false
      editor.openPanel('photos')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placingId])

  const placing = photos.find((p) => p.id === placingId)
  return (
    <>
      {placing && (
        <div role="status" className="absolute inset-x-14 top-3 z-30 mx-auto flex w-fit flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-xl bg-prune-700 px-4 py-2 text-center text-sm text-white shadow-lg md:max-w-md">
          <span>{t('soil_photos.placing.banner', { name: photoLabel(placing) })}</span>
          <button type="button" onClick={() => photoActions.cancelPlacing()} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-white/15 px-2 py-1 text-xs hover:bg-white/25">
            <X className="h-3.5 w-3.5" />
            {t('common.cancel')}
          </button>
        </div>
      )}
      <PhotoLightbox />
      <PhotoCompare />
    </>
  )
}

function getPhoto(id: number): MapPhotoData | undefined {
  return getPhotosState().photos.find((p) => p.id === id)
}
