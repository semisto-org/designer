import clsx from 'clsx'
import { Target, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import { storedProperties } from '@/map/drawing/catalog'
import { saveFeature } from '@/map/drawing/save'
import { useEditor } from '@/map/editor/EditorContext'
import { adviceText, useZoneAdvice, zoneLabel } from '@/map/zones/ZonesPanel'
import { isPermacultureZone, PERMACULTURE_ZONE_COLORS, zoneNumberOf, zoneOfFeature, ZONE_NUMBERS } from '@/map/zones/permaculture'
import type { MapFeature } from '@/types'

/** A zone itself, or any element once the terrain has zones (sectors and notes aside). */
export function appliesToZone(feature: MapFeature): boolean {
  if (isPermacultureZone(feature)) return true
  return feature.properties.layer !== 'notes' && feature.properties.status === 'active'
}

/**
 * Inspector section of the permaculture zones. On a zone: its number, as
 * six pills, and what it holds. On any other element: the zone it stands
 * in, and the companion's word when it is too far or too near the house.
 */
export default function ZoneSection({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const advice = useZoneAdvice(editor)

  if (isPermacultureZone(feature)) {
    const number = zoneNumberOf(feature) ?? 1
    const choose = (n: number) => {
      if (n === number) return
      void saveFeature(editor, feature.properties.id, {
        properties: { ...storedProperties(feature), zone_number: n },
        style: { ...(feature.properties.style ?? {}), color: PERMACULTURE_ZONE_COLORS[n as keyof typeof PERMACULTURE_ZONE_COLORS] },
      })
    }
    return (
      <div className="space-y-2 text-sm">
        <p className="font-medium text-loam-700">{t('permaculture_zones.inspector.choose')}</p>
        <div className="flex gap-1" role="radiogroup" aria-label={t('permaculture_zones.inspector.choose')}>
          {ZONE_NUMBERS.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={n === number}
              aria-label={zoneLabel(n)}
              disabled={!editor.canEdit}
              onClick={() => choose(n)}
              className={clsx('h-8 flex-1 rounded-full text-sm font-semibold ring-1 ring-inset', n === number ? 'text-white ring-transparent' : 'bg-white text-loam-700 ring-loam-200 hover:bg-loam-50')}
              style={n === number ? { background: PERMACULTURE_ZONE_COLORS[n] } : undefined}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="text-loam-700">{t('permaculture_zones.inspector.zone', { number, frequency: t(`permaculture_zones.frequency.${number}`) })}</p>
        <p className="text-loam-600"><span className="font-medium text-loam-800">{t('permaculture_zones.inspector.holds_title')} </span>{t(`permaculture_zones.holds.${number}`)}</p>
        {editor.activePanel !== 'zones' && (
          <Button size="sm" variant="secondary" onClick={() => editor.openPanel('zones')}><Target className="h-4 w-4" aria-hidden />{t('permaculture_zones.inspector.open')}</Button>
        )}
      </div>
    )
  }

  // An element: nothing to say while the terrain has no zones.
  if (!editor.features.some((f) => f.properties.status === 'active' && isPermacultureZone(f))) return null
  const zone = zoneOfFeature(feature, editor.features)
  const mine = advice.filter((a) => a.kind === 'placement' && a.featureId === feature.properties.id)
  return (
    <div className="space-y-1.5 text-sm">
      <p className="flex items-center gap-2 text-loam-700">
        <span className="h-2.5 w-5 shrink-0 rounded-full" style={{ background: zone == null ? '#d9d1c3' : PERMACULTURE_ZONE_COLORS[zone] }} aria-hidden />
        {zone == null ? t('permaculture_zones.inspector.outside') : t('permaculture_zones.inspector.zone', { number: zone, frequency: t(`permaculture_zones.frequency.${zone}`) })}
      </p>
      {mine.map((a, i) => (
        <p key={i} className="flex gap-2 rounded-lg bg-humus-50 px-2.5 py-1.5 text-loam-700">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-humus-600" aria-hidden />{adviceText(a)}
        </p>
      ))}
    </div>
  )
}
