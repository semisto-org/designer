import clsx from 'clsx'
import { Camera, MapPin, Pencil, Trash2 } from 'lucide-react'
import { Fragment, useMemo } from 'react'
import { ChipButton } from '@/components/ui/ChipButton'
import { IconButton } from '@/components/ui/IconButton'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { LAYER_COLORS } from '@/map/layers/features'
import { photoUrl } from '@/map/photos/format'
import { photoActions } from '@/map/photos/store'
import type { CommentData, Mentionable } from '@/types/collab'
import { Avatar } from '../Avatar'
import { geometryCenter } from '../geometry'
import { timeAgo } from '../time'
import { ChatComposer, type ChatDraft } from './ChatComposer'
import { tokenizeChat } from './cite'
import { chatActions } from './chatStore'

const PHONE = '(max-width: 767px)'

/** Shows an element of the map from a message; on a phone the discussion steps aside. */
export function useShowOnMap() {
  const editor = useEditor()
  return {
    feature(id: number) {
      const feature = editor.features.find((f) => f.properties.id === id)
      if (!feature) return editor.notify(t('collab.chat.feature_gone'))
      editor.select(id)
      const center = geometryCenter(feature.geometry)
      if (center) editor.instance.easeTo({ center, zoom: Math.max(editor.instance.getZoom(), 18), duration: 600 })
      if (window.matchMedia(PHONE).matches) chatActions.setOpen(false)
    },
    place(location: [number, number]) {
      editor.instance.easeTo({ center: location, zoom: Math.max(editor.instance.getZoom(), 18), duration: 600 })
      if (window.matchMedia(PHONE).matches) chatActions.setOpen(false)
    },
  }
}

export function ChatMessage({ comment, members, highlighted, editing, busy, onEdit, onCancelEdit, onSave, onRemove, onApplaud }: {
  comment: CommentData
  members: Mentionable[]
  highlighted: boolean
  editing: boolean
  busy: boolean
  onEdit: () => void
  onCancelEdit: () => void
  onSave: (draft: ChatDraft) => Promise<void>
  onRemove: () => void
  onApplaud: () => void
}) {
  const editor = useEditor()
  const show = useShowOnMap()
  const features = comment.features ?? []
  const tokens = useMemo(
    () => tokenizeChat(comment.body, comment.mentions.map((m) => m.handle), features),
    [comment.body, comment.mentions, features],
  )
  const inline = new Set(tokens.flatMap((token) => (token.kind === 'feature' ? [token.id] : [])))
  const others = features.filter((f) => !inline.has(f.id))

  return (
    <article className={clsx('flex gap-2 rounded-lg transition-colors duration-700', highlighted && 'bg-humus-50 ring-4 ring-humus-50')}>
      <Avatar name={comment.author.name} url={comment.author.avatarUrl} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-loam-500">
          <span className="font-medium text-loam-900">{comment.author.name}</span>
          <time dateTime={comment.createdAt} title={new Date(comment.createdAt).toLocaleString('fr-BE')}>{timeAgo(comment.createdAt)}</time>
          {comment.editedAt && <span>{t('collab.comments.edited')}</span>}
        </p>
        {editing ? (
          <div className="mt-1">
            <ChatComposer
              members={members}
              initial={comment.body}
              initialFeatures={features}
              autoFocus
              busy={busy}
              submitLabel={t('common.save')}
              editOnly
              onSubmit={onSave}
              onCancel={onCancelEdit}
            />
          </div>
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm text-loam-800">
            {tokens.map((token, i) => (
              <Fragment key={i}>
                {token.kind === 'mention' && <span className="rounded bg-prune-50 px-0.5 font-medium text-prune-700">{token.value}</span>}
                {token.kind === 'feature' && (
                  <ChipButton inline tone="leaf" onClick={() => show.feature(token.id)} title={t('collab.chat.show_feature', { name: token.value.slice(1) })}>
                    {token.value}
                  </ChipButton>
                )}
                {token.kind === 'link' && (
                  <a href={token.value} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-prune-600 underline underline-offset-2">{token.value}</a>
                )}
                {token.kind === 'text' && token.value}
              </Fragment>
            ))}
          </p>
        )}

        {(others.length > 0 || comment.location || comment.photo) && !editing && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {others.map((feature) => (
              <ChipButton
                key={feature.id}
                onClick={() => show.feature(feature.id)}
                title={t('collab.chat.show_feature', { name: feature.name })}
                icon={<span className="h-2.5 w-2.5 rounded-full" style={{ background: LAYER_COLORS[feature.layer] ?? 'var(--color-loam-500)' }} />}
              >
                {feature.name}
              </ChipButton>
            ))}
            {comment.location && (
              <ChipButton tone="prune" icon={<MapPin />} onClick={() => show.place(comment.location as [number, number])}>
                {t('collab.chat.show_place')}
              </ChipButton>
            )}
          </div>
        )}
        {comment.photo && !editing && (
          <a
            href={photoUrl(editor.map.id, comment.photo.id, 'large')}
            onClick={(event) => { event.preventDefault(); photoActions.open(comment.photo!.id) }}
            className="mt-2 block w-fit overflow-hidden rounded-lg ring-1 ring-loam-200 hover:ring-prune-300"
            aria-label={comment.photo.caption ?? t('collab.chat.photo')}
          >
            {comment.photo.video ? (
              <span className="flex h-24 w-40 items-center justify-center bg-loam-100 text-loam-500"><Camera className="h-6 w-6" /></span>
            ) : (
              <img src={photoUrl(editor.map.id, comment.photo.id, 'thumb')} alt={comment.photo.caption ?? ''} className="h-32 w-auto max-w-full object-cover" loading="lazy" />
            )}
          </a>
        )}

        {!editing && (
          <div className="mt-1 flex items-center gap-1 text-sm text-loam-500">
            <ChipButton
              onClick={onApplaud}
              pressed={comment.applause.mine}
              aria-label={t(comment.applause.mine ? 'collab.comments.unapplaud' : 'collab.comments.applaud')}
              title={comment.applause.names.length ? comment.applause.names.join(', ') : t('collab.comments.applaud')}
              className={clsx('!py-0.5', !comment.applause.mine && '!bg-transparent !ring-0 hover:!bg-humus-50')}
            >
              <span aria-hidden="true">👏</span>
              {comment.applause.count > 0 && <span>{comment.applause.count}</span>}
            </ChipButton>
            {comment.canEdit && <IconButton size="sm" label={t('common.edit')} onClick={onEdit}><Pencil /></IconButton>}
            {comment.canDelete && <IconButton size="sm" tone="danger" label={t('common.delete')} onClick={onRemove}><Trash2 /></IconButton>}
          </div>
        )}
      </div>
    </article>
  )
}
