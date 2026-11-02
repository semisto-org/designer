import clsx from 'clsx'
import { Camera, Crosshair, LocateFixed, Paperclip, Send, X } from 'lucide-react'
import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { ChipButton } from '@/components/ui/ChipButton'
import { inputClass } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { Tooltip } from '@/components/ui/Tooltip'
import { t } from '@/lib/i18n'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { useEditor } from '@/map/editor/EditorContext'
import { LAYER_COLORS } from '@/map/layers/features'
import { devicePosition, uploadActions, useUploads } from '@/map/photos/upload'
import type { Mentionable } from '@/types/collab'
import { Avatar } from '../Avatar'
import { matchMembers, mentionQuery } from '../CommentComposer'
import { api } from '@/lib/api'
import { useDocumentUploads } from '@/documents/upload'
import type { MapDocumentData } from '@/types/documents'
import { splitDrop } from './attach'
import { chatFeatureLabel, citedIds, citeQuery, matchCitables, type Citable } from './cite'
import { chatActions } from './chatStore'

/** A message ready to send: its text and what it points at on the map. */
export type ChatDraft = {
  body: string
  featureIds: number[]
  location: [number, number] | null
  photoId: number | null
  documentId: number | null
}

/** A document joined to a message stays under the library's own limit. */
const DOCUMENT_LIMITS = { maxBytes: 200 * 1024 * 1024 }

/** What the discussion panel can ask of its message box: join a file dropped anywhere on it. */
export type ChatComposerHandle = {
  /** Joins the first picture as the photo, else the first file as a document; false when nothing can be joined. */
  attachFiles: (files: ArrayLike<File> | null | undefined) => boolean
  /** Whether a dropped file would be joined. */
  canAttach: boolean
}

type Suggestion =
  | { kind: 'member'; key: string; member: Mentionable }
  | { kind: 'feature'; key: string; item: Citable }

/**
 * The discussion's message box: « @ » mentions a member, « # » cites an
 * element of the map; the pin button pins the message where you stand (or
 * where you point on the map), the camera joins a photo taken on the spot,
 * the paperclip a document of any kind (kept out of the map's library until
 * someone adds it from the message). A file can also be pasted into the box
 * or dropped on the panel: a picture becomes the photo, anything else the
 * document.
 * Enter sends on a computer (Shift+Enter for a new line); a phone keeps
 * Enter for new lines and sends with the button.
 */
