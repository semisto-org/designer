// Free tags on map elements (plants, networks, structures…), shared by the
// whole map. Pure helpers, no React: the inspector, the elements list and
// the plant list use them; the server normalizes the same way
// (MapFeature::Tags).

export const MAX_TAGS = 20
export const MAX_TAG_LENGTH = 40

/** Filter value meaning « elements without any tag ». */
export const UNTAGGED = '\u0000untagged'

type Tagged = { properties: { tags?: unknown } }

export function normalizeTag(value: string): string {
  return value.normalize('NFC').replace(/\s+/g, ' ').trim()
}

const key = (tag: string) => normalizeTag(tag).toLocaleLowerCase('fr')

export function tagsOf(item: Tagged | null | undefined): string[] {
  const tags = item?.properties.tags
  return Array.isArray(tags) ? tags.filter((t): t is string => typeof t === 'string') : []
}

/** Case-insensitive: « Phase 1 » matches « phase 1 »; UNTAGGED matches elements without tags. */
export function hasTag(item: Tagged, tag: string): boolean {
  const tags = tagsOf(item)
  if (tag === UNTAGGED) return tags.length === 0
  const wanted = key(tag)
  return tags.some((t) => key(t) === wanted)
}

/** Adds `tag` (normalized) unless it is empty, already there (any case) or too long. */
export function addTag(tags: string[], tag: string): string[] {
  const clean = normalizeTag(tag)
  if (!clean || clean.length > MAX_TAG_LENGTH || tags.length >= MAX_TAGS) return tags
  return tags.some((t) => key(t) === key(clean)) ? tags : [...tags, clean]
}

export function removeTag(tags: string[], tag: string): string[] {
  return tags.filter((t) => key(t) !== key(tag))
}

export type TagCount = { tag: string; count: number }

/** Tags used by `items`, one spelling each (the first met), sorted the French way. */
export function tagCounts(items: Tagged[]): TagCount[] {
  const counts = new Map<string, TagCount>()
  for (const item of items) {
    for (const tag of tagsOf(item)) {
      const k = key(tag)
      const entry = counts.get(k)
      if (entry) entry.count += 1
      else counts.set(k, { tag, count: 1 })
    }
  }
  return [...counts.values()].sort((a, b) => a.tag.localeCompare(b.tag, 'fr', { sensitivity: 'base', numeric: true }))
}

export type TagGroup<T> = { tag: string | null; items: T[] }

/**
 * One group per tag (an element with two tags sits in both), then the
 * untagged ones under `tag: null`. Empty groups are left out.
 */
export function groupByTag<T extends Tagged>(items: T[]): TagGroup<T>[] {
  const groups: TagGroup<T>[] = tagCounts(items).map(({ tag }) => ({ tag, items: items.filter((i) => hasTag(i, tag)) }))
  const untagged = items.filter((i) => tagsOf(i).length === 0)
  if (untagged.length) groups.push({ tag: null, items: untagged })
  return groups
}
