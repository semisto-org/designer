import { Head, Link } from '@inertiajs/react'
import clsx from 'clsx'
import { ArrowDown, ArrowUp, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { AdminNav } from '@/components/admin/AdminNav'
import { PlanBadge } from '@/components/admin/UserActions'
import { Card, EmptyState } from '@/components/ui/Card'
import { Input } from '@/components/ui/Field'
import { t } from '@/lib/i18n'
import { formatDate } from '@/lib/money'
import { relativeTime } from '@/lib/relativeTime'
import type { AdminMapCounts, AdminMapStatsRow } from '@/types/admin'

type Props = { maps: AdminMapStatsRow[] }

type CountKey = keyof AdminMapCounts
type SortKey = 'map' | 'owner' | 'area' | 'people' | 'lastActivity' | CountKey

// The figure columns, in the order of the table; `people` sums editors and viewers.
const FIGURES: { key: SortKey; label: string }[] = [
  { key: 'palette', label: 'palette' },
  { key: 'plants', label: 'plants' },
  { key: 'patches', label: 'patches' },
  { key: 'features', label: 'features' },
  { key: 'drafts', label: 'drafts' },
  { key: 'people', label: 'people' },
  { key: 'comments', label: 'comments' },
  { key: 'photos', label: 'photos' },
  { key: 'planImages', label: 'plan_images' },
  { key: 'aiActions', label: 'ai_actions' },
]

const numbers = new Intl.NumberFormat('fr-BE', { maximumFractionDigits: 1 })

function sortValue(map: AdminMapStatsRow, key: SortKey): number | string {
  switch (key) {
    case 'map': return map.name.toLocaleLowerCase('fr')
    case 'owner': return map.owner.name.toLocaleLowerCase('fr')
    case 'area': return map.areaM2 ?? -1
    case 'people': return map.counts.editors + map.counts.viewers
    case 'lastActivity': return map.lastActivityAt ?? ''
    default: return map.counts[key]
  }
}

function formatArea(m2: number | null) {
  if (m2 == null) return t('admin.maps.no_area')
  return m2 >= 10_000 ? `${numbers.format(m2 / 10_000)} ha` : `${numbers.format(m2)} m²`
}

/** Super admin: every map of every account with its figures, sortable. */
export default function AdminMaps({ maps }: Props) {
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'lastActivity', desc: true })

  const rows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('fr')
    const filtered = maps.filter((map) => {
      if (map.archived && !showArchived) return false
      if (!needle) return true
      return [map.name, map.owner.name, map.owner.email, map.region ?? '', map.team ?? '']
        .some((text) => text.toLocaleLowerCase('fr').includes(needle))
    })
    return [...filtered].sort((a, b) => {
      const x = sortValue(a, sort.key)
      const y = sortValue(b, sort.key)
      const order = x < y ? -1 : x > y ? 1 : b.id - a.id
      return sort.desc ? -order : order
    })
  }, [maps, query, showArchived, sort])

  const totals = useMemo(() => {
    const sum = (key: CountKey) => rows.reduce((total, map) => total + map.counts[key], 0)
    return { palette: sum('palette'), plants: sum('plants'), features: sum('features'), comments: sum('comments'), photos: sum('photos') }
  }, [rows])

  // Text columns start A→Z, figures and dates start with the largest.
  const toggle = (key: SortKey) => setSort((current) =>
    current.key === key ? { key, desc: !current.desc } : { key, desc: !['map', 'owner'].includes(key) })

  const header = (key: SortKey, label: string, hint?: string, align: 'left' | 'right' = 'right') => (
    <th scope="col" className={clsx('whitespace-nowrap px-2 py-2 font-medium first:pl-4 last:pr-4', align === 'right' ? 'text-right' : 'text-left')}
      aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : undefined}>
      <button type="button" onClick={() => toggle(key)} title={hint}
        className={clsx('inline-flex items-center gap-1 hover:text-loam-900', sort.key === key && 'text-prune-700')}>
        {label}
        {sort.key === key && (sort.desc ? <ArrowDown className="h-3 w-3" aria-hidden /> : <ArrowUp className="h-3 w-3" aria-hidden />)}
      </button>
    </th>
  )

  return (
    <div>
      <Head title={t('admin.maps.title')} />
      <AdminNav />
      <h1 className="text-2xl">{t('admin.maps.title')}</h1>
      <p className="mt-1 text-loam-500">{t('admin.maps.intro')}</p>

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-loam-400" aria-hidden />
          <Input
            type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={t('admin.maps.search')} aria-label={t('admin.maps.search')} className="pl-9!"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-loam-700">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)}
            className="h-4 w-4 rounded border-loam-300 text-prune-600" />
          {t('admin.maps.show_archived')}
        </label>
        <span className="text-sm text-loam-500">{t('admin.maps.count', { count: rows.length })}</span>
      </div>
      {rows.length > 0 && (
        <p className="mt-2 text-sm text-loam-500">
          {t('admin.maps.totals', {
            palette: numbers.format(totals.palette), plants: numbers.format(totals.plants), features: numbers.format(totals.features),
            comments: numbers.format(totals.comments), photos: numbers.format(totals.photos),
          })}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="mt-6"><EmptyState title={t('admin.maps.empty')} /></div>
      ) : (
        <Card className="mt-4 overflow-x-auto p-0!">
          <table className="w-full text-sm">
            <thead className="border-b border-loam-100 bg-loam-50 text-xs text-loam-500">
              <tr>
                {header('map', t('admin.maps.columns.map'), undefined, 'left')}
                {header('owner', t('admin.maps.columns.owner'), undefined, 'left')}
                {header('area', t('admin.maps.columns.area'))}
                {FIGURES.map((figure) => header(figure.key, t(`admin.maps.columns.${figure.label}`), t(`admin.maps.hints.${figure.label}`)))}
                {header('lastActivity', t('admin.maps.columns.last_activity'))}
              </tr>
            </thead>
            <tbody className="divide-y divide-loam-100">
              {rows.map((map) => (
                <tr key={map.id} className={clsx('align-top hover:bg-loam-50/60', map.archived && 'text-loam-400')}>
                  <td className="min-w-44 py-2 pl-4 pr-2">
                    <p className="font-medium text-loam-900">
                      {map.name} <span className="font-normal text-loam-400">#{map.id}</span>
                    </p>
                    <p className="flex flex-wrap gap-x-1.5 text-xs text-loam-500 [&>span+span]:before:mr-1.5 [&>span+span]:before:content-['·']">
                      <span>{t(`maps.stages.${map.stage}`)}</span>
                      {map.region && <span>{map.region}</span>}
                      {map.team && <span>{t('admin.maps.team', { name: map.team })}</span>}
                      {map.published && <span className="text-leaf-700">{t('admin.maps.published')}</span>}
                      {map.archived && <span className="text-clay-700">{t('admin.maps.archived')}</span>}
                    </p>
                  </td>
                  <td className="min-w-32 px-2 py-2">
                    <Link href="/admin/users" data={{ q: map.owner.email }} className="font-medium text-loam-900 hover:text-prune-700 hover:underline">
                      {map.owner.name}
                    </Link>
                    <p className="text-xs"><PlanBadge plan={map.owner.plan} /></p>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-loam-700">{formatArea(map.areaM2)}</td>
                  {FIGURES.map((figure) => {
                    const value = figure.key === 'people'
                      ? `${map.counts.editors} · ${map.counts.viewers}`
                      : numbers.format(map.counts[figure.key as CountKey])
                    const empty = figure.key === 'people' ? map.counts.editors + map.counts.viewers === 0 : map.counts[figure.key as CountKey] === 0
                    return (
                      <td key={figure.key} className={clsx('whitespace-nowrap px-2 py-2 text-right tabular-nums', empty ? 'text-loam-300' : 'text-loam-800')}>
                        {value}
                      </td>
                    )
                  })}
                  <td className="whitespace-nowrap py-2 pl-2 pr-4 text-right text-loam-600" title={t('admin.maps.dates', { created: formatDate(map.createdAt), last: map.lastActivityAt ? formatDate(map.lastActivityAt) : '—' })}>
                    {relativeTime(map.lastActivityAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
