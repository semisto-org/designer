import { useEffect, useState } from 'react'
import { MarkdownEditor } from '@/documents/markdown/MarkdownEditor'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'

/** A Markdown document in the library's viewer: the page itself, on paper, to read before opening it. */
export function MarkdownPreview({ url, title }: { url: string; title: string }) {
  const [content, setContent] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    setContent(null)
    setFailed(false)
    api<{ content: string }>(`${url}/content`, { signal: controller.signal })
      .then((data) => setContent(data.content))
      .catch((e) => { if ((e as Error).name !== 'AbortError') setFailed(true) })
    return () => controller.abort()
  }, [url])

  return (
    <div className="h-full max-h-full w-full max-w-3xl overflow-y-auto rounded-2xl bg-[#fffdf8] px-6 py-8 text-loam-900 sm:px-10">
      {failed ? <p className="text-loam-500">{t('documents.markdown.errors.save_failed')}</p>
        : content === null ? <p className="text-loam-500">{t('documents.viewer.loading')}</p>
          : (
            <>
              {!/^\s*#\s/.test(content) && <h1 className="mb-6 font-serif text-3xl">{title}</h1>}
              {content.trim() ? <MarkdownEditor content={content} editable={false} /> : <p className="text-loam-500">{t('documents.markdown.empty_read')}</p>}
            </>
          )}
    </div>
  )
}
