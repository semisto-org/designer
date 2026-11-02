import { usePage } from '@inertiajs/react'
import clsx from 'clsx'
import { Bell, BellOff, Users, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { IconButton } from '@/components/ui/IconButton'
import { confirmAction } from '@/components/ui/confirm'
import { api } from '@/lib/api'
import { cable } from '@/lib/cable'
import { t } from '@/lib/i18n'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { useEditor } from '@/map/editor/EditorContext'
import type { SharedProps } from '@/types'
import type { CommentData, ThreadData } from '@/types/collab'
import { refreshThreads, useThreads } from '../threadsStore'
import { ChatComposer, type ChatDraft } from './ChatComposer'
import { ChatMessage } from './ChatMessage'
import { ChatPins } from './ChatPins'
import { chatActions, rememberedOpen, useChat } from './chatStore'

type Broadcast = { type: 'upsert' | 'delete'; id: number }

/**
 * « Discussion de la carte »: the map's live discussion, for its members
 * (owner, editors, team, and the viewers the owner let in). A dock on the
 * right of the map from md up, a sheet over the map on a phone. Hiding it
 * keeps everything loaded and connected: showing it again is instant.
 *
 * Messages point at the map: elements cited with « # » (a click shows
 * them), a pinned spot (drawn on the map while the discussion shows) and a
 * photo taken on the spot.
 */
export default function MapChat() {
  const editor = useEditor()
  const mapId = editor.map.id
  const member = editor.map.chat === true
  const chat = useChat()
  const me = usePage<SharedProps>().props.currentUser?.id ?? null
  const [thread, setThread] = useState<ThreadData | null>(null)
  const [failed, setFailed] = useState(false)
  const [offline, setOffline] = useState(false)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const loadedRef = useRef(false)
  const openRef = useRef(chat.open)
  openRef.current = chat.open
  const wide = useMediaQuery('(min-width: 768px)')
  const { threads } = useThreads(mapId)
  const base = `/maps/${mapId}/comments`

  useEffect(() => {
    if (member) chatActions.init(mapId, rememberedOpen(mapId))
  }, [member, mapId])

  // Unread messages from before this visit (the threads list knows).
  const mapThread = threads.find((thread) => thread.type === 'Map')
  useEffect(() => {
    if (mapThread?.unread && !loadedRef.current) chatActions.markSomeUnread()
  }, [mapThread?.unread])

  const markRead = useCallback(() => {
    void api(`${base}/read`, { method: 'POST', body: { commentable_type: 'Map', commentable_id: mapId } })
      .then(() => refreshThreads(mapId))
      .catch(() => undefined)
  }, [base, mapId])

  // Loaded the first time it shows (opening it marks it read).
  const load = useCallback(async () => {
    try {
      const data = await api<ThreadData>(`${base}?commentable_type=Map&commentable_id=${mapId}`)
      setThread(data)
      loadedRef.current = true
      setFailed(false)
      void refreshThreads(mapId)
    } catch {
      setFailed(true)
    }
  }, [base, mapId])

  useEffect(() => {
    if (!member || !chat.open) return
    if (!loadedRef.current) void load()
    else markRead()
  }, [member, chat.open, load, markRead])

  // Live: told which message changed, each tab reads it with its own rights.
  useEffect(() => {
    if (!member) return
    const subscription = cable().subscriptions.create(
      { channel: 'MapChatChannel', map_id: mapId },
      {
        connected: () => {
          setOffline(false)
          // Back after a cut: catch up on what was said meanwhile.
          if (loadedRef.current) void load()
        },
        disconnected: () => setOffline(true),
        received: (message: Broadcast) => {
          if (message.type === 'delete') {
            setThread((current) => current && { ...current, comments: current.comments.filter((c) => c.id !== message.id) })
            return
          }
          void api<CommentData>(`${base}/${message.id}`).then((comment) => {
            let added = false
            setThread((current) => {
              if (!current) return current
              const exists = current.comments.some((c) => c.id === comment.id)
              added = !exists
              const comments = exists ? current.comments.map((c) => (c.id === comment.id ? comment : c)) : [...current.comments, comment]
              return { ...current, comments }
            })
            const fromOther = comment.author.id !== me
            if (!fromOther) return
            if (openRef.current) markRead()
            else if (added || !loadedRef.current) chatActions.arrived()
          }).catch(() => undefined)
        },
      },
    )
    return () => { subscription.unsubscribe() }
  }, [member, mapId, base, me, load, markRead])

  // « D » shows or hides the discussion, outside text fields and drawings.
  useEffect(() => {
    if (!member) return
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return
      if (event.key !== 'd' && event.key !== 'D') return
      const target = event.target as HTMLElement | null
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      if (editor.drawing || document.querySelector('[aria-modal="true"]')) return
      event.preventDefault()
      chatActions.toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [member, editor.drawing])

  const fail = (error: unknown) => editor.notify(error instanceof Error ? error.message : t('collab.chat.error'), 'error')

  async function post(draft: ChatDraft) {
    setBusy(true)
    try {
      const comment = await api<CommentData>(base, {
        method: 'POST',
        body: { comment: { commentable_type: 'Map', commentable_id: mapId, body: draft.body, feature_ids: draft.featureIds, lng: draft.location?.[0], lat: draft.location?.[1], map_photo_id: draft.photoId } },
      })
      setThread((current) => current && (current.comments.some((c) => c.id === comment.id) ? current : { ...current, comments: [...current.comments, comment] }))
      void refreshThreads(mapId)
    } catch (error) {
      fail(error)
      throw error
    } finally {
      setBusy(false)
    }
  }

  async function save(comment: CommentData, draft: ChatDraft) {
    setBusy(true)
    try {
      const updated = await api<CommentData>(`${base}/${comment.id}`, { method: 'PATCH', body: { comment: { body: draft.body, feature_ids: draft.featureIds } } })
      replace(updated)
      setEditing(null)
    } catch (error) {
      fail(error)
    } finally {
      setBusy(false)
    }
  }

  async function remove(comment: CommentData) {
    if (!(await confirmAction({ title: t('collab.chat.confirm_delete'), confirmLabel: t('common.delete'), tone: 'danger' }))) return
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
      replace(await api<CommentData>(`${base}/${comment.id}/applause`, { method: comment.applause.mine ? 'DELETE' : 'POST' }))
    } catch (error) {
      fail(error)
    }
  }

  async function toggleDigest() {
    if (!thread) return
    const subscribed = !thread.subscribed
    try {
      await api(`${base}/subscribe`, { method: subscribed ? 'POST' : 'DELETE', body: { commentable_type: 'Map', commentable_id: mapId } })
      setThread((current) => current && { ...current, subscribed })
    } catch (error) {
      fail(error)
    }
  }

  const replace = (updated: CommentData) =>
    setThread((current) => current && { ...current, comments: current.comments.map((c) => (c.id === updated.id ? updated : c)) })

  if (!member) return null

  const comments = thread?.comments ?? []
  const shown = chat.open && !chat.picking
  return (
    <>
      {(chat.open || chat.picking) && <ChatPins comments={comments} />}
      {/* Mounted once opened, then only hidden: the scroll, the draft and the photo being sent survive. */}
      {(thread || chat.open) && (
        <aside
          aria-label={t('collab.chat.title')}
          data-private
          className={clsx(
            'absolute z-30 flex-col overflow-hidden bg-white shadow-xl ring-1 ring-loam-200',
            shown ? 'flex' : 'hidden',
            wide ? 'bottom-2 right-2 top-2 w-96 rounded-xl' : 'inset-x-0 bottom-14 h-[70%] rounded-t-2xl',
          )}
        >
          <header className="flex items-start gap-2 border-b border-loam-100 px-4 py-3">
            <div className="min-w-0 flex-1">
              <h2 className="font-serif text-lg leading-tight text-loam-900">{t('collab.chat.title')}</h2>
              <p className="mt-0.5 flex items-center gap-1 text-sm text-loam-500" title={t('collab.chat.who')}>
                <Users className="h-4 w-4 shrink-0" />
                {t('collab.chat.members', { count: (thread?.members.length ?? 0) + 1 })}
              </p>
            </div>
            {thread && (
              <IconButton size="sm" label={t('collab.chat.digest')} pressed={thread.subscribed} onClick={() => void toggleDigest()}>
                {thread.subscribed ? <Bell /> : <BellOff />}
              </IconButton>
            )}
            <IconButton size="sm" label={`${t('collab.chat.hide')} (D)`} onClick={() => chatActions.setOpen(false)}>
              <X />
            </IconButton>
          </header>
          {offline && <p role="status" className="bg-humus-50 px-4 py-2 text-sm text-humus-800">{t('collab.chat.offline')}</p>}
          <MessageList
            thread={thread}
            failed={failed}
            busy={busy}
            editing={editing}
            setEditing={setEditing}
            onSave={save}
            onRemove={remove}
            onApplaud={applaud}
          />
          <div className="border-t border-loam-100 p-3">
            <ChatComposer members={thread?.members ?? []} busy={busy} onSubmit={post} />
          </div>
        </aside>
      )}
    </>
  )
}

function MessageList({ thread, failed, busy, editing, setEditing, onSave, onRemove, onApplaud }: {
  thread: ThreadData | null
  failed: boolean
  busy: boolean
  editing: number | null
  setEditing: (id: number | null) => void
  onSave: (comment: CommentData, draft: ChatDraft) => Promise<void>
  onRemove: (comment: CommentData) => void
  onApplaud: (comment: CommentData) => void
}) {
  const chat = useChat()
  const list = useRef<HTMLOListElement>(null)
  const stick = useRef(true)
  const count = thread?.comments.length ?? 0
  const lastRead = useRef<string | null | undefined>(undefined)
  if (thread && lastRead.current === undefined) lastRead.current = thread.lastReadAt
  const [highlight, setHighlight] = useState<number | null>(null)

  // Follows the conversation while the person is at its bottom.
  useLayoutEffect(() => {
    const el = list.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [count, chat.open])

  // A pin clicked on the map, or a link: bring that message into view.
  useEffect(() => {
    if (!chat.focusId || !thread || !chat.open) return
    const el = document.getElementById(`chat-message-${chat.focusId}`)
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      setHighlight(chat.focusId)
      window.setTimeout(() => setHighlight(null), 2500)
    }
    chatActions.clearFocus()
  }, [chat.focusId, thread, chat.open])

  if (failed && !thread) return <p className="flex-1 p-4 text-sm text-clay-700">{t('collab.comments.load_error')}</p>
  if (!thread) return <p className="flex-1 p-4 text-sm text-loam-400">{t('common.loading')}</p>

  const firstNew = thread.comments.find((c) => !c.canEdit && lastRead.current && new Date(c.createdAt) > new Date(lastRead.current))?.id
  return (
    <ol
      ref={list}
      onScroll={(e) => {
        const el = e.currentTarget
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
      }}
      className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3"
    >
      {thread.comments.length === 0 && (
        <li className="space-y-2 py-6 text-center text-sm text-loam-500">
          <p>{t('collab.chat.empty')}</p>
          <p className="text-loam-600">{t('collab.chat.empty_outdoor')}</p>
        </li>
      )}
      {thread.comments.map((comment) => (
        <li key={comment.id} id={`chat-message-${comment.id}`}>
          {comment.id === firstNew && (
            <p className="mb-2 flex items-center gap-2 text-sm font-medium text-prune-700">
              <span className="h-px flex-1 bg-prune-200" />{t('collab.chat.new_below')}<span className="h-px flex-1 bg-prune-200" />
            </p>
          )}
          <ChatMessage
            comment={comment}
            members={thread.members}
            highlighted={highlight === comment.id}
            editing={editing === comment.id}
            busy={busy}
            onEdit={() => setEditing(comment.id)}
            onCancelEdit={() => setEditing(null)}
            onSave={(draft) => onSave(comment, draft)}
            onRemove={() => onRemove(comment)}
            onApplaud={() => onApplaud(comment)}
          />
        </li>
      ))}
    </ol>
  )
}
