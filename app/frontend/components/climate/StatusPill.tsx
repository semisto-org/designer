import clsx from 'clsx'
import { CircleAlert, CircleCheck, CircleHelp, TriangleAlert } from 'lucide-react'
import { t } from '@/lib/i18n'
import type { PlantStatus } from '@/types/climate_finance'

const STYLES: Record<PlantStatus, { className: string; icon: typeof CircleCheck }> = {
  ok: { className: 'bg-leaf-50 text-leaf-700 ring-leaf-200', icon: CircleCheck },
  borderline: { className: 'bg-humus-50 text-humus-700 ring-humus-200', icon: TriangleAlert },
  at_risk: { className: 'bg-clay-50 text-clay-700 ring-clay-100', icon: CircleAlert },
  unknown: { className: 'bg-loam-50 text-loam-500 ring-loam-200', icon: CircleHelp },
}

/** A plant status with its icon and label: never color alone. */
export function StatusPill({ status, prefix, title, hidePrefix = false }: { status: PlantStatus; prefix?: string; title?: string; hidePrefix?: boolean }) {
  const { className, icon: Icon } = STYLES[status]
  return (
    <span title={title} className={clsx('inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset', className)}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {prefix && <span className={hidePrefix ? 'sr-only' : 'text-loam-500'}>{prefix}{hidePrefix && ' :'}</span>}
      <span className="truncate">{t(`climate.plants.statuses.${status}`)}</span>
    </span>
  )
}
