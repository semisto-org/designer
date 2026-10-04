import clsx from 'clsx'
import { t } from '@/lib/i18n'
import { Indicative, Muted, Section, SubTitle } from '@/dossier/parts'
import type { Dossier } from '@/types/dossier'

const TONES = {
  warning: 'border-humus-400 bg-humus-50',
  blocking: 'border-clay-500 bg-clay-50',
  info: 'border-loam-300 bg-loam-50',
} as const

/** Regulatory and planting alerts, every one marked as indicative. */
export function AlertsSection({ dossier, number }: { dossier: Dossier; number: number }) {
  const { regulatory, planting } = dossier.alerts
  const none = regulatory.alerts.length === 0 && planting.alerts.length === 0
  return (
    <Section id="alerts" number={number} title={t('dossier.sections.alerts')} intro={t('dossier.alerts.intro')}>
      {none && <Muted>{t('dossier.alerts.none')}</Muted>}
      {regulatory.alerts.length > 0 && (
        <div className="space-y-2">
          <SubTitle>{t('dossier.alerts.regulatory')}</SubTitle>
          <ul className="space-y-2">
            {regulatory.alerts.map((alert, i) => (
              <li key={`${alert.rule}-${i}`} className={clsx('dossier-keep rounded-r-lg border-l-4 px-3 py-2 print:bg-white', TONES[alert.severity])}>
                <p className="font-medium text-loam-900">
                  {alert.title}
                  <span className="ml-2 text-xs font-normal text-loam-600">{t(`drawing.alerts.severity.${alert.severity}`)}</span>
                  <Indicative />
                </p>
                <p className="text-loam-700">{alert.explanation}</p>
                {alert.source?.label && <p className="text-xs text-loam-500">{t('dossier.alerts.source', { label: alert.source.label })}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!regulatory.boundary && regulatory.rulesCount > 0 && <p className="text-xs text-loam-500">{t('dossier.alerts.no_boundary')}</p>}
      {planting.alerts.length > 0 && (
        <div className="space-y-2">
          <SubTitle>{t('dossier.alerts.planting')}</SubTitle>
          <ul className="space-y-2">
            {planting.alerts.map((alert, i) => (
              <li key={`${alert.rule}-${i}`} className={clsx('dossier-keep rounded-r-lg border-l-4 px-3 py-2 print:bg-white', TONES[alert.level])}>
                <p className="text-loam-800">
                  <span className="font-medium text-loam-900">{t(`plant_alerts.rules.${alert.rule}`)}</span>
                  <span className="ml-2 text-xs text-loam-600">{t(`plant_alerts.levels.${alert.level}`)}</span>
                  <Indicative />
                </p>
                <p className="text-loam-700">{alert.message}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  )
}
