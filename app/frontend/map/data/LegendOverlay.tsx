import clsx from 'clsx'
import { ChevronDown, ListTree } from 'lucide-react'
import { useState } from 'react'
import { hasLegend, LayerLegend } from '@/components/legend/LayerLegend'
import { t } from '@/lib/i18n'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { useEditor } from '@/map/editor/EditorContext'
import { useLayerState, visibleOverlays } from '@/map/data/store'

const OPEN_KEY = 'designer.legend.open'

function storedOpen(): boolean | null {
  try {
    const value = window.localStorage.getItem(OPEN_KEY)
    return value == null ? null : value === '1'
  } catch {
    return null
  }
}

/**
 * The legend of the data layers shown on the map, over the map: a card in
 * the lower right corner on a computer, a « Légende » button that opens it
 * on a phone. The « Couches » panel shows the same legends under each layer,
 * so the card steps aside while it is open, and on a phone it leaves the
 * bottom of the screen to any open panel or selection.
 */
export default function LegendOverlay() {
  const { regionLayers, activePanel, selected } = useEditor()
  const state = useLayerState()
  const wide = useMediaQuery('(min-width: 768px)')
  const [choice, setChoice] = useState<boolean | null>(storedOpen)
  const open = choice ?? wide

  const shown = visibleOverlays(state)
  const layers = regionLayers
    .filter((layer) => layer.category === 'overlay' && shown.includes(layer.key) && hasLegend(layer))
    .sort((a, b) => (b.position ?? 0) - (a.position ?? 0))
  if (layers.length === 0 || activePanel === 'layers' || (!wide && (activePanel || selected))) return null

  const toggle = () => {
    const next = !open
    setChoice(next)
    try {
      window.localStorage.setItem(OPEN_KEY, next ? '1' : '0')
    } catch {
      // Private browsing: the choice lasts until the page closes.
    }
  }

  return (
    <section
      aria-label={t('map_data.legend.title')}
      className={clsx(
        'absolute bottom-[5.5rem] left-2 z-10 md:bottom-11 md:left-auto md:right-2',
        open && 'right-2 md:w-72',
      )}
    >
      <div className={clsx('rounded-xl bg-white/95 shadow-lg ring-1 ring-loam-900/10 backdrop-blur', open && 'flex max-h-[42dvh] flex-col md:max-h-[min(28rem,55dvh)]')}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className={clsx(
            'flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-medium text-loam-800 hover:bg-loam-50',
            open && 'rounded-b-none border-b border-loam-100',
          )}
        >
          <ListTree className="h-4 w-4 shrink-0 text-prune-600" aria-hidden="true" />
          <span className="flex-1">{t('map_data.legend.title')}</span>
          {!open && layers.length > 1 && <span className="rounded-full bg-prune-100 px-1.5 text-xs tabular-nums text-prune-700">{layers.length}</span>}
          <ChevronDown className={clsx('h-4 w-4 shrink-0 text-loam-400 transition-transform', open ? '' : 'rotate-180')} aria-hidden="true" />
        </button>
        {open && (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-3 pt-2">
            {layers.map((layer) => (
              <div key={layer.key}>
                <h3 className="mb-1.5 text-xs font-semibold text-loam-800">{layer.name}</h3>
                <LayerLegend layer={layer} />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
