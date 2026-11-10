/**
 * What comes in when someone pastes a page written elsewhere: a Word or
 * LibreOffice document (HTML on the clipboard), a PDF (plain text only, its
 * lists and titles flattened to lines) or a spreadsheet (tab-separated
 * cells). Both functions turn it into the plain HTML the editor reads, so
 * that bullets stay lists, numbered points stay numbered, tables stay tables
 * and titles stay titles. Pure where it can be (`textToHtml`), so the rules
 * are tested on their own.
 */

/** A bullet as people type it or as a PDF draws it. */
// Symbol and Wingdings bullets come out of a PDF as private-use characters.
const BULLET = /^[-–—•·▪◦●○■□*o\uf0a7\uf0b7\uf076\uf0d8\uf0fc]$/
const BULLET_ITEM = /^\s*(?:[-–—•·▪◦●○■□*]\s+|[\uf0a7\uf0b7\uf076\uf0d8\uf0fc]\s*)(\S.*)$/
// « o » is Word's second-level bullet: only when a space and a word follow.
const O_ITEM = /^\s*o\s+(\S.*)$/
const ORDERED_ITEM = /^\s*(\d{1,2})\s*[.)]\s+(.+)$/

type Line = { text: string; raw: string }
type Item = { lines: string[]; children: { ordered: boolean; items: Item[] } | null }
type Block =
  | { kind: 'p'; lines: string[] }
  | { kind: 'h'; text: string }
  | { kind: 'list'; ordered: boolean; items: Item[]; markerless: boolean }
  | { kind: 'table'; rows: string[][] }

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** A short line ending with a colon, on its own: a title (« Sol : », « Gestion des vents : »). */
function titleOf(text: string): string | null {
  const match = /^(.{2,70}?)\s*:$/.exec(text)
  if (!match || /^[-–•·▪◦*]/.test(text) || ORDERED_ITEM.test(text)) return null
  return match[1]
}

/**
 * Plain text to HTML, or null when it is one line (nothing to rebuild).
 * Lines are wrapped where the PDF wrapped them: a line that follows a long
 * one belongs to it, a line after a short one starts anew.
 */
