import clsx from 'clsx'
import { MarkdownEditor } from '@/documents/markdown/MarkdownEditor'
import { slideDensity, slideMarkdown } from './slideMarkdown'

/**
 * Typography of a text slide, read from across a room: serif titles, lists
 * with a leaf-green mark, tables as a designer lays out needs beside
 * functions. The type shrinks as the slide says more (slideSize), never
 * under 16 px.
 */
export const SLIDE_PROSE = clsx(
  'prose max-w-none text-[1em] leading-relaxed text-loam-800 prose-p:my-3',
  'prose-headings:font-serif prose-headings:font-normal prose-headings:not-italic prose-headings:text-loam-900',
  'prose-h1:text-[1.9em] prose-h2:text-[1.6em] prose-h3:text-[1.35em] prose-h3:text-prune-800 prose-h3:mb-2 prose-h3:mt-6 first:prose-headings:mt-0',
  'prose-strong:text-loam-900 prose-a:text-prune-700 prose-li:my-1 prose-li:marker:text-leaf-600',
  'prose-blockquote:border-l-leaf-400 prose-blockquote:font-normal prose-blockquote:not-italic',
  'prose-table:my-4 prose-table:text-[0.9em] prose-th:bg-leaf-50 prose-th:text-left prose-th:text-leaf-900',
  'markdown-page',
)

/** The slide's type size, set around the page (the page follows in em). */
export function slideSize(body: string) {
  const density = slideDensity(body)
  if (density === 'short') return 'text-xl sm:text-2xl'
  if (density === 'medium') return 'text-lg sm:text-xl'
  return 'text-base sm:text-lg'
}

/** What the audience reads on a text slide, its Markdown rendered as a page. */
export function SlideBody({ body, className }: { body: string; className?: string }) {
  const markdown = slideMarkdown(body)
  return (
    <div className={clsx(slideSize(markdown), className)}>
      <MarkdownEditor key={markdown} content={markdown} editable={false} prose={SLIDE_PROSE} />
    </div>
  )
}
