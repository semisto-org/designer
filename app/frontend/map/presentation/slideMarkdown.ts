/**
 * A text slide's body is Markdown (titles, lists, tables, bold), written by
 * the slide editor or by an AI. Slides written before it held plain lines,
 * one thought per line, with « - » or « • » for a list: read as Markdown,
 * those lines would run together into one paragraph. This keeps each of
 * them on its own, and leaves real Markdown as it is.
 */
export function slideMarkdown(body: string): string {
  const lines = body.replace(/\r\n?/g, '\n').split('\n').map((line) => line.replace(/^(\s*)•\s+/, '$1- '))
  const out: string[] = []
  let fence = false
  lines.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence
    const previous = lines[i - 1]
    const plain = (s: string) => s.trim() !== '' && !/^\s/.test(s) && !/^(#{1,6}\s|[-*+]\s|\d+[.)]\s|\||>|```|~~~)/.test(s)
    // Two plain lines in a row: in the old slides, two paragraphs.
    if (!fence && previous !== undefined && plain(line) && previous.trim() !== '' && !/^\|/.test(previous) && !/(\\|\s{2})$/.test(previous) && !/^(#{1,6})\s/.test(previous)) {
      out.push('')
    }
    out.push(line)
  })
  return out.join('\n')
}

/** How much a slide says, to size its type: a few lines large, a full page smaller. */
export function slideDensity(body: string): 'short' | 'medium' | 'long' {
  const text = body.replace(/[|#*_`>-]/g, '').replace(/\s+/g, ' ').trim()
  const rows = body.split('\n').filter((line) => line.trim()).length
  if (text.length <= 420 && rows <= 9) return 'short'
  if (text.length <= 1100 && rows <= 22) return 'medium'
  return 'long'
}

/**
 * A long text cut at its titles: what comes before the first title (`lead`),
 * then one section per title of the highest level used. Pasted from a
 * pre-project of ten headings, it becomes ten slides.
 */
export function splitByHeadings(body: string): { lead: string; sections: { title: string; body: string }[] } {
  const lines = body.split('\n')
  let fence = false
  const levels = lines.flatMap((line) => {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence
    const match = !fence && /^(#{1,3})\s+\S/.exec(line)
    return match ? [match[1].length] : []
  })
  if (levels.length === 0) return { lead: body, sections: [] }
  const level = Math.min(...levels)
  const heading = new RegExp(`^#{${level}}\\s+(.+?)\\s*#*\\s*$`)
  const lead: string[] = []
  const sections: { title: string; lines: string[] }[] = []
  fence = false
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence
    const match = !fence && heading.exec(line)
    if (match) sections.push({ title: match[1].replace(/\*\*|__/g, '').replace(/\s*:$/, '').trim(), lines: [] })
    else (sections.length ? sections[sections.length - 1].lines : lead).push(line)
  }
  return { lead: lead.join('\n').trim(), sections: sections.map((s) => ({ title: s.title.slice(0, 120), body: s.lines.join('\n').trim() })) }
}
