import { Link } from '@inertiajs/react'
import clsx from 'clsx'
import { AlertCircle, ArrowRight, FilePlus2, Loader2, Trash2, X } from 'lucide-react'
import { useCallback, useRef, useState, type DragEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { relativeTime } from '@/lib/relativeTime'
import { DocumentIcon } from '@/documents/DocumentIcon'
import { documentAccept, useDocumentUploads, type DocumentUpload } from '@/documents/upload'
import { DocumentViewer } from '@/documents/DocumentViewer'
import { formatBytes, formatMegabytes } from '@/map/photos/format'
import type { DocumentLimits, MapDocumentData } from '@/types/documents'

/**
 * « Documents du projet », under the project sheet: plans from an architect,
 * a surveyor's report, old photos… sent by the team or by the people behind
 * the project through the private link. They also live in the map's
 * « Documents » library.
 */
export function ProjectDocuments({ endpoint, initial, limits, canEdit, libraryHref, className, fields = { origin: 'project_sheet' }, intro }: {
  /** Where the documents are sent: the map's documents, or the private link's. */
  endpoint: string
  initial: MapDocumentData[]
  limits: DocumentLimits
  canEdit: boolean
  /** The library, for the team (not through the private link). */
  libraryHref?: string
  className?: string
  fields?: Record<string, string>
  intro?: string
}) {
  const [docs, setDocs] = useState(initial)
  const [openId, setOpenId] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const onSaved = useCallback((doc: MapDocumentData) => setDocs((list) => [doc, ...list]), [])
  const { uploads, add, dismiss } = useDocumentUploads(endpoint, limits, onSaved)

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    if (canEdit) add(event.dataTransfer.files, fields)
  }

  async function remove(doc: MapDocumentData) {
    setError(null)
    try {
      await api(`${endpoint}/${doc.id}`, { method: 'DELETE' })
      setDocs((list) => list.filter((d) => d.id !== doc.id))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Card className={clsx('p-5! sm:p-7!', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl">{t('documents.project.title')}</h2>
        {libraryHref && (
          <Link href={libraryHref} className="inline-flex items-center gap-1 text-sm font-medium text-prune-700 hover:underline">
            {t('documents.project.library')}<ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
      <p className="mt-1 max-w-2xl text-sm text-loam-600">{intro ?? t('documents.project.intro')}</p>

      {canEdit && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={clsx('mt-4 rounded-xl border border-dashed p-4 text-center', dragging ? 'border-prune-500 bg-prune-50' : 'border-loam-300 bg-loam-50')}
        >
          <Button size="sm" onClick={() => input.current?.click()}>
            <FilePlus2 className="h-4 w-4" />{t('documents.add')}
          </Button>
          <p className="mt-2 text-sm text-loam-500">{t('documents.drop_hint', { max: formatMegabytes(limits.maxBytes) })}</p>
          <input ref={input} type="file" multiple accept={documentAccept(limits)} className="sr-only" aria-label={t('documents.add')}
            onChange={(e) => { add(e.target.files, fields); e.target.value = '' }} />
        </div>
      )}

      <UploadList uploads={uploads} onDismiss={dismiss} />
      {error && <p className="mt-2 text-sm text-clay-600" role="alert">{error}</p>}

      {docs.length === 0 && uploads.length === 0 ? (
        <p className="mt-4 text-sm text-loam-500">{t('documents.project.empty')}</p>
      ) : (
        <ul className="mt-4 divide-y divide-loam-100">
          {docs.map((doc) => (
            <li key={doc.id} className="flex items-center gap-3 py-2">
              <button type="button" onClick={() => setOpenId(doc.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[#f7f3ea] ring-1 ring-loam-900/10">
                  {doc.thumbUrl
                    ? <img src={doc.thumbUrl} alt="" loading="lazy" className={clsx('h-full w-full', doc.preview === 'image' ? 'object-cover' : 'object-contain object-top')} />
                    : <DocumentIcon kind={doc.kind} filename={doc.filename} className="h-full w-full" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-loam-900 hover:text-prune-700">{doc.title}</span>
                  <span className="block truncate text-sm text-loam-500">
                    {doc.byteSize ? formatBytes(doc.byteSize) : ''} · {doc.fromProjectLink ? t('documents.project.sent_by_link', { when: relativeTime(doc.createdAt) }) : relativeTime(doc.createdAt)}
                  </span>
                </span>
              </button>
              {canEdit && (
                <button type="button" onClick={() => window.confirm(t('documents.viewer.confirm_delete')) && remove(doc)}
                  className="rounded-full p-2 text-loam-400 hover:bg-loam-100 hover:text-clay-500" aria-label={`${t('common.delete')} ${doc.title}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <DocumentViewer docs={docs} openId={openId} onOpen={setOpenId} canEdit={false} tagSuggestions={[]} />
    </Card>
  )
}

export function UploadList({ uploads, onDismiss }: { uploads: DocumentUpload[]; onDismiss: (key: string) => void }) {
  if (uploads.length === 0) return null
  return (
    <ul className="mt-3 space-y-1.5" aria-live="polite">
      {uploads.map((item) => (
        <li key={item.key} className="flex items-center gap-2 rounded-lg bg-white p-2 text-sm ring-1 ring-loam-200">
          {item.status === 'error' ? <AlertCircle className="h-4 w-4 shrink-0 text-clay-500" /> : <Loader2 className="h-4 w-4 shrink-0 animate-spin text-prune-600" />}
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-loam-800">{item.name}</span>
            {item.status === 'error'
              ? <span className="block text-clay-600" role="alert">{item.message}</span>
              : (
                <span className="mt-1 block h-1 overflow-hidden rounded bg-loam-100" role="progressbar" aria-valuenow={item.progress} aria-valuemin={0} aria-valuemax={100}>
                  <span className="block h-full bg-prune-500 transition-all" style={{ width: `${item.progress}%` }} />
                </span>
              )}
          </span>
          {item.status === 'error' && (
            <button type="button" onClick={() => onDismiss(item.key)} className="rounded p-1 text-loam-400 hover:bg-loam-100" aria-label={t('common.close')}>
              <X className="h-4 w-4" />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
