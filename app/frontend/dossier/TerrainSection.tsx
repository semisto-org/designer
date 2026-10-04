import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { formatArea, formatLength, formatNumber, t } from '@/lib/i18n'
import { Facts, Indicative, LockedNote, Muted, Section, SubTitle, fr } from '@/dossier/parts'
import type { Dossier } from '@/types/dossier'
import type { IdentifyLayerResult, IdentifyResponse } from '@/types/map_data'

/** Area, limits, what the region's layers say here, relief and rainwater. */
export function TerrainSection({ dossier, number, isOwner }: { dossier: Dossier; number: number; isOwner: boolean }) {
  const { terrain } = dossier
  const point = terrain.point
  return (
    <Section id="terrain" number={number} title={t('dossier.sections.terrain')}>
      <Facts
        items={[
          [t('dossier.terrain.area'), terrain.areaM2 != null ? formatArea(terrain.areaM2) : ''],
          [t('dossier.terrain.perimeter'), terrain.perimeterM != null ? formatLength(terrain.perimeterM) : ''],
          [t('dossier.terrain.point'), point ? t('dossier.terrain.point_value', { lat: point.lat.toFixed(5).replace('.', ','), lng: point.lng.toFixed(5).replace('.', ',') }) : ''],
        ]}
      />
      {terrain.parcels.length > 0 && (
        <p><span className="text-loam-500">{t('dossier.terrain.parcels')}{'\u00a0: '}</span>{terrain.parcels.join(' · ')}</p>
      )}
      {terrain.identify && point && <LayerReadings mapId={dossier.map.id} point={point} identify={terrain.identify} />}
      <Relief relief={terrain.relief} isOwner={isOwner} />
    </Section>
  )
}

function LayerReadings({ mapId, point, identify }: {
  mapId: number; point: { lng: number; lat: number }; identify: NonNullable<Dossier['terrain']['identify']>
}) {
  const [results, setResults] = useState<IdentifyLayerResult[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const query = new URLSearchParams({ lng: String(point.lng), lat: String(point.lat), zoom: String(identify.zoom) })
    identify.layers.forEach((layer) => query.append('layers[]', layer.key))
    api<IdentifyResponse>(`/maps/${mapId}/identify?${query}`, { signal: controller.signal })
      .then((data) => setResults(data.results))
      .catch((error: Error) => error.name !== 'AbortError' && setFailed(true))
    return () => controller.abort()
  }, [mapId, point.lng, point.lat, identify])

  // A layer that could not be read says nothing useful on paper: such rows
  // (and the whole block when none answered) are shown on screen only.
  const unreadable = (key: string) => {
    const result = results?.find((r) => r.key === key)
    return !result || result.status === 'unavailable'
  }
  const nothingToPrint = failed || !results || identify.layers.every((layer) => unreadable(layer.key))
  return (
    <div className={clsx('space-y-2', nothingToPrint && 'print:hidden')}>
      <SubTitle>{t('dossier.terrain.layers_title')}</SubTitle>
      <p className="text-xs text-loam-500">{t('dossier.terrain.layers_intro')}</p>
      {failed ? (
        <Muted>{t('dossier.terrain.layers_failed')}</Muted>
      ) : (
        <dl className="divide-y divide-loam-100 rounded-lg ring-1 ring-loam-200">
          {identify.layers.map((layer) => {
            const result = results?.find((r) => r.key === layer.key)
            return (
              <div key={layer.key} className={clsx('dossier-keep grid gap-1 px-3 py-2 sm:grid-cols-[12rem_minmax(0,1fr)] print:grid-cols-[12rem_minmax(0,1fr)]', results && unreadable(layer.key) && 'print:hidden')}>
                <dt className="font-medium text-loam-800">{layer.name}</dt>
                <dd className="text-loam-700">
                  {!results ? (
                    <span className="text-loam-400">{t('dossier.terrain.layers_loading')}</span>
                  ) : !result || result.status === 'unavailable' ? (
                    <span className="text-loam-400">{t('dossier.terrain.layer_unavailable')}</span>
                  ) : result.status === 'empty' ? (
                    <span className="text-loam-500">{t('dossier.terrain.layer_empty')}</span>
                  ) : (
                    <ul className="space-y-0.5">
                      {result.entries.slice(0, 4).map((entry, i) => (
                        <li key={i}>
                          {entry.text}
                          {entry.detail && <span className="text-loam-500"> — {entry.detail}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </dd>
              </div>
            )
          })}
        </dl>
      )}
    </div>
  )
}

function Relief({ relief, isOwner }: { relief: Dossier['terrain']['relief']; isOwner: boolean }) {
  if ('locked' in relief) {
    return (
      <div className="space-y-2 print:hidden">
        <SubTitle>{t('dossier.terrain.relief_title')}</SubTitle>
        <LockedNote body={t('dossier.locked.terrain')} isOwner={isOwner} />
      </div>
    )
  }
  const stats = relief.available ? relief.stats : null
  const rain = relief.rainwater
  const percent = (value: number | null | undefined) => (value == null ? '' : `${fr(value)} %`)
  return (
    <div className="dossier-keep space-y-2">
      <SubTitle>{t('dossier.terrain.relief_title')}<Indicative /></SubTitle>
      {stats ? (
        <Facts
          columns={4}
          items={[
            [t('dossier.terrain.altitude'), stats.zMin != null && stats.zMax != null
              ? t('dossier.terrain.altitude_value', { min: formatNumber(Math.round(stats.zMin)), max: formatNumber(Math.round(stats.zMax)) }) : ''],
            [t('dossier.terrain.drop'), stats.drop != null ? `${fr(stats.drop)} m` : ''],
            [t('dossier.terrain.slope_mean'), percent(stats.slopeMeanPct)],
            [t('dossier.terrain.slope_steep'), percent(stats.slopeP90Pct), t('dossier.terrain.slope_steep_hint')],
          ]}
        />
      ) : (
        !relief.available && <Muted>{t(`dossier.terrain.relief_reason.${relief.reason}`)}</Muted>
      )}
      <div className="rounded-lg bg-sky-50 px-3 py-2 print:border print:border-sky-200 print:bg-white">
        <p className="text-[11px] text-sky-900/70">{t('dossier.terrain.rainwater')}</p>
        {rain.roofAreaM2 <= 0 ? (
          <p className="text-loam-600">{t('dossier.terrain.rainwater_none')}</p>
        ) : rain.volumeM3 == null ? (
          <p className="text-loam-600">{t('dossier.terrain.rainwater_no_rain')}</p>
        ) : (
          <>
            <p className="font-semibold text-sky-900">{t('dossier.terrain.rainwater_value', { volume: fr(rain.volumeM3) })}</p>
            <p className="text-xs text-loam-600">
              {t('dossier.terrain.rainwater_detail', { area: formatArea(rain.roofAreaM2), rain: formatNumber(rain.annualRainfallMm ?? 0), coefficient: fr(rain.coefficient) })}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
