import { ExternalLink } from 'lucide-react'
import { t } from '@/lib/i18n'
import type { ClimateSource, CurrentClimate, ProjectionData, ValueReference } from '@/types/climate_finance'

type Props = {
  sources: ClimateSource[]
  note: string | null
  current?: CurrentClimate
  projections?: ProjectionData[]
}

/** Where the figures come from, and how they were built, value by value. */
export function Sources({ sources, note, current, projections = [] }: Props) {
  if (sources.length === 0) return null
  const normals = Object.entries(current?.references ?? {}) as [string, ValueReference][]
  return (
    <details className="rounded-lg bg-loam-50 p-2.5 text-xs text-loam-600">
      <summary className="cursor-pointer font-medium text-loam-700">{t('climate.sources.title')}</summary>
      <p className="mt-2">{t('climate.sources.method')}</p>
      {note && <p className="mt-1.5">{note}</p>}
      <ul className="mt-2 space-y-1.5">
        {sources.map((source) => (
          <li key={source.key}>
            <span className="text-loam-800">{source.publisher}</span>
            {source.year && <span> ({source.year})</span>}
            <span> — {source.title}</span>
            {source.licence && <span className="text-loam-500"> {t('climate.sources.licence', { licence: source.licence })}</span>}
            <SourceLink url={source.url} />
          </li>
        ))}
      </ul>

      {current && current.stations.length > 0 && (
        <>
          <h4 className="mt-3 font-medium text-loam-700">{t('climate.sources.stations_title', { area: current.subArea.name })}</h4>
          <p className="mt-1">
            {current.stations.map((station, index) => (
              <span key={`${station.source}-${station.name}`}>
                {index > 0 && ', '}
                {station.name}
                {station.altitudeM != null && <span className="text-loam-500"> ({t('climate.sources.altitude', { altitude: station.altitudeM })})</span>}
              </span>
            ))}
          </p>
        </>
      )}

      {normals.length > 0 && (
        <>
          <h4 className="mt-3 font-medium text-loam-700">{t('climate.sources.normals_title')}</h4>
          <dl className="mt-1 space-y-1.5">
            {normals.map(([field, reference]) => (
              <div key={field}>
                <dt className="text-loam-800">
                  {t(`climate.sources.fields.${snake(field)}`)}
                  {reference.sources.map((source) => (
                    <span key={source.key} className="text-loam-500"> · {source.publisher}<SourceLink url={source.url} /></span>
                  ))}
                </dt>
                {reference.detail && <dd>{reference.detail}</dd>}
              </div>
            ))}
          </dl>
        </>
      )}

      {projections.map((projection) => {
        const references = Object.entries(projection.references ?? {}) as [string, string][]
        if (references.length === 0) return null
        return (
          <div key={`${projection.horizon}-${projection.scenario}`}>
            <h4 className="mt-3 font-medium text-loam-700">
              {t('climate.sources.projection_title', { horizon: projection.horizon, scenario: t(`climate.future.scenarios.${projection.scenario}`) })}
            </h4>
            <dl className="mt-1 space-y-1.5">
              {references.map(([field, detail]) => (
                <div key={field}>
                  <dt className="text-loam-800">{t(`climate.sources.fields.${snake(field)}`)}</dt>
                  <dd>{detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        )
      })}
    </details>
  )
}

function SourceLink({ url }: { url: string | null }) {
  if (!url) return null
  return (
    <a href={url} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center text-prune-700 hover:underline" aria-label={url}>
      <ExternalLink className="h-3 w-3" aria-hidden />
    </a>
  )
}

/** meanTempC → mean_temp_c, the locale keys. */
function snake(key: string) {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}
