import { Camera, Database, FileText, Map as MapIcon, ShieldAlert, WifiOff } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { formatDate } from '@/collab/time'
import { Button } from '@/components/ui/Button'
import { formatArea, t } from '@/lib/i18n'
import { formatBytes } from '@/lib/money'
import { PublicMapView } from '@/public_maps/PublicMapView'
import type { PublicMapProps } from '@/types/collab'
import iconUrl from '../../../public/icon.svg'
import { OFFLINE_STYLE } from './protocols'

export type OfflinePhoto = {
  id: number
  kind: 'photo' | 'video'
  caption: string | null
  takenAt: string
  dated: boolean
  /** The photo as the app shows it (JPEG); absent for a video. */
  view?: string
  /** The original file: videos, and photos for owners and editors. */
  file?: string
}

export type OfflineDocument = {
  id: number
  title: string
  description: string | null
  tags: string[]
  kind: string | null
  file: string
  bytes: number
  createdAt: string
}

/** What OfflineSite::Builder writes in donnees/carte.js: the public view's props, plus the rest of the map. */
export type OfflineData = PublicMapProps & {
  offline: {
    exportedAt: string
    exportedBy: string | null
    owner: string
    networks: boolean
    photos: OfflinePhoto[]
    documents: OfflineDocument[]
    skipped: { name: string; bytes: number }[]
    files: { geojson: string; plants: string }
  }
}

const TABS = ['plan', 'photos', 'documents', 'data'] as const
type Tab = (typeof TABS)[number]
const ICONS: Record<Tab, typeof MapIcon> = { plan: MapIcon, photos: Camera, documents: FileText, data: Database }