export const ChatComposer = forwardRef<ChatComposerHandle, {
  members: Mentionable[]
  initial?: string
  initialFeatures?: { id: number; name: string }[]
  submitLabel?: string
  busy?: boolean
  autoFocus?: boolean
  /** Editing a sent message: its text and citations only. */
  editOnly?: boolean
  onSubmit: (draft: ChatDraft) => Promise<void> | void
  onCancel?: () => void
}>(function ChatComposer({ members, initial = '', initialFeatures = [], submitLabel, busy, autoFocus, editOnly, onSubmit, onCancel }, ref) {
  const editor = useEditor()
  const wide = useMediaQuery('(min-width: 768px)')
  const [text, setText] = useState(initial)
  const [cursor, setCursor] = useState(0)
  const [active, setActive] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const [location, setLocation] = useState<[number, number] | null>(null)
  const [locating, setLocating] = useState(false)
  const [upload, setUpload] = useState<string | null>(null)
  const cited = useRef(new Map(initialFeatures.map((f) => [f.id, f.name])))
  const field = useRef<HTMLTextAreaElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const documentInput = useRef<HTMLInputElement>(null)
  const [doc, setDoc] = useState<MapDocumentData | null>(null)
  const pendingCursor = useRef<number | null>(null)
  const listId = useId()

  useLayoutEffect(() => {
    if (pendingCursor.current == null || !field.current) return
    field.current.focus()
    field.current.setSelectionRange(pendingCursor.current, pendingCursor.current)
    setCursor(pendingCursor.current)
    pendingCursor.current = null
  }, [text])

  const citables = useMemo<Citable[]>(() => editor.features
    .filter((f) => f.properties.status !== 'rejected')
    .map((f) => ({ id: f.properties.id, layer: f.properties.layer, label: chatFeatureLabel(f.properties, t(`editor.kinds.${f.properties.kind}`)) })), [editor.features])

  const mentioning = mentionQuery(text, cursor)
  const citing = mentioning ? null : citeQuery(text, cursor)
  const suggestions: Suggestion[] = dismissed ? [] : mentioning
    ? matchMembers(members, mentioning.query).map((member) => ({ kind: 'member' as const, key: `m${member.id}`, member }))
    : citing ? matchCitables(citables, citing.query).map((item) => ({ kind: 'feature' as const, key: `f${item.id}`, item })) : []

  // The photo being sent: its id once on the server, and the spot it was taken.
  const uploads = useUploads()
  const sending = upload ? uploads.find((item) => item.key === upload) : undefined
  const photo = sending?.status === 'done' || sending?.status === 'duplicate' ? sending.photo : null
  useEffect(() => {
    if (sending?.status === 'error') {
      editor.notify(sending.message ?? t('collab.chat.photo_failed'), 'error')
      setUpload(null)
    }
    // The photo pins the message only where it was really taken (its GPS, or the phone on the spot).
    if (photo && !location && photo.lng != null && photo.lat != null && (photo.locationSource === 'exif' || photo.locationSource === 'device')) setLocation([photo.lng, photo.lat])
  }, [sending?.status, sending?.message, photo, location, editor])

  // The document being sent: the library's uploader, kept out of the library (origin « chat »).
  const documentsUrl = `/maps/${editor.map.id}/documents`
  const onDocSaved = useCallback((saved: MapDocumentData) => setDoc(saved), [])
  const docUploads = useDocumentUploads(documentsUrl, DOCUMENT_LIMITS, onDocSaved)
  const docSending = docUploads.uploads.find((u) => u.status === 'uploading')
  const docFailed = docUploads.uploads.find((u) => u.status === 'error')
  useEffect(() => {
    if (!docFailed) return
    editor.notify(docFailed.message ?? t('collab.chat.document_failed'), 'error')
    docUploads.dismiss(docFailed.key)
  }, [docFailed, editor, docUploads])

  function removeDocument() {
    // Never sent with a message, it would only take room: it goes.
    if (doc) void api(`${documentsUrl}/${doc.id}`, { method: 'DELETE' }).catch(() => undefined)
    setDoc(null)
  }

  function insert(choice: Suggestion) {
    const typing = choice.kind === 'member' ? mentioning : citing
    if (!typing) return
    const word = choice.kind === 'member' ? `@${choice.member.handle}` : `#${choice.item.label}`
    if (choice.kind === 'feature') cited.current.set(choice.item.id, choice.item.label)
    const after = text.slice(cursor)
    pendingCursor.current = typing.start + word.length + 1
    setText(`${text.slice(0, typing.start)}${word} ${after.replace(/^ /, '')}`)
    setActive(0)
  }

  async function submit() {
    const body = text.trim()
    if (!body || busy || (sending && !photo) || docSending) return
    await onSubmit({ body, featureIds: citedIds(body, cited.current), location, photoId: photo?.id ?? null, documentId: doc?.id ?? null })
    setText('')
    setCursor(0)
    setLocation(null)
    setUpload(null)
    setDoc(null)
    cited.current.clear()
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % suggestions.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + suggestions.length) % suggestions.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insert(suggestions[active] ?? suggestions[0]); return }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setDismissed(true); return }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || (wide && !e.shiftKey))) { e.preventDefault(); void submit() }
    if (e.key === 'Escape' && onCancel) onCancel()
  }

  async function pinHere() {
    setLocating(true)
    const position = await devicePosition()
    setLocating(false)
    if (position) setLocation([position.lng, position.lat])
    else editor.notify(t('collab.chat.no_position'), 'error')
  }

  async function pinOnMap() {
    chatActions.setPicking(true)
    editor.notify(t('collab.chat.pin_picking'))
    try {
      const geometry = await editor.draw('point')
      if (geometry?.type === 'Point') setLocation([geometry.coordinates[0], geometry.coordinates[1]])
    } finally {
      chatActions.setPicking(false)
      field.current?.focus()
    }
  }

  const canAttachPhoto = !editOnly && editor.canEdit && !(upload && !photo)
  const canAttachDocument = !editOnly && editor.canEdit && !docSending
  const canAttach = canAttachPhoto || canAttachDocument

  /** Joins what was chosen, pasted or dropped: a picture as the photo, anything else as the document. */
  function attachFiles(files: ArrayLike<File> | null | undefined): boolean {
    const { photo: picture, document: other } = splitDrop(files)
    if (picture) return attach([picture])
    if (other) return attachDocument(other)
    return false
  }

  /** One document per message: a new one replaces the one waiting. */
  function attachDocument(chosen: File | undefined): boolean {
    if (!chosen || !canAttachDocument) return false
    if (doc) removeDocument()
    docUploads.add([chosen], { origin: 'chat' })
    return true
  }

  /** Joins the first picture among the files (the camera, a paste or a drop). */
  function attach(files: ArrayLike<File> | null | undefined): boolean {
    const chosen = splitDrop(files).photo
    if (!chosen || !canAttachPhoto) return false
    const [key] = uploadActions.add(editor.map.id, [chosen], {
      source: wide ? 'web' : 'phone',
      // Only a phone knows where it stands: a computer's position comes from its
      // internet line, often far from the place, and would pin a screenshot there.
      useDevicePosition: !wide,
      fallbackPosition: location ? { lng: location[0], lat: location[1] } : undefined,
    })
    setUpload(key ?? null)
    return true
  }

  useImperativeHandle(ref, () => ({ attachFiles, canAttach }))

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    // A copied screenshot or file joins the message; pasted text stays text.
    if (e.clipboardData.files.length > 0 && attachFiles(e.clipboardData.files)) e.preventDefault()
  }

  const activeId = suggestions[active] ? `${listId}-${suggestions[active].key}` : undefined
  return (
    <div className="relative">
      <textarea
        ref={field}
        rows={editOnly ? 3 : 2}
        value={text}
        autoFocus={autoFocus}
        maxLength={5000}
        placeholder={t('collab.chat.placeholder')}
        aria-label={t('collab.chat.placeholder')}
        aria-autocomplete="list"
        aria-controls={suggestions.length ? listId : undefined}
        aria-activedescendant={suggestions.length ? activeId : undefined}
        className={inputClass + ' resize-none'}
        onChange={(e) => { setText(e.target.value); setCursor(e.target.selectionStart); setDismissed(false); setActive(0) }}
        onSelect={(e) => setCursor(e.currentTarget.selectionStart)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
      />
      {suggestions.length > 0 && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 bottom-full z-10 mb-1 max-h-64 overflow-y-auto rounded-xl bg-white py-1 shadow-lg ring-1 ring-loam-200">
          {suggestions.map((choice, i) => (
            <li
              key={choice.key}
              id={`${listId}-${choice.key}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); insert(choice) }}
              onMouseEnter={() => setActive(i)}
              className={clsx('flex cursor-pointer items-center gap-2 px-3 py-2 text-sm', i === active ? 'bg-prune-50 text-prune-800' : 'text-loam-700')}
            >
              {choice.kind === 'member' ? (
                <><Avatar name={choice.member.name} url={choice.member.avatarUrl} className="h-6 w-6 text-sm" />{choice.member.handle}</>
              ) : (
                <><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: LAYER_COLORS[choice.item.layer] ?? 'var(--color-loam-500)' }} />{choice.item.label}</>
              )}
            </li>
          ))}
        </ul>
      )}

      {!editOnly && (location || upload || doc || docSending) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {location && (
            <ChipButton tone="prune" icon={<X />} onClick={() => setLocation(null)} title={t('collab.chat.unpin')}>
              {t('collab.chat.pin_set')}
            </ChipButton>
          )}
          {upload && (
            <ChipButton tone={photo ? 'leaf' : 'neutral'} icon={<X />} onClick={() => setUpload(null)} title={t('collab.chat.photo_remove')}>
              {photo ? t('collab.chat.photo_ready') : `${t('collab.chat.photo_sending')} ${sending?.progress ?? 0} %`}
            </ChipButton>
          )}
          {docSending && (
            <ChipButton tone="neutral" icon={<Paperclip />} disabled>
              {`${t('collab.chat.document_sending')} ${docSending.progress} %`}
            </ChipButton>
          )}
          {doc && !docSending && (
            <ChipButton tone="leaf" icon={<X />} onClick={removeDocument} title={t('collab.chat.document_remove')}>
              <span className="max-w-48 truncate">{doc.filename ?? doc.title}</span>
            </ChipButton>
          )}
        </div>
      )}

      <div className="mt-2 flex items-center gap-1">
        {!editOnly && (
          <>
            <ComposerTip title={t('collab.chat.pin_here')} text={t('collab.chat.pin_here_tip')}>
              <IconButton size="sm" label={t('collab.chat.pin_here')} title={undefined} onClick={() => void pinHere()} disabled={locating} pressed={locating}>
                <LocateFixed />
              </IconButton>
            </ComposerTip>
            <ComposerTip title={t('collab.chat.pin_on_map')} text={t('collab.chat.pin_on_map_tip')}>
              <IconButton size="sm" label={t('collab.chat.pin_on_map')} title={undefined} onClick={() => void pinOnMap()} disabled={!!editor.drawing}>
                <Crosshair />
              </IconButton>
            </ComposerTip>
            {editor.canEdit && (
              <>
                <ComposerTip title={t('collab.chat.photo')} text={t(wide ? 'collab.chat.photo_tip' : 'collab.chat.photo_tip_phone')}>
                  <IconButton size="sm" label={t('collab.chat.photo')} title={undefined} onClick={() => file.current?.click()} disabled={!!upload && !photo}>
                    <Camera />
                  </IconButton>
                </ComposerTip>
                <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => { attach(e.target.files); e.target.value = '' }} />
                <ComposerTip title={t('collab.chat.document')} text={t(wide ? 'collab.chat.document_tip' : 'collab.chat.document_tip_phone')}>
                  <IconButton size="sm" label={t('collab.chat.document')} title={undefined} onClick={() => documentInput.current?.click()} disabled={!!docSending}>
                    <Paperclip />
                  </IconButton>
                </ComposerTip>
                <input ref={documentInput} type="file" className="hidden" onChange={(e) => { attachDocument(e.target.files?.[0]); e.target.value = '' }} />
              </>
            )}
          </>
        )}
        <span className="min-w-0 flex-1 truncate text-sm text-loam-400">{locating ? t('collab.chat.locating') : wide ? t('collab.chat.hint') : ''}</span>
        {onCancel && <Button size="sm" variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>}
        <Button size="sm" onClick={() => void submit()} disabled={busy || text.trim() === '' || (!!upload && !photo) || !!docSending}>
          <Send className="h-4 w-4" />
          {submitLabel ?? t('collab.chat.send')}
        </Button>
      </div>
    </div>
  )
})

/** A composer button's tooltip: what it is, then what it does. Lined up left so it stays inside the panel. */
function ComposerTip({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <Tooltip align="start" content={<><span className="block font-medium">{title}</span><span className="block text-white/80">{text}</span></>}>
      {children}
    </Tooltip>
  )
}
