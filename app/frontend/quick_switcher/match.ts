// Matching for the quick switcher: accent- and case-insensitive, every word
// typed must be found, and a map whose name starts with the text comes
// before one that only contains it. Kept free of React for node:test.

export type SwitcherMap = {
  id: number
  name: string
  address: string | null
  stage: string
  role: string | null
  teamName: string | null
  updatedAt: string
}

export type Match = { map: SwitcherMap; highlight: [number, number] | null }

/** Lower case without accents, one character for one: indexes stay those of the original. */
export function fold(text: string): string {
  let out = ''
  for (const char of text) {
    const folded = char.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    out += folded.length === char.length ? folded : char.toLowerCase()
  }
  return out
}

function words(query: string): string[] {
  return fold(query).split(/[\s,'’-]+/).filter(Boolean)
}

/** Optimal string alignment distance, stopped early above `max`. */
export function distance(a: string, b: string, max = 1): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const rows: number[][] = [Array.from({ length: b.length + 1 }, (_, j) => j)]
  for (let i = 1; i <= a.length; i++) {
    rows[i] = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let value = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, rows[i - 2][j - 2] + 1)
      rows[i][j] = value
      best = Math.min(best, value)
    }
    if (best > max) return max + 1
  }
  return rows[a.length][b.length]
}

function isSubsequence(needle: string, haystack: string) {
  let at = 0
  for (const char of haystack) if (char === needle[at]) at++
  return at === needle.length
}

// A loose match: the initials (« jfg » for Jardin-forêt de Gembloux), or a
// word typed with one slip (« walhian », « gemblou »).
function looselyFound(term: string, text: string): boolean {
  const parts = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  if (term.length >= 2 && isSubsequence(term, parts.map((part) => part[0]).join(''))) return true
  if (term.length < 4) return false
  return parts.some((part) => distance(term, part.slice(0, term.length)) <= 1 || distance(term, part) <= 1)
}

// 0: the name starts with it · 1: a word of the name does · 2: the name
// contains it · 3: only the place or the team does · 4: a loose match.
function rank(map: SwitcherMap, query: string, terms: string[]): number | null {
  const name = fold(map.name)
  const rest = fold([map.address, map.teamName].filter(Boolean).join(' '))
  if (!terms.every((term) => name.includes(term) || rest.includes(term))) {
    return terms.every((term) => name.includes(term) || rest.includes(term) || looselyFound(term, `${name} ${rest}`)) ? 4 : null
  }
  const whole = fold(query.trim())
  if (name.startsWith(whole)) return 0
  if (terms.every((term) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(term)}`, 'u').test(name))) return 1
  if (terms.every((term) => name.includes(term))) return 2
  return 3
}

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The maps matching what was typed, best first; maps keep their given
 * order (last worked on first) within a rank. Nothing typed: all of them.
 */
export function searchMaps(maps: SwitcherMap[], query: string, limit = 50): Match[] {
  const terms = words(query)
  if (terms.length === 0) return maps.slice(0, limit).map((map) => ({ map, highlight: null }))
  return maps
    .map((map, index) => ({ map, index, rank: rank(map, query, terms) }))
    .filter((entry): entry is { map: SwitcherMap; index: number; rank: number } => entry.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, limit)
    .map(({ map }) => {
      const at = fold(map.name).indexOf(terms[0])
      return { map, highlight: at >= 0 ? [at, at + terms[0].length] : null }
    })
}

/** The maps opened lately come first, in the order they were opened; then the rest as given. */
export function byRecent(maps: SwitcherMap[], recentIds: number[]): SwitcherMap[] {
  const position = new Map(recentIds.map((id, index) => [id, index]))
  return maps
    .map((map, index) => ({ map, index, recent: position.get(map.id) ?? Infinity }))
    .sort((a, b) => a.recent - b.recent || a.index - b.index)
    .map(({ map }) => map)
}

/** Remembers that a map was just opened (most recent first, at most `limit`). */
export function rememberOpened(recentIds: number[], id: number, limit = 12): number[] {
  return [id, ...recentIds.filter((other) => other !== id)].slice(0, limit)
}

/** A page of the app the switcher can also open (« Tâches », « Nouvelle carte »…). */
export type SwitcherPage = { key: string; label: string; href: string; keywords?: string }

/** The pages whose name (or keywords) hold every word typed; none when nothing is typed. */
export function searchPages(pages: SwitcherPage[], query: string): SwitcherPage[] {
  const terms = words(query)
  if (terms.length === 0) return []
  return pages.filter((page) => {
    const text = fold(`${page.label} ${page.keywords ?? ''}`)
    return terms.every((term) => text.includes(term) || (term.length >= 4 && looselyFound(term, text)))
  })
}

/** Cmd+J on a Mac, Ctrl+J elsewhere (either works everywhere). */
export function isSwitcherShortcut(event: { key: string; code?: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }): boolean {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return false
  return event.key.toLowerCase() === 'j' || event.code === 'KeyJ'
}
