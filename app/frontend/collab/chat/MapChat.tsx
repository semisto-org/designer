import { usePage } from '@inertiajs/react'
import { ImagePlus, Users, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { IconButton } from '@/components/ui/IconButton'
import { toast } from '@/components/ui/toast'
import { confirmAction } from '@/components/ui/confirm'
import { api, ApiError } from '@/lib/api'
import { cable } from '@/lib/cable'
import { t } from '@/lib/i18n'
import { useFileDrag } from '@/lib/useFileDrag'
import { useEditor } from '@/map/editor/EditorContext'
import { ZoneCard } from '@/map/layout/ZoneLayer'
import { PRIORITY } from '@/map/layout/zones'
import type { SharedProps } from '@/types'
import type { ChatLevel, CommentData, ThreadData } from '@/types/collab'
import { refreshThreads, useThreads } from '../threadsStore'
import { ChatComposer, type ChatComposerHandle, type ChatDraft } from './ChatComposer'
import { ChatMessage } from './ChatMessage'
import { ChatNotifyMenu } from './ChatNotifyMenu'
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
  const composer = useRef<ChatComposerHandle>(null)
  const openRef = useRef(chat.open)
  openRef.current = chat.open
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

  // Read only when someone can see it: a tab left open with the discussion
  // showing must not swallow the messages (they would never ring nor be
  // e-mailed, Chris's to Michael on 2026-11-03). Hidden, the tab waits and
  // marks them read when it shows again.
  const pendingRead = useRef(false)
  const markRead = useCallback(() => {
    if (document.visibilityState !== 'visible') {
      pendingRead.current = true
      return
    }
    pendingRead.current = false
    void api(`${base}/read`, { method: 'POST', body: { commentable_type: 'Map', commentable_id: mapId } })
      .then(() => refreshThreads(mapId))
      .catch(() => undefined)
  }, [base, mapId])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && pendingRead.current && openRef.current) markRead()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [markRead])

  // Loaded the first time it shows (opening it marks it read, unless the tab
  // is hidden: it is then read when it shows).
  const load = useCallback(async () => {
    try {
      const hidden = document.visibilityState !== 'visible'
      const data = await api<ThreadData>(`${base}?commentable_type=Map&commentable_id=${mapId}${hidden ? '&peek=1' : ''}`)
      if (hidden) pendingRead.current = true
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

  const fail = (error: unknown) => editor.notify(error instanceof ApiError ? error.message : t('collab.network_error'), 'error')

  async function post(draft: ChatDraft) {
    setBusy(true)
    try {
      const comment = await api<CommentData>(base, {
        method: 'POST',
        body: { comment: { commentable_type: 'Map', commentable_id: mapId, body: draft.body, feature_ids: draft.featureIds, lng: draft.location?.[0], lat: draft.location?.[1], map_photo_id: draft.photoId, map_document_id: draft.documentId } },
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

  async function changeLevel(level: ChatLevel) {
    try {
      const result = await api<{ level: ChatLevel; subscribed: boolean }>(`${base}/subscribe`, { method: 'PATCH', body: { commentable_type: 'Map', commentable_id: mapId, level } })
      setThread((current) => current && { ...current, level: result.level, subscribed: result.subscribed })
      toast(t('collab.chat.notify.saved', { level: t(`collab.chat.notify.${result.level}`) }), { tone: 'success' })
    } catch (error) {
      fail(error)
    }
  }

  const replace = (updated: CommentData) =>
    setThread((current) => current && { ...current, comments: current.comments.map((c) => (c.id === updated.id ? updated : c)) })

  // A picture or any file dragged from the computer can be dropped anywhere on the panel.
  const fileDrag = useFileDrag(member && chat.open && !chat.picking && editor.canEdit)
  if (!member) return null

  const comments = thread?.comments ?? []
  const shown = chat.open && !chat.picking
  return (
    <>
      {(chat.open || chat.picking) && <ChatPins comments={comments} />}
      {/* Mounted once opened, then only hidden: the scroll, the draft and the photo being sent survive. */}
      {(thread || chat.open) && (
        // The right zone from md up, a sheet on a phone; it waits while an element's sheet is open (map/layout/zones).
        <ZoneCard id="chat" zone={{ desktop: 'right', phone: 'sheet' }} priority={PRIORITY.chat} active={shown} passThrough className="h-full justify-end">
        <aside
          aria-label={t('collab.chat.title')}
          data-private
          className="pointer-events-auto relative flex h-[70%] min-h-0 flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl ring-1 ring-loam-200 md:h-full md:w-96 md:rounded-xl"
          onDragOver={(e) => {
            if (!fileDrag || !composer.current?.canAttach) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
          }}
          onDrop={(e) => {
            if (!fileDrag) return
            e.preventDefault()
            if (!composer.current?.attachFiles(e.dataTransfer.files)) editor.notify(t('collab.chat.drop_busy'), 'error')
          }}
        >
          {fileDrag && composer.current?.canAttach && (
            <div aria-hidden className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-prune-400 bg-prune-50/90 p-6 text-center text-sm font-medium text-prune-800">
              <ImagePlus className="h-6 w-6" />
              {t('collab.chat.drop')}
            </div>
          )}
          <header className="flex items-start gap-2 border-b border-loam-100 px-4 py-3">
            <div className="min-w-0 flex-1">
              <h2 className="font-serif text-lg leading-tight text-loam-900">{t('collab.chat.title')}</h2>
              <p className="mt-0.5 flex items-center gap-1 text-sm text-loam-500" title={t('collab.chat.who')}>
                <Users className="h-4 w-4 shrink-0" />
                {t('collab.chat.members', { count: (thread?.members.length ?? 0) + 1 })}
              </p>
            </div>
            {thread && (
              <ChatNotifyMenu level={thread.level ?? (thread.subscribed ? 'all' : 'mentions')} onChange={(level) => void changeLevel(level)} />
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
            <ChatComposer ref={composer} members={thread?.members ?? []} busy={busy} onSubmit={post} />
          </div>
        </aside>
        </ZoneCard>
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
