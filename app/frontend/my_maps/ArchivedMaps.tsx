import { Link, router } from '@inertiajs/react'
import { Archive } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { t } from '@/lib/i18n'

export type ArchivedMap = { id: number; name: string; archivedAt: string; teamId: number | null; canRestore: boolean }

const longDate = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })

/** The maps their owner put away, at the bottom of « Mes cartes »: kept, readable, and brought back when the plan has room. */
export function ArchivedMaps({ maps }: { maps: ArchivedMap[] }) {
  if (maps.length === 0) return null
  return (
    <section className="mt-16" aria-labelledby="archived-maps">
      <h2 id="archived-maps" className="flex items-center gap-2 border-b border-loam-200 pb-2 text-2xl">
        <Archive className="h-5 w-5 text-loam-400" aria-hidden="true" />
        {t('maps.archives.section_title')}
      </h2>
      <p className="mt-2 max-w-prose text-sm text-loam-600">{t('maps.archives.section_intro')}</p>
      <ul className="mt-4 divide-y divide-dashed divide-loam-200">
        {maps.map((map) => (
          <li key={map.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <Link href={`/maps/${map.id}`} className="font-serif text-lg font-semibold text-loam-900 hover:underline">{map.name}</Link>
              <p className="text-sm text-loam-500">{t('maps.archives.archived_on', { date: longDate.format(new Date(map.archivedAt)) })}</p>
            </div>
            <div className="flex items-center gap-2">
              {!map.canRestore && <span className="max-w-xs text-sm text-loam-500">{t('maps.archives.restore_full')}</span>}
              <Button size="sm" variant="secondary" disabled={!map.canRestore} onClick={() => router.delete(`/maps/${map.id}/archive`)}>
                {t('maps.archives.restore')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The owner's small « Archiver » button, pinned on a map card. */
export function ArchiveButton({ id, name }: { id: number; name: string }) {
  return (
    <button
      type="button"
      onClick={() => router.post(`/maps/${id}/archive`)}
      title={t('maps.archives.archive_title', { name })}
      className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-[#fffdf7]/90 px-2.5 py-1 text-sm text-loam-600 opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-within:opacity-100 hover:text-loam-900 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-prune-600"
    >
      <Archive className="h-3.5 w-3.5" aria-hidden="true" />
      {t('maps.archives.archive')}
    </button>
  )
}
