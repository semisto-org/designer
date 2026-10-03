import { Send } from 'lucide-react'
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { inputClass } from '@/components/ui/Field'
import { t } from '@/lib/i18n'
import type { Mentionable } from '@/types/collab'
import { Avatar } from './Avatar'

/** The "@query" being typed right before the cursor, if any. */
export function mentionQuery(text: string, cursor: number): { start: number; query: string } | null {
  const before = text.slice(0, cursor)
  const match = /(^|[\s(])@([^\s@]*(?: ?[^\s@]*)?)$/u.exec(before)
  if (!match) return null
  const query = match[2]
  if (query.length > 40) return null
  return { start: before.length - query.length - 1, query }
}

export function matchMembers(members: Mentionable[], query: string): Mentionable[] {
  const q = query.trim().toLowerCase()
  return members
    .filter((m) => m.handle.toLowerCase().split(/\s+/).some((word) => word.startsWith(q)) || m.handle.toLowerCase().startsWith(q))
    .slice(0, 5)
}

type Props = {
  members: Mentionable[]
  initial?: string
  placeholder?: string
  submitLabel?: string
  busy?: boolean
  autoFocus?: boolean
  onSubmit: (body: string) => Promise<void> | void
  onCancel?: () => void
}

/** Comment box with @mention completion (members of the map only). */
export function CommentComposer({ members, initial = '', placeholder, submitLabel, busy, autoFocus, onSubmit, onCancel }: Props) {
  const [text, setText] = useState(initial)
  const [cursor, setCursor] = useState(0)
  const [active, setActive] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)
  const pendingCursor = useRef<number | null>(null)
  const listId = useId()

  // Put the caret after an inserted mention as soon as the new text is in the
  // DOM (before the next keystroke can land at the wrong place).
  useLayoutEffect(() => {
    if (pendingCursor.current == null || !field.current) return
    field.current.focus()
    field.current.setSelectionRange(pendingCursor.current, pendingCursor.current)
    setCursor(pendingCursor.current)
    pendingCursor.current = null
  }, [text])

  const typing = mentionQuery(text, cursor)
  const suggestions = typing && !dismissed ? matchMembers(members, typing.query) : []

  function insert(member: Mentionable) {
    if (!typing) return
    const after = text.slice(cursor)
    const next = `${text.slice(0, typing.start)}@${member.handle} ${after.replace(/^ /, '')}`
    const position = typing.start + member.handle.length + 2
    pendingCursor.current = position
    setText(next)
    setActive(0)
  }

  async function submit() {
    const body = text.trim()
    if (!body || busy) return
    await onSubmit(body)
    setText('')
    setCursor(0)
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % suggestions.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + suggestions.length) % suggestions.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insert(suggestions[active] ?? suggestions[0]); return }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setDismissed(true); return }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit() }
    if (e.key === 'Escape' && onCancel) onCancel()
  }

  return (
    <div className="relative">
      <textarea
        ref={field}
        rows={initial ? 3 : 2}
        value={text}
        autoFocus={autoFocus}
        maxLength={5000}
        placeholder={placeholder ?? t('collab.comments.placeholder')}
        aria-label={placeholder ?? t('collab.comments.placeholder')}
        aria-autocomplete="list"
        aria-controls={suggestions.length ? listId : undefined}
        className={inputClass + ' resize-y'}
        onChange={(e) => { setText(e.target.value); setCursor(e.target.selectionStart); setDismissed(false); setActive(0) }}
        onSelect={(e) => setCursor(e.currentTarget.selectionStart)}
        onKeyDown={onKeyDown}
      />
      {suggestions.length > 0 && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 bottom-full z-10 mb-1 overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-loam-200">
          {suggestions.map((m, i) => (
            <li key={m.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); insert(m) }}
                className={'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ' + (i === active ? 'bg-prune-50 text-prune-800' : 'text-loam-700 hover:bg-loam-50')}
              >
                <Avatar name={m.name} url={m.avatarUrl} className="h-5 w-5 text-[10px]" />
                {m.handle}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-loam-400">{members.length > 0 ? t('collab.comments.mention_hint') : ''}</span>
        <div className="flex gap-2">
          {onCancel && <Button size="sm" variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>}
          <Button size="sm" onClick={() => void submit()} disabled={busy || text.trim() === ''}>
            <Send className="h-3.5 w-3.5" />
            {submitLabel ?? t('collab.comments.send')}
          </Button>
        </div>
      </div>
    </div>
  )
}
