import { Head, router } from '@inertiajs/react'
import { ArrowDown, ArrowUp, ExternalLink } from 'lucide-react'
import { AdminNav } from '@/components/admin/AdminNav'
import type { GalleryCard } from '@/components/site/Gallery'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/Card'
import { formatArea, t } from '@/lib/i18n'
import { formatDate } from '@/lib/money'

type Row = Omit<GalleryCard, 'boundary'> & { id: number; mapName: string; ownerEmail: string | null; chosen: boolean; tour: boolean; publishedAt: string }

/** « Carnets ouverts »: the published maps offered by their owners, and the ones the public site shows. */
export default function AdminGallery({ publications }: { publications: Row[] }) {
  const choose = (row: Row, choice: 'show' | 'hide' | 'tour' | 'up' | 'down') =>
    router.patch(`/admin/gallery/${row.id}`, { choice }, { preserveScroll: true })
  const chosen = publications.filter((row) => row.chosen)

  return (
    <div>
      <Head title={t('admin.gallery.title')} />
      <AdminNav />
      <h1 className="text-2xl">{t('admin.gallery.title')}</h1>
      <p className="mt-1 max-w-3xl text-loam-500">{t('admin.gallery.intro')}</p>

      {publications.length === 0 ? (
        <div className="mt-8"><EmptyState title={t('admin.gallery.empty_title')}>{t('admin.gallery.empty')}</EmptyState></div>
      ) : (
        <ul className="mt-8 grid gap-4">
          {publications.map((row) => {
            const position = chosen.indexOf(row)
            return (
              <li key={row.id} className="flex flex-col gap-4 rounded-2xl bg-white p-4 ring-1 ring-loam-200 sm:flex-row sm:items-center">
                {row.previewPath
                  ? <img src={row.previewPath} alt="" className="aspect-[1200/630] w-full shrink-0 rounded-lg bg-loam-100 object-cover sm:w-48" />
                  : <div className="grid aspect-[1200/630] w-full shrink-0 place-items-center rounded-lg bg-loam-100 text-sm text-loam-500 sm:w-48">{t('admin.gallery.no_preview')}</div>}
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <a href={row.path} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-serif text-lg font-semibold text-prune-900 hover:underline">
                      {row.title}
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </a>
                    {row.chosen && <span className="rounded-full bg-leaf-100 px-2.5 py-0.5 text-sm font-medium text-leaf-800">{t('admin.gallery.shown')}</span>}
                    {row.tour && <span className="rounded-full bg-prune-100 px-2.5 py-0.5 text-sm font-medium text-prune-800">{t('admin.gallery.tour')}</span>}
                  </p>
                  <p className="mt-1 text-sm text-loam-500">
                    {[row.mapName, row.ownerEmail, row.areaM2 ? formatArea(row.areaM2) : null, row.regionName, t('admin.gallery.published', { date: formatDate(row.publishedAt) })].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {row.chosen ? (
                    <>
                      <Button size="sm" variant="ghost" disabled={position <= 0} onClick={() => choose(row, 'up')} aria-label={t('admin.gallery.up')}><ArrowUp className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" disabled={position === chosen.length - 1} onClick={() => choose(row, 'down')} aria-label={t('admin.gallery.down')}><ArrowDown className="h-4 w-4" /></Button>
                      {!row.tour && <Button size="sm" variant="secondary" onClick={() => choose(row, 'tour')}>{t('admin.gallery.choose_tour')}</Button>}
                      <Button size="sm" variant="secondary" onClick={() => choose(row, 'hide')}>{t('admin.gallery.hide')}</Button>
                    </>
                  ) : (
                    <Button size="sm" onClick={() => choose(row, 'show')}>{t('admin.gallery.show')}</Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
