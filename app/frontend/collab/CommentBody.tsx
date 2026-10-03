import { Fragment, useMemo } from 'react'
import type { Mention } from '@/types/collab'

type Token = { kind: 'text' | 'mention' | 'link'; value: string }

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Splits a plain-text comment into text, @mentions (the handles the server
 * resolved) and http(s) links. Everything is rendered as React text nodes:
 * there is no HTML in a comment, whatever it contains.
 */
export function tokenize(body: string, mentions: Mention[]): Token[] {
  const handles = [...new Set(mentions.map((m) => m.handle))].sort((a, b) => b.length - a.length)
  const parts = [
    handles.length ? `(?<![\\p{L}\\p{N}_@])@(?:${handles.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}_])` : null,
    'https?:\\/\\/[^\\s<>"\']+',
  ].filter(Boolean)
  const pattern = new RegExp(parts.join('|'), 'giu')
  const tokens: Token[] = []
  let last = 0
  for (const match of body.matchAll(pattern)) {
    let value = match[0]
    const index = match.index ?? 0
    const isLink = /^https?:/i.test(value)
    if (isLink) value = value.replace(/[.,;:!?)\]]+$/, '')
    if (index > last) tokens.push({ kind: 'text', value: body.slice(last, index) })
    tokens.push({ kind: isLink ? 'link' : 'mention', value })
    last = index + value.length
  }
  if (last < body.length) tokens.push({ kind: 'text', value: body.slice(last) })
  return tokens
}

export function CommentBody({ body, mentions }: { body: string; mentions: Mention[] }) {
  const tokens = useMemo(() => tokenize(body, mentions), [body, mentions])
  return (
    <p className="whitespace-pre-wrap break-words text-sm text-loam-800">
      {tokens.map((token, i) => (
        <Fragment key={i}>
          {token.kind === 'mention' && <span className="rounded bg-prune-50 px-0.5 font-medium text-prune-700">{token.value}</span>}
          {token.kind === 'link' && (
            <a href={token.value} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-prune-600 underline underline-offset-2">{token.value}</a>
          )}
          {token.kind === 'text' && token.value}
        </Fragment>
      ))}
    </p>
  )
}
