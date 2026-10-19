import { Head, Link } from '@inertiajs/react'
import { Box, Drone, Eye } from 'lucide-react'
import { useEffect } from 'react'
import { Logo } from '@/components/Logo'
import { track } from '@/lib/analytics'
import { formatArea, t } from '@/lib/i18n'
import { formatDate } from '@/collab/time'
import { aerialViewLabel } from '@/drone/format'
import { PublicMapView } from '@/public_maps/PublicMapView'
import type { PublicMapProps } from '@/types/collab'

/**
 * A published map: read-only, no account, no editing, no comments. What it
 * shows is the snapshot the owner published (boundary, chosen layers,
 * region base layers), with a legend and its attribution.
 */
export default function PublicMapShow(props: PublicMapProps) {
  const { map } = props

  // Where the visitor came from: ?via=… on links Terranova makes, else direct.
  useEffect(() => {
    const via = new URLSearchParams(window.location.search).get('via')
    track('public_map_view', { source: via && /^[a-z_]{1,20}$/.test(via) ? via : 'direct' })
  }, [])

  return (
    <div className="flex h-dvh flex-col bg-loam-100">
      <Head title={props.title}>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-loam-200 bg-white px-3">
        <Logo className="h-7 w-7 shrink-0" />
        <h1 className="truncate text-base">{props.title}</h1>
        {map.areaM2 != null && <span className="hidden text-sm text-loam-400 sm:inline">{formatArea(map.areaM2)}</span>}
        {props.reliefPath && (
          <Link
            href={props.reliefPath}
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-prune-700 px-3 py-1 text-sm font-medium text-white hover:bg-prune-800"
            title={t('public_maps.relief.open_hint')}
          >
            <Box className="h-4 w-4" aria-hidden="true" />
            {t('public_maps.relief.open')}
          </Link>
        )}
        <span className={(props.reliefPath ? 'hidden sm:inline-flex' : 'ml-auto inline-flex') + ' shrink-0 items-center gap-1.5 rounded-full bg-loam-100 px-2.5 py-0.5 text-xs text-loam-600'}>
          <Eye className="h-3.5 w-3.5" />
          {t('public_maps.read_only')}
        </span>
      </header>
      <PublicMapView {...props} className="relative min-h-0 flex-1" />
      <footer className="flex h-9 shrink-0 items-center justify-between gap-3 border-t border-loam-200 bg-white px-3 text-xs text-loam-500">
        <span>{t('public_maps.published_on', { date: formatDate(props.publishedAt) })}</span>
        {props.aerialView && (
          <span className="hidden min-w-0 items-center gap-1 truncate sm:inline-flex"><Drone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{aerialViewLabel(props.aerialView)}</span>
        )}
        <a href="/" className="font-medium text-prune-700 hover:underline">{t('public_maps.made_with')}</a>
      </footer>
    </div>
  )
}
