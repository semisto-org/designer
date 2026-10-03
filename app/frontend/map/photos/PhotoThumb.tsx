import clsx from 'clsx'
import { photoUrl } from '@/map/photos/format'
import { photoLabel } from '@/map/photos/format'
import type { MapPhotoData } from '@/types/soil_photos'

/** Square thumbnail of a photo (the authenticated image route, small variant). */
export function PhotoThumb({ mapId, photo, className }: { mapId: number; photo: MapPhotoData; className?: string }) {
  return (
    <img
      src={photoUrl(mapId, photo.id, 'thumb')}
      alt={photoLabel(photo)}
      loading="lazy"
      decoding="async"
      className={clsx('h-full w-full object-cover', className)}
    />
  )
}
