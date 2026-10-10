import { usePage } from '@inertiajs/react'
import clsx from 'clsx'
import { ThumbsUp } from 'lucide-react'
import { useState } from 'react'
import { Avatar } from '@/collab/Avatar'
import { Dialog } from '@/components/ui/Dialog'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import type { SharedProps } from '@/types'
import type { ReleaseNoteLikes } from '@/types/releaseNotes'
import { likersSummary } from './format'

const STACK_MAX = 8

/**
 * The thumbs up of an entry and everyone who gave one: the button, the
 * stacked faces (the viewer's lands at the end, in the order of arrival)
 * and « Aimé par toi, Alice et 3 autres », which opens the full list.
 * The change shows at once and is set right by the server's answer.
 */
export function LikeBar({ noteId, title, value, onChange, preview = false }: {
  noteId: number
  title: string
  value: ReleaseNoteLikes
  onChange: (value: ReleaseNoteLikes) => void
  /** In the staff preview: drawn, not clickable. */
  preview?: boolean
}) {
  const { currentUser } = usePage().props as unknown as SharedProps
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const { likes, likesCount, liked } = value

  async function toggle() {
    if (busy || preview || !currentUser) return
    const before = value
    const me = { id: currentUser.id, name: currentUser.name, avatarUrl: currentUser.avatarUrl }
    onChange(liked
      ? { likes: likes.filter((liker) => liker.id !== me.id), likesCount: Math.max(0, likesCount - 1), liked: false }
      : { likes: [...likes, me], likesCount: likesCount + 1, liked: true })
    setBusy(true)
    setError(false)
    try {
      onChange(await api<ReleaseNoteLikes>(`/nouveautes/${noteId}/like`, { method: liked ? 'DELETE' : 'POST' }))
    } catch {
      onChange(before)
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  const summary = likersSummary(likes, likesCount, liked, currentUser?.id)
  const shown = likes.slice(0, STACK_MAX)
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={liked}
        disabled={preview}
        title={liked ? t('release_notes.like.remove') : undefined}
        className={clsx(
          'group inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors duration-200 active:scale-[0.97]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-prune-600',
          liked ? 'bg-leaf-600 text-white hover:bg-leaf-700' : 'bg-white text-leaf-700 ring-[1.5px] ring-inset ring-leaf-500 hover:bg-leaf-50',
        )}
      >
        <ThumbsUp
          aria-hidden
          className={clsx('h-4 w-4 transition-transform duration-300 ease-out motion-reduce:transition-none', liked ? 'fill-current -rotate-12 scale-110' : 'group-hover:-rotate-12')}
        />
        {liked ? t('release_notes.like.liked') : t('release_notes.like.action')}
        {likesCount > 0 && (
          <span className={clsx('tabular-nums', liked ? 'text-leaf-100' : 'text-leaf-600')}>{likesCount}</span>
        )}
      </button>

      {likesCount > 0 ? (
        <button
          type="button"
          onClick={() => setListOpen(true)}
          className="group flex min-w-0 items-center gap-2 rounded-full py-0.5 pr-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-prune-600"
          aria-label={`${summary}. ${t('release_notes.like.see_all')}`}
        >
          <span className="flex shrink-0 -space-x-2">
            {shown.map((liker) => (
              <span key={liker.id} title={liker.name} className="rounded-full ring-2 ring-[#fffdf7]">
                <Avatar name={liker.name} url={liker.avatarUrl} className="h-7 w-7" />
              </span>
            ))}
            {likesCount > shown.length && (
              <span className="grid h-7 min-w-7 place-items-center rounded-full bg-loam-100 px-1.5 text-[11px] font-semibold text-loam-600 ring-2 ring-[#fffdf7]">
                +{likesCount - shown.length}
              </span>
            )}
          </span>
          <span className="min-w-0 text-sm text-loam-500 group-hover:text-loam-800 group-hover:underline">{summary}</span>
        </button>
      ) : (
        <span className="font-hand text-lg leading-none text-loam-400">{summary}</span>
      )}

      {error && <p role="alert" className="w-full text-sm text-clay-500">{t('release_notes.like.error')}</p>}

      <Dialog open={listOpen} onClose={() => setListOpen(false)} title={t('release_notes.like.list_title', { title })}>
        <ul className="divide-y divide-loam-100">
          {likes.map((liker) => (
            <li key={liker.id} className="flex items-center gap-3 py-2.5">
              <Avatar name={liker.name} url={liker.avatarUrl} className="h-9 w-9" />
              <span className="text-sm font-medium text-loam-800">
                {liker.name}{liker.id === currentUser?.id && <span className="font-normal text-loam-400"> · {t('release_notes.like.you')}</span>}
              </span>
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  )
}
