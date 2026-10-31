import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { useEditor } from '@/map/editor/EditorContext'
import { useLayerState } from '@/map/data/store'
import { pastPhotoLimit, photoMaxZoom } from '@/map/data/photoLimit'
import { t } from '@/lib/i18n'

const DISMISSED = 'designer.editor.photo-limit-dismissed'

/**
 * Zoomed in past what the aerial photo holds, the map turns blurry and it
 * looks like a fault (Clémence's test, October 2026). Say why, and point
 * to what sees further: the place itself, or a drone view.
 */
export default function PhotoLimitOverlay() {
  const { instance, regionLayers, canEdit, openPanel } = useEditor()
  const { base } = useLayerState()
  const maxZoom = photoMaxZoom(regionLayers, base)
  const [zoom, setZoom] = useState(() => instance.getZoom())
  const [dismissed, setDismissed] = useState(() => {
    try { return window.sessionStorage.getItem(DISMISSED) === '1' } catch { return false }
  })

  useEffect(() => {
    const onZoom = () => setZoom(instance.getZoom())
    instance.on('zoomend', onZoom)
    return () => { instance.off('zoomend', onZoom) }
  }, [instance])

  if (dismissed || !pastPhotoLimit(zoom, maxZoom)) return null

  const dismiss = () => {
    setDismissed(true)
    try { window.sessionStorage.setItem(DISMISSED, '1') } catch { /* private mode: only for this view */ }
  }

  return (
    <div className="pointer-events-none absolute inset-x-2 bottom-24 z-20 md:left-1/2 md:right-auto md:w-[28rem] md:-translate-x-1/2">
      <div role="status" className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-loam-900/10 bg-white/95 p-3.5 shadow-lg backdrop-blur">
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="font-serif text-lg leading-snug text-loam-900">{t('map_data.photo_limit.title')}</p>
          <p className="text-sm text-loam-600">{t('map_data.photo_limit.body')}</p>
          {canEdit && (
            <Button variant="ghost" size="sm" className="-ml-2" onClick={() => openPanel('layers')}>
              {t('map_data.photo_limit.drone')}
            </Button>
          )}
        </div>
        <IconButton label={t('map_data.photo_limit.dismiss')} size="sm" onClick={dismiss}>
          <X className="h-4 w-4" aria-hidden />
        </IconButton>
      </div>
    </div>
  )
}
