import { Layers, PenLine, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { HelpButton } from '@/components/help/HelpButton'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { RisksSection } from '@/map/site_rules/RisksSection'
import { SiteRulesSources } from '@/map/site_rules/SiteRulesSources'
import { UrbanismSection } from '@/map/site_rules/UrbanismSection'
import type { SiteRulesReport } from '@/types/site_rules'

/**
 * « Règles et risques »: what the law and the land already say about the
 * place. Natural and technological risks (Géorisques) and town-planning
 * rules (zoning, local plan, easements), each read for a forest garden in
 * one indicative line. Regions without providers say so and point to the
 * region layers that cover the subject.
 */
export default function SiteRulesPanel() {
  const editor = useEditor()
  const mapId = editor.map.id
  const [report, setReport] = useState<SiteRulesReport | null>(null)
  const [error, setError] = useState(false)

  const load = useCallback((signal?: AbortSignal) => {
    setError(false)
    api<SiteRulesReport>(`/maps/${mapId}/site_rules`, { signal })
      .then(setReport)
      .catch((e: Error) => { if (e.name !== 'AbortError') setError(true) })
  }, [mapId])

  // Reload when the outline (location) changes.
  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load, editor.map.updatedAt])

  const header = (
    <div className="flex items-start gap-2">
      <p className="flex-1 text-sm text-loam-600">{t('site_rules.intro')}</p>
      <HelpButton slug="regles-et-risques-du-terrain" iconOnly />
    </div>
  )

  if (error) {
    return (
      <div className="space-y-3">
        {header}
        <p className="text-sm text-clay-700">{t('site_rules.load_error')}</p>
        <Button variant="secondary" size="sm" onClick={() => load()}><RefreshCw className="h-4 w-4" />{t('site_rules.retry')}</Button>
      </div>
    )
  }
  if (!report) return <div className="space-y-3">{header}<p className="text-sm text-loam-500" aria-busy="true">{t('site_rules.loading')}</p></div>

  if (!report.configured) {
    return (
      <div className="space-y-3">
        {header}
        <p className="rounded-2xl bg-loam-50 p-3 text-sm text-loam-700">{t('site_rules.not_configured', { region: report.region?.name ?? '' })}</p>
        {report.layers.length > 0 && (
          <div className="space-y-2 text-sm text-loam-700">
            <p>{t('site_rules.not_configured_layers')}</p>
            <ul className="flex flex-wrap gap-1.5">
              {report.layers.map((layer) => (
                <li key={layer.key} className="rounded-full bg-leaf-50 px-2.5 py-1 text-xs font-medium text-leaf-800">{layer.name}</li>
              ))}
            </ul>
            <Button variant="secondary" size="sm" onClick={() => editor.openPanel('layers')}>
              <Layers className="h-4 w-4" />{t('site_rules.open_layers')}
            </Button>
          </div>
        )}
      </div>
    )
  }

  const noLocation = report.risks.available === false && report.risks.reason === 'no_location'
  return (
    <div className="space-y-6">
      {header}
      <p className="rounded-2xl border border-dashed border-humus-300 bg-humus-50 p-3 text-xs leading-relaxed text-humus-900">
        <span className="mr-1.5 rounded bg-white/70 px-1.5 py-0.5 text-[11px] font-medium">{t('site_rules.indicative')}</span>
        {t('site_rules.disclaimer')}
      </p>
      {noLocation && editor.canEdit && (
        <Button variant="secondary" size="sm" onClick={() => editor.openPanel('terrain')}>
          <PenLine className="h-4 w-4" />{t('site_rules.draw_outline')}
        </Button>
      )}
      <RisksSection block={report.risks} />
      <UrbanismSection block={report.urbanism} queriedWith={report.queriedWith} />
      <SiteRulesSources sources={report.sources} />
    </div>
  )
}
