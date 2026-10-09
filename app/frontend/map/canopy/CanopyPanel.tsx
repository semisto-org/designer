import { ExternalLink, PenLine, RefreshCw } from 'lucide-react'
import { useEffect } from 'react'
import { HelpButton } from '@/components/help/HelpButton'
import { Button } from '@/components/ui/Button'
import { formatArea, formatNumber, t } from '@/lib/i18n'
import { CanopyLegend } from '@/map/canopy/CanopyLegend'
import { canopyActions, useCanopy, type CanopyReport } from '@/map/canopy/store'
import { useEditor } from '@/map/editor/EditorContext'

type Report = Extract<CanopyReport, { available: true }>

const monthYear = new Intl.DateTimeFormat('fr-BE', { month: 'long', year: 'numeric' })

/** « septembre 2018 », or « septembre 2018 et mai 2019 » when the imagery spans several dates. */
function imageryWhen(imagery: NonNullable<Report['imagery']>): string {
  const from = monthYear.format(new Date(imagery.from))
  const to = monthYear.format(new Date(imagery.to))
  return from === to ? from : t('canopy.imagery.between', { from, to })
}

/**
 * « Arbres en place »: the height of the trees standing on and around the
 * terrain, from a satellite canopy height map, said in plain sentences, and
 * painted on the map on demand.
 */
export default function CanopyPanel() {
  const editor = useEditor()
  const mapId = editor.map.id
  const version = editor.map.bbox?.join(',') ?? ''
  const { mapId: loadedFor, report, loading, error, showOnMap } = useCanopy()

  useEffect(() => { canopyActions.load(mapId, version) }, [mapId, version])

  const current = loadedFor === mapId ? report : null

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-loam-600">{t('canopy.intro')}</p>
        <HelpButton slug="les-arbres-deja-en-place" compact />
      </div>

      {error && !current && (
        <div className="space-y-2 rounded-lg bg-clay-50 p-3 text-sm text-clay-700">
          <p>{t('canopy.load_error')}</p>
          <Button variant="secondary" size="sm" onClick={() => canopyActions.load(mapId, version, true)}>
            <RefreshCw className="h-4 w-4" />{t('canopy.retry')}
          </Button>
        </div>
      )}
      {!error && !current && loading && <p className="text-sm text-loam-500" aria-busy="true">{t('canopy.loading')}</p>}

      {current && !current.available && (
        <div className="space-y-3">
          <p className="text-sm text-loam-600">{t(`canopy.reasons.${current.reason}`)}</p>
          {current.reason === 'no_outline' && editor.canEdit && (
            <Button variant="secondary" size="sm" onClick={() => editor.openPanel('terrain')}>
              <PenLine className="h-4 w-4" />{t('canopy.draw_outline')}
            </Button>
          )}
        </div>
      )}

      {current?.available && <Findings report={current} showOnMap={showOnMap} />}
    </div>
  )
}

function Findings({ report, showOnMap }: { report: Report; showOnMap: boolean }) {
  const { stats, thresholds, imagery, source } = report
  const sharePercent = Math.round(stats.canopyShare * 100)
  const yearsAgo = imagery ? new Date().getFullYear() - new Date(imagery.to).getFullYear() : null

  return (
    <>
      <div className="space-y-2.5 font-serif text-[17px] leading-snug text-loam-900">
        {stats.maxHeightM >= thresholds.canopyM ? (
          <>
            <p>{t('canopy.sentences.tallest', { height: stats.maxHeightM })}</p>
            <p>{t('canopy.sentences.cover', { share: sharePercent, area: formatArea(stats.canopyAreaM2) })}</p>
            {stats.tallAreaM2 > 0
              ? <p>{t('canopy.sentences.tall', { area: formatArea(stats.tallAreaM2), height: thresholds.tallM })}</p>
              : <p>{t('canopy.sentences.no_tall', { height: thresholds.tallM })}</p>}
            {stats.meanCanopyHeightM != null && (
              <p className="text-[15px] text-loam-700">{t('canopy.sentences.mean', { height: formatNumber(stats.meanCanopyHeightM) })}</p>
            )}
          </>
        ) : (
          <p>{t('canopy.sentences.open_ground', { height: thresholds.canopyM })}</p>
        )}
      </div>

      <p className="rounded-lg bg-humus-50 px-3 py-2 text-xs text-humus-900">
        {imagery
          ? t('canopy.imagery.dated', { when: imageryWhen(imagery), years: yearsAgo ?? 0 })
          : t('canopy.imagery.undated')}
      </p>

      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm text-loam-700">
          <input
            type="checkbox"
            checked={showOnMap}
            onChange={(e) => canopyActions.setShowOnMap(e.target.checked)}
            className="rounded border-loam-300 text-prune-600 focus:ring-prune-500"
          />
          {t('canopy.show_on_map')}
        </label>
        <CanopyLegend />
      </div>

      <p className="text-xs text-loam-500">
        {t('canopy.attribution')}
        <a href={source.url} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center align-middle text-loam-500 hover:text-loam-800" aria-label={t('canopy.source_link')}>
          <ExternalLink className="h-3 w-3" />
        </a>
        <span className="block">{t('canopy.precision', { cell: formatNumber(report.grid.cellM) })}</span>
      </p>
    </>
  )
}
