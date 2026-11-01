import { useCallback, useRef, useState } from 'react'
import { t } from '@/lib/i18n'
import { trackWrite, writeOutcome } from '@/lib/saveStatus'
import { formatMegabytes } from '@/map/photos/format'
import type { DocumentLimits, MapDocumentData } from '@/types/documents'

export type DocumentUpload = {
  key: string
  name: string
  status: 'uploading' | 'error'
  progress: number
  message?: string
}

/** Why a file is refused before sending it, or null. Same rule as MapDocument: any type, up to a size. */
export function documentRejection(file: File, limits: DocumentLimits): string | null {
  if (file.size > limits.maxBytes) return t('documents.errors.too_large', { name: file.name, max: formatMegabytes(limits.maxBytes).replace(' Mo', '') })
  return null
}

const isPdf = (file: File) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name)

/** The first page of a PDF as a small JPEG, drawn here: the server has no PDF renderer. */
async function pdfThumbnail(file: File): Promise<Blob | null> {
  try {
    const { openPdf } = await import('@/map/plan_images/pdf')
    const pdf = await openPdf(file)
    const page = await pdf.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: 480 / Math.max(base.width, base.height) })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const context = canvas.getContext('2d')!
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvas, canvasContext: context, viewport }).promise
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8))
    void pdf.loadingTask.destroy()
    return blob
  } catch {
    // A protected or broken PDF just has no thumbnail.
    return null
  }
}

function csrfToken(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? ''
}

function send(endpoint: string, form: FormData, onProgress: (percent: number) => void): Promise<MapDocumentData> {
  // Counted by the editor header's « Enregistré » until the file has arrived.
  const finish = trackWrite()
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', endpoint)
    xhr.setRequestHeader('Accept', 'application/json')
    xhr.setRequestHeader('X-CSRF-Token', csrfToken())
    xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(Math.round((event.loaded / event.total) * 100))
    xhr.onerror = () => {
      finish('lost')
      reject(new Error(t('documents.errors.upload_failed')))
    }
    xhr.onload = () => {
      finish(writeOutcome(xhr.status))
      let body: Record<string, unknown> = {}
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        // Not JSON (proxy error page): the status says enough.
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as unknown as MapDocumentData)
      else reject(new Error(typeof body.message === 'string' ? body.message : t('documents.errors.upload_failed')))
    }
    xhr.send(form)
  })
}

/**
 * Sends files to a documents endpoint (the map's, or the project sheet's
 * private link), one after the other, with their progress. Each saved
 * document goes to `onSaved`.
 */
export function useDocumentUploads(endpoint: string, limits: DocumentLimits, onSaved: (doc: MapDocumentData) => void) {
  const [uploads, setUploads] = useState<DocumentUpload[]>([])
  const queue = useRef(Promise.resolve())

  const patch = (key: string, changes: Partial<DocumentUpload>) =>
    setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...changes } : u)))

  const add = useCallback((files: FileList | File[] | null, fields: Record<string, string | string[]> = {}) => {
    Array.from(files ?? []).forEach((file) => {
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const rejected = documentRejection(file, limits)
      setUploads((list) => [...list, { key, name: file.name, status: rejected ? 'error' : 'uploading', progress: 0, message: rejected ?? undefined }])
      if (rejected) return
      queue.current = queue.current.then(async () => {
        const form = new FormData()
        form.append('document[file]', file)
        Object.entries(fields).forEach(([name, value]) => {
          if (Array.isArray(value)) value.forEach((v) => form.append(`document[${name}][]`, v))
          else form.append(`document[${name}]`, value)
        })
        if (isPdf(file)) {
          const thumb = await pdfThumbnail(file)
          if (thumb) form.append('document[thumbnail]', thumb, 'apercu.jpg')
        }
        try {
          const saved = await send(endpoint, form, (progress) => patch(key, { progress }))
          setUploads((list) => list.filter((u) => u.key !== key))
          onSaved(saved)
        } catch (error) {
          patch(key, { status: 'error', message: (error as Error).message })
        }
      })
    })
  }, [endpoint, limits, onSaved])

  const dismiss = (key: string) => setUploads((list) => list.filter((u) => u.key !== key))
  return { uploads, add, dismiss }
}
