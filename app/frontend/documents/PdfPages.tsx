import type { PDFDocumentProxy } from 'pdfjs-dist'
import { Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { t } from '@/lib/i18n'

/**
 * The pages of a PDF, one under the other, drawn by pdf.js as they scroll
 * into view: the same on a computer and on a phone (whose browsers often
 * cannot show a PDF inside a page).
 */
export function PdfPages({ url, title }: { url: string; title: string }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [failed, setFailed] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    let cancelled = false
    let loaded: PDFDocumentProxy | null = null
    setPdf(null)
    setFailed(false)
    import('@/map/plan_images/pdf')
      .then(({ openPdfUrl }) => openPdfUrl(url))
      .then((doc) => {
        loaded = doc
        if (cancelled) void doc.loadingTask.destroy()
        else setPdf(doc)
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
      void loaded?.loadingTask.destroy()
    }
  }, [url])

  useEffect(() => {
    const element = box.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={box} className="h-full w-full overflow-y-auto overscroll-contain" aria-label={title}>
      {failed && <p className="p-6 text-center text-loam-200">{t('documents.viewer.pdf_failed')}</p>}
      {!pdf && !failed && (
        <p className="flex h-full items-center justify-center gap-2 text-loam-200"><Loader2 className="h-5 w-5 animate-spin" />{t('documents.viewer.loading')}</p>
      )}
      {pdf && width > 0 && (
        <div className="mx-auto flex max-w-4xl flex-col gap-3 py-1">
          {Array.from({ length: pdf.numPages }, (_, i) => <PdfPage key={i} pdf={pdf} number={i + 1} width={Math.min(width - 8, 896)} />)}
        </div>
      )}
    </div>
  )
}

function PdfPage({ pdf, number, width }: { pdf: PDFDocumentProxy; number: number; width: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [ratio, setRatio] = useState(1.414)
  const [visible, setVisible] = useState(number === 1)

  useEffect(() => {
    const element = canvas.current
    if (!element || visible) return
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && setVisible(true), { rootMargin: '600px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [visible])

  useEffect(() => {
    if (!visible || !canvas.current) return
    let cancelled = false
    let task: { cancel: () => void } | null = null
    void pdf.getPage(number).then((page) => {
      if (cancelled || !canvas.current) return
      const base = page.getViewport({ scale: 1 })
      setRatio(base.height / base.width)
      const scale = (width / base.width) * Math.min(window.devicePixelRatio || 1, 2)
      const viewport = page.getViewport({ scale })
      const element = canvas.current
      element.width = Math.round(viewport.width)
      element.height = Math.round(viewport.height)
      const context = element.getContext('2d')!
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, element.width, element.height)
      const render = page.render({ canvas: element, canvasContext: context, viewport })
      task = render
      render.promise.catch(() => undefined)
    })
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [pdf, number, width, visible])

  return (
    <canvas
      ref={canvas}
      aria-label={t('documents.viewer.page', { number })}
      className="mx-auto block bg-white shadow-lg"
      style={{ width, height: Math.round(width * ratio) }}
    />
  )
}
