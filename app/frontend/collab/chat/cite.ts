// Citing elements of the map in a message of its discussion (« # »), and
// reading them back. No imports, so node:test can load it.

/** What the composer knows of an element it can cite. */
export type Citable = { id: number; label: string; layer: string }

/**
 * How an element is named after « # »: its name, else its kind, and a
 * plant's number. Mirrors Collab::CommentSerializer.feature_label.
 */
export function chatFeatureLabel(properties: { name?: string | null; number?: unknown }, kindLabel: string): string {
  const base = properties.name?.trim() || kindLabel
  const number = typeof properties.number === 'number' || (typeof properties.number === 'string' && /^\d+$/.test(properties.number))
    ? Number(properties.number) : null
  return number ? `${base} n° ${number}` : base
}

/** The « #query » being typed right before the cursor, if any. */
export function citeQuery(text: string, cursor: number): { start: number; query: string } | null {
  const before = text.slice(0, cursor)
  const match = /(^|[\s(])#([^\s#@]*(?: [^\s#@]*){0,2})$/u.exec(before)
  if (!match) return null
  const query = match[2]
  if (query.length > 40) return null
  return { start: before.length - query.length - 1, query }
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Elements whose label has a word starting with the query (accents ignored), best first. */
export function matchCitables(items: Citable[], query: string, limit = 6): Citable[] {
  const q = fold(query.trim())
  if (!q) return items.slice(0, limit)
  const scored = items.flatMap((item) => {
    const label = fold(item.label)
    if (label.startsWith(q)) return [{ item, score: 0 }]
    if (label.split(/[\s'’-]+/).some((word) => word.startsWith(q))) return [{ item, score: 1 }]
    if (label.includes(q)) return [{ item, score: 2 }]
    return []
  })
  return scored.sort((a, b) => a.score - b.score || a.item.label.localeCompare(b.item.label, 'fr')).slice(0, limit).map((s) => s.item)
}

/** The cited elements whose « #label » is still in the text, in the order they appear. */
export function citedIds(text: string, cited: Map<number, string>): number[] {
  return [...cited.entries()]
    .map(([id, label]) => ({ id, at: text.indexOf(`#${label}`) }))
    .filter((c) => c.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((c) => c.id)
}

export type ChatToken =
  | { kind: 'text'; value: string }
  | { kind: 'mention'; value: string }
  | { kind: 'link'; value: string }
  | { kind: 'feature'; value: string; id: number }

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Splits a message into text, @mentions, #cited elements and links. Every
 * piece is rendered as React text: a message never carries HTML.
 */
export function tokenizeChat(body: string, handles: string[], features: { id: number; name: string }[]): ChatToken[] {
  const byLabel = new Map(features.map((f) => [f.name.toLowerCase(), f.id]))
  const mentions = [...new Set(handles)].sort((a, b) => b.length - a.length)
  const labels = [...new Set(features.map((f) => f.name))].sort((a, b) => b.length - a.length)
  const parts = [
    mentions.length ? `(?<![\\p{L}\\p{N}_@])@(?:${mentions.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}_])` : null,
    labels.length ? `(?<![\\p{L}\\p{N}_#])#(?:${labels.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}_])` : null,
    'https?:\\/\\/[^\\s<>"\']+',
  ].filter(Boolean)
  const pattern = new RegExp(parts.join('|'), 'giu')
  const tokens: ChatToken[] = []
  let last = 0
  for (const match of body.matchAll(pattern)) {
    let value = match[0]
    const index = match.index ?? 0
    if (index > last) tokens.push({ kind: 'text', value: body.slice(last, index) })
    if (/^https?:/i.test(value)) {
      value = value.replace(/[.,;:!?)\]]+$/, '')
      tokens.push({ kind: 'link', value })
    } else if (value.startsWith('#')) {
      tokens.push({ kind: 'feature', value, id: byLabel.get(value.slice(1).toLowerCase()) ?? 0 })
    } else {
      tokens.push({ kind: 'mention', value })
    }
    last = index + value.length
  }
  if (last < body.length) tokens.push({ kind: 'text', value: body.slice(last) })
  return tokens
}
