// The interface strings are cut into segments, so that a page downloads only
// the strings its own code names (vite.config.ts, plugin `rails-locales`).
// A segment is one second-level subtree of the merged locale files
// (`editor.panels`, `site.home`…), or the plain strings sitting directly
// under a top-level key (`common`). Plain Node, no Vite: test/frontend/locales
// runs it on the sources.

type Tree = Record<string, unknown>

const isTree = (value: unknown): value is Tree => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export function deepMerge(target: Tree, source: Tree): Tree {
  for (const [key, value] of Object.entries(source)) {
    const existing = target[key]
    if (isTree(value) && isTree(existing)) deepMerge(existing, value)
    else target[key] = value
  }
  return target
}

/** The segment that holds a key: `editor.panels.water.title` → `editor.panels`, `common.save` → `common`. */
export function segmentOf(key: string, tree: Tree): string | null {
  const [top, second] = key.split('.')
  const node = tree[top]
  if (node === undefined) return null
  return second && isTree(node) && isTree(node[second]) ? `${top}.${second}` : top
}

/**
 * Every segment of the merged trees, by locale: `{ 'editor.panels': { fr: { editor: { panels: … } } } }`.
 * A segment carries its locales together, so switching locale never misses one.
 */
export function splitSegments(locales: Record<string, Tree>): Map<string, Tree> {
  const segments = new Map<string, Tree>()
  const put = (id: string, locale: string, data: Tree) => {
    const segment = segments.get(id) ?? {}
    segments.set(id, deepMerge(segment, { [locale]: data }))
  }
  for (const [locale, tree] of Object.entries(locales)) {
    for (const [top, node] of Object.entries(tree)) {
      if (!isTree(node)) {
        put(top, locale, { [top]: node })
        continue
      }
      const plain: Tree = {}
      for (const [second, child] of Object.entries(node)) {
        if (isTree(child)) put(`${top}.${second}`, locale, { [top]: { [second]: child } })
        else plain[second] = child
      }
      if (Object.keys(plain).length > 0 || Object.keys(node).length === 0) put(top, locale, { [top]: plain })
    }
  }
  return segments
}

// A string that starts like a key: 'editor.panels.water', `billing.plans.${key}`,
// 'collab.' (a prefix completed at run time). The character after the second
// part tells whether that part is whole (a quote or a dot) or completed at
// run time (`${`).
const KEY_LITERAL = /['"`]([a-z_][a-z0-9_]*)\.([a-z0-9_]*)(\$\{|[.'"`])?/g
// A whole top-level tree read at once: translations('site'), content<Faq>('faq').
const WHOLE_TREE = /\b(?:translations|content|values)\s*(?:<[^>()]*>)?\(\s*['"`]([a-z_][a-z0-9_]*)['"`]/g

/** The segments whose strings a piece of code may read, given every segment's id. */
export function segmentsUsed(code: string, ids: Iterable<string>): Set<string> {
  const byTop = new Map<string, string[]>()
  for (const id of ids) {
    const [top, second = ''] = id.split('.')
    byTop.set(top, [...(byTop.get(top) ?? []), second])
  }
  const used = new Set<string>()
  const all = (top: string) => byTop.get(top)?.forEach((second) => used.add(second ? `${top}.${second}` : top))
  for (const [, top, second, after] of code.matchAll(KEY_LITERAL)) {
    const seconds = byTop.get(top)
    if (!seconds) continue
    if (second === '') {
      // 'editor.' or `editor.${kind}`: anything under it.
      if (after === '${' || after === undefined || after === "'" || after === '"' || after === '`') all(top)
      continue
    }
    if (after === '${') {
      // `plants.strata_${n}`: the second part is completed at run time.
      for (const s of seconds) if (s.startsWith(second)) used.add(s ? `${top}.${s}` : top)
      if (seconds.includes('')) used.add(top)
      continue
    }
    if (seconds.includes(second)) used.add(`${top}.${second}`)
    else if (seconds.includes('')) used.add(top)
  }
  for (const [, top] of code.matchAll(WHOLE_TREE)) all(top)
  return used
}
