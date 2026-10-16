import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { t } from '@/lib/i18n'

type Heading = { level: number; text: string; element: HTMLElement }

/**
 * The page's headings, beside it on a wide screen, for a long document.
 * Read from the rendered page so it always matches what is written.
 */
export function Contents({ root, version }: { root: HTMLElement | null; version: unknown }) {
  const [headings, setHeadings] = useState<Heading[]>([])
  useEffect(() => {
    if (!root) return
    const found = [...root.querySelectorAll<HTMLElement>('h1, h2, h3')]
      .map((element) => ({ level: Number(element.tagName[1]), text: element.textContent?.trim() ?? '', element }))
      .filter((h) => h.text)
    setHeadings(found)
  }, [root, version])

  if (headings.length < 3) return null
  const top = Math.min(...headings.map((h) => h.level))
  return (
    <nav aria-label={t('documents.markdown.contents')} className="sticky top-20 hidden max-h-[calc(100dvh-6rem)] overflow-y-auto xl:block print:hidden">
      <p className="mb-2 text-sm font-medium text-loam-500">{t('documents.markdown.contents')}</p>
      <ul className="space-y-1 border-l border-loam-900/10 text-sm">
        {headings.map((h, i) => (
          <li key={i}>
            <button type="button" onClick={() => h.element.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className={clsx('block w-full truncate py-0.5 pr-2 text-left text-loam-600 hover:text-prune-700', h.level - top === 0 ? 'pl-3 font-medium' : h.level - top === 1 ? 'pl-6' : 'pl-9')}>
              {h.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
