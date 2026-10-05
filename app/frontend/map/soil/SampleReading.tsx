import { ArrowDown, ArrowUp, Check } from 'lucide-react'
import clsx from 'clsx'
import { t } from '@/lib/i18n'
import { BAND_STYLE, formatValue } from '@/map/soil/format'
import type { SoilBand, SoilReading } from '@/types/soil_photos'

const BAND_ICON = { low: ArrowDown, ok: Check, high: ArrowUp } as const

/** A band as a chip: colour, icon and word, so it never relies on colour alone. */
export function BandChip({ band, className }: { band: SoilBand; className?: string }) {
  const Icon = BAND_ICON[band]
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', BAND_STYLE[band].chip, className)}>
      <Icon className="h-3 w-3" aria-hidden />
      {t(`soil.bands.${band}`)}
    </span>
  )
}

/** The plain-French reading of one point's results: each value with its band and what it means, then the texture class. */
export default function SampleReading({ reading }: { reading: SoilReading }) {
  return (
    <div className="space-y-3">
      {reading.texture && (
        <div className="rounded-lg bg-loam-50 p-2.5 text-sm">
          <p className="font-medium text-loam-800">{reading.texture.name}</p>
          <p className="text-xs text-loam-500">
            {t('soil.compare.texture_parts', { sand: formatValue(reading.texture.sand), silt: formatValue(reading.texture.silt), clay: formatValue(reading.texture.clay) })}
          </p>
          <p className="mt-1 text-loam-600">{reading.texture.description}</p>
        </div>
      )}
      <ul className="space-y-2.5">
        {reading.parameters.map((parameter) => (
          <li key={parameter.key} className="text-sm">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium text-loam-800">{t(`soil.fields.${parameter.key}.name`)}</span>
              <span className="text-loam-600">{formatValue(parameter.value)}{parameter.unit ? ` ${parameter.unit}` : ''}</span>
              <BandChip band={parameter.band} />
            </p>
            <p className="mt-0.5 text-xs text-loam-500">{parameter.explanation}</p>
            {parameter.sources.length > 0 && (
              <p className="mt-0.5 text-[11px] leading-tight text-loam-400">
                {t('soil.compare.sources')}{' '}
                {parameter.sources.map((source, i) => (
                  <span key={source.url}>
                    {i > 0 && ' ; '}
                    <a href={source.url} target="_blank" rel="noreferrer" className="hover:underline">{source.label}</a>
                  </span>
                ))}
              </p>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-loam-400">{t('soil.compare.caveat', { provenance: reading.provenance })}</p>
    </div>
  )
}
