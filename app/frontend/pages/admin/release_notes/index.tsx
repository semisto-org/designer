import { Head, Link, router } from '@inertiajs/react'
import { ExternalLink, Pencil, Plus, ThumbsUp, Trash2 } from 'lucide-react'
import { AdminNav } from '@/components/admin/AdminNav'
import { ButtonLink } from '@/components/ui/Button'
import { Card, EmptyState } from '@/components/ui/Card'
import { t } from '@/lib/i18n'
import { formatLongDay } from '@/release_notes/format'
import type { AdminReleaseNote } from '@/types/releaseNotes'

const PATH = '/admin/release-notes'

/** Semisto staff: the « Nouveautés » entries, drafts included, with their thumbs up. */
export default function AdminReleaseNotes({ notes }: { notes: AdminReleaseNote[] }) {
  return (
    <div>
      <Head title={t('release_notes.admin.title')} />
      <AdminNav />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl">{t('release_notes.admin.title')}</h1>
          <p className="mt-1 max-w-3xl text-loam-500">{t('release_notes.admin.intro')}</p>
        </div>
        <div className="flex gap-2">
          <ButtonLink href="/nouveautes" variant="ghost"><ExternalLink className="h-4 w-4" aria-hidden />{t('release_notes.admin.view_page')}</ButtonLink>
          <ButtonLink href={`${PATH}/new`}><Plus className="h-4 w-4" aria-hidden />{t('release_notes.admin.new')}</ButtonLink>
        </div>
      </div>

      {notes.length === 0 ? (
        <div className="mt-6"><EmptyState title={t('release_notes.admin.empty')} /></div>
      ) : (
        <Card className="mt-6 p-0!">
          <ul className="divide-y divide-loam-100">
            {notes.map((note) => (
              <li key={note.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                {note.screenshotUrl ? (
                  <img src={note.screenshotUrl} alt="" className="h-12 w-20 shrink-0 rounded border border-loam-200 object-cover object-top" />
                ) : (
                  <span className="h-12 w-20 shrink-0 rounded border border-dashed border-loam-200 bg-loam-50" />
                )}
                <div className="min-w-0 flex-1">
                  <Link href={`${PATH}/${note.id}/edit`} className="font-medium text-loam-900 hover:text-prune-700 hover:underline">{note.title}</Link>
                  <p className="text-xs text-loam-500">
                    {formatLongDay(note.publishedOn)} ·{' '}
                    <span className={note.published ? 'text-leaf-700' : 'text-humus-700'}>
                      {t(note.published ? 'release_notes.admin.published' : 'release_notes.admin.draft')}
                    </span>
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-sm text-loam-600 tabular-nums">
                  <ThumbsUp className="h-4 w-4 text-leaf-600" aria-hidden />{t('release_notes.admin.likes', { count: note.likesCount })}
                </span>
                <div className="flex gap-1">
                  <Link href={`${PATH}/${note.id}/edit`} className="rounded-md p-1.5 text-loam-500 hover:bg-loam-100 hover:text-loam-900" title={t('release_notes.admin.edit')} aria-label={t('release_notes.admin.edit')}>
                    <Pencil className="h-4 w-4" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => { if (confirm(t('release_notes.admin.confirm_delete', { title: note.title }))) router.delete(`${PATH}/${note.id}`) }}
                    className="rounded-md p-1.5 text-loam-500 hover:bg-clay-50 hover:text-clay-600" title={t('release_notes.admin.delete')} aria-label={t('release_notes.admin.delete')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
