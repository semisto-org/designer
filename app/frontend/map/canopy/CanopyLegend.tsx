import clsx from 'clsx'
import { t } from '@/lib/i18n'
import { CANOPY_RAMP } from '@/map/canopy/ramp'

/** The height classes of the overlay, a colour swatch each. */
export function CanopyLegend({ compact = false }: { compact?: boolean }) {
  return (
    <ul className={clsx('flex', compact ? 'flex-col gap-0.5' : 'flex-wrap gap-x-3 gap-y-1.5 text-xs text-loam-600')}>
      {CANOPY_RAMP.map((step, index) => {
        const next = CANOPY_RAMP[index + 1]
        const [r, g, b, a] = step.color
        return (
          <li key={step.min} className="flex items-center gap-1">
            <span aria-hidden className="inline-block h-3 w-3 rounded-sm ring-1 ring-loam-900/10" style={{ backgroundColor: `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(2)})` }} />
            {next ? t('canopy.legend.range', { from: step.min, to: next.min }) : t('canopy.legend.above', { from: step.min })}
          </li>
        )
      })}
    </ul>
  )
}

/** The ramp in one line, for a phone: « Arbres 1 m ▮▮▮▮▮ 30 m ». */
export function CanopyStrip() {
  const first = CANOPY_RAMP[0].min
  const last = CANOPY_RAMP[CANOPY_RAMP.length - 1].min
  return (
    <span className="flex items-center gap-1" title={t('canopy.legend.source')}>
      <span className="font-medium text-loam-800">{t('canopy.legend.short_title')}</span>
      <span>{t('canopy.legend.metres', { value: first })}</span>
      <span aria-hidden className="flex overflow-hidden rounded-sm ring-1 ring-loam-900/10">
        {CANOPY_RAMP.map(({ min, color: [r, g, b, a] }) => (
          <span key={min} className="inline-block h-2.5 w-3" style={{ backgroundColor: `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(2)})` }} />
        ))}
      </span>
      <span>{t('canopy.legend.metres', { value: `${last}+` })}</span>
    </span>
  )
}
