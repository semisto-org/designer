import { Handshake } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { RevealLabel } from '@/components/ui/RevealLabel'
import { t } from '@/lib/i18n'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { useEditor } from '@/map/editor/EditorContext'
import { ZoneCard, useZoneDevice } from '@/map/layout/ZoneLayer'
import { PRIORITY } from '@/map/layout/zones'

const PANEL = 'actions'

/**
 * « Passer à l'action » (plants from the Semisto nursery, implementation,
 * co-management) is where the plan leaves the screen for the land, so it is
 * not one tool among thirty in the rail: it has its own leaf button, in the
 * header from md up and at the foot of the map on a phone.
 */
function useTakeAction() {
  const editor = useEditor()
  const open = editor.activePanel === PANEL
  return { open, toggle: () => editor.openPanel(open ? null : PANEL) }
}

/** Header action, from md up: the label shows on wide screens (2xl), unrolls on hover below. */
export default function TakeActionButton() {
  const desktop = useMediaQuery('(min-width: 768px)')
  const { open, toggle } = useTakeAction()
  if (!desktop) return null
  const label = t('journey.requests.panel_title')
  return (
    <Button size="sm" variant="leaf" className="group gap-x-0 pl-2 pr-2 2xl:pr-3" aria-label={label} aria-pressed={open} onClick={toggle}>
      <Handshake className="h-4 w-4" aria-hidden />
      <span className="hidden pl-1.5 2xl:inline" aria-hidden>{label}</span>
      <span className="2xl:hidden"><RevealLabel>{label}</RevealLabel></span>
    </Button>
  )
}

/** On a phone: a pill at the foot of the map, which an open sheet covers. */
export function TakeActionChip() {
  const device = useZoneDevice()
  const { open, toggle } = useTakeAction()
  if (device !== 'phone' || open) return null
  return (
    <ZoneCard id="take-action" zone={{ desktop: 'bottom', phone: 'bottom' }} priority={PRIORITY.guide - 1} order={5} className="mb-3 self-start">
      <Button size="sm" variant="leaf" className="shadow-md" onClick={toggle}>
        <Handshake className="h-4 w-4" aria-hidden />{t('journey.requests.panel_title')}
      </Button>
    </ZoneCard>
  )
}
