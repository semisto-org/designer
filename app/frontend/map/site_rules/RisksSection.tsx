import { t } from '@/lib/i18n'
import { GardenNote, OfficialLink, SectionTitle, SubTitle, reasonText } from '@/map/site_rules/parts'
import type { RisksBlock } from '@/types/site_rules'

/** The risks Géorisques knows at the place: the present ones read for a garden, the others in one line. */
export function RisksSection({ block }: { block: RisksBlock }) {
  return (
    <section className="space-y-3" aria-labelledby="site-rules-risks">
      <div id="site-rules-risks"><SectionTitle note={t('site_rules.risks.note')}>{t('site_rules.risks.title')}</SectionTitle></div>
      {!block.available ? (
        <p className="text-sm text-loam-600">{reasonText(block.reason)}</p>
      ) : (
        <RisksList block={block} />
      )}
    </section>
  )
}

function RisksList({ block }: { block: Extract<RisksBlock, { available: true }> }) {
  const present = block.items.filter((item) => item.present)
  const absent = block.items.filter((item) => !item.present)
  return (
    <>
      {(block.address || block.commune.name) && (
        <p className="text-xs text-loam-500">{block.address ?? block.commune.name}</p>
      )}
      {present.length === 0 && <p className="text-sm text-loam-700">{t('site_rules.risks.none_present')}</p>}
      {present.length > 0 && (
        <div className="space-y-2">
          <SubTitle>{t('site_rules.risks.present_title')}</SubTitle>
          <ul className="space-y-2">
            {present.map((item) => (
              <li key={item.key} className="rounded-2xl border-l-4 border-humus-400 bg-loam-50 px-3 py-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className="text-sm font-medium text-loam-900">{item.label}</span>
                  <span className="text-[11px] text-loam-500">{t(`site_rules.risks.groups.${item.group}`)}</span>
                </div>
                {item.level && (
                  <p className="text-xs text-humus-800">
                    {item.level} <span className="text-loam-500">({t(`site_rules.risks.scope.${item.scope}`)})</span>
                  </p>
                )}
                <GardenNote>{item.advice}</GardenNote>
              </li>
            ))}
          </ul>
          {present.some((item) => item.scope === 'commune') && <p className="text-[11px] text-loam-500">{t('site_rules.risks.commune_only')}</p>}
        </div>
      )}
      {absent.length > 0 && (
        <p className="text-xs text-loam-600">
          <span className="font-medium text-loam-700">{t('site_rules.risks.absent_title')} : </span>
          {absent.map((item) => item.label).join(', ')}
        </p>
      )}
      <OfficialLink href={block.reportUrl}>{t('site_rules.risks.report_link')}</OfficialLink>
    </>
  )
}
