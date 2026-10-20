import clsx from 'clsx'
import { ClipboardList, MessageSquareText } from 'lucide-react'
import { useState } from 'react'
import { t } from '@/lib/i18n'
import { DocumentIcon, extensionLabel } from '@/documents/DocumentIcon'
import type { MapDocumentData } from '@/types/documents'

/** A document as a sheet of paper in the library: its first page (or picture), its title, its tags. */
export function DocumentTile({ doc, onOpen, selected }: { doc: MapDocumentData; onOpen: (doc: MapDocumentData) => void; selected?: boolean }) {
  const [broken, setBroken] = useState(false)
  return (
    <button
      type="button"
      onClick={() => onOpen(doc)}
      aria-pressed={selected}
      className={clsx(
        'group flex w-full flex-col overflow-hidden rounded-2xl bg-white text-left shadow-sm ring-1 ring-loam-900/10 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-prune-500',
        selected && 'ring-2 ring-prune-600',
      )}
    >
      <span className="relative block aspect-[4/3] overflow-hidden border-b border-loam-900/5 bg-[#f7f3ea]">
        {doc.form ? (
          <span className="block h-full space-y-1.5 overflow-hidden bg-[#fffdf7] py-3 pl-3 pr-10 text-left">
            {doc.form.fields.slice(0, 3).map((field, i) => (
              <span key={i} className="block border-b border-dashed border-loam-200 pb-1.5">
                <span className="block truncate text-sm text-loam-500">{field.label}</span>
                <span className="block truncate font-serif text-loam-800">{field.value}</span>
              </span>
            ))}
          </span>
        ) : doc.excerpt ? ( // design-lint-ok: the same paper as the sketch preview above, until a paper token exists
          <span className="block h-full overflow-hidden bg-[#fffdf7] px-3 pb-8 pt-3 text-left">
            <span className="line-clamp-5 block font-serif text-sm leading-snug text-loam-700">{doc.excerpt}</span>
          </span>
        ) : doc.thumbUrl && !broken ? (
          <img src={doc.thumbUrl} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)}
            className={clsx('h-full w-full', doc.preview === 'image' ? 'object-cover' : 'object-contain object-top p-3 drop-shadow')} />
        ) : (
          <span className="grid h-full place-items-center">
            <DocumentIcon kind={doc.kind} filename={doc.filename} className="h-16 w-16" />
          </span>
        )}
        {!doc.form && <span className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-sm font-medium text-loam-600 shadow-sm">{extensionLabel(doc.filename)}</span>}
        {doc.origin === 'form' && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-lichen-700/90 px-2 py-0.5 text-sm text-white" title={t('forms.viewer.badge')}>
            <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">{t('forms.viewer.badge')}</span>
          </span>
        )}
        {doc.origin === 'project_sheet' && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-prune-600/90 px-2 py-0.5 text-sm text-white" title={t('documents.from_project_sheet')}>
            <ClipboardList className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">{t('documents.from_project_sheet')}</span>
          </span>
        )}
      </span>
      <span className="flex flex-1 flex-col gap-1 p-3">
        <span className="line-clamp-2 break-words text-sm font-medium text-loam-900 group-hover:text-prune-700">{doc.title}</span>
        {doc.tags.length > 0 && (
          <span className="flex flex-wrap gap-1">
            {doc.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="rounded-full bg-lichen-100 px-2 py-0.5 text-sm text-lichen-700">{tag}</span>
            ))}
            {doc.tags.length > 3 && <span className="text-sm text-loam-500">+{doc.tags.length - 3}</span>}
          </span>
        )}
      </span>
    </button>
  )
}