/** The tab in the address (#photos), so that going back and reloading keep it. */
function useTab(): [Tab, (tab: Tab) => void] {
  const read = (): Tab => {
    const hash = window.location.hash.slice(1)
    return (TABS as readonly string[]).includes(hash) ? (hash as Tab) : 'plan'
  }
  const [tab, setTab] = useState<Tab>(read)
  useEffect(() => {
    const onHash = () => setTab(read())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return [tab, (next) => { window.location.hash = next === 'plan' ? '' : next }]
}

/**
 * The map as a website that opens from a folder: the plan over its aerial
 * photo with the garden through the years, the photos, the documents and
 * the raw data. Nothing here reaches a server.
 */
export function OfflineSite({ data }: { data: OfflineData }) {
  const [tab, setTab] = useTab()
  const { offline } = data
  const counts: Record<Tab, number | null> = { plan: null, photos: offline.photos.length, documents: offline.documents.length, data: null }

  return (
    <div className="flex h-dvh flex-col bg-loam-100 text-loam-900">
      <header className="shrink-0 border-b border-loam-200 bg-white">
        <div className="flex items-center gap-3 px-3 pt-2 sm:h-12 sm:pt-0">
          <img src={iconUrl} alt="" aria-hidden="true" className="h-7 w-7 shrink-0" />
          <h1 className="min-w-0 truncate font-serif text-xl">{data.title}</h1>
          {data.map.areaM2 != null && <span className="hidden text-sm text-loam-500 sm:inline">{formatArea(data.map.areaM2)}</span>}
          <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-loam-100 px-2.5 py-0.5 text-sm text-loam-600">
            <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
            {t('offline_site.viewer.offline_badge')}
          </span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 py-1.5" aria-label={data.title}>
          {TABS.map((key) => {
            const Icon = ICONS[key]
            const count = counts[key]
            return (
              <Button
                key={key}
                variant={tab === key ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setTab(key)}
                aria-current={tab === key ? 'page' : undefined}
                className="shrink-0"
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {t(`offline_site.viewer.tabs.${key}`)}
                {count != null && count > 0 && <span className={tab === key ? 'text-prune-100' : 'text-loam-400'}>{count}</span>}
              </Button>
            )
          })}
        </nav>
      </header>

      {offline.networks && (
        <p className="flex shrink-0 items-center gap-2 bg-humus-100 px-3 py-1.5 text-sm text-humus-800">
          <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t('offline_site.viewer.networks')}
        </p>
      )}

      <main className="relative min-h-0 flex-1">
        {tab === 'plan' && (
          <>
            <PublicMapView {...data} mapStyle={OFFLINE_STYLE} className="absolute inset-0" />
            {data.layers.length === 0 && (
              <p className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-white/95 px-3 py-1 text-sm text-loam-600 shadow ring-1 ring-loam-200">
                {t('offline_site.viewer.no_tiles')}
              </p>
            )}
          </>
        )}
        {tab === 'photos' && <Page><Photos photos={offline.photos} /></Page>}
        {tab === 'documents' && <Page><Documents documents={offline.documents} /></Page>}
        {tab === 'data' && <Page><Data data={data} /></Page>}
      </main>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-0.5 border-t border-loam-200 bg-white px-3 py-1.5 text-sm text-loam-500">
        <span>{t('offline_site.viewer.exported', { date: formatDate(offline.exportedAt) })}</span>
        <a href="https://terranova.semisto.org" target="_blank" rel="noopener" className="font-medium text-prune-700 hover:underline">
          {t('offline_site.viewer.made_with')}
        </a>
      </footer>
    </div>
  )
}

function Page({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-6">{children}</div>
    </div>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl bg-white p-6 text-center text-sm text-loam-500 ring-1 ring-loam-200">{children}</p>
}

/** The photos year by year, newest first: the place as it changed. */
function Photos({ photos }: { photos: OfflinePhoto[] }) {
  const years = useMemo(() => {
    const byYear = new Map<string, OfflinePhoto[]>()
    photos.forEach((photo) => {
      const year = photo.takenAt.slice(0, 4)
      byYear.set(year, [...(byYear.get(year) ?? []), photo])
    })
    return [...byYear.entries()]
  }, [photos])
  if (photos.length === 0) return <Empty>{t('offline_site.viewer.photos_empty')}</Empty>

  return (
    <div className="space-y-8">
      {years.map(([year, items]) => (
        <section key={year}>
          <h2 className="mb-3 font-serif text-2xl text-loam-800">{year}</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((photo) => (
              <li key={photo.id} className="overflow-hidden rounded-2xl bg-white ring-1 ring-loam-200">
                {photo.kind === 'video' && photo.file ? (
                  <video src={photo.file} controls preload="metadata" className="aspect-square w-full bg-loam-900 object-cover" />
                ) : (
                  <a href={photo.view} target="_blank" rel="noopener">
                    <img src={photo.view} alt={photo.caption ?? ''} loading="lazy" className="aspect-square w-full object-cover" />
                  </a>
                )}
                <div className="space-y-0.5 p-2.5 text-sm">
                  {photo.caption && <p className="text-loam-800">{photo.caption}</p>}
                  <p className="text-loam-500">
                    {formatDate(photo.takenAt)}
                    {!photo.dated && <> · {t('offline_site.viewer.photo_undated')}</>}
                  </p>
                  {photo.kind === 'photo' && photo.file && (
                    <a href={photo.file} target="_blank" rel="noopener" className="font-medium text-prune-700 hover:underline">
                      {t('offline_site.viewer.original')}
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function Documents({ documents }: { documents: OfflineDocument[] }) {
  if (documents.length === 0) return <Empty>{t('offline_site.viewer.documents_empty')}</Empty>
  return (
    <ul className="divide-y divide-loam-100 overflow-hidden rounded-2xl bg-white ring-1 ring-loam-200">
      {documents.map((document) => (
        <li key={document.id} className="flex items-start gap-3 p-4">
          <FileText className="mt-0.5 h-5 w-5 shrink-0 text-loam-400" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-loam-900">{document.title}</p>
            {document.description && <p className="mt-0.5 whitespace-pre-line text-sm text-loam-600">{document.description}</p>}
            <p className="mt-1 text-sm text-loam-500">
              {formatDate(document.createdAt)} · {formatBytes(document.bytes)}
              {document.tags.length > 0 && <> · {document.tags.join(', ')}</>}
            </p>
          </div>
          <a href={document.file} target="_blank" rel="noopener" className="shrink-0 rounded-full bg-loam-100 px-3 py-1 text-sm font-medium text-loam-700 hover:bg-loam-200">
            {t('offline_site.viewer.open')}
          </a>
        </li>
      ))}
    </ul>
  )
}

function Data({ data }: { data: OfflineData }) {
  const { files, skipped } = data.offline
  const links = [
    { href: files.geojson, label: t('offline_site.viewer.geojson'), hint: t('offline_site.viewer.geojson_hint') },
    { href: files.plants, label: t('offline_site.viewer.plants'), hint: t('offline_site.viewer.plants_hint') },
  ]
  return (
    <div className="space-y-6">
      <p className="text-loam-600">{t('offline_site.viewer.data_intro')}</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {links.map((link) => (
          <li key={link.href}>
            <a href={link.href} download className="block rounded-2xl bg-white p-4 ring-1 ring-loam-200 hover:ring-prune-300">
              <span className="font-medium text-loam-900">{link.label}</span>
              <span className="mt-0.5 block text-sm text-loam-500">{link.hint}</span>
            </a>
          </li>
        ))}
      </ul>
      {skipped.length > 0 && (
        <section>
          <h2 className="mb-2 font-medium text-loam-800">{t('offline_site.viewer.skipped')}</h2>
          <ul className="space-y-1 text-sm text-loam-600">
            {skipped.map((file) => <li key={file.name}>{file.name} · {formatBytes(file.bytes)}</li>)}
          </ul>
        </section>
      )}
    </div>
  )
}
