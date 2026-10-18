import { ImagePlus, Star } from 'lucide-react'
import { useRef } from 'react'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { useLinkedPhotos } from '@/map/photos/linked'
import { PhotoGallery } from '@/map/photos/PhotoGallery'
import { anchor } from '@/map/photos/PhotosInspector'
import { photoAccept, photoActions, usePhotos } from '@/map/photos/store'
import { uploadActions } from '@/map/photos/upload'
import { numberProperty, ownProperties } from '@/map/plants/properties'
import type { MapFeature } from '@/types'

/**
 * Top of a plant's inspector: the photos linked to it, as a gallery (a click
 * opens the photo). An editor stars one as the cover, shown first here and
 * in the plant's card on the map (`cover_photo_id`).
 */
export default function PlantPhotosSection({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const { limits } = usePhotos()
  const featureId = feature.properties.id
  const coverId = numberProperty(feature, 'cover_photo_id')
  const photos = useLinkedPhotos(editor.map.id, featureId, coverId)
  const fileInput = useRef<HTMLInputElement>(null)

  function add(files: FileList | null) {
    const list = Array.from(files ?? [])
    if (list.length === 0) return
    uploadActions.add(editor.map.id, list, { featureId, fallbackPosition: anchor(feature.geometry) })
    editor.openPanel('photos')
  }

  async function setCover(photoId: number | null) {
    const properties: Record<string, unknown> = { ...ownProperties(feature), cover_photo_id: photoId }
    if (photoId == null) delete properties.cover_photo_id
    try {
      await editor.updateFeature(featureId, { properties })
    } catch (e) {
      editor.notify(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  if (photos === null) return null
  if (photos.length === 0 && !editor.canEdit) return null

  const addButton = editor.canEdit && (
    <>
      <button type="button" onClick={() => fileInput.current?.click()}
        className={photos.length === 0
          ? 'flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-loam-300 px-3 py-3 text-sm text-loam-600 hover:border-prune-300 hover:bg-prune-50 hover:text-prune-700'
          : 'absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-sm text-prune-700 shadow hover:bg-white'}>
        <ImagePlus className="h-4 w-4" />
        {photos.length === 0 ? t('plant_peek.add_photo') : t('soil_photos.inspector.add')}
      </button>
      <input ref={fileInput} type="file" multiple accept={photoAccept(limits.contentTypes)} className="sr-only" aria-label={t('soil_photos.inspector.add')}
        onChange={(e) => { add(e.target.files); e.target.value = '' }} />
    </>
  )

  return (
    <section aria-label={t('soil_photos.inspector.title')} className="relative">
      {photos.length > 0 && (
        // A new cover comes first: the gallery starts over on it.
        <PhotoGallery key={coverId ?? 'none'} mapId={editor.map.id} photos={photos} onOpen={(photo) => photoActions.open(photo.id)}
          openLabel={t('plant_peek.open_photo')} className="aspect-[4/3] rounded-xl"
          overlay={editor.canEdit && photos.length > 1 ? (photo) => {
            const isCover = photo.id === coverId
            return (
              <button type="button" onClick={() => void setCover(isCover ? null : photo.id)} aria-pressed={isCover}
                title={isCover ? t('plant_peek.remove_cover') : undefined}
                className={'absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm shadow '
                  + (isCover ? 'bg-humus-100 text-humus-800 hover:bg-humus-50' : 'bg-white/90 text-loam-700 hover:bg-white')}>
                <Star className={'h-4 w-4' + (isCover ? ' fill-current' : '')} aria-hidden="true" />
                {isCover ? t('plant_peek.cover') : t('plant_peek.make_cover')}
              </button>
            )
          } : undefined} />
      )}
      {addButton}
    </section>
  )
}
