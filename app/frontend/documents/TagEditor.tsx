import { X } from 'lucide-react'
import { useId, useState, type KeyboardEvent } from 'react'
import { inputClass } from '@/components/ui/Field'
import { t } from '@/lib/i18n'
import { addTag, MAX_TAG_LENGTH, MAX_TAGS, removeTag } from '@/map/tags/tags'

/** Free tags typed in a field, suggested from the ones already in use (the same rules as the map's elements). */
export function TagEditor({ tags, suggestions, onChange, canEdit, label }: {
  tags: string[]
  suggestions: string[]
  onChange: (tags: string[]) => void
  canEdit: boolean
  label?: string
}) {
  const listId = useId()
  const [draft, setDraft] = useState('')
  const offered = suggestions.filter((tag) => !tags.some((t) => t.toLowerCase() === tag.toLowerCase()))

  function commit(value = draft) {
    const next = addTag(tags, value)
    setDraft('')
    if (next !== tags) onChange(next)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
      onChange(tags.slice(0, -1))
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-lichen-100 py-0.5 pl-2.5 pr-1 text-sm font-medium text-lichen-700">
            {tag}
            {canEdit && (
              <button type="button" onClick={() => onChange(removeTag(tags, tag))} className="rounded-full p-0.5 hover:bg-lichen-200" aria-label={t('tags.remove', { tag })}>
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        ))}
        {!canEdit && tags.length === 0 && <span className="text-sm text-loam-500">{t('documents.no_tags')}</span>}
      </div>
      {canEdit && tags.length < MAX_TAGS && (
        <>
          <input
            className={inputClass + ' mt-2'}
            list={listId}
            value={draft}
            maxLength={MAX_TAG_LENGTH}
            placeholder={t('documents.tag_placeholder')}
            aria-label={label ?? t('tags.title')}
            onChange={(e) => {
              const value = e.target.value
              // Picking a suggestion from the list adds it at once.
              if (offered.includes(value)) commit(value)
              else setDraft(value)
            }}
            onKeyDown={onKeyDown}
            onBlur={() => draft.trim() && commit()}
          />
          <datalist id={listId}>{offered.map((tag) => <option key={tag} value={tag} />)}</datalist>
          {offered.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {offered.slice(0, 8).map((tag) => (
                <button key={tag} type="button" onClick={() => commit(tag)}
                  className="rounded-full px-2.5 py-0.5 text-sm text-lichen-700 ring-1 ring-inset ring-lichen-200 hover:bg-lichen-50">
                  + {tag}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
