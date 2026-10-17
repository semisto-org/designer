import clsx from 'clsx'
import { ChevronLeft, ChevronRight, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { t } from '@/lib/i18n'
import { photoLabel, photoUrl } from '@/map/photos/format'
import { useSwipe } from '@/map/photos/useSwipe'
import type { MapPhotoData } from '@/types/soil_photos'

/**
 * A row of photos seen one at a time: arrows on hover, a swipe with a
 * finger, dots underneath. A click on the photo calls `onOpen`.
 */
export function PhotoGallery({ mapId, photos, onOpen, openLabel, className }: {
  mapId: number
  photos: MapPhotoData[]
  onOpen: (photo: MapPhotoData) => void
  openLabel: string
  className?: string
}) {
  const [index, setIndex] = useState(0)
  const count = photos.length
  useEffect(() => setIndex((i) => Math.min(i, Math.max(count - 1, 0))), [count])
  const previous = index > 0 ? () => setIndex(index - 1) : undefined
  const next = index < count - 1 ? () => setIndex(index + 1) : undefined
  const swipe = useSwipe({ enabled: count > 1, onPrevious: previous, onNext: next })
  if (count === 0) return null

  return (
    <div className={clsx('group relative overflow-hidden bg-loam-100', className)} {...swipe.handlers} style={{ touchAction: 'pan-y' }}>
      <div className="flex h-full transition-transform duration-300 ease-out"
        style={{ transform: `translateX(calc(${-index * 100}% + ${swipe.offset}px))`, transitionDuration: swipe.offset ? '0ms' : undefined }}>
        {photos.map((p, i) => (
          <button key={p.id} type="button" onClick={() => onOpen(p)} className="relative h-full w-full shrink-0" aria-label={`${openLabel} · ${photoLabel(p)}`}
            tabIndex={i === index ? 0 : -1} aria-hidden={i !== index}>
            {/* Only the shown photo and its neighbours load. */}
            {Math.abs(i - index) <= 1 && (
              <img src={photoUrl(mapId, p.id, 'large')} alt={photoLabel(p)} decoding="async" draggable={false} className="h-full w-full object-cover" />
            )}
            {p.kind === 'video' && (
              <span className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-loam-900/70 px-2 py-0.5 text-sm text-white">
                <Play className="h-3 w-3 fill-current" aria-hidden="true" />{t('soil_photos.video.label')}
              </span>
            )}
          </button>
        ))}
      </div>
      {previous && (
        <button type="button" onClick={previous} aria-label={t('soil_photos.gallery.previous')}
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1.5 text-loam-800 opacity-0 shadow transition-opacity hover:bg-white focus:opacity-100 group-hover:opacity-100">
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      {next && (
        <button type="button" onClick={next} aria-label={t('soil_photos.gallery.next')}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1.5 text-loam-800 opacity-0 shadow transition-opacity hover:bg-white focus:opacity-100 group-hover:opacity-100">
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
      {count > 1 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1.5" aria-label={t('soil_photos.gallery.position', { index: index + 1, count })}>
          {photos.slice(0, 7).map((p, i) => (
            <span key={p.id} className={clsx('h-1.5 w-1.5 rounded-full shadow', i === Math.min(index, 6) ? 'bg-white' : 'bg-white/55')} />
          ))}
        </div>
      )}
    </div>
  )
}
