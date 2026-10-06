import clsx from 'clsx'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { t } from '@/lib/i18n'
import { pageThumbnail } from '@/map/plan_images/pdf'

// Thumbnails are drawn one after the other, up to this many pages.
const MAX_THUMBNAILS = 60

/** Chooses the page of a PDF to lay on the map. */
export default function PdfPagePicker({ pdf, name, onPick, onClose }: {
  pdf: PDFDocumentProxy
  name: string
  onPick: (pageNumber: number) => void
  onClose: () => void
}) {
  const [thumbs, setThumbs] = useState<Record<number, string>>({})
  const [selected, setSelected] = useState(1)
  const count = pdf.numPages

  useEffect(() => {
    let cancelled = false
    void (async () => {
      for (let page = 1; page <= Math.min(count, MAX_THUMBNAILS) && !cancelled; page += 1) {
        try {
          const url = await pageThumbnail(pdf, page)
          if (!cancelled) setThumbs((current) => ({ ...current, [page]: url }))
        } catch {
          // A page pdf.js cannot draw keeps its number only.
        }
      }
    })()
    return () => { cancelled = true }
  }, [pdf, count])

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('plan_images.pdf.title', { name })}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>{t('plan_images.cancel')}</Button>
          <Button onClick={() => onPick(selected)}>
            {t('plan_images.pdf.import', { page: selected })}
          </Button>
        </>
      )}
    >
      <p className="mb-3 text-sm text-loam-600">{t('plan_images.pdf.hint', { count })}</p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: count }, (_, index) => index + 1).map((page) => (
          <li key={page}>
            <button
              type="button"
              onClick={() => setSelected(page)}
              onDoubleClick={() => onPick(page)}
              aria-pressed={selected === page}
              className={clsx(
                'block w-full rounded-xl p-1.5 text-left ring-2 transition-colors',
                selected === page ? 'bg-prune-50 ring-prune-600' : 'ring-transparent hover:bg-loam-50',
              )}
            >
              <span className="grid aspect-[4/3] place-items-center overflow-hidden rounded-lg bg-loam-100">
                {thumbs[page]
                  ? <img src={thumbs[page]} alt="" className="max-h-full max-w-full object-contain" />
                  : <span className="text-xs text-loam-400">…</span>}
              </span>
              <span className="mt-1 block text-center text-xs font-medium text-loam-700">{t('plan_images.pdf.page', { page })}</span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  )
}
