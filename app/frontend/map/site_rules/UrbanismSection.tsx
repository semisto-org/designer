import { t } from '@/lib/i18n'
import { GardenNote, OfficialLink, SectionTitle, SubTitle, formatDate, reasonText } from '@/map/site_rules/parts'
import type { SiteRulesReport, UrbanismBlock, UrbanismPrescription } from '@/types/site_rules'

// Zone families, coloured like a planning map: built (prune), to be built
// (humus), farmland (lichen), natural (leaf).
const FAMILY_STYLE: Record<string, string> = {
  u: 'bg-prune-100 text-prune-800',
  au: 'bg-humus-100 text-humus-800',
  a: 'bg-lichen-100 text-lichen-700',
  n: 'bg-leaf-100 text-leaf-800',
  constructible: 'bg-prune-100 text-prune-800',
  activities: 'bg-humus-100 text-humus-800',
  not_constructible: 'bg-leaf-100 text-leaf-800',
}

/** The town-planning rules of the outline: local plan, zones, prescriptions and public utility easements. */
export function UrbanismSection({ block, queriedWith }: { block: UrbanismBlock; queriedWith: SiteRulesReport['queriedWith'] }) {
  return (
    <section className="space-y-3" aria-labelledby="site-rules-urbanism">
      <div id="site-rules-urbanism"><SectionTitle note={t('site_rules.urbanism.note')}>{t('site_rules.urbanism.title')}</SectionTitle></div>
      {!block.available ? (
        <p className="text-sm text-loam-600">{reasonText(block.reason)}</p>
      ) : (
        <UrbanismDetail block={block} queriedWith={queriedWith} />
      )}
    </section>
  )
}

function UrbanismDetail({ block, queriedWith }: { block: Extract<UrbanismBlock, { available: true }>; queriedWith: SiteRulesReport['queriedWith'] }) {
  return (
    <div className="space-y-4">
      <div className="text-xs text-loam-500">
        {block.communes.length > 0 && <p>{t('site_rules.urbanism.commune')} : {block.communes.map((c) => c.name).join(', ')}</p>}
        {queriedWith && <p>{t(`site_rules.urbanism.queried_with.${queriedWith}`)}</p>}
      </div>

      {block.rnu && <p className="rounded-2xl bg-loam-50 p-3 text-sm text-loam-700">{t('site_rules.urbanism.rnu')}</p>}
      {block.documentMissing && <p className="rounded-2xl bg-loam-50 p-3 text-sm text-loam-700">{t('site_rules.urbanism.document_missing')}</p>}

      {block.documents.map((doc) => (
        <div key={`${doc.type}-${doc.title}`} className="space-y-0.5">
          <SubTitle>{t('site_rules.urbanism.document')}</SubTitle>
          <p className="text-sm text-loam-900">
            {doc.type ? t(`site_rules.urbanism.document_types.${doc.type}`) : doc.title}
            {doc.date && <span className="text-loam-500"> · {t('site_rules.urbanism.document_date', { date: formatDate(doc.date) ?? doc.date })}</span>}
          </p>
          {doc.title && doc.type && <p className="text-xs text-loam-500">{doc.title}</p>}
          <OfficialLink href={doc.url}>{t('site_rules.urbanism.document_link')}</OfficialLink>
        </div>
      ))}

      {block.zones.length > 0 && (
        <div className="space-y-2">
          <SubTitle>{t('site_rules.urbanism.zones_title')}</SubTitle>
          <ul className="space-y-2">
            {block.zones.map((zone) => (
              <li key={`${zone.label}-${zone.url}`} className="rounded-2xl bg-loam-50 px-3 py-2.5">
                <div className="flex items-start gap-2.5">
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold ${FAMILY_STYLE[zone.family] ?? 'bg-loam-100 text-loam-700'}`}>{zone.label}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-loam-900">{t(`site_rules.urbanism.zones.${zone.family}.label`)}</p>
                    {zone.longLabel && zone.longLabel !== zone.label && <p className="text-xs text-loam-600">{zone.longLabel}</p>}
                  </div>
                </div>
                <GardenNote>{zone.advice}</GardenNote>
                <div className="mt-1.5"><OfficialLink href={zone.url}>{t('site_rules.urbanism.regulation_link')}</OfficialLink></div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {block.sectors.length > 0 && (
        <div className="space-y-2">
          <SubTitle>{t('site_rules.urbanism.sectors_title')}</SubTitle>
          <ul className="space-y-2">
            {block.sectors.map((sector) => (
              <li key={`${sector.label}-${sector.type}`} className="rounded-2xl bg-loam-50 px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold ${FAMILY_STYLE[sector.family] ?? 'bg-loam-100 text-loam-700'}`}>{sector.label}</span>
                  <p className="text-sm font-medium text-loam-900">{t(`site_rules.urbanism.sectors.${sector.family}.label`)}</p>
                </div>
                <GardenNote>{sector.advice}</GardenNote>
                <div className="mt-1.5"><OfficialLink href={sector.url}>{t('site_rules.urbanism.regulation_link')}</OfficialLink></div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {block.prescriptions.length > 0 && <Prescriptions items={block.prescriptions} />}

      {block.easements.length > 0 && (
        <div className="space-y-2">
          <SubTitle>{t('site_rules.urbanism.easements_title')}</SubTitle>
          <ul className="space-y-2">
            {block.easements.map((e) => (
              <li key={e.category ?? e.label} className="rounded-2xl bg-loam-50 px-3 py-2.5">
                <p className="text-sm font-medium text-loam-900">
                  {e.label}
                  {e.count > 1 && <span className="ml-1.5 text-xs font-normal text-loam-500">{t('site_rules.urbanism.count', { count: e.count })}</span>}
                </p>
                {(e.kind || e.names.length > 0) && (
                  <p className="text-xs text-loam-600">{[e.kind, e.names.join(', ')].filter(Boolean).join(' · ')}</p>
                )}
                <GardenNote>{e.advice}</GardenNote>
                <div className="mt-1.5"><OfficialLink href={e.url}>{t('site_rules.urbanism.act_link')}</OfficialLink></div>
              </li>
            ))}
          </ul>
          {block.easements.some((e) => e.network) && <p className="text-[11px] text-loam-500">{t('site_rules.urbanism.networks_note')}</p>}
        </div>
      )}

      {block.partial && <p className="text-xs text-humus-800">{t('site_rules.urbanism.partial')}</p>}
    </div>
  )
}

/** The prescriptions that matter to a garden in full; the others (parking, shops, housing…) folded. */
function Prescriptions({ items }: { items: UrbanismPrescription[] }) {
  const garden = items.filter((p) => p.advice)
  const others = items.filter((p) => !p.advice)
  return (
    <div className="space-y-2">
      <SubTitle>{t('site_rules.urbanism.prescriptions_title')}</SubTitle>
      {garden.length > 0 && (
        <ul className="space-y-2">
          {garden.map((p) => (
            <li key={`${p.type}-${p.label}`} className="rounded-2xl bg-loam-50 px-3 py-2.5">
              <p className="text-sm font-medium text-loam-900">{p.label}</p>
              <GardenNote>{p.advice}</GardenNote>
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <details className="text-xs text-loam-600">
          <summary className="cursor-pointer text-prune-700 hover:underline">{t('site_rules.urbanism.other_prescriptions', { count: others.length })}</summary>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
            {others.map((p) => <li key={`${p.type}-${p.label}`}>{p.label}</li>)}
          </ul>
        </details>
      )}
    </div>
  )
}
