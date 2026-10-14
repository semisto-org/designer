import clsx from 'clsx'
import { Play } from 'lucide-react'
import { t } from '@/lib/i18n'
import { formatDuration, photoLabel, photoUrl } from '@/map/photos/format'
import type { MapPhotoData } from '@/types/soil_photos'

/** Square thumbnail of a photo (the authenticated image route, small variant). A video shows its still frame with a play mark. */
export function PhotoThumb({ mapId, photo, className }: { mapId: number; photo: MapPhotoData; className?: string }) {
  const image = (
    <img
      src={photoUrl(mapId, photo.id, 'thumb')}
      alt={photoLabel(photo)}
      loading="lazy"
      decoding="async"
      className={clsx('h-full w-full object-cover', className)}
    />
  )
  if (photo.kind !== 'video') return image
  return (
    <span className="relative block h-full w-full">
      {image}
      <span className="pointer-events-none absolute bottom-1 left-1 inline-flex items-center gap-1 rounded-full bg-loam-900/70 px-1.5 py-0.5 text-sm font-medium text-white"
        title={t('soil_photos.video.label')}>
        <Play className="h-3 w-3 fill-current" aria-hidden="true" />
        {photo.durationS != null && <span>{formatDuration(photo.durationS)}</span>}
        <span className="sr-only">{t('soil_photos.video.label')}</span>
      </span>
    </span>
  )
}
