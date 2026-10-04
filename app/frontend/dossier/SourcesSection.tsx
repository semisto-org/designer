import type { ReactNode } from 'react'
import { sourceLabel } from '@/components/plants/ProvenanceBadge'
import { t } from '@/lib/i18n'
import { Section } from '@/dossier/parts'
import type { Dossier, DossierSection, DossierSource } from '@/types/dossier'

function withDetail(source: DossierSource) {
  return source.detail && source.detail !== source.label ? source.detail : null
}

function Link({ source, children }: { source: DossierSource; children: ReactNode }) {
  if (!source.url) return <>{children}</>
  return (
    <>
      {children}
      <span className="break-all text-loam-500"> — {source.url}</span>
    </>
  )
}

function line(source: DossierSource): ReactNode {
  const detail = withDetail(source)
  switch (source.kind) {
    case 'layer':
      return detail ? t('dossier.sources.cover_layer', { label: source.label, detail }) : t('dossier.sources.cover_layer_plain', { label: source.label })
    case 'layers':
      return detail ? t('dossier.sources.layers', { label: source.label, detail }) : t('dossier.sources.layers_plain', { label: source.label })
    case 'relief':
      return t('dossier.sources.relief', { label: source.label })
    case 'climate':
      return detail ? t('dossier.sources.climate', { label: source.label, detail }) : t('dossier.sources.climate_plain', { label: source.label })
    case 'plant_source': {
      const fields = (source.detail ?? '').split(',').filter(Boolean).map((f) => t(`dossier.sources.plant_fields.${f}`))
      const text = t('dossier.sources.plant_source', { source: sourceLabel(source.label), fields: fields.join(', ') })
      return source.license ? `${text} (${t('dossier.sources.plant_license', { license: source.license })})` : text
    }
    case 'regulation':
      return t('dossier.sources.regulation', { label: source.label })
  }
}

/** Every data source behind the sections printed, with its licence. */
export function SourcesSection({ dossier, number, enabled, photoCount }: {
  dossier: Dossier; number: number; enabled: Set<DossierSection>; photoCount: number
}) {
  const on = (section: DossierSection) => enabled.has(section)
  const of = (section: DossierSection) => dossier.sources.filter((s) => s.section === section)
  const lines: { key: string; body: ReactNode }[] = [{ key: 'map', body: t('dossier.sources.map') }]
  const push = (key: string, body: ReactNode) => lines.push({ key, body })

  if (on('cover')) of('cover').forEach((s) => push(s.key, <Link source={s}>{line(s)}</Link>))
  if (on('terrain')) of('terrain').forEach((s) => push(s.key, <Link source={s}>{line(s)}</Link>))
  if (on('climate')) of('climate').forEach((s) => push(s.key, <Link source={s}>{line(s)}</Link>))
  if (on('soil')) {
    if (dossier.soil.analyses && dossier.soil.samples.length > 0) push('soil', t('dossier.sources.soil', { provenance: dossier.soil.provenance }))
    if (dossier.soil.bioindicators.observations.length > 0) push('bioindicators', t('dossier.sources.bioindicators'))
  }
  if ((on('plants') || on('climate')) && dossier.plants.rows.length > 0) {
    const plantSources = of('plants')
    push('plant-catalogue', (
      <>
        {t('dossier.sources.plant_catalogue')}
        {plantSources.length > 0 && (
          <ul className="mt-0.5 list-[circle] pl-5">
            {plantSources.map((s) => <li key={s.key}>{line(s)}</li>)}
          </ul>
        )}
      </>
    ))
    if (plantSources.some((s) => s.label === 'pfaf')) push('pfaf', t('dossier.sources.pfaf'))
  }
  if (on('alerts')) {
    of('alerts').forEach((s) => push(s.key, <Link source={s}>{line(s)}</Link>))
    if (dossier.alerts.planting.alerts.length > 0) push('planting', t('dossier.sources.planting'))
  }
  if (on('photos') && photoCount > 0) push('photos', t('dossier.sources.photos'))
  if (on('finances') && dossier.finances.exists) push('finances', t('dossier.sources.finances'))

  return (
    <Section id="sources" number={number} title={t('dossier.sections.sources')} intro={t('dossier.sources.intro')}>
      <ul className="list-disc space-y-1 pl-5 text-xs text-loam-700 marker:text-loam-400">
        {lines.map(({ key, body }) => <li key={key}>{body}</li>)}
      </ul>
    </Section>
  )
}
