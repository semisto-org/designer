import { X } from 'lucide-react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { IconButton } from '@/components/ui/IconButton'
import { t } from '@/lib/i18n'
import type { PresentationStep } from './types'

/** Lines of a slide: paragraphs, and runs of « - » lines as lists. */
function blocks(body: string) {
  const out: ({ kind: 'p'; text: string } | { kind: 'ul'; items: string[] })[] = []
  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const item = /^[-•*]\s+(.*)$/.exec(line)
    const last = out[out.length - 1]
    if (item) {
      if (last?.kind === 'ul') last.items.push(item[1])
      else out.push({ kind: 'ul', items: [item[1]] })
    } else {
      out.push({ kind: 'p', text: line })
    }
  }
  return out
}

/**
 * A text slide, full screen over its view of the place: the place's name,
 * the title, the text the audience reads. A page of the field notebook
 * laid on the map, which stays visible around it.
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
      <article className="relative max-h-full w-full max-w-3xl overflow-y-auto rounded-2xl bg-loam-50 px-8 py-10 shadow-[0_24px_60px_rgb(26_26_26/0.35)] ring-1 ring-loam-200 sm:px-14 sm:py-14">
        {onClose && (
          <IconButton label={t('presentations.done')} onClick={onClose} className="absolute right-3 top-3">
            <X />
          </IconButton>
        )}
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-leaf-700">{place}</p>
        <h2 className="mt-3 font-serif text-4xl leading-tight text-loam-900 sm:text-5xl">{step.title}</h2>
        <div className="mt-6 h-px w-16 bg-prune-300" aria-hidden />
        {body ? (
          <div className="mt-6 space-y-4 text-lg leading-relaxed text-loam-800 sm:text-xl">
            {blocks(body).map((block, i) =>
              block.kind === 'p' ? (
                <p key={i}>{block.text}</p>
              ) : (
                <ul key={i} className="space-y-2 pl-1">
                  {block.items.map((item, j) => (
                    <li key={j} className="flex gap-3">
                      <span className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-leaf-600" aria-hidden />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ),
            )}
          </div>
        ) : (
          onClose && <p className="mt-6 text-lg text-loam-500">{t('presentations.slide_empty')}</p>
        )}
      </article>
    </div>,
    document.body,
  )
}
