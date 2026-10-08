import { t } from '@/lib/i18n'
import { OfficialLink } from '@/map/site_rules/parts'
import type { SiteRulesSource } from '@/types/site_rules'

/** Where the rules and risks come from, with their licence. */
export function SiteRulesSources({ sources }: { sources: SiteRulesSource[] }) {
  if (sources.length === 0) return null
  return (
    <div className="rounded-lg bg-loam-50 p-2.5 text-xs text-loam-600">
      <p className="font-medium text-loam-700">{t('site_rules.sources.title')}</p>
      <ul className="mt-1.5 space-y-1.5">
        {sources.map((source) => (
          <li key={source.key}>
            <span className="text-loam-800">{source.publisher}</span>
            <span> — {source.title}, {t('site_rules.sources.licence_line', { licence: source.licence })} </span>
            <OfficialLink href={source.url}>{new URL(source.url).hostname}</OfficialLink>
          </li>
        ))}
      </ul>
    </div>
  )
}
