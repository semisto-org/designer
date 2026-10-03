import { Head, usePage } from '@inertiajs/react'
import { createElement } from 'react'
import type { MetaTag } from '@/types/billing'

const APP_SUFFIX = / · Semisto Designer$/

/**
 * The server renders title, description, canonical, Open Graph and structured
 * data into the HTML (so crawlers and link previews see them). This mirrors
 * the same tags for in-app navigation, from the `_inertia_meta` prop, so the
 * head stays in sync when moving between public pages.
 */
export function MetaHead() {
  const meta = (usePage().props as { _inertia_meta?: MetaTag[] })._inertia_meta
  if (!meta?.length) return null
  return (
    <Head>
      {meta.map((tag) => {
        const { tagName, headKey, type, innerContent, ...attributes } = tag
        if (tagName === 'title') return <title key={headKey}>{String(innerContent).replace(APP_SUFFIX, '')}</title>
        if (tagName === 'script') {
          const json = JSON.stringify(innerContent).replace(/</g, '\\u003c')
          return createElement('script', { key: headKey, 'head-key': headKey, type, dangerouslySetInnerHTML: { __html: json } })
        }
        return createElement(tagName, { key: headKey, 'head-key': headKey, ...attributes })
      })}
    </Head>
  )
}
