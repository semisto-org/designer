import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { LAYER_COLORS } from '@/map/layers/features'
import type { FeatureLayer } from '@/types'

const LAYERS: FeatureLayer[] = ['existing', 'water', 'access', 'structures', 'plants', 'animals', 'networks', 'notes']

/** Every element of the map, grouped by layer. Clicking one selects it. */
export default function ElementsPanel() {
  const editor = useEditor()
  const groups = LAYERS.map((layer) => ({
    layer,
    items: editor.features.filter((f) => f.properties.layer === layer && f.properties.status !== 'rejected'),
  })).filter((g) => g.items.length > 0)

  if (groups.length === 0) return <p className="text-sm text-loam-500">{t('editor.elements.empty')}</p>
  return (
    <div className="space-y-5">
      {groups.map(({ layer, items }) => (
        <section key={layer}>
          <h3 className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-loam-500">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: LAYER_COLORS[layer] }} />
            {t(`editor.layers.${layer}`)} · {items.length}
          </h3>
          <ul className="divide-y divide-loam-100">
            {items.map((f) => (
              <li key={f.properties.id}>
                <button
                  type="button"
                  onClick={() => editor.select(f.properties.id)}
                  className={
                    'flex w-full items-center justify-between gap-2 px-1 py-1.5 text-left text-sm hover:bg-loam-50 ' +
                    (editor.selectedId === f.properties.id ? 'font-medium text-prune-700' : 'text-loam-700')
                  }
                >
                  <span className="truncate">{f.properties.name || t(`editor.kinds.${f.properties.kind}`)}</span>
                  {f.properties.status === 'draft' && (
                    <span className="rounded bg-humus-100 px-1.5 text-xs text-humus-700">{t('editor.draft')}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
