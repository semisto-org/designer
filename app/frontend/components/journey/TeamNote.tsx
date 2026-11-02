import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import clsx from 'clsx'
import { Bold, Check, CircleAlert, Italic, List, ListChecks, ListOrdered, LoaderCircle, Lock, type LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { HandNote } from '@/components/ui/HandNote'
import { IconButton } from '@/components/ui/IconButton'
import { api, ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import { relativeTime } from '@/lib/relativeTime'
import type { TeamNotesApi } from '@/lib/teamNotes'
import type { TeamNote as TeamNoteData } from '@/types/journey'

const DEBOUNCE_MS = 900
const MAX_LENGTH = 20_000

type Status = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'
type Conflict = { theirs: TeamNoteData | null }

const PROSE = clsx(
  'markdown-page prose prose-sm max-w-none text-loam-800 outline-none',
  'prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5',
  'prose-a:text-prune-700 prose-a:underline-offset-2 prose-strong:text-loam-900',
)

// A few tools only: a note is written fast, often on a phone, on site.
const TOOLS: { key: string; icon: LucideIcon; run: (e: Editor) => void; active: (e: Editor) => boolean }[] = [
  { key: 'bold', icon: Bold, run: (e) => e.chain().focus().toggleBold().run(), active: (e) => e.isActive('bold') },
  { key: 'italic', icon: Italic, run: (e) => e.chain().focus().toggleItalic().run(), active: (e) => e.isActive('italic') },
  { key: 'bullet_list', icon: List, run: (e) => e.chain().focus().toggleBulletList().run(), active: (e) => e.isActive('bulletList') },
  { key: 'ordered_list', icon: ListOrdered, run: (e) => e.chain().focus().toggleOrderedList().run(), active: (e) => e.isActive('orderedList') },
  { key: 'task_list', icon: ListChecks, run: (e) => e.chain().focus().toggleTaskList().run(), active: (e) => e.isActive('taskList') },
]

function Toolbar({ editor }: { editor: Editor }) {
  const active = useEditorState({ editor, selector: ({ editor: e }) => TOOLS.map((tool) => tool.active(e)) })
  return (
    <div role="toolbar" aria-label={t('documents.markdown.toolbar.label')} className="flex flex-wrap items-center gap-0.5">
      {TOOLS.map((tool, i) => {
        const Icon = tool.icon
        return (
          <IconButton
            key={tool.key} size="sm" label={t(`documents.markdown.toolbar.${tool.key}`)} pressed={active[i]}
            onMouseDown={(e) => e.preventDefault()} onClick={() => tool.run(editor)}
          >
            <Icon aria-hidden />
          </IconButton>
        )
      })}
    </div>
  )
}

/**
 * The team's own note at the bottom of a section of the sheet: a small rich
 * text editor (stored as Markdown), autosaved. Only the map's team, or its
 * pro owner, ever receives it. Someone else saving the same note meanwhile
 * is caught (409): the writer chooses whose text stays.
 */
export function TeamNote({ notes, section }: { notes: TeamNotesApi; section: string }) {
  const saved = notes.notes[section] ?? null
  const [meta, setMeta] = useState<TeamNoteData | null>(saved)
  const [status, setStatus] = useState<Status>('idle')
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const [tooLong, setTooLong] = useState(false)
  const version = useRef<number | null>(saved?.lockVersion ?? null)
  const body = useRef(saved?.body ?? '')
  const lastSaved = useRef(saved?.body ?? '')
  const timer = useRef<number | undefined>(undefined)
  const inflight = useRef(false)
  const alive = useRef(true)
  const store = useRef(notes.setNote)
  store.current = notes.setNote

  const save = useCallback(async () => {
    window.clearTimeout(timer.current)
    if (inflight.current) return
    const text = body.current
    if (text.trim() === lastSaved.current.trim()) { if (alive.current) setStatus((s) => (s === 'dirty' ? 'saved' : s)); return }
    if (text.length > MAX_LENGTH) { if (alive.current) setTooLong(true); return }
    inflight.current = true
    if (alive.current) { setStatus('saving'); setTooLong(false) }
    try {
      const result = await api<{ note: TeamNoteData | null }>(`${notes.endpoint}/${section}`, {
        method: 'PATCH', body: { body: text, lock_version: version.current },
      })
      version.current = result.note?.lockVersion ?? null
      lastSaved.current = result.note?.body ?? ''
      store.current(section, result.note)
      if (!alive.current) return
      setMeta(result.note)
      setStatus(body.current === text ? 'saved' : 'dirty')
    } catch (error) {
      if (!alive.current) return
      if (error instanceof ApiError && error.status === 409) {
        setConflict({ theirs: (error.data.note as TeamNoteData | null) ?? null })
        setStatus('idle')
      } else {
        setStatus('error')
      }
    } finally {
      inflight.current = false
    }
    if (alive.current && body.current !== text && !conflictRef.current) timer.current = window.setTimeout(save, DEBOUNCE_MS)
  }, [notes.endpoint, section])

  const conflictRef = useRef<Conflict | null>(null)
  conflictRef.current = conflict

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false, code: false, codeBlock: false, blockquote: false, horizontalRule: false, underline: false,
        link: { openOnClick: !notes.canEdit, autolink: true, HTMLAttributes: { rel: 'noopener', target: '_blank' } },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: t('journey.project.team_notes.placeholder') }),
      Markdown,
    ],
    content: saved?.body ?? '',
    contentType: 'markdown',
    editable: notes.canEdit,
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        lang: 'fr', class: clsx(PROSE, notes.canEdit && 'min-h-24'),
        'aria-label': t(notes.teamName ? 'journey.project.team_notes.title_team' : 'journey.project.team_notes.title_pro'),
      },
    },
    onUpdate: ({ editor: e }) => {
      body.current = e.getMarkdown()
      setStatus('dirty')
      window.clearTimeout(timer.current)
      if (!conflictRef.current) timer.current = window.setTimeout(save, DEBOUNCE_MS)
    },
  }, [section])

  // Leaving the section or the page sends what is still waiting.
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      if (body.current !== lastSaved.current && !conflictRef.current) void save()
    }
  }, [save])

  function keepMine() {
    version.current = conflict?.theirs?.lockVersion ?? null
    setConflict(null)
    conflictRef.current = null
    void save()
  }

  function takeTheirs() {
    const theirs = conflict?.theirs ?? null
    version.current = theirs?.lockVersion ?? null
    lastSaved.current = theirs?.body ?? ''
    body.current = lastSaved.current
    editor?.commands.setContent(lastSaved.current, { contentType: 'markdown', emitUpdate: false })
    store.current(section, theirs)
    setMeta(theirs)
    setConflict(null)
    conflictRef.current = null
    setStatus('saved')
  }

  if (!notes.canEdit && !saved) return null
  const team = notes.teamName
  const theirName = conflict?.theirs?.updatedBy

  return (
    <section className="mt-8 rounded-2xl border border-dashed border-prune-200 bg-prune-50/40 p-4 sm:p-5" aria-labelledby={`team-note-${section}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h3 id={`team-note-${section}`} className="flex items-center gap-1.5 text-sm font-semibold text-prune-900">
            <Lock className="h-4 w-4 shrink-0" aria-hidden />
            {team ? t('journey.project.team_notes.title_team') : t('journey.project.team_notes.title_pro')}
          </h3>
          <p className="mt-0.5 text-sm text-loam-600">
            {team ? t('journey.project.team_notes.hint_team', { team }) : t('journey.project.team_notes.hint_pro')}
          </p>
        </div>
        <span className="hidden sm:block"><HandNote tone="prune" className="text-lg">{t('journey.project.team_notes.aside')}</HandNote></span>
      </div>

      {editor && (
        <div className={clsx('mt-3', notes.canEdit && 'rounded-xl bg-white px-3 pb-2 pt-1 ring-1 ring-loam-200 focus-within:ring-prune-300')}>
          {notes.canEdit && <div className="-mx-1 border-b border-loam-100 pb-1"><Toolbar editor={editor} /></div>}
          <div className={notes.canEdit ? 'pt-2' : undefined}><EditorContent editor={editor} /></div>
        </div>
      )}

      {conflict && (
        <div role="alert" className="mt-3 rounded-xl bg-humus-50 p-3 text-sm text-humus-900 ring-1 ring-humus-200">
          <p>{theirName ? t('journey.project.team_notes.conflict_by', { who: theirName }) : t('journey.project.team_notes.conflict')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={keepMine}>{t('journey.project.team_notes.keep_mine')}</Button>
            <Button size="sm" variant="ghost" onClick={takeTheirs}>{t('journey.project.team_notes.take_theirs')}</Button>
          </div>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-loam-500">
        <span>
          {meta?.updatedAt && (meta.updatedBy
            ? t('journey.project.team_notes.updated', { when: relativeTime(meta.updatedAt), who: meta.updatedBy })
            : t('journey.project.team_notes.updated_anonymous', { when: relativeTime(meta.updatedAt) }))}
        </span>
        {notes.canEdit ? (
          <span aria-live="polite" className="flex items-center gap-1.5">
            {status === 'saving' && <><LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />{t('journey.project.saving')}</>}
            {status === 'dirty' && t('journey.project.unsaved')}
            {status === 'saved' && <><Check className="h-3.5 w-3.5 text-leaf-600" aria-hidden />{t('journey.project.saved')}</>}
            {status === 'error' && (
              <span className="flex flex-wrap items-center gap-1.5 text-clay-600">
                <CircleAlert className="h-3.5 w-3.5" aria-hidden />{t('journey.project.error')}
                <Button size="sm" variant="ghost" onClick={() => void save()}>{t('journey.project.retry')}</Button>
              </span>
            )}
            {tooLong && <span className="text-clay-600">{t('journey.project.team_notes.too_long', { max: MAX_LENGTH.toLocaleString('fr-BE') })}</span>}
          </span>
        ) : (
          <span>{t('journey.project.team_notes.read_only')}</span>
        )}
      </div>
    </section>
  )
}
