import { ChevronLeft, ChevronRight, MapPin, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { formatDate } from '@/collab/time'
import { t } from '@/lib/i18n'
import type { DeliverablePhoto } from '@/types/collab'

/**
 * One photo or video of the deliverable, full screen: the large still or the
 * video, its caption and date, arrows and keys to move on, and « Voir sur le
 * plan » to find where it was taken.
 */
export function PhotoViewer({ photos, openId, onOpen, onLocate }: {
  photos: DeliverablePhoto[]
  openId: number | null
  onOpen: (id: number | null) => void
  onLocate: (photo: DeliverablePhoto) => void
}) {
  const index = photos.findIndex((p) => p.id === openId)
  const photo = index >= 0 ? photos[index] : null
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (openId == null) return
    dialog.current?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onOpen(null)
      else if (event.key === 'ArrowLeft' && index > 0) onOpen(photos[index - 1].id)
      else if (event.key === 'ArrowRight' && index < photos.length - 1) onOpen(photos[index + 1].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId, index, photos, onOpen])

  if (!photo) return null
  const located = photo.lng != null && photo.lat != null

  return createPortal(
    <div ref={dialog} role="dialog" aria-modal="true" aria-label={photo.caption ?? t('deliverables.page.photos_title')} tabIndex={-1}
      className="fixed inset-0 z-[60] flex flex-col bg-loam-950 text-white outline-none">
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-2 md:p-6">
        {photo.kind === 'video' && photo.videoUrl ? (
          <video key={photo.id} src={photo.videoUrl} poster={photo.largeUrl} controls playsInline className="max-h-full max-w-full" />
        ) : (
          <img src={photo.largeUrl} alt={photo.caption ?? ''} className="max-h-full max-w-full object-contain" />
        )}
        <IconButton label={t('deliverables.page.close')} tone="onDark" onClick={() => onOpen(null)} className="absolute right-3 top-3 bg-black/50">
          <X className="h-5 w-5" />
        </IconButton>
        {index > 0 && (
          <IconButton label={t('deliverables.page.previous')} tone="onDark" onClick={() => onOpen(photos[index - 1].id)} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50">
            <ChevronLeft className="h-6 w-6" />
          </IconButton>
        )}
        {index < photos.length - 1 && (
          <IconButton label={t('deliverables.page.next')} tone="onDark" onClick={() => onOpen(photos[index + 1].id)} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50">
            <ChevronRight className="h-6 w-6" />
          </IconButton>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 bg-loam-900 px-4 py-3">
        <div className="min-w-0 flex-1">
          {photo.caption && <p className="text-base">{photo.caption}</p>}
          <p className="text-sm text-loam-300">
            {photo.takenAt ? formatDate(photo.takenAt) : null}
            {' · '}{index + 1} / {photos.length}
          </p>
        </div>
        {located && (
          <Button variant="secondary" size="sm" onClick={() => { onOpen(null); onLocate(photo) }}>
            <MapPin className="h-4 w-4" aria-hidden />{t('deliverables.page.photo_on_plan')}
          </Button>
        )}
      </div>
    </div>,
    document.body,
  )
}
