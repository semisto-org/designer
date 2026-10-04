import { CircleAlert, Info, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import type { PlantingAlert } from '@/types/plants'

const ICONS = { blocking: CircleAlert, warning: TriangleAlert, info: Info }
const TONES = { blocking: 'text-clay-500', warning: 'text-humus-600', info: 'text-prune-500' }

/** Coherence alerts, each with a French « Pourquoi ? ». Clicking one with a patch selects it. */
export function AlertsList({ alerts }: { alerts: PlantingAlert[] }) {
  const editor = useEditor()
  const [open, setOpen] = useState<number | null>(null)
  return (
    <ul className="space-y-2">
      {alerts.map((alert, i) => {
        const Icon = ICONS[alert.level]
        return (
          <li key={i} className="rounded-lg bg-loam-50 p-2 text-xs">
            <div className="flex gap-2">
              <Icon className={'mt-0.5 h-4 w-4 shrink-0 ' + TONES[alert.level]} aria-label={t(`plant_alerts.levels.${alert.level}`)} />
              <div className="min-w-0 flex-1">
                <p className="text-loam-800">
                  <span className="font-semibold">{t(`plant_alerts.rules.${alert.rule}`)} · </span>
                  {alert.featureId != null && alert.featureId !== editor.selectedId ? (
                    <button type="button" className="text-left underline decoration-loam-300 underline-offset-2 hover:decoration-loam-600" onClick={() => editor.select(alert.featureId)}>
                      {alert.message}
                    </button>
                  ) : alert.message}
                </p>
                <button type="button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="mt-1 text-prune-600 hover:underline">
                  {t('plant_list.why')}
                </button>
                {open === i && <p className="mt-1 text-loam-600">{t(`plant_alerts.explanations.${alert.rule}`)}</p>}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
