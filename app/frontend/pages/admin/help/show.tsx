import { Head, Link, router } from '@inertiajs/react'
import { ExternalLink, SearchX, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import { AdminNav } from '@/components/admin/AdminNav'
import { ButtonLink } from '@/components/ui/Button'
import { Card, EmptyState } from '@/components/ui/Card'
import { t } from '@/lib/i18n'
import { relativeTime } from '@/lib/relativeTime'

type Article = { slug: string; title: string; category: string; url: string; helpful: number; unhelpful: number }
type Comment = { id: number; slug: string; title: string; helpful: boolean; comment: string; author: string | null; createdAt: string }
type Miss = { id: number; query: string; count: number; lastSearchedAt: string }

/** Semisto staff: what readers say about the guides, and the searches that found nothing. */
export default function AdminHelp({ articles, comments, misses }: { articles: Article[]; comments: Comment[]; misses: Miss[] }) {
  const answered = articles.filter((a) => a.helpful + a.unhelpful > 0)
  return (
    <div>
      <Head title={t('help.admin.title')} />
      <AdminNav />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl">{t('help.admin.title')}</h1>
          <p className="mt-1 max-w-3xl text-loam-500">{t('help.admin.intro')}</p>
        </div>
        <ButtonLink href="/help" variant="ghost"><ExternalLink className="h-4 w-4" aria-hidden />{t('help.admin.view_center')}</ButtonLink>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="help-admin-misses">
          <h2 id="help-admin-misses" className="flex items-center gap-2 text-lg"><SearchX className="h-5 w-5 text-humus-600" aria-hidden />{t('help.admin.misses_title')}</h2>
          <p className="mt-1 text-sm text-loam-500">{t('help.admin.misses_intro')}</p>
          {misses.length === 0 ? (
            <div className="mt-3"><EmptyState title={t('help.admin.misses_empty')} /></div>
          ) : (
            <Card className="mt-3 p-0!">
              <ul className="divide-y divide-loam-100">
                {misses.map((miss) => (
                  <li key={miss.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1 truncate font-medium text-loam-900">« {miss.query} »</span>
                    <span className="shrink-0 text-sm text-loam-500 tabular-nums">{t('help.admin.times', { count: miss.count })} · {relativeTime(miss.lastSearchedAt)}</span>
                    <button
                      type="button"
                      onClick={() => router.delete(`/admin/help/misses/${miss.id}`, { preserveScroll: true })}
                      aria-label={t('help.admin.clear_miss', { query: miss.query })}
                      title={t('help.admin.clear_miss', { query: miss.query })}
                      className="shrink-0 rounded-md p-1 text-loam-400 hover:bg-loam-100 hover:text-loam-800"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>

        <section aria-labelledby="help-admin-comments">
          <h2 id="help-admin-comments" className="text-lg">{t('help.admin.comments_title')}</h2>
          <p className="mt-1 text-sm text-loam-500">{t('help.admin.comments_intro')}</p>
          {comments.length === 0 ? (
            <div className="mt-3"><EmptyState title={t('help.admin.comments_empty')} /></div>
          ) : (
            <ul className="mt-3 space-y-3">
              {comments.map((comment) => (
                <li key={comment.id}>
                  <Card className="p-4!">
                    <p className="flex flex-wrap items-center gap-x-2 text-sm text-loam-500">
                      {comment.helpful ? <ThumbsUp className="h-4 w-4 text-leaf-600" aria-label={t('help.feedback.yes')} /> : <ThumbsDown className="h-4 w-4 text-clay-600" aria-label={t('help.feedback.no')} />}
                      <Link href={`/help/${comment.slug}`} className="font-medium text-loam-900 hover:text-prune-700 hover:underline">{comment.title}</Link>
                      <span>· {comment.author ?? t('help.admin.anonymous')} · {relativeTime(comment.createdAt)}</span>
                    </p>
                    <p className="mt-2 whitespace-pre-line text-loam-800">{comment.comment}</p>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="help-admin-articles" className="mt-8">
        <h2 id="help-admin-articles" className="text-lg">{t('help.admin.articles_title')}</h2>
        <p className="mt-1 text-sm text-loam-500">{t('help.admin.articles_intro', { count: answered.length })}</p>
        <Card className="mt-3 overflow-x-auto p-0!">
          <table className="w-full text-sm">
            <thead className="text-left text-loam-500">
              <tr className="border-b border-loam-100">
                <th className="px-4 py-2.5 font-medium">{t('help.admin.column_guide')}</th>
                <th className="px-4 py-2.5 font-medium">{t('help.admin.column_category')}</th>
                <th className="px-4 py-2.5 text-right font-medium">{t('help.feedback.yes')}</th>
                <th className="px-4 py-2.5 text-right font-medium">{t('help.feedback.no')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-loam-100">
              {articles.map((article) => (
                <tr key={article.slug}>
                  <td className="px-4 py-2.5"><Link href={article.url} className="font-medium text-loam-900 hover:text-prune-700 hover:underline">{article.title}</Link></td>
                  <td className="px-4 py-2.5 text-loam-500">{article.category}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-leaf-700">{article.helpful || '–'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-clay-700">{article.unhelpful || '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  )
}
