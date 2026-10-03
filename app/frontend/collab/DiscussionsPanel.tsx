import { ArrowLeft, MessageSquare } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { LAYER_COLORS } from '@/map/layers/features'
import { CommentThread } from './CommentThread'
import { geometryCenter } from './geometry'
import { clearGeneralDiscussionRequest, peekGeneralDiscussionRequest, setCommentEmails, useThreads } from './threadsStore'
import { timeAgo } from './time'

/** "Discussions": every thread of the map, newest first; a click opens the element. */
export default function DiscussionsPanel() {
  const editor = useEditor()
  const { threads, commentEmails, loaded } = useThreads(editor.map.id)
  const [general, setGeneral] = useState(peekGeneralDiscussionRequest)
  useEffect(clearGeneralDiscussionRequest, [])

  const mapThread = threads.find((thread) => thread.type === 'Map')
  const elementThreads = threads.filter((thread) => thread.type === 'MapFeature' && thread.count > 0)

  function open(featureId: number) {
    const feature = editor.features.find((f) => f.properties.id === featureId)
    if (!feature) return
    editor.select(featureId)
    const center = geometryCenter(feature.geometry)
    if (center && !editor.instance.getBounds().contains(center)) editor.instance.easeTo({ center, duration: 600 })
    if (window.matchMedia('(max-width: 767px)').matches) editor.openPanel(null)
  }

  async function toggleEmails(enabled: boolean) {
    setCommentEmails(enabled)
    try {
      await api('/comment_preference', { method: 'PATCH', body: { comment_emails: enabled } })
    } catch (error) {
      setCommentEmails(!enabled)
      editor.notify((error as Error).message, 'error')
    }
  }

  if (general) {
    return (
      <div className="space-y-3">
        <button type="button" onClick={() => setGeneral(false)} className="inline-flex items-center gap-1.5 text-sm text-loam-600 hover:text-loam-900">
          <ArrowLeft className="h-4 w-4" />
          {t('collab.discussions.back')}
        </button>
        <h3 className="text-sm font-semibold text-loam-900">{t('collab.discussions.general')}</h3>
        <CommentThread type="Map" id={editor.map.id} emptyHint={t('collab.discussions.general_empty')} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-loam-600">{t('collab.discussions.intro')}</p>

      <button
        type="button"
        onClick={() => setGeneral(true)}
        className="flex w-full items-start gap-2 rounded-lg bg-prune-50 p-3 text-left hover:bg-prune-100"
      >
        <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-prune-600" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2 text-sm font-medium text-prune-900">
            {t('collab.discussions.general')}
            <Count count={mapThread?.count ?? 0} unread={mapThread?.unread ?? false} />
          </span>
          <span className="block truncate text-xs text-loam-500">
            {mapThread?.preview ? `${mapThread.lastAuthorName} : ${mapThread.preview}` : t('collab.discussions.general_hint')}
          </span>
        </span>
      </button>

      <section aria-label={t('collab.discussions.elements')}>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-loam-500">{t('collab.discussions.elements')}</h3>
        {!loaded ? (
          <p className="text-sm text-loam-400">{t('common.loading')}</p>
        ) : elementThreads.length === 0 ? (
          <p className="text-sm text-loam-500">{t('collab.discussions.empty')}</p>
        ) : (
          <ul className="divide-y divide-loam-100">
            {elementThreads.map((thread) => {
              const exists = editor.features.some((f) => f.properties.id === thread.id)
              return (
                <li key={thread.key}>
                  <button
                    type="button"
                    disabled={!exists}
                    onClick={() => open(thread.id)}
                    className={'flex w-full items-start gap-2 px-1 py-2 text-left hover:bg-loam-50 disabled:opacity-60 ' + (editor.selectedId === thread.id ? 'bg-loam-50' : '')}
                  >
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: LAYER_COLORS[thread.layer ?? ''] ?? '#6e6355' }} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2 text-sm text-loam-800">
                        <span className={'truncate ' + (thread.unread ? 'font-semibold' : '')}>{thread.title}</span>
                        <Count count={thread.count} unread={thread.unread} />
                      </span>
                      <span className="block truncate text-xs text-loam-500">{thread.lastAuthorName} : {thread.preview}</span>
                      {thread.lastCommentAt && <span className="block text-[11px] text-loam-400">{timeAgo(thread.lastCommentAt)}</span>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <label className="flex items-start gap-2 border-t border-loam-100 pt-3 text-sm text-loam-700">
        <input type="checkbox" checked={commentEmails} onChange={(e) => void toggleEmails(e.target.checked)} className="mt-0.5 rounded border-loam-300 text-prune-600" />
        <span>
          {t('collab.discussions.emails')}
          <span className="block text-xs text-loam-400">{t('collab.discussions.emails_hint')}</span>
        </span>
      </label>
    </div>
  )
}

function Count({ count, unread }: { count: number; unread: boolean }) {
  if (count === 0) return null
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-loam-500">
      {unread && <span className="h-2 w-2 rounded-full bg-prune-600" role="img" aria-label={t('collab.discussions.unread')} />}
      {count}
    </span>
  )
}
