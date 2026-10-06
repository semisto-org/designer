import type { PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

// PDF plans are read in the browser (pdf.js) and one page is turned into a
// PNG, which is then imported like any other image: the server only ever
// stores images. pdf.js is loaded on demand, the editor does not pay for it.

/** Longest side of the rendered page, in pixels: the map shows textures up to 4096 px. */
export const RENDER_SIZE = 4096
const THUMB_WIDTH = 220

export function isPdf(file: File) {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

export async function openPdf(file: File): Promise<PDFDocumentProxy> {
  // The legacy build carries the polyfills older Safari and Firefox need.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  return pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
}

async function renderToCanvas(pdf: PDFDocumentProxy, pageNumber: number, scaleFor: (width: number, height: number) => number) {
  const page = await pdf.getPage(pageNumber)
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: scaleFor(base.width, base.height) })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  const context = canvas.getContext('2d')!
  // A plan's white paper stays white (pdf.js leaves the canvas transparent otherwise).
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvas, canvasContext: context, viewport }).promise
  page.cleanup()
  return canvas
}

/** A small preview of a page, as a data URL. */
export async function pageThumbnail(pdf: PDFDocumentProxy, pageNumber: number): Promise<string> {
  const canvas = await renderToCanvas(pdf, pageNumber, (width) => THUMB_WIDTH / width)
  return canvas.toDataURL('image/jpeg', 0.8)
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('render'))), type, quality))

/**
 * One page as an image file ready to import: a PNG (sharp lines), or a
 * JPEG when the PNG would be heavier than `maxBytes`.
 */
export async function pageAsImage(pdf: PDFDocumentProxy, pageNumber: number, name: string, maxBytes: number): Promise<File> {
  const canvas = await renderToCanvas(pdf, pageNumber, (width, height) => RENDER_SIZE / Math.max(width, height))
  const png = await toBlob(canvas, 'image/png')
  const blob = png.size <= maxBytes ? png : await toBlob(canvas, 'image/jpeg', 0.9)
  const extension = blob.type === 'image/png' ? 'png' : 'jpg'
  canvas.width = 0
  canvas.height = 0
  return new File([blob], `${name}.${extension}`, { type: blob.type })
}
