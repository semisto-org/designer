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

// 0: the name starts with it · 1: a word of the name does · 2: the name
// contains it · 3: only the place or the team does.
function rank(map: SwitcherMap, query: string, terms: string[]): number | null {
  const name = fold(map.name)
  const rest = fold([map.address, map.teamName].filter(Boolean).join(' '))
  if (!terms.every((term) => name.includes(term) || rest.includes(term))) return null
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

/** Cmd+J on a Mac, Ctrl+J elsewhere (either works everywhere). */
export function isSwitcherShortcut(event: { key: string; code?: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }): boolean {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return false
  return event.key.toLowerCase() === 'j' || event.code === 'KeyJ'
}