export function textToHtml(text: string): string | null {
  const source = text.replace(/\r\n?/g, '\n').replace(/ /g, ' ').replace(/\f/g, '\n')
  if (!source.trim().includes('\n')) return null
  const lines: Line[] = source.split('\n').map((raw) => ({ raw, text: raw.trim().replace(/\s+/g, ' ') }))
  const longest = Math.max(...lines.map((l) => l.text.length))
  // The PDF wrapped this line if the one before ran to the margin and the
  // sentence goes on: no closing punctuation, and a lower-case start.
  const wrapped = (previous: string | undefined, line: string) =>
    !!previous && longest >= 40 && previous.length >= longest * 0.72 && !/[.!?;:)…»]$/.test(previous) &&
    (/^[a-zà-ÿ(«"'’0-9]/.test(line) || /[,(–-]$/.test(previous))

  const blocks: Block[] = []
  const last = () => blocks[blocks.length - 1]
  const lastItem = (list: Extract<Block, { kind: 'list' }>): Item => {
    const item = list.items[list.items.length - 1]
    return item.children ? item.children.items[item.children.items.length - 1] : item
  }
  let blank = false
  let previous: string | undefined

  for (let i = 0; i < lines.length; i += 1) {
    const { text: line, raw } = lines[i]
    if (!line) {
      blank = true
      continue
    }
    const current = last()

    // Tab-separated cells, from a spreadsheet or a table read out of a PDF.
    const cells = raw.split('\t').map((c) => c.trim())
    if (cells.length > 1 && raw.includes('\t')) {
      const next = lines[i + 1]?.raw ?? ''
      if (current?.kind === 'table' && !blank) current.rows.push(cells)
      else if (next.includes('\t')) blocks.push({ kind: 'table', rows: [cells] })
      else blocks.push({ kind: 'p', lines: [cells.join(' ')] })
      blank = false
      previous = line
      continue
    }

    // A bullet alone on its line: the PDF put the text of the items below it.
    if (BULLET.test(line) && line !== 'o') {
      blocks.push({ kind: 'list', ordered: false, items: [], markerless: true })
      blank = false
      previous = undefined
      continue
    }

    const bullet = BULLET_ITEM.exec(line) ?? (current?.kind === 'list' ? O_ITEM.exec(line) : null)
    const ordered = ORDERED_ITEM.exec(line)
    if (bullet || ordered) {
      const text = bullet ? bullet[1] : ordered![2]
      const isOrdered = !bullet
      const item: Item = { lines: [text], children: null }
      if (current?.kind === 'list' && (current.ordered === isOrdered || current.markerless && current.items.length === 0)) {
        if (current.items.length === 0) current.ordered = isOrdered
        // An « o » under a bullet is its sub-item.
        if (!isOrdered && O_ITEM.test(line) && !BULLET_ITEM.test(line) && current.items.length) {
          const parent = current.items[current.items.length - 1]
          parent.children ??= { ordered: false, items: [] }
          parent.children.items.push(item)
        } else {
          current.items.push(item)
        }
      } else if (current?.kind === 'list' && current.items.length && isOrdered && !current.items[current.items.length - 1].children
        && (/:$/.test(current.items[current.items.length - 1].lines.join(' ')) || ordered![1] === '1' && !blank)) {
        // « 1) 2) 3) » under « … fruitiers : »: the points of that item.
        current.items[current.items.length - 1].children = { ordered: true, items: [item] }
      } else if (current?.kind === 'list' && current.items.length && current.items[current.items.length - 1].children?.ordered === isOrdered) {
        current.items[current.items.length - 1].children!.items.push(item)
      } else {
        blocks.push({ kind: 'list', ordered: isOrdered, items: [item], markerless: false })
      }
      blank = false
      previous = text
      continue
    }

    const title = titleOf(line)
    if (title && (blank || current?.kind !== 'list' && !wrapped(previous, line))) {
      blocks.push({ kind: 'h', text: title })
      blank = false
      previous = undefined
      continue
    }

    if (current?.kind === 'list') {
      // Under a lone bullet, each line is an item until the next blank line.
      if (current.markerless && (current.items.length === 0 || !blank)) {
        if (current.items.length && wrapped(previous, line)) lastItem(current).lines.push(line)
        else current.items.push({ lines: [line], children: null })
        blank = false
        previous = line
        continue
      }
      if (!blank) {
        lastItem(current).lines.push(line)
        previous = line
        continue
      }
    }

    if (current?.kind === 'p' && !blank && wrapped(previous, line)) current.lines.push(line)
    else blocks.push({ kind: 'p', lines: [line] })
    blank = false
    previous = line
  }

  return blocks.map(render).filter(Boolean).join('')
}

function joinLines(lines: string[]): string {
  return lines.reduce((out, line) => {
    if (!out) return line
    // A word cut at the end of a PDF line (« mycor- / rhizien »).
    if (/[a-zà-ÿ]-$/i.test(out) && /^[a-zà-ÿ]/.test(line)) return out.slice(0, -1) + line
    return `${out} ${line}`
  }, '')
}

function renderItems(ordered: boolean, items: Item[]): string {
  const tag = ordered ? 'ol' : 'ul'
  return `<${tag}>${items.map((item) => `<li><p>${escape(joinLines(item.lines))}</p>${item.children ? renderItems(item.children.ordered, item.children.items) : ''}</li>`).join('')}</${tag}>`
}

function render(block: Block): string {
  switch (block.kind) {
    case 'h': return `<h3>${escape(block.text)}</h3>`
    case 'p': return `<p>${escape(joinLines(block.lines))}</p>`
    case 'list': return block.items.length ? renderItems(block.ordered, block.items) : ''
    case 'table': {
      const width = Math.max(...block.rows.map((r) => r.length))
      const row = (cells: string[], tag: 'th' | 'td') => `<tr>${Array.from({ length: width }, (_, i) => `<${tag}><p>${escape(cells[i] ?? '')}</p></${tag}>`).join('')}</tr>`
      return `<table><tbody>${block.rows.map((r, i) => row(r, i === 0 ? 'th' : 'td')).join('')}</tbody></table>`
    }
  }
}

/**
 * Markdown typed elsewhere (an AI's answer, a README): titles, lists, a
 * table with its « |---| » line, bold. Pasted, it is read as Markdown.
 */
export function looksLikeMarkdown(text: string): boolean {
  const lines = text.split(/\r?\n/)
  let signs = 0
  for (const line of lines) {
    if (/^#{1,6}\s+\S/.test(line)) signs += 2
    else if (/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)) signs += 3
    else if (/\*\*[^*\n]+\*\*/.test(line)) signs += 1
    else if (/^\s*[-*]\s+\[[ xX]\]\s/.test(line)) signs += 2
  }
  return signs >= 2
}

/**
 * HTML from Word, LibreOffice, Pages or Google Docs, made plain: Word's
 * fake lists (paragraphs with a « mso-list » level and a typed bullet)
 * become real lists, a table's first row becomes its header, and the
 * office's own markup (styles, fonts, comments) goes. Needs a browser.
 */
export function cleanPastedHtml(html: string): string {
  if (typeof DOMParser === 'undefined') return html
  // Word wraps each typed bullet in a conditional comment: keep it findable.
  const marked = html
    .replace(/<!\[if !supportLists\]>([\s\S]*?)<!\[endif\]>/gi, '<span data-list-marker>$1</span>')
    .replace(/<!--\[if !supportLists\]-->([\s\S]*?)<!--\[endif\]-->/gi, '<span data-list-marker>$1</span>')
  const doc = new DOMParser().parseFromString(marked, 'text/html')
  doc.querySelectorAll('style, script, meta, link, title, xml').forEach((node) => node.remove())
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_COMMENT)
  const comments: Node[] = []
  while (walker.nextNode()) comments.push(walker.currentNode)
  comments.forEach((node) => node.parentNode?.removeChild(node))
  doc.querySelectorAll('o\\:p').forEach((node) => node.remove())

  rebuildWordLists(doc)
  // The office's column widths would pin the table narrow: it takes the page's width.
  doc.querySelectorAll('colgroup').forEach((node) => node.remove())
  doc.querySelectorAll('table, tr, td, th').forEach((cell) => {
    for (const attr of ['width', 'style', 'colwidth', 'height']) cell.removeAttribute(attr)
  })
  // Empty lines the office keeps to space its page out (in a cell, between paragraphs).
  doc.querySelectorAll('p').forEach((p) => {
    p.querySelectorAll('br').forEach((br) => { if (!br.nextSibling || br.nextSibling.textContent?.trim() === '' && !br.nextSibling.nextSibling) br.remove() })
    if (!p.textContent?.replace(/ /g, ' ').trim() && !p.querySelector('img')) {
      const cell = p.closest('td, th')
      if (!cell || cell.querySelectorAll('p').length > 1) p.remove()
    }
  })
  // A short line ending with a colon, on its own (« Raison d'être : »): a title, as from a PDF.
  doc.body.querySelectorAll(':scope > p, :scope > div > p').forEach((p) => {
    const title = titleOf((p.textContent ?? '').replace(/\s+/g, ' ').trim())
    if (!title || p.querySelector('img')) return
    const heading = doc.createElement('h3')
    heading.textContent = title
    p.replaceWith(heading)
  })
  doc.querySelectorAll('table').forEach((table) => {
    if (table.querySelector('th')) return
    const first = table.querySelector('tr')
    first?.querySelectorAll('td').forEach((td) => {
      const th = doc.createElement('th')
      th.innerHTML = td.innerHTML
      td.replaceWith(th)
    })
  })
  return doc.body.innerHTML
}

/** Word's list paragraphs (`mso-list: l0 level2`), grouped into nested lists. */
function rebuildWordLists(doc: Document) {
  const isListParagraph = (el: Element | null): el is HTMLElement =>
    !!el && el.tagName === 'P' && (/mso-list:\s*l\d/i.test(el.getAttribute('style') ?? '') || /MsoListParagraph/i.test(el.className))
  const paragraphs = Array.from(doc.body.querySelectorAll('p')).filter(isListParagraph)
  const done = new Set<Element>()
  for (const start of paragraphs) {
    if (done.has(start)) continue
    const run: HTMLElement[] = []
    let el: Element | null = start
    while (isListParagraph(el)) {
      run.push(el)
      done.add(el)
      el = el.nextElementSibling
    }
    const root = doc.createElement('div')
    const stack: { level: number; list: HTMLElement }[] = []
    for (const p of run) {
      const level = Number(/level(\d)/i.exec(p.getAttribute('style') ?? '')?.[1] ?? 1)
      const markerEl = p.querySelector('[data-list-marker]')
      const marker = (markerEl?.textContent ?? '').replace(/\s+/g, '').trim()
      markerEl?.remove()
      const ordered = /^(\d+|[a-z]|[ivxlc]+)[.)]$/i.test(marker)
      while (stack.length && stack[stack.length - 1].level > level) stack.pop()
      let top = stack[stack.length - 1]
      if (!top || top.level < level) {
        const list = doc.createElement(ordered ? 'ol' : 'ul')
        const parentItem = top?.list.lastElementChild
        ;(parentItem ?? root).appendChild(list)
        top = { level, list }
        stack.push(top)
      }
      const li = doc.createElement('li')
      const inner = doc.createElement('p')
      inner.innerHTML = p.innerHTML.replace(/^(\s|&nbsp;)+/, '')
      li.appendChild(inner)
      top.list.appendChild(li)
    }
    run[0].before(...Array.from(root.childNodes))
    run.forEach((p) => p.remove())
  }
}
