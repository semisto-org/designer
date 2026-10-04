import clsx from 'clsx'
import { useMemo, useState } from 'react'
import { t } from '@/lib/i18n'
import { BAND_STYLE, RESULT_GROUPS, formatValue } from '@/map/soil/format'
import { BandChip } from '@/map/soil/SampleReading'
import { useSoil } from '@/map/soil/store'
import Upsell from '@/map/soil/Upsell'
import type { SoilParameterReading, SoilResultKey, SoilSampleData } from '@/types/soil_photos'

type Selection = { sampleId: number; key: SoilResultKey | 'texture' }

const ROW_KEYS = RESULT_GROUPS.flatMap((group) => group.keys)

/**
 * The points side by side. The figures are always shown; with a plan that
 * includes analyses each value is placed against indicative bands (low / ok /
 * high), with its explanation and the USDA texture class. Without, an upsell.
 */
export default function CompareTab() {
  const { samples, analyses, fields, bands, provenance } = useSoil()
  const [selection, setSelection] = useState<Selection | null>(null)
  const units = useMemo(() => new Map(fields.map((f) => [f.key, f.unit])), [fields])

  // Only the points with at least one figure, and only the rows somebody filled.
  const columns = samples.filter((s) => Object.keys(s.results).length > 0)
  const rows = ROW_KEYS.filter((key) => columns.some((s) => s.results[key] != null))
  const hasTexture = analyses && columns.some((s) => s.interpretation?.texture)

  if (columns.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-loam-600">{t(analyses ? 'soil.compare.intro' : 'soil.compare.intro_plain')}</p>
        <p className="rounded-lg bg-loam-50 p-3 text-sm text-loam-500">{t('soil.compare.empty')}</p>
        {!analyses && <Upsell />}
      </div>
    )
  }

  const reading = (sample: SoilSampleData, key: SoilResultKey): SoilParameterReading | undefined =>
    sample.interpretation?.parameters.find((p) => p.key === key)

  const selectedSample = selection ? columns.find((s) => s.id === selection.sampleId) : undefined

  return (
    <div className="space-y-4">
      <p className="text-sm text-loam-600">{t(analyses ? 'soil.compare.intro' : 'soil.compare.intro_plain')}</p>
      {!analyses && <Upsell />}

      {analyses && (
        <div aria-live="polite" className="min-h-[3rem]">
          {selection && selectedSample ? <Explanation sample={selectedSample} selection={selection} /> : <p className="text-xs text-loam-500">{t('soil.compare.explain_hint')}</p>}
        </div>
      )}

      <div className="-mx-1 overflow-x-auto rounded-xl border border-loam-100">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-loam-50 text-left text-xs text-loam-500">
              <th scope="col" className="sticky left-0 z-10 w-28 min-w-28 max-w-28 bg-loam-50 px-3 py-2 font-medium">{t('soil.compare.measure')}</th>
              {columns.map((sample) => (
                <th key={sample.id} scope="col" className="px-3 py-2 text-right font-medium text-loam-700">{sample.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-loam-100">
            {rows.map((key) => {
              const limits = analyses ? bands?.[key] : undefined
              return (
                <tr key={key}>
                  <th scope="row" className="sticky left-0 z-10 w-28 min-w-28 max-w-28 bg-white px-3 py-2 text-left font-normal">
                    <span className="block text-loam-800">{t(`soil.fields.${key}.short`)}{units.get(key) ? <span className="text-xs text-loam-400"> ({units.get(key)})</span> : null}</span>
                    {limits && <span className="block text-[11px] leading-tight text-loam-400">{limits.high_above == null ? t('soil.compare.limits_low', { low: formatValue(limits.low_below) }) : t('soil.compare.limits', { low: formatValue(limits.low_below), high: formatValue(limits.high_above) })}</span>}
                  </th>
                  {columns.map((sample) => {
                    const value = sample.results[key]
                    if (value == null) return <td key={sample.id} className="px-3 py-2 text-right text-loam-400">{t('soil.compare.missing')}</td>
                    const parameter = reading(sample, key)
                    const selected = selection?.sampleId === sample.id && selection.key === key
                    if (!parameter) return <td key={sample.id} className="px-3 py-2 text-right tabular-nums text-loam-800">{formatValue(value)}</td>
                    return (
                      <td key={sample.id} className="p-0 text-right">
                        <button
                          type="button" aria-pressed={selected}
                          aria-label={`${t(`soil.fields.${key}.name`)}, ${sample.label} : ${formatValue(value)}, ${t(`soil.bands.${parameter.band}`)}`}
                          onClick={() => setSelection(selected ? null : { sampleId: sample.id, key })}
                          className={clsx('block h-full w-full px-3 py-2 text-right tabular-nums focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-prune-600', BAND_STYLE[parameter.band].cell, selected && 'ring-2 ring-inset ring-prune-500')}
                        >
                          {formatValue(value)}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            {hasTexture && (
              <tr>
                <th scope="row" className="sticky left-0 z-10 w-28 min-w-28 max-w-28 bg-white px-3 py-2 text-left font-normal text-loam-800">{t('soil.compare.texture')}</th>
                {columns.map((sample) => {
                  const texture = sample.interpretation?.texture
                  const selected = selection?.sampleId === sample.id && selection.key === 'texture'
                  if (!texture) return <td key={sample.id} className="px-3 py-2 text-right text-loam-400">{t('soil.compare.missing')}</td>
                  return (
                    <td key={sample.id} className="p-0 text-right">
                      <button
                        type="button" aria-pressed={selected} onClick={() => setSelection(selected ? null : { sampleId: sample.id, key: 'texture' })}
                        className={clsx('block h-full w-full px-3 py-2 text-right text-loam-800 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-prune-600', selected && 'ring-2 ring-inset ring-prune-500')}
                      >
                        {texture.name}
                      </button>
                    </td>
                  )
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {analyses && <p className="text-xs text-loam-400">{t('soil.compare.caveat', { provenance })}</p>}
    </div>
  )
}

function Explanation({ sample, selection }: { sample: SoilSampleData; selection: Selection }) {
  if (selection.key === 'texture') {
    const texture = sample.interpretation?.texture
    if (!texture) return null
    return (
      <div className="space-y-1 rounded-lg bg-loam-50 p-3 text-sm">
        <p className="font-medium text-loam-800">{t('soil.compare.texture_title', { point: sample.label })} : {texture.name}</p>
        <p className="text-xs text-loam-500">{t('soil.compare.texture_parts', { sand: formatValue(texture.sand), silt: formatValue(texture.silt), clay: formatValue(texture.clay) })}</p>
        <p className="text-loam-600">{texture.description}</p>
      </div>
    )
  }
  const parameter = sample.interpretation?.parameters.find((p) => p.key === selection.key)
  if (!parameter) return null
  return (
    <div className="space-y-1.5 rounded-lg bg-loam-50 p-3 text-sm">
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-loam-800">{t('soil.compare.explain_title', { measure: t(`soil.fields.${parameter.key}.name`), point: sample.label })}</span>
        <span className="text-loam-600">{formatValue(parameter.value)}{parameter.unit ? ` ${parameter.unit}` : ''}</span>
        <BandChip band={parameter.band} />
      </p>
      <p className="text-loam-600">{parameter.explanation}</p>
    </div>
  )
}
