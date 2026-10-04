import clsx from 'clsx'
import { formatDate } from '@/components/plants/format'
import { t } from '@/lib/i18n'
import { Indicative, LockedNote, Muted, Section, SubTitle, Table, Td, Th, fr } from '@/dossier/parts'
import type { Dossier } from '@/types/dossier'
import type { SoilBand, SoilResultKey } from '@/types/soil_photos'

const BAND_TONES: Record<SoilBand, string> = {
  low: 'text-humus-700',
  ok: 'text-leaf-700',
  high: 'text-clay-700',
}

/** Lab results of the sampling points, their reading, bio-indicator plants. */
export function SoilSection({ dossier, number, isOwner }: { dossier: Dossier; number: number; isOwner: boolean }) {
  const { samples, analyses, fields, provenance, bioindicators } = dossier.soil
  const columns = fields.map((f) => f.key as SoilResultKey).filter((key) => samples.some((s) => s.results[key] != null))
  const hasTexture = analyses && samples.some((s) => s.interpretation?.texture)
  const empty = samples.length === 0 && bioindicators.observations.length === 0

  return (
    <Section id="soil" number={number} title={t('dossier.sections.soil')}>
      {empty && <Muted>{t('dossier.soil.empty')}</Muted>}
      {samples.length > 0 && (
        <div className="space-y-2">
          <SubTitle>{t('dossier.soil.samples_title')}{analyses && <Indicative />}</SubTitle>
          <Table
            head={<>
              <Th>{t('dossier.soil.sample')}</Th>
              <Th>{t('dossier.soil.depth')}</Th>
              {columns.map((key) => {
                const unit = fields.find((f) => f.key === key)?.unit
                return <Th key={key} className="text-right">{t(`soil.fields.${key}.short`)}{unit && <span className="block whitespace-nowrap normal-case tracking-normal text-loam-400">{unit}</span>}</Th>
              })}
              {hasTexture && <Th>{t('dossier.soil.texture')}</Th>}
            </>}
          >
            <tbody>
              {samples.map((sample) => {
                const bands = Object.fromEntries((sample.interpretation?.parameters ?? []).map((p) => [p.key, p.band]))
                const noResults = columns.every((key) => sample.results[key] == null)
                return (
                  <tr key={sample.id} className="dossier-keep border-b border-loam-100">
                    <Td>
                      <span className="font-medium text-loam-900">{sample.label}</span>
                      <span className="block text-xs text-loam-500">
                        {sample.status === 'planned' ? t('dossier.soil.planned') : sample.sampledOn ? formatDate(sample.sampledOn) : t('soil.points.status.sampled')}
                        {sample.lab && ` · ${sample.lab}`}
                      </span>
                    </Td>
                    <Td className="whitespace-nowrap tabular-nums">{t('soil.points.depth', { from: sample.depthFromCm, to: sample.depthToCm })}</Td>
                    {noResults && columns.length > 0 ? (
                      <td colSpan={columns.length} className="py-1.5 pr-3 text-right text-loam-400">{t('dossier.soil.no_results')}</td>
                    ) : columns.map((key) => {
                      const value = sample.results[key]
                      const band = bands[key] as SoilBand | undefined
                      return (
                        <Td key={key} className="text-right tabular-nums">
                          {value == null ? '—' : fr(value)}
                          {band && <sup className={clsx('ml-0.5 font-semibold', BAND_TONES[band])}>{t(`dossier.soil.band_short.${band}`)}</sup>}
                        </Td>
                      )
                    })}
                    {hasTexture && <Td>{sample.interpretation?.texture?.name ?? '—'}</Td>}
                  </tr>
                )
              })}
            </tbody>
          </Table>
          {analyses ? (
            <p className="text-xs text-loam-500">{t('dossier.soil.legend', { provenance })}</p>
          ) : (
            columns.length > 0 && <LockedNote body={t('dossier.locked.soil')} isOwner={isOwner} />
          )}
        </div>
      )}

      {bioindicators.observations.length > 0 && (
        <div className="dossier-keep space-y-2">
          <SubTitle>{t('dossier.soil.bio_title')}<Indicative /></SubTitle>
          <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2 print:grid-cols-2">
            {bioindicators.observations.map((o) => (
              <li key={o.id}>
                <span className="font-medium text-loam-900">{o.speciesName}</span>
                {o.latinName && <span className="italic text-loam-500"> {o.latinName}</span>}
                <span className="text-loam-500"> · {t(`soil.abundances.${o.abundance}`).toLowerCase()}</span>
              </li>
            ))}
          </ul>
          {bioindicators.summary.length > 0 && (
            <p>
              <span className="text-loam-500">{t('dossier.soil.bio_summary')}{'\u00a0: '}</span>
              {bioindicators.summary.slice(0, 5).map((s) => t(`soil.indicators.${s.key}.label`).toLowerCase()).join(', ')}
            </p>
          )}
        </div>
      )}
    </Section>
  )
}
