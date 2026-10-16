import { BookOpen, ChevronLeft, ChevronRight, ClipboardList, Download, ExternalLink, MessageSquareText, PenLine, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, buttonClass } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { t } from '@/lib/i18n'
import { relativeTime } from '@/lib/relativeTime'
import { DocumentIcon } from '@/documents/DocumentIcon'
import { FormAnswers } from '@/documents/FormAnswers'
import { MarkdownPreview } from '@/documents/markdown/MarkdownPreview'
import { PdfPages } from '@/documents/PdfPages'
import { TagEditor } from '@/documents/TagEditor'
import { documentSize } from '@/documents/compression'
import type { MapDocumentData } from '@/types/documents'

/**
 * One document, full screen: images and PDFs are shown right here (the
 * browser's own PDF reader), a Markdown page too when the document has a
 * page of its own (`pageUrl`), anything else waits for a download. Its title,
 * note and tags sit beside it; arrows and keys move through the list.
 */
export function DocumentViewer({ docs, openId, onOpen, canEdit, tagSuggestions, onSave, onDelete, pageUrl }: {
  docs: MapDocumentData[]
  openId: number | null
  onOpen: (id: number | null) => void
  canEdit: boolean
  tagSuggestions: string[]
  onSave?: (doc: MapDocumentData, patch: { title?: string; description?: string; tags?: string[] }) => Promise<void>
  onDelete?: (doc: MapDocumentData) => Promise<void>
  /** The page where a Markdown document is read and written (the map's library only). */
  pageUrl?: (doc: MapDocumentData) => string
}) {
  const index = docs.findIndex((d) => d.id === openId)
  const doc = index >= 0 ? docs[index] : null
  const dialog = useRef<HTMLDivElement>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  useEffect(() => {
    if (!doc) return
    setTitle(doc.title)
    setDescription(doc.description ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id])

  useEffect(() => {
    if (openId == null) return
    const back = document.activeElement as HTMLElement | null
    dialog.current?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
      back?.focus?.()
    }
  }, [openId == null])

  useEffect(() => {
    if (openId == null) return
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      if (event.key === 'Escape') onOpen(null)
      else if (!typing && event.key === 'ArrowLeft' && index > 0) onOpen(docs[index - 1].id)
      else if (!typing && event.key === 'ArrowRight' && index < docs.length - 1) onOpen(docs[index + 1].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId, index, docs, onOpen])

  if (!doc) return null
  const page = doc.markdown && pageUrl ? pageUrl(doc) : null
  const save = (patch: Parameters<NonNullable<typeof onSave>>[1]) => onSave?.(doc, patch)

  return createPortal(
    <div ref={dialog} role="dialog" aria-modal="true" aria-label={doc.title} tabIndex={-1}
      className="fixed inset-0 z-[60] flex flex-col bg-loam-950 text-white outline-none md:flex-row">
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-2 md:p-6">
        {doc.preview === 'image' && doc.previewUrl && (
          <img src={doc.previewUrl} alt={doc.title} className="max-h-full max-w-full object-contain" />
        )}
        {doc.preview === 'pdf' && doc.previewUrl && <PdfPages key={doc.id} url={doc.previewUrl} title={doc.title} />}
        {doc.form && (
          <div className="max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl">
            <FormAnswers fields={doc.form.fields} title={doc.form.formName} className="!px-6 !py-5" />
          </div>
        )}
        {page && <MarkdownPreview key={doc.id} url={page} title={doc.title} />}
        {!doc.preview && !doc.form && !page && (
          <div className="max-w-sm text-center">
            <DocumentIcon kind={doc.kind} filename={doc.filename} className="mx-auto h-24 w-24" />
            <p className="mt-4 text-lg">{doc.filename}</p>
            <p className="mt-1 text-sm text-loam-300">{t('documents.viewer.no_preview')}</p>
            <a href={doc.downloadUrl} className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-prune-700 hover:bg-prune-50">
              <Download className="h-4 w-4" />{t('documents.viewer.download')}
            </a>
          </div>
        )}
        <button type="button" onClick={() => onOpen(null)} className="absolute right-3 top-3 rounded-full bg-black/50 p-2 hover:bg-black/70" aria-label={t('common.close')}>
          <X className="h-5 w-5" />
        </button>
        {index > 0 && (
          <button type="button" onClick={() => onOpen(docs[index - 1].id)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 hover:bg-black/70" aria-label={t('documents.viewer.previous')}>
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {index < docs.length - 1 && (
          <button type="button" onClick={() => onOpen(docs[index + 1].id)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 hover:bg-black/70" aria-label={t('documents.viewer.next')}>
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
        <p className="absolute bottom-3 left-3 rounded-full bg-black/50 px-3 py-1 text-sm md:left-1/2 md:-translate-x-1/2">
          {t('documents.viewer.counter', { index: index + 1, total: docs.length })}
        </p>
      </div>

      <aside className="max-h-[45%] shrink-0 space-y-4 overflow-y-auto bg-white p-4 text-loam-800 md:max-h-none md:w-80">
        {canEdit && onSave ? (
          <Field label={t('documents.fields.title')}>
            <Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title.trim() && title.trim() !== doc.title && save({ title: title.trim() })} />
          </Field>
        ) : (
          <h2 className="font-serif text-xl text-loam-900">{doc.title}</h2>
        )}
        <p className="text-sm text-loam-600">
          {doc.form
            ? t('forms.viewer.received', { when: relativeTime(doc.form.submittedAt) })
            : doc.fromProjectLink
            ? t('documents.viewer.sent_by_link', { when: relativeTime(doc.createdAt) })
            : doc.uploadedBy
              ? t('documents.viewer.added_by', { name: doc.uploadedBy, when: relativeTime(doc.createdAt) })
              : t('documents.viewer.added', { when: relativeTime(doc.createdAt) })}
          <br />
          {doc.filename}{doc.byteSize ? ` · ${documentSize(doc)}` : ''}
        </p>
        {doc.origin === 'form' && (
          <p className="flex items-center gap-1.5 rounded-lg bg-lichen-100 px-3 py-2 text-sm text-lichen-700">
            <MessageSquareText className="h-4 w-4 shrink-0" aria-hidden />{t('forms.viewer.badge')}
          </p>
        )}
        {doc.origin === 'project_sheet' && (
          <p className="flex items-center gap-1.5 rounded-lg bg-prune-50 px-3 py-2 text-sm text-prune-800">
            <ClipboardList className="h-4 w-4 shrink-0" aria-hidden />{t('documents.from_project_sheet')}
          </p>
        )}
        {canEdit && onSave ? (
          <Field label={t('documents.fields.description')}>
            <Textarea rows={3} value={description} maxLength={2000} placeholder={t('documents.fields.description_placeholder')}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => description.trim() !== (doc.description ?? '') && save({ description: description.trim() })} />
          </Field>
        ) : doc.description ? (
          <p className="whitespace-pre-line text-sm text-loam-700">{doc.description}</p>
        ) : null}
        <div>
          <h3 className="mb-1 text-sm font-medium text-loam-700">{t('tags.title')}</h3>
          <TagEditor tags={doc.tags} suggestions={tagSuggestions} canEdit={canEdit && !!onSave} onChange={(tags) => save({ tags })} />
        </div>
        {page && (
          <div className="flex flex-wrap gap-2">
            <a href={page} className={buttonClass('primary', 'sm')}><BookOpen className="h-4 w-4" />{t('documents.markdown.open_page')}</a>
            {canEdit && <a href={`${page}?edit=1`} className={buttonClass('secondary', 'sm')}><PenLine className="h-4 w-4" />{t('documents.markdown.edit')}</a>}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <a href={doc.downloadUrl} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-prune-700 ring-[1.5px] ring-inset ring-prune-600 hover:bg-prune-600 hover:text-white">
            <Download className="h-4 w-4" />{t('documents.viewer.download')}
          </a>
          {doc.preview && (
            <a href={doc.fileUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-prune-700 hover:bg-prune-50">
              <ExternalLink className="h-4 w-4" />{t('documents.viewer.open_tab')}
            </a>
          )}
        </div>
        {canEdit && onDelete && (
          <Button size="sm" variant="ghost" className="text-clay-500" onClick={() => {
            if (!window.confirm(t('documents.viewer.confirm_delete'))) return
            const next = docs[index + 1] ?? docs[index - 1]
            void onDelete(doc).then(() => onOpen(next ? next.id : null))
          }}>
            <Trash2 className="h-4 w-4" />{t('common.delete')}
          </Button>
        )}
      </aside>
    </div>,
    document.body,
  )
}
