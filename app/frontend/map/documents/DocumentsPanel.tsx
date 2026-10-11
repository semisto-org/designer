import { Link } from '@inertiajs/react'
import clsx from 'clsx'
import { ArrowRight, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { buttonClass } from '@/components/ui/Button'
import { DocumentIcon } from '@/documents/DocumentIcon'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { relativeTime } from '@/lib/relativeTime'
import { useEditor } from '@/map/editor/EditorContext'
import type { MapDocumentData } from '@/types/documents'

/** « Documents » in the editor: the latest documents of the map, and the way to its full library. */
export default function DocumentsPanel() {
  const editor = useEditor()
  const mapId = editor.map.id
  const [docs, setDocs] = useState<MapDocumentData[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<{ documents: MapDocumentData[] }>(`/maps/${mapId}/documents`)
      .then((data) => setDocs(data.documents))
      .catch((e: Error) => setError(e.message))
  }, [mapId])

  return (
    <div className="space-y-4">
      <p className="text-sm text-loam-600">{t('documents.panel.intro')}</p>
      <Link href={`/maps/${mapId}/documents`} className={buttonClass('primary', 'sm')}>
        {t('documents.panel.open')}<ArrowRight className="h-4 w-4" />
      </Link>
      {error && <p className="text-sm text-clay-600" role="alert">{error}</p>}
      {!docs && !error && <p className="flex items-center gap-2 text-sm text-loam-500"><Loader2 className="h-4 w-4 animate-spin" />{t('common.loading')}</p>}
      {docs && docs.length === 0 && <p className="text-sm text-loam-500">{t('documents.panel.empty')}</p>}
      {docs && docs.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-medium text-loam-700">{t('documents.panel.recent')}</h3>
          <ul className="space-y-1">
            {docs.slice(0, 8).map((doc) => (
              <li key={doc.id}>
                <Link href={`/maps/${mapId}/documents?open=${doc.id}`} className="flex items-center gap-3 rounded-lg p-1.5 hover:bg-loam-50">
                  <span className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-[#f7f3ea] ring-1 ring-loam-900/10">
                    {doc.thumbUrl
                      ? <img src={doc.thumbUrl} alt="" loading="lazy" className={clsx('h-full w-full', doc.preview === 'image' ? 'object-cover' : 'object-contain object-top')} />
                      : <DocumentIcon kind={doc.kind} filename={doc.filename} className="h-full w-full" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-loam-900">{doc.title}</span>
                    <span className="block truncate text-sm text-loam-500">{doc.tags.length ? doc.tags.join(', ') : relativeTime(doc.createdAt)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
