import { t } from '@/lib/i18n'
import type { MapFeature } from '@/types'
import { otherProperties } from './otherProperties'

/**
 * « Autres informations »: what a plant carries that no other section shows
 * (written by an AI or brought by an import), read-only, so nothing stays
 * hidden. Nothing renders when there is none.
 */
export default function OtherPropertiesSection({ feature }: { feature: MapFeature }) {
  const list = otherProperties(feature.properties)
  if (list.length === 0) return null
  return (
    <section className="space-y-2 border-t border-loam-100 pt-3 text-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-loam-500">{t('plant_feature.other_properties.title')}</h3>
      <p className="text-loam-500">{t('plant_feature.other_properties.hint')}</p>
      <dl className="space-y-1">
        {list.map((p) => (
          <div key={p.key} className="flex gap-2">
            <dt className="w-2/5 shrink-0 text-loam-500">{p.label}</dt>
            <dd className="min-w-0 flex-1 whitespace-pre-line break-words text-loam-800">{p.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
