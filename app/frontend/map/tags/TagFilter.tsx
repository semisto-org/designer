import clsx from 'clsx'
import { Tag } from 'lucide-react'
import { t } from '@/lib/i18n'
import { UNTAGGED, type TagCount } from '@/map/tags/tags'

/**
 * Tag bar over a list: « Tout », one chip per tag, « Sans étiquette »; and,
 * when `onGroup` is given, a switch to group the list by tag. Renders
 * nothing while the map has no tags.
 */
export function TagFilter({ tags, value, onChange, grouped, onGroup }: {
  tags: TagCount[]
  value: string | null
  onChange: (tag: string | null) => void
  grouped?: boolean
  onGroup?: (grouped: boolean) => void
}) {
  if (tags.length === 0) return null
  const chip = (active: boolean) => clsx(
    'rounded-full px-2.5 py-1 text-xs font-medium',
    active ? 'bg-prune-600 text-white' : 'bg-loam-100 text-loam-600 hover:bg-loam-200',
  )
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('tags.filter_label')}>
        <Tag className="mt-1 h-3.5 w-3.5 shrink-0 text-loam-400" aria-hidden />
        <button type="button" aria-pressed={value == null} onClick={() => onChange(null)} className={chip(value == null)}>
          {t('tags.all')}
        </button>
        {tags.map(({ tag, count }) => (
          <button key={tag} type="button" aria-pressed={value === tag} onClick={() => onChange(value === tag ? null : tag)} className={chip(value === tag)}>
            {tag} <span className="tabular-nums opacity-70">{count}</span>
          </button>
        ))}
        <button type="button" aria-pressed={value === UNTAGGED} onClick={() => onChange(value === UNTAGGED ? null : UNTAGGED)} className={chip(value === UNTAGGED)}>
          {t('tags.untagged')}
        </button>
      </div>
      {onGroup && (
        <label className="flex items-center gap-2 text-xs text-loam-600">
          <input type="checkbox" checked={!!grouped} onChange={(e) => onGroup(e.target.checked)} className="rounded border-loam-300 text-prune-600 focus:ring-prune-600" />
          {t('tags.group_by')}
        </label>
      )}
    </div>
  )
}

/** Small read-only chips after an element's name in a list. */
export function TagChips({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null
  return (
    <span className="flex shrink-0 flex-wrap justify-end gap-1">
      {tags.slice(0, 3).map((tag) => (
        <span key={tag} className="rounded-full bg-lichen-100 px-1.5 text-[11px] text-lichen-700">{tag}</span>
      ))}
      {tags.length > 3 && <span className="text-[11px] text-loam-400">+{tags.length - 3}</span>}
    </span>
  )
}
