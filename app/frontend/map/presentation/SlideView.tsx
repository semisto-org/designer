import clsx from 'clsx'
import { X } from 'lucide-react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { IconButton } from '@/components/ui/IconButton'
import { t } from '@/lib/i18n'
import { SlideBody } from './SlideBody'
import type { PresentationStep } from './types'

/**
 * A text slide, full screen over its view of the place: the place's name,
 * the title, the text the audience reads (Markdown: titles, lists,
 * tables). A page of the field notebook laid on the map, which stays
 * visible around it; every slide has the same width, whatever it holds.
 */
export function SlideView({ step, place, onClose }: { step: PresentationStep; place: string; onClose?: () => void }) {
  const body = step.slide?.body ?? ''

  useEffect(() => {
    if (!onClose) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-loam-900/35 p-4 pt-20 backdrop-blur-[2px] sm:p-10 sm:pt-24" data-presentation-slide>
      <article className={clsx('relative max-h-full w-full max-w-5xl overflow-y-auto', 'rounded-2xl bg-loam-50 px-8 py-10 shadow-[0_24px_60px_rgb(26_26_26/0.35)] ring-1 ring-loam-200 sm:px-14 sm:py-14')}>
        {onClose && (
          <IconButton label={t('presentations.done')} onClick={onClose} className="absolute right-3 top-3">
            <X />
          </IconButton>
        )}
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-leaf-700">{place}</p>
        <h2 className="mt-3 font-serif text-4xl leading-tight text-loam-900 sm:text-5xl">{step.title}</h2>
        <div className="mt-6 h-px w-16 bg-prune-300" aria-hidden />
        {body ? (
          <SlideBody body={body} className="mt-6" />
        ) : (
          onClose && <p className="mt-6 text-lg text-loam-500">{t('presentations.slide_empty')}</p>
        )}
      </article>
    </div>,
    document.body,
  )
}
