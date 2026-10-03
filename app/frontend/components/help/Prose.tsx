import clsx from 'clsx'
import type { MouseEvent } from 'react'

// The typography plugin, themed with the Semisto tokens.
const PROSE =
  'prose max-w-none text-[0.95rem] ' +
  '[--tw-prose-body:var(--color-loam-700)] [--tw-prose-headings:var(--color-loam-900)] [--tw-prose-lead:var(--color-loam-600)] ' +
  '[--tw-prose-links:var(--color-prune-600)] [--tw-prose-bold:var(--color-loam-900)] [--tw-prose-counters:var(--color-loam-400)] ' +
  '[--tw-prose-bullets:var(--color-loam-300)] [--tw-prose-hr:var(--color-loam-200)] [--tw-prose-quotes:var(--color-loam-800)] ' +
  '[--tw-prose-quote-borders:var(--color-leaf-300)] [--tw-prose-captions:var(--color-loam-400)] [--tw-prose-code:var(--color-loam-800)] ' +
  '[--tw-prose-th-borders:var(--color-loam-200)] [--tw-prose-td-borders:var(--color-loam-200)] ' +
  'prose-headings:font-semibold prose-h2:mt-9 prose-h2:text-xl prose-h3:text-base prose-a:font-medium prose-a:no-underline hover:prose-a:underline ' +
  'prose-code:rounded prose-code:bg-loam-100 prose-code:px-1 prose-code:py-0.5 prose-code:font-normal prose-code:before:content-none prose-code:after:content-none ' +
  'prose-blockquote:not-italic prose-img:rounded-lg'

/**
 * Renders the HTML of a help article (Markdown rendered and sanitised on the
 * server: raw HTML in the source is dropped by Commonmarker).
 */
export function Prose({ html, className, onClick }: { html: string; className?: string; onClick?: (event: MouseEvent<HTMLDivElement>) => void }) {
  return <div className={clsx(PROSE, className)} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
}
