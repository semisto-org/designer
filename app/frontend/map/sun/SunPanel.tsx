import { ExternalLink, PenLine, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { HelpButton } from '@/components/help/HelpButton'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { formatNumber, t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { biggestLoss, clock, duration } from '@/map/sun/geometry'
import { SEASON_COLORS, SunDiagram } from '@/map/sun/SunDiagram'
import { SunMonths } from '@/map/sun/SunMonths'
import type { SunPath, SunReport } from '@/map/sun/types'

export const SUN_HELP_SLUG = 'le-soleil-et-l-horizon'

const monthName = new Intl.DateTimeFormat('fr-BE', { month: 'long' })

/**
 * "Soleil": the horizon seen from the terrain with the sun's paths through
 * the seasons, then the hours of direct sun month by month (on the terrain
 * versus an open horizon) and the irradiation. The horizon and the
 * irradiation come from PVGIS; without them the sun paths and the daylight
 * hours still show, over a flat horizon.
 */
export default function SunPanel() {
  const editor = useEditor()
  const mapId = editor.map.id
  const [report, setReport] = useState<SunReport | null>(null)
  const [error, setError] = useState(false)

  const load = useCallback((signal?: AbortSignal) => {
    setError(false)
    api<SunReport>(`/maps/${mapId}/sun`, { signal })
      .then(setReport)
      .catch((e: Error) => { if (e.name !== 'AbortError') setError(true) })
  }, [mapId])

  // Reload when the outline (hence the centre) changes.
  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load, editor.map.updatedAt])

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-clay-700">{t('sun.load_error')}</p>
        <Button variant="secondary" size="sm" onClick={() => load()}><RefreshCw className="h-4 w-4" />{t('sun.retry')}</Button>
      </div>
    )
  }
  if (!report) return <p className="font-hand text-lg text-loam-500" aria-busy="true">{t('sun.loading')}</p>

  if (!report.available) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-loam-600">{t(`sun.reasons.${report.reason}`)}</p>
        {report.reason === 'no_location' && editor.canEdit && (
          <Button variant="secondary" size="sm" onClick={() => editor.openPanel('terrain')}>
            <PenLine className="h-4 w-4" />{t('sun.draw_outline')}
          </Button>
        )}
        <HelpButton slug={SUN_HELP_SLUG} label={t('sun.help')} className="-ml-2" />
      </div>
    )
  }

  const profile = report.horizon.available ? report.horizon.profile : null
  const winter = report.paths.find((p) => p.key === 'winter_solstice')
  const loss = biggestLoss(report.months)
  const pvgis = report.sources.find((s) => s.key === 'pvgis')

  return (
    <div className="space-y-5">
      <p className="text-sm text-loam-700">{t('sun.intro')}</p>

      <figure className="space-y-2">
        <div className="overflow-hidden rounded-2xl shadow-sm ring-1 ring-loam-200">
          <SunDiagram paths={report.paths} profile={profile} />
        </div>
        <figcaption className="space-y-1 text-xs text-loam-500">
          {profile ? <p>{t('sun.horizon_note')}</p> : <p className="text-loam-600">{t(`sun.reasons.${'reason' in report.horizon ? report.horizon.reason : 'upstream_error'}`)}</p>}
          <p>{t('sun.solar_time')}</p>
        </figcaption>
      </figure>

      {profile && (
        <div className="space-y-1 border-l-2 border-humus-300 pl-3 font-hand text-lg leading-snug text-prune-700">
          {loss
            ? <p>{t('sun.insight', { month: monthName.format(new Date(2026, loss.month.month - 1, 21)), lost: duration(loss.lostHours) })}</p>
            : <p>{t('sun.insight_open')}</p>}
          {winter?.firstSun != null && winter.firstSun >= 9 * 60 && <p>{t('sun.insight_winter', { time: clock(round5(winter.firstSun)) })}</p>}
        </div>
      )}

      <ul className="space-y-2">
        {report.paths.map((path) => <PathSummary key={path.key} path={path} />)}
      </ul>

      <SunMonths months={report.months} />

      {report.irradiation.available && (
        <p className="text-xs text-loam-600">
          {t('sun.months.annual', {
            value: formatNumber(report.irradiation.annualKwhM2),
            from: report.irradiation.yearMin ?? '?',
            to: report.irradiation.yearMax ?? '?',
          })}
        </p>
      )}

      <div className="space-y-1 rounded-lg bg-loam-50 p-2.5 text-[11px] leading-snug text-loam-500">
        <p className="font-medium text-loam-700">{t('sun.sources.title')}</p>
        {pvgis && (
          <p>
            {t('sun.sources.pvgis', { attribution: pvgis.publisher, detail: pvgis.title })}
            {pvgis.url && (
              <a href={pvgis.url} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center text-prune-700 hover:underline" aria-label={pvgis.url}>
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            )}
          </p>
        )}
        <p>{t('sun.sources.noaa')}</p>
      </div>

      <HelpButton slug={SUN_HELP_SLUG} label={t('sun.help')} className="-ml-2" />
    </div>
  )
}

const round5 = (minutes: number) => Math.round(minutes / 5) * 5

function PathSummary({ path }: { path: SunPath }) {
  const color = SEASON_COLORS[path.key]
  return (
    <li className="flex gap-2.5 text-xs">
      <span className="mt-1.5 h-0.5 w-4 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
      <span className="text-loam-600">
        <span className="font-hand text-base leading-none" style={{ color }}>{t(`sun.seasons.${path.key}`)}</span>
        <span className="text-loam-400"> · {t('sun.path.noon', { degrees: formatNumber(path.noonElevation) })}</span>
        <br />
        {path.terrainHours != null ? (
          <>
            <span className="font-medium text-loam-800">{t('sun.path.direct', { hours: duration(path.terrainHours) })}</span>{' '}
            {t('sun.path.open', { hours: duration(path.openHours) })}
            <br />
            {path.firstSun != null && path.lastSun != null
              ? t('sun.path.window', { first: clock(round5(path.firstSun)), last: clock(round5(path.lastSun)) })
              : t('sun.path.none')}
          </>
        ) : (
          t('sun.path.open_only', { hours: duration(path.openHours) })
        )}
      </span>
    </li>
  )
}
