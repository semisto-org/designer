import { LocateFixed, Spline } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { formatLength, t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { storedProperties } from '@/map/drawing/catalog'
import { saveFeature } from '@/map/drawing/save'
import { startShapeEdit } from '@/map/drawing/store'
import { gpsAccuracy, gpsToCheck } from '@/map/gps/accuracy'
import type { MapFeature } from '@/types'

/** Points placed from the phone's GPS get this inspector section. */
export function appliesToGpsPoint(feature: MapFeature): boolean {
  return feature.geometry.type === 'Point' && gpsAccuracy(feature.properties) != null
}

/**
 * How precise the phone's GPS was, and for an imprecise fix nobody checked
 * yet, what to do: move the point to its real place, or say it is right.
 */
export default function GpsAccuracySection({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const id = feature.properties.id
  const accuracy = formatLength(gpsAccuracy(feature.properties))

  if (!gpsToCheck(feature.properties)) {
    return (
      <p className="flex items-center gap-2 text-sm text-loam-600">
        <LocateFixed className="h-4 w-4 shrink-0" />
        {feature.properties.gps_checked === true ? t('gps.checked', { accuracy }) : t('gps.placed', { accuracy })}
      </p>
    )
  }

  const confirm = async () => {
    if (await saveFeature(editor, id, { properties: { ...storedProperties(feature), gps_checked: true } })) editor.notify(t('gps.confirmed'))
  }

  return (
    <div className="space-y-2 rounded-2xl bg-humus-50 p-3 text-sm text-humus-700 ring-1 ring-humus-200">
      <p className="font-medium">{t('gps.to_check_title', { accuracy })}</p>
      <p>{t('gps.to_check_body')}</p>
      {editor.canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled={editor.drawing} onClick={() => startShapeEdit(id)}>
            <Spline className="h-4 w-4" />
            {t('gps.move')}
          </Button>
          <Button variant="ghost" size="sm" disabled={editor.drawing} onClick={confirm}>{t('gps.confirm')}</Button>
        </div>
      )}
    </div>
  )
}
