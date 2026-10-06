import { X } from 'lucide-react'
import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import { inputClass } from '@/components/ui/Field'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { addTag, MAX_TAG_LENGTH, MAX_TAGS, removeTag, tagCounts, tagsOf } from '@/map/tags/tags'
import type { MapFeature } from '@/types'

/**
 * « Étiquettes » of the selected element: free words shared by the whole map
 * (« zone nord », « phase 1 »), suggested from the tags already in use. The
 * lists filter and group by them.
 */
export default function TagsSection({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const listId = useId()
  const [draft, setDraft] = useState('')
  const tags = tagsOf(feature)
  const suggestions = useMemo(
    () => tagCounts(editor.features).map((c) => c.tag).filter((tag) => !tags.some((t) => t.toLowerCase() === tag.toLowerCase())),
    [editor.features, tags],
  )
  if (!editor.canEdit && tags.length === 0) return null

  function save(next: string[]) {
    if (next === tags) return
    editor.updateFeature(feature.properties.id, { tags: next }).catch((e: Error) => editor.notify(e.message, 'error'))
  }

  function commit() {
    const next = addTag(tags, draft)
    setDraft('')
    save(next)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
      save(tags.slice(0, -1))
    }
  }

  return (
    <section>
      <h3 className="mb-1 text-sm font-medium text-loam-700">{t('tags.title')}</h3>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-lichen-100 py-0.5 pl-2.5 pr-1 text-xs font-medium text-lichen-700">
            {tag}
            {editor.canEdit && (
              <button
                type="button" onClick={() => save(removeTag(tags, tag))}
                className="rounded-full p-0.5 hover:bg-lichen-200" aria-label={t('tags.remove', { tag })}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
      </div>
      {editor.canEdit && tags.length < MAX_TAGS && (
        <>
          <input
            value={draft} list={listId} maxLength={MAX_TAG_LENGTH}
            onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} onBlur={() => draft.trim() && commit()}
            placeholder={t(tags.length ? 'tags.add_another' : 'tags.placeholder')}
            aria-label={t('tags.add')}
            className={inputClass + ' mt-1.5 py-1.5'}
          />
          <datalist id={listId}>
            {suggestions.map((tag) => <option key={tag} value={tag} />)}
          </datalist>
          {tags.length === 0 && <p className="mt-1 text-xs text-loam-400">{t('tags.hint')}</p>}
        </>
      )}
    </section>
  )
}
