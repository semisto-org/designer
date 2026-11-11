// The map's live discussion (« Discussion de la carte »), the part with no
// phone in it, so it is tested: the messages' shape, keeping the list in
// order as messages arrive, the « @ » and « # » being typed, and reading a
// message back into text, mentions, cited elements and links. Mirrors the
// website's app/frontend/collab/chat/cite.ts.
import { distance } from './geo'
import type { Position } from './types'

export type ChatAuthor = { id: number; name: string; avatarUrl: string | null }

/** A message as the comments API gives it (Collab::CommentSerializer). */
export type ChatMessage = {
  id: number
  body: string
  author: ChatAuthor
  createdAt: string
  editedAt: string | null
  mentions: { id: number; handle: string }[]
  applause: { count: number; mine: boolean; names: string[] }
  /** Elements of the map the message cites (« # »), each with its label. */
  features?: { id: number; name: string; layer: string; kind: string }[]
  /** The spot the message is pinned to, [lng, lat]. */
  location?: Position | null
  /** A photo of the map joined to the message. */
  photo?: { id: number; caption: string | null; video: boolean } | null
  /** A file joined to the message on the website: a pasted screenshot, a PDF… */
  document?: ChatDocument | null
  canEdit: boolean
  canDelete: boolean
}

/** A file joined to a message (Collab::CommentSerializer#document_json). */
export type ChatDocument = {
  id: number
  title: string
  filename: string | null
  kind: string
  byteSize: number | null
  inLibrary: boolean
  previewUrl: string | null
  downloadUrl: string
}

/**
 * Whether the phone shows the file itself in the message: a picture the
 * server can scale (JPEG, PNG, WebP, GIF). Anything else is a card that
 * opens the file.
 */
export function showsAsPicture(document: Pick<ChatDocument, 'kind' | 'previewUrl'>): boolean {
  return document.kind === 'image' && !!document.previewUrl
}

/** The file's path on the server at a size (thumb, large, original, download). */
export function documentPath(mapId: number, documentId: number, size: 'thumb' | 'large' | 'original' | 'download'): string {
  return `/maps/${mapId}/documents/${documentId}/file?size=${size}`
}

/** « 1,2 Mo », « 340 ko »: a file's weight, to know before opening it on the terrain. */
export function fileSize(bytes: number | null | undefined): string | null {
  if (!bytes || bytes <= 0) return null
  if (bytes < 1000 * 1000) return `${Math.max(1, Math.round(bytes / 1000))} ko`
  return `${(bytes / 1_000_000).toFixed(1).replace('.', ',')} Mo`
}

/** Someone who can be @mentioned. */
export type ChatMember = { id: number; name: string; handle: string; avatarUrl: string | null }

/** The map's thread as the comments API gives it. */
export type ChatThread = { comments: ChatMessage[]; members: ChatMember[]; lastReadAt: string | null; subscribed: boolean }

/** Adds or replaces a message, keeping the list oldest first. */
export function upsertMessage(list: ChatMessage[], message: ChatMessage): ChatMessage[] {
  const others = list.filter((m) => m.id !== message.id)
  return [...others, message].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id)
}

export function removeMessage(list: ChatMessage[], id: number): ChatMessage[] {
  return list.filter((m) => m.id !== id)
}

/** What the composer knows of an element it can cite. */
export type Citable = { id: number; label: string; layer: string; meters?: number | null }

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

/** The « #query » or « @query » being typed right before the cursor, if any. */
export function typedQuery(text: string, cursor: number): { sign: '#' | '@'; start: number; query: string } | null {
  const before = text.slice(0, cursor)
  const cite = /(^|[\s(])#([^\s#@]*(?: [^\s#@]*){0,2})$/u.exec(before)
  if (cite && cite[2].length <= 40) return { sign: '#', start: before.length - cite[2].length - 1, query: cite[2] }
  const mention = /(^|[\s(])@([\p{L}\p{N}_.-]*)$/u.exec(before)
  if (mention) return { sign: '@', start: before.length - mention[2].length - 1, query: mention[2] }
  return null
}

/** Puts « #label » or « @handle » in place of what was being typed; returns the text and the cursor after it. */
export function insertToken(text: string, at: { start: number; query: string }, token: string): { text: string; cursor: number } {
  const end = at.start + 1 + at.query.length
  const next = `${text.slice(0, at.start)}${token} ${text.slice(end).replace(/^ /, '')}`
  return { text: next, cursor: at.start + token.length + 1 }
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * Elements whose label has a word starting with the query (accents
 * ignored), best first. On the terrain, what stands nearest comes first:
 * with no query, the elements around the person.
 */
export function matchCitables(items: Citable[], query: string, limit = 8): Citable[] {
  const q = fold(query.trim())
  const near = (a: Citable, b: Citable) => (a.meters ?? Infinity) - (b.meters ?? Infinity) || a.label.localeCompare(b.label, 'fr')
  if (!q) return items.slice().sort(near).slice(0, limit)
  const scored = items.flatMap((item) => {
    const label = fold(item.label)
    if (label.startsWith(q)) return [{ item, score: 0 }]
    if (label.split(/[\s'’-]+/).some((word) => word.startsWith(q))) return [{ item, score: 1 }]
    if (label.includes(q)) return [{ item, score: 2 }]
    return []
  })
  return scored.sort((a, b) => a.score - b.score || near(a.item, b.item)).slice(0, limit).map((s) => s.item)
}

/** People whose name or handle starts with the query. */
export function matchMembers(members: ChatMember[], query: string, limit = 6): ChatMember[] {
  const q = fold(query)
  return members
    .filter((m) => !q || fold(m.handle).startsWith(q) || fold(m.name).split(/\s+/).some((word) => word.startsWith(q)))
    .slice(0, limit)
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

/** Splits a message into text, @mentions, #cited elements and links (never markup). */
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

/** The messages pinned within `radius` meters of the person, nearest first: what was said about where one stands. */
export function pinnedHere(messages: ChatMessage[], me: Position, radius = 25): { message: ChatMessage; meters: number }[] {
  return messages
    .filter((m): m is ChatMessage & { location: Position } => Array.isArray(m.location))
    .map((message) => ({ message, meters: distance(me, message.location) }))
    .filter((m) => m.meters <= radius)
    .sort((a, b) => a.meters - b.meters)
}

/** True when two messages in a row come from the same person within five minutes: the second one carries no name. */
export function continues(previous: ChatMessage | undefined, message: ChatMessage): boolean {
  if (!previous || previous.author.id !== message.author.id) return false
  return Math.abs(Date.parse(message.createdAt) - Date.parse(previous.createdAt)) < 5 * 60_000
}

/** Messages from others after the last time one read the discussion (all of them when never read). */
export function unreadSince(messages: ChatMessage[], lastReadAt: string | null): number {
  return messages.filter((m) => !m.canEdit && (!lastReadAt || m.createdAt > lastReadAt)).length
}
