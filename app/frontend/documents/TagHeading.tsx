import { Check, Pencil, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Field'
import { t } from '@/lib/i18n'

const MAX_LENGTH = 40

/**
 * The title of a shelf in the library (« analyse de sol 5 »). For an
 * editor, a small pencil beside the name renames the tag on every document
 * that carries it: shown on hover with a mouse, always on a touch screen.
 */
export function TagHeading({ tag, count, canRename, onRename }: {
  tag: string
  count: number
  canRename: boolean
  /** Resolves once saved; a rejection keeps the field open. */
  onRename: (to: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(tag)
  const [saving, setSaving] = useState(false)
  const field = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) field.current?.select()
  }, [editing])

  function start() {
    setValue(tag)
    setEditing(true)
  }

  async function submit() {
    const to = value.trim().replace(/\s+/g, ' ')
    if (!to || to === tag) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onRename(to)
      setEditing(false)
    } catch {
      field.current?.focus()
    } finally {
      setSaving(false)
    }
  }

  const counter: ReactNode = <span className="font-sans text-sm text-loam-500">{count}</span>

  if (editing) {
    return (
      <form
        className="mb-3"
        onSubmit={(e) => { e.preventDefault(); void submit() }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Input
            ref={field}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false) }}
            maxLength={MAX_LENGTH}
            disabled={saving}
            aria-label={t('documents.rename_tag', { tag })}
            className="!w-auto min-w-0 flex-1 font-serif !text-xl sm:max-w-sm"
          />
          <IconButton type="submit" label={t('common.save')} tone="prune" disabled={saving}><Check /></IconButton>
          <IconButton label={t('common.cancel')} onClick={() => setEditing(false)} disabled={saving}><X /></IconButton>
        </div>
        <p className="mt-1 text-sm text-loam-500">{t('documents.rename_tag_hint')}</p>
      </form>
    )
  }

  return (
    <h2 className="group mb-3 flex items-center gap-2 font-serif text-xl text-loam-900">
      <span>{tag}</span>
      {counter}
      {canRename && (
        <IconButton
          size="sm"
          label={t('documents.rename_tag', { tag })}
          onClick={start}
          className="[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Pencil />
        </IconButton>
      )}
    </h2>
  )
}
