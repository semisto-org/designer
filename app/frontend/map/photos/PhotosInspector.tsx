import type { Geometry } from 'geojson'
import { ImagePlus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { photoLabel } from '@/map/photos/format'
import { PhotoThumb } from '@/map/photos/PhotoThumb'
import { photoAccept, photoActions, usePhotos } from '@/map/photos/store'
import { uploadActions } from '@/map/photos/upload'
import type { MapFeature } from '@/types'
import type { MapPhotoData } from '@/types/soil_photos'

const NEARBY_METERS = 15
const MAX_SHOWN = 8

/** A point on (or in the middle of) a geometry, to place a photo added from its inspector. */
function anchor(geometry: Geometry): { lng: number; lat: number } | null {
  const mean = (coords: number[][]) => ({
    lng: coords.reduce((sum, c) => sum + c[0], 0) / coords.length,
    lat: coords.reduce((sum, c) => sum + c[1], 0) / coords.length,
  })
  switch (geometry.type) {
    case 'Point': return { lng: geometry.coordinates[0], lat: geometry.coordinates[1] }
    case 'LineString': return mean(geometry.coordinates)
    case 'Polygon': return mean(geometry.coordinates[0].slice(0, -1))
    case 'MultiPolygon': return mean(geometry.coordinates[0][0].slice(0, -1))
    default: return null
  }
}

/** Inspector section « Photos »: photos linked to the selected feature or taken within 15 m of it. */
export default function PhotosInspector({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const { version, mapId, limits } = usePhotos()
  const [photos, setPhotos] = useState<MapPhotoData[] | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const featureId = feature.properties.id

  useEffect(() => {
    let cancelled = false
    api<{ photos: MapPhotoData[] }>(`/maps/${editor.map.id}/photos?feature_id=${featureId}`)
      .then((data) => !cancelled && setPhotos(data.photos))
      .catch(() => !cancelled && setPhotos([]))
    return () => { cancelled = true }
  }, [editor.map.id, featureId, version, mapId])

  function add(files: FileList | null) {
    const list = Array.from(files ?? [])
    if (list.length === 0) return
    uploadActions.add(editor.map.id, list, { featureId, fallbackPosition: anchor(feature.geometry) })
    editor.openPanel('photos')
  }

  if (photos === null) return null
  if (photos.length === 0 && !editor.canEdit) return null

  return (
    <section className="space-y-2 border-t border-loam-100 pt-3" aria-label={t('soil_photos.inspector.title')}>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-loam-500">
          {t('soil_photos.inspector.title')}{photos.length > 0 ? ` · ${photos.length}` : ''}
        </h3>
        {editor.canEdit && (
          <>
            <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-prune-700 hover:bg-prune-50">
              <ImagePlus className="h-3.5 w-3.5" />
              {t('soil_photos.inspector.add')}
            </button>
            <input ref={fileInput} type="file" multiple accept={photoAccept(limits.contentTypes)} className="sr-only" aria-label={t('soil_photos.inspector.add')}
              onChange={(e) => { add(e.target.files); e.target.value = '' }} />
          </>
        )}
      </div>
      {photos.length === 0 ? (
        <p className="text-xs text-loam-500">{t('soil_photos.inspector.empty', { meters: NEARBY_METERS })}</p>
      ) : (
        <ul className="grid grid-cols-4 gap-1.5">
          {photos.slice(0, MAX_SHOWN).map((photo) => (
            <li key={photo.id}>
              <button type="button" onClick={() => photoActions.open(photo.id)} className="block w-full text-left" title={photoLabel(photo)}>
                <span className="block aspect-square overflow-hidden rounded-md bg-loam-100"><PhotoThumb mapId={editor.map.id} photo={photo} /></span>
                <span className="mt-0.5 block truncate text-[11px] text-loam-500">
                  {photo.featureId === featureId ? t('soil_photos.inspector.linked') : t('soil_photos.inspector.distance', { meters: photo.distanceM ?? 0 })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {photos.length > MAX_SHOWN && <p className="text-xs text-loam-500">{t('soil_photos.inspector.more', { count: photos.length - MAX_SHOWN })}</p>}
    </section>
  )
}
