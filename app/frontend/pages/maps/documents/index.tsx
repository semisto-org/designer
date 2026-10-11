import { Head } from '@inertiajs/react'
import clsx from 'clsx'
import { ClipboardList, FilePlus2, Search, Tag } from 'lucide-react'
import { useCallback, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { MapViewHeader } from '@/components/map_views/MapViews'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'
import { useCompressionRefresh } from '@/documents/compression'
import { DocumentTile } from '@/documents/DocumentTile'
import { DocumentViewer } from '@/documents/DocumentViewer'
import { UploadList } from '@/documents/ProjectDocuments'
import { documentAccept, useDocumentUploads } from '@/documents/upload'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { formatMegabytes } from '@/map/photos/format'
import { groupByTag, hasTag, tagCounts, UNTAGGED } from '@/map/tags/tags'
import type { DocumentLimits, MapDocumentData } from '@/types/documents'

type Props = {
  map: { id: number; name: string; role: string | null }
  documents: MapDocumentData[]
  canEdit: boolean
  limits: DocumentLimits
}

type Sort = 'newest' | 'oldest' | 'title'
/** A tag, UNTAGGED, PROJECT_SHEET or null for everything. */
type Shelf = string | null
const PROJECT_SHEET = '\u0000project_sheet'

// Shapes a document like a map element for the shared tag helpers.
const asTagged = (doc: MapDocumentData) => ({ doc, properties: { tags: doc.tags } })

/**
 * The map's document library: plans, reports, analyses, permits… Shelves
 * by tag on the side, sheets of paper in the middle, a preview of images
 * and PDFs on a click. Everyone on the map reads; editors add and tag.
 */
export default function MapDocuments({ map, documents, canEdit, limits }: Props) {
  const [docs, setDocs] = useState(documents)
  const [shelf, setShelf] = useState<Shelf>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('newest')
  const [grouped, setGrouped] = useState(true)
  // ?open=ID (from the editor's panel) opens that document at once.
  const [openId, setOpenId] = useState<number | null>(() => (typeof window === 'undefined' ? null : Number(new URLSearchParams(window.location.search).get('open')) || null))
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const endpoint = `/maps/${map.id}/documents`

  const onSaved = useCallback((doc: MapDocumentData) => setDocs((list) => [doc, ...list]), [])
  const { uploads, add, dismiss } = useDocumentUploads(endpoint, limits, onSaved)
  useCompressionRefresh(endpoint, docs, setDocs)

  const tags = useMemo(() => tagCounts(docs.map(asTagged)), [docs])
  const fromSheet = docs.filter((d) => d.origin === 'project_sheet').length
  const untagged = docs.filter((d) => d.tags.length === 0).length

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('fr')
    const list = docs.filter((doc) => {
      if (shelf === PROJECT_SHEET && doc.origin !== 'project_sheet') return false
      if (shelf && shelf !== PROJECT_SHEET && !hasTag(asTagged(doc), shelf)) return false
      if (!needle) return true
      return [doc.title, doc.filename, doc.description, ...doc.tags].some((v) => v?.toLocaleLowerCase('fr').includes(needle))
    })
    const sorted = [...list]
    if (sort === 'title') sorted.sort((a, b) => a.title.localeCompare(b.title, 'fr', { numeric: true, sensitivity: 'base' }))
    else sorted.sort((a, b) => (sort === 'newest' ? -1 : 1) * (a.createdAt.localeCompare(b.createdAt) || a.id - b.id))
    return sorted
  }, [docs, shelf, query, sort])

  // On one shelf, grouping again by tag would only repeat it.
  const groups = useMemo(() => (grouped && shelf == null
    ? groupByTag(visible.map(asTagged)).map((g) => ({ tag: g.tag, docs: g.items.map((i) => i.doc) }))
    : [{ tag: undefined as string | null | undefined, docs: visible }]), [grouped, shelf, visible])
  // The viewer moves through what is on screen, in order, each document once.
  const ordered = useMemo(() => [...new Map(groups.flatMap((g) => g.docs).map((d) => [d.id, d])).values()], [groups])

  function addFiles(files: FileList | File[] | null) {
    const shelfTag = shelf && shelf !== PROJECT_SHEET && shelf !== UNTAGGED ? [shelf] : []
    add(files, shelf === PROJECT_SHEET ? { origin: 'project_sheet' } : { tags: shelfTag })
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    if (canEdit) addFiles(event.dataTransfer.files)
  }

  async function save(doc: MapDocumentData, patch: { title?: string; description?: string; tags?: string[] }) {
    setError(null)
    try {
      const saved = await api<MapDocumentData>(`${endpoint}/${doc.id}`, { method: 'PATCH', body: { document: patch } })
      setDocs((list) => list.map((d) => (d.id === saved.id ? saved : d)))
    } catch (e) {
      setError((e as Error).message)
    }
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

  const shelfButton = (value: Shelf, label: string, count: number, icon?: ReactNode) => (
    <button
      type="button" aria-pressed={shelf === value} onClick={() => setShelf(value)}
      className={clsx(
        'flex w-full shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-left text-sm lg:rounded-lg',
        shelf === value ? 'bg-prune-600 text-white' : 'bg-white text-loam-700 ring-1 ring-inset ring-loam-200 hover:bg-loam-50 lg:bg-transparent lg:ring-0',
      )}
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      <span className={clsx('text-sm', shelf === value ? 'text-prune-100' : 'text-loam-500')}>{count}</span>
    </button>
  )

  return (
    <div onDragOver={(e) => { if (canEdit) { e.preventDefault(); setDragging(true) } }} onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)} onDrop={onDrop}>
      <Head title={t('documents.page_title', { map: map.name })} />
      <MapViewHeader map={map} current="documents" />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-3xl">{t('documents.title')}</h1>
          <p className="mt-1 text-loam-600">{t('documents.intro')}</p>
        </div>
        {canEdit && (
          <div className="flex max-w-xs flex-col items-start gap-1.5 sm:items-end sm:text-right">
            <Button onClick={() => input.current?.click()}>
              <FilePlus2 className="h-4 w-4" />{t('documents.add')}
            </Button>
            <p className="text-sm text-loam-500">{t('documents.drop_hint', { max: formatMegabytes(limits.maxBytes) })}</p>
            <input ref={input} type="file" multiple accept={documentAccept(limits)} className="sr-only" aria-label={t('documents.add')}
              onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
          </div>
        )}
      </div>
      {!canEdit && <p className="mt-3 rounded-lg bg-loam-100 px-3 py-2 text-sm text-loam-600">{t('documents.read_only')}</p>}

      <UploadList uploads={uploads} onDismiss={dismiss} />
      {error && <p className="mt-3 text-sm text-clay-600" role="alert">{error}</p>}

      {docs.length === 0 && uploads.length === 0 ? (
        <EmptyLibrary canEdit={canEdit} onAdd={() => input.current?.click()} />
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <nav aria-label={t('documents.shelves')} className="-mx-4 overflow-x-auto px-4 lg:sticky lg:top-4 lg:mx-0 lg:self-start lg:overflow-visible lg:px-0">
            <p className="mb-2 hidden text-sm font-medium text-loam-500 lg:block">{t('documents.shelves')}</p>
            <ul className="flex gap-2 lg:flex-col lg:gap-0.5">
              <li>{shelfButton(null, t('documents.all'), docs.length)}</li>
              {fromSheet > 0 && <li>{shelfButton(PROJECT_SHEET, t('documents.project_sheet_shelf'), fromSheet, <ClipboardList className="h-4 w-4 shrink-0" aria-hidden />)}</li>}
              {tags.map(({ tag, count }) => <li key={tag}>{shelfButton(tag, tag, count, <Tag className="h-4 w-4 shrink-0 opacity-60" aria-hidden />)}</li>)}
              {tags.length > 0 && untagged > 0 && <li>{shelfButton(UNTAGGED, t('tags.untagged'), untagged)}</li>}
            </ul>
          </nav>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-48 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-loam-400" aria-hidden />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('documents.search')} aria-label={t('documents.search')} className="!pl-9" type="search" />
              </label>
              <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={t('documents.sort.label')} className="!w-auto">
                {(['newest', 'oldest', 'title'] as const).map((s) => <option key={s} value={s}>{t(`documents.sort.${s}`)}</option>)}
              </Select>
              {shelf == null && tags.length > 0 && (
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-loam-700">
                  <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} className="rounded border-loam-300 text-prune-600" />
                  {t('documents.group_by_tag')}
                </label>
              )}
            </div>
            <p className="mt-3 text-sm text-loam-500">{t('documents.count', { count: visible.length })}</p>

            {visible.length === 0 && <p className="mt-6 text-loam-500">{t('documents.none_found')}</p>}
            {groups.map((group) => (group.docs.length > 0 && (
              <section key={group.tag ?? 'all'} className="mt-5">
                {group.tag !== undefined && (
                  <h2 className="mb-3 flex items-baseline gap-2 font-serif text-xl text-loam-900">
                    {group.tag ?? t('tags.untagged')}
                    <span className="font-sans text-sm text-loam-500">{group.docs.length}</span>
                  </h2>
                )}
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  {group.docs.map((doc) => <li key={doc.id}><DocumentTile doc={doc} onOpen={(d) => setOpenId(d.id)} /></li>)}
                </ul>
              </section>
            )))}
          </div>
        </div>
      )}

      {dragging && canEdit && (
        <div className="pointer-events-none fixed inset-4 z-50 grid place-items-center rounded-3xl border-2 border-dashed border-prune-500 bg-prune-50/80">
          <p className="font-serif text-2xl text-prune-800">{t('documents.drop_now')}</p>
        </div>
      )}

      <DocumentViewer
        docs={ordered} openId={openId} onOpen={setOpenId} canEdit={canEdit}
        tagSuggestions={tags.map((c) => c.tag).concat(t('documents.suggested_tags').split(',').map((s) => s.trim()))
          .filter((tag, i, all) => all.findIndex((o) => o.toLowerCase() === tag.toLowerCase()) === i)}
        onSave={save} onDelete={remove}
      />
    </div>
  )
}

/** The library before its first document: what is worth gathering, and why. */
function EmptyLibrary({ canEdit, onAdd }: { canEdit: boolean; onAdd: () => void }) {
  const ideas = t('documents.empty.ideas').split('|')
  return (
    <div className="mt-8 grid gap-6 rounded-2xl bg-[#f7f3ea] p-6 ring-1 ring-loam-900/10 sm:p-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <h2 className="font-serif text-2xl text-loam-900">{t('documents.empty.title')}</h2>
        <p className="mt-2 text-loam-700">{t('documents.empty.body')}</p>
        {canEdit && <Button className="mt-5" onClick={onAdd}><FilePlus2 className="h-4 w-4" />{t('documents.add')}</Button>}
      </div>
      <ul className="space-y-2 text-loam-700">
        {ideas.map((idea) => (
          <li key={idea} className="flex gap-2 border-b border-dashed border-loam-300 pb-2 last:border-0">
            <span aria-hidden className="text-leaf-600">✎</span>{idea}
          </li>
        ))}
      </ul>
    </div>
  )
}
