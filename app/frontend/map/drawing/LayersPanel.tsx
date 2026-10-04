import clsx from 'clsx'
import { Eye, EyeOff, ShieldAlert } from 'lucide-react'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { DESIGN_LAYERS, layerColor } from '@/map/drawing/catalog'
import { setHiddenLayers, useDrawingState } from '@/map/drawing/store'
import { LAYER_COLORS } from '@/map/layers/features'

/** "Calques": show or hide each design layer, for this viewer only. */
export default function LayersPanel() {
  const editor = useEditor()
  const hidden = useDrawingState((s) => s.hiddenLayers)
  const counts = new Map<string, number>()
  editor.features.forEach((f) => {
    if (f.properties.status !== 'rejected') counts.set(f.properties.layer, (counts.get(f.properties.layer) ?? 0) + 1)
  })

  function toggle(layer: string) {
    setHiddenLayers(hidden.includes(layer) ? hidden.filter((l) => l !== layer) : [...hidden, layer])
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-loam-600">{t('drawing.layers_panel.intro')}</p>
      <ul className="divide-y divide-loam-100">
        {DESIGN_LAYERS.map((layer) => {
          const visible = !hidden.includes(layer)
          const count = counts.get(layer) ?? 0
          return (
            <li key={layer}>
              <button
                type="button"
                onClick={() => toggle(layer)}
                aria-pressed={visible}
                aria-label={t('drawing.layers_panel.toggle', { layer: t(`editor.layers.${layer}`) })}
                className="flex w-full items-center gap-3 px-1 py-2 text-left hover:bg-loam-50"
              >
                <span
                  className={clsx('h-3.5 w-3.5 shrink-0 rounded-full ring-2 ring-white', !visible && 'opacity-30')}
                  style={{ background: LAYER_COLORS[layer] ?? layerColor(layer) }}
                />
                <span className={clsx('flex-1 text-sm', visible ? 'text-loam-900' : 'text-loam-400 line-through decoration-loam-300')}>
                  {t(`editor.layers.${layer}`)}
                  {layer === 'networks' && <ShieldAlert className="ml-1.5 inline h-3.5 w-3.5 text-loam-400" aria-hidden />}
                </span>
                <span className="text-xs text-loam-400">{t('drawing.layers_panel.count', { count })}</span>
                {visible ? <Eye className="h-4 w-4 text-loam-500" /> : <EyeOff className="h-4 w-4 text-loam-400" />}
              </button>
            </li>
          )
        })}
      </ul>
      {hidden.length > 0 && (
        <button type="button" onClick={() => setHiddenLayers([])} className="text-sm font-medium text-prune-700 hover:underline">
          {t('drawing.layers_panel.show_all')}
        </button>
      )}
      <p className="flex items-start gap-1.5 text-xs text-loam-500">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {t('drawing.layers_panel.sensitive')}
      </p>
    </div>
  )
}
