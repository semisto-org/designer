import { Bell, BellOff, Pencil, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import type { CommentData, ThreadData, ThreadType } from '@/types/collab'
import { Avatar } from './Avatar'
import { CommentBody } from './CommentBody'
import { CommentComposer } from './CommentComposer'
import { refreshThreads } from './threadsStore'
import { timeAgo } from './time'

/**
 * One discussion thread: comments, applause, follow toggle and a composer.
 * Used in the inspector (a feature) and in the Discussions panel (the map).
 * Viewers can read and write; only the author edits; the author or the
 * owner deletes.
 */
export function CommentThread({ type, id, emptyHint }: { type: ThreadType; id: number; emptyHint?: string }) {
  const editor = useEditor()
  const mapId = editor.map.id
  const base = `/maps/${mapId}/comments`
  const query = `commentable_type=${type}&commentable_id=${id}`
  const [thread, setThread] = useState<ThreadData | null>(null)
  const [failed, setFailed] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const lastRead = useRef<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await api<ThreadData>(`${base}?${query}`)
      setThread((current) => {
        // The "new" markers compare with the time the thread was opened, kept while it stays open.
        if (!current) lastRead.current = data.lastReadAt
        return data
      })
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [base, query])

  useEffect(() => {
    setThread(null)
    setEditing(null)
    lastRead.current = null
    void load().then(() => refreshThreads(mapId))
    const timer = window.setInterval(() => { if (!document.hidden) void load() }, 30_000)
    return () => window.clearInterval(timer)
  }, [load, mapId])

  // Opening a link from an e-mail (#comment-12) scrolls to the comment.
  const loaded = thread !== null
  useEffect(() => {
    if (!loaded || !window.location.hash.startsWith('#comment-')) return
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: 'center' })
  }, [loaded])

  const fail = (error: unknown) => editor.notify(error instanceof Error ? error.message : t('collab.comments.error'), 'error')

  async function post(body: string) {
    setBusy(true)
    try {
      const comment = await api<CommentData>(base, { method: 'POST', body: { comment: { commentable_type: type, commentable_id: id, body } } })
      setThread((current) => current && { ...current, comments: [...current.comments, comment], subscribed: true })
      void refreshThreads(mapId)
    } catch (error) {
      fail(error)
      throw error
    } finally {
      setBusy(false)
    }
  }

  async function save(comment: CommentData, body: string) {
    setBusy(true)
    try {
      const updated = await api<CommentData>(`${base}/${comment.id}`, { method: 'PATCH', body: { comment: { body } } })
      replace(updated)
      setEditing(null)
    } catch (error) {
      fail(error)
    } finally {
      setBusy(false)
    }
  }

  async function remove(comment: CommentData) {
    if (!window.confirm(t('collab.comments.confirm_delete'))) return
    try {
      await api(`${base}/${comment.id}`, { method: 'DELETE' })
      setThread((current) => current && { ...current, comments: current.comments.filter((c) => c.id !== comment.id) })
      void refreshThreads(mapId)
    } catch (error) {
      fail(error)
    }
  }

  async function applaud(comment: CommentData) {
    try {
      const updated = await api<CommentData>(`${base}/${comment.id}/applause`, { method: comment.applause.mine ? 'DELETE' : 'POST' })
      replace(updated)
    } catch (error) {
      fail(error)
    }
  }

  async function toggleSubscription() {
    if (!thread) return
    const subscribed = !thread.subscribed
    try {
      await api(`${base}/subscribe`, { method: subscribed ? 'POST' : 'DELETE', body: { commentable_type: type, commentable_id: id } })
      setThread((current) => current && { ...current, subscribed })
      void refreshThreads(mapId)
    } catch (error) {
      fail(error)
    }
  }

  const replace = (updated: CommentData) =>
    setThread((current) => current && { ...current, comments: current.comments.map((c) => (c.id === updated.id ? updated : c)) })

  if (failed && !thread) return <p className="text-sm text-clay-500">{t('collab.comments.load_error')}</p>
  if (!thread) return <p className="text-sm text-loam-400">{t('common.loading')}</p>

  // "New": written by someone else since this person last opened the thread
  // (their own comments are the ones they can edit).
  const isNew = (c: CommentData) => lastRead.current != null && !c.canEdit && new Date(c.createdAt) > new Date(lastRead.current)

  return (
    <div className="space-y-3">
      {thread.comments.length === 0 ? (
        <p className="text-sm text-loam-500">{emptyHint ?? t('collab.comments.empty')}</p>
      ) : (
        <ol className="space-y-3">
          {thread.comments.map((comment) => (
            <li key={comment.id} id={`comment-${comment.id}`} className="flex gap-2">
              <Avatar name={comment.author.name} url={comment.author.avatarUrl} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-loam-500">
                  <span className="font-medium text-loam-800">{comment.author.name}</span>
                  <time dateTime={comment.createdAt} title={new Date(comment.createdAt).toLocaleString('fr-BE')}>{timeAgo(comment.createdAt)}</time>
                  {comment.editedAt && <span>{t('collab.comments.edited')}</span>}
                  {isNew(comment) && <span className="rounded bg-prune-600 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-white">{t('collab.comments.new')}</span>}
                </div>
                {editing === comment.id ? (
                  <div className="mt-1">
                    <CommentComposer
                      members={thread.members}
                      initial={comment.body}
                      autoFocus
                      busy={busy}
                      submitLabel={t('common.save')}
                      onSubmit={(body) => save(comment, body)}
                      onCancel={() => setEditing(null)}
                    />
                  </div>
                ) : (
                  <CommentBody body={comment.body} mentions={comment.mentions} />
                )}
                {editing !== comment.id && (
                  <div className="mt-1 flex items-center gap-1 text-xs text-loam-500">
                    <button
                      type="button"
                      onClick={() => void applaud(comment)}
                      aria-pressed={comment.applause.mine}
                      aria-label={t(comment.applause.mine ? 'collab.comments.unapplaud' : 'collab.comments.applaud')}
                      title={comment.applause.names.length ? comment.applause.names.join(', ') : t('collab.comments.applaud')}
                      className={'inline-flex items-center gap-1 rounded-full px-2 py-1 hover:bg-humus-50 ' + (comment.applause.mine ? 'bg-humus-100 text-humus-700' : '')}
                    >
                      <span aria-hidden="true">👏</span>
                      {comment.applause.count > 0 && <span>{comment.applause.count}</span>}
                    </button>
                    {comment.canEdit && (
                      <button type="button" onClick={() => setEditing(comment.id)} className="rounded p-1.5 hover:bg-loam-100" aria-label={t('common.edit')} title={t('common.edit')}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {comment.canDelete && (
                      <button type="button" onClick={() => void remove(comment)} className="rounded p-1.5 hover:bg-loam-100 hover:text-clay-500" aria-label={t('common.delete')} title={t('common.delete')}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      <CommentComposer members={thread.members} busy={busy} onSubmit={post} />
      <button
        type="button"
        onClick={() => void toggleSubscription()}
        aria-pressed={thread.subscribed}
        className="inline-flex items-center gap-1.5 text-xs text-loam-500 hover:text-loam-800"
      >
        {thread.subscribed ? <Bell className="h-3.5 w-3.5 text-prune-600" /> : <BellOff className="h-3.5 w-3.5" />}
        {thread.subscribed ? t('collab.comments.following') : t('collab.comments.follow')}
      </button>
    </div>
  )
}

