import clsx from 'clsx'
import { Hammer, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { DESIGN_MODES, type DesignMode } from '@/map/time/mode'

const ICONS: Record<DesignMode, typeof MapPin> = { existing: MapPin, project: Hammer }

/**
 * « Existant | Projet »: the land alone, or the project over it. In the
 * header beside the steps on a computer, at the head of the time strip on a
 * phone. Picking a step sets it too (map/time/mode).
 */
export function ModeSwitch({ className }: { className?: string }) {
  const { mode, setMode } = useEditor()
  return (
    <div role="group" aria-label={t('design_mode.label')} className={clsx('flex items-center gap-0.5 rounded-full bg-loam-50 p-0.5 ring-1 ring-loam-200', className)}>
      {DESIGN_MODES.map((option) => {
        const Icon = ICONS[option]
        const active = option === mode
        return (
          <Button
            key={option}
            size="sm"
            variant={active ? (option === 'existing' ? 'leaf' : 'primary') : 'ghost'}
            aria-pressed={active}
            title={t(`design_mode.${option}_hint`)}
            onClick={() => setMode(option)}
            className="min-h-8 flex-1 !py-1"
          >
            <Icon className="h-4 w-4" aria-hidden />
            {t(`design_mode.${option}`)}
          </Button>
        )
      })}
    </div>
  )
}
