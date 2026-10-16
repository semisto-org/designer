import { Head, Link } from '@inertiajs/react'
import clsx from 'clsx'
import { AlertTriangle, ArrowLeft, BookOpen, Check, CloudOff, Download, FileDown, Loader2, PenLine } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Contents } from '@/documents/markdown/Contents'
import { Letterhead } from '@/documents/markdown/Letterhead'
import { MarkdownEditor } from '@/documents/markdown/MarkdownEditor'
import { useAutosave, type SaveStatus } from '@/documents/markdown/useAutosave'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { relativeTime } from '@/lib/relativeTime'
import type { Letterhead as LetterheadData, MapDocumentData } from '@/types/documents'

type Props = {
  map: { id: number; name: string }
  document: MapDocumentData
  content: string
  checksum: string | null
  canEdit: boolean
  letterhead: LetterheadData
}

type Mode = 'read' | 'edit'

/**
 * A Markdown document as a page of the field notebook: read calmly, with
 * its contents beside it; written in place by the map's editors, saved as
 * they go; printed or saved as PDF under the team's (or the pro's) logo.
 */
export default function MarkdownDocument({ map, document: initial, content, checksum, canEdit, letterhead }: Props) {
  const [doc, setDoc] = useState(initial)
  const [text, setText] = useState(content)
  const latest = useRef(content)
  const [mode, setMode] = useState<Mode>(() => (canEdit && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('edit') ? 'edit' : 'read'))
  const [title, setTitle] = useState(initial.title)
  const [page, setPage] = useState<HTMLDivElement | null>(null)
  const [version, setVersion] = useState(0)
  // A document just created opens with the cursor at the end of its text.
  const [fresh] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('new'))
  const base = `/maps/${map.id}/documents/${doc.id}`

  const onStale = useCallback((serverText: string, serverDoc: MapDocumentData) => {
    latest.current = serverText
    setText(serverText)
    setDoc(serverDoc)
  }, [])
  const { status, change, flush, conflict, dismissConflict } = useAutosave({ url: `${base}/content`, checksum, onSaved: setDoc, onStale })

  const onChange = useCallback((markdown: string) => {
    latest.current = markdown
    change(markdown)
    setVersion((v) => v + 1)
  }, [change])

  async function switchTo(next: Mode) {
    if (next === mode) return
    await flush()
    setText(latest.current)
    setMode(next)
    const url = new URL(window.location.href)
    if (next === 'edit') url.searchParams.set('edit', '1')
    else url.searchParams.delete('edit')
    url.searchParams.delete('new')
    window.history.replaceState(window.history.state, '', url)
  }

  async function exportPdf() {
    await flush()
    window.print()
  }

  async function saveTitle() {
    const next = title.trim()
    if (!next || next === doc.title) return setTitle(doc.title)
    const saved = await api<MapDocumentData>(base, { method: 'PATCH', body: { document: { title: next } } })
    setDoc(saved)
  }

  // Ctrl/Cmd + S saves at once instead of opening the browser's dialog.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void flush()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flush])

  // The library's title is the page's heading, unless the text opens with one.
  const showTitle = !/^\s*#\s/.test(text)
  const empty = text.trim() === ''
  const edited = doc.contentEditedAt
    ? doc.contentEditedBy
      ? t('documents.markdown.edited', { name: doc.contentEditedBy, when: relativeTime(doc.contentEditedAt) })
      : t('documents.markdown.edited_anonymous', { when: relativeTime(doc.contentEditedAt) })
    : doc.uploadedBy ? t('documents.markdown.created', { name: doc.uploadedBy, when: relativeTime(doc.createdAt) }) : null

  return (
    <div className="min-h-dvh bg-[#f1ece1] text-loam-900 print:min-h-0 print:bg-white">
      <Head title={doc.title} />
      <header className="z-30 border-b sm:sticky sm:top-0 border-loam-900/10 bg-[#f1ece1]/90 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
          <Link href={`/maps/${map.id}/documents`} className="inline-flex min-w-0 items-center gap-1.5 rounded-full px-2 py-1.5 text-sm text-loam-600 hover:bg-white/70 hover:text-loam-900">
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{t('documents.markdown.back')} · {map.name}</span>
          </Link>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {canEdit && mode === 'edit' && <SaveBadge status={status} />}
            {canEdit && (
              <div className="flex rounded-full bg-white p-0.5 ring-1 ring-loam-900/10" role="group">
                {(['read', 'edit'] as const).map((m) => {
                  const Icon = m === 'read' ? BookOpen : PenLine
                  return (
                    <button key={m} type="button" aria-pressed={mode === m} onClick={() => void switchTo(m)}
                      className={clsx('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold', mode === m ? 'bg-prune-600 text-white' : 'text-loam-600 hover:text-prune-700')}>
                      <Icon className="h-4 w-4" aria-hidden />{t(`documents.markdown.${m}`)}
                    </button>
                  )
                })}
              </div>
            )}
            <Button variant="secondary" size="sm" onClick={() => void exportPdf()} aria-label={t('documents.markdown.pdf')} title={t('documents.markdown.pdf')}>
              <FileDown className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">{t('documents.markdown.pdf')}</span>
            </Button>
            <a href={doc.downloadUrl} title={t('documents.markdown.download')} aria-label={t('documents.markdown.download')}
              className="grid h-9 w-9 place-items-center rounded-full text-loam-600 hover:bg-white/70 hover:text-prune-700">
              <Download className="h-4 w-4" aria-hidden />
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-8 px-0 py-0 sm:px-4 sm:py-8 xl:grid-cols-[13rem_minmax(0,1fr)] print:block print:p-0">
        <div className="hidden xl:block print:hidden">{mode === 'read' && <Contents root={page} version={`${text}${version}`} />}</div>
        <article className="mx-auto w-full max-w-3xl bg-[#fffdf8] px-5 py-8 shadow-[0_1px_2px_rgba(60,40,20,0.08),0_12px_40px_-12px_rgba(60,40,20,0.18)] ring-1 ring-loam-900/5 sm:rounded-2xl sm:px-12 sm:py-12 print:max-w-none print:rounded-none print:bg-white print:p-0 print:shadow-none print:ring-0">
          <Letterhead letterhead={letterhead} mapName={map.name} />

          {mode === 'edit' && (
            <label className="mb-8 block print:hidden">
              <span className="text-sm text-loam-500">{t('documents.markdown.title_label')}</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => void saveTitle()} maxLength={200}
                className="mt-1 block w-full rounded-lg border-loam-200 bg-white/60 px-3 py-1.5 text-base text-loam-800 focus:border-prune-500 focus:ring-prune-500" />
            </label>
          )}
          {showTitle && <h1 className={clsx('mb-6 font-serif text-4xl text-loam-900', mode === 'edit' && 'hidden print:block')}>{doc.title}</h1>}

          {conflict && (
            <div role="alert" className="mb-6 rounded-xl bg-humus-50 px-4 py-3 text-sm text-humus-900 ring-1 ring-humus-200 print:hidden">
              <p className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{conflict.message}</p>
              <textarea readOnly value={conflict.mine} rows={6} className="mt-3 w-full rounded-lg border-humus-200 bg-white font-mono text-sm" />
              <Button size="sm" variant="ghost" className="mt-2" onClick={dismissConflict}>{t('common.close')}</Button>
            </div>
          )}

          {!canEdit && mode === 'read' && empty ? null : (
            <div ref={setPage}>
              <MarkdownEditor key={mode} content={text} editable={mode === 'edit'} onChange={onChange} autofocus={fresh} />
            </div>
          )}
          {mode === 'read' && empty && (
            <p className="text-loam-500 print:hidden">{canEdit ? t('documents.markdown.empty_read_editor') : t('documents.markdown.empty_read')}</p>
          )}
          {edited && <p className="mt-12 border-t border-dashed border-loam-300 pt-3 text-sm text-loam-500 print:hidden">{edited}</p>}
          {!canEdit && <p className="mt-6 rounded-lg bg-loam-100 px-3 py-2 text-sm text-loam-600 print:hidden">{t('documents.markdown.read_only')}</p>}
        </article>
      </div>
    </div>
  )
}

function SaveBadge({ status }: { status: SaveStatus }) {
  const map = {
    saved: { icon: Check, label: t('documents.markdown.saved'), className: 'text-leaf-700' },
    dirty: { icon: PenLine, label: t('documents.markdown.unsaved'), className: 'text-loam-500' },
    saving: { icon: Loader2, label: t('documents.markdown.saving'), className: 'text-loam-500 [&>svg]:animate-spin' },
    error: { icon: CloudOff, label: t('documents.markdown.offline'), className: 'text-clay-700' },
  }[status]
  const Icon = map.icon
  return (
    <span role="status" className={clsx('inline-flex max-w-[16rem] items-center gap-1.5 text-sm', map.className)}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden /><span className={status === 'error' ? '' : 'hidden sm:inline'}>{map.label}</span>
    </span>
  )
}
