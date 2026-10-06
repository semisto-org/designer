import { useState } from 'react'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { LAYER_COLORS } from '@/map/layers/features'
import { usePlanting } from '@/map/plants/store'
import { TagChips, TagFilter } from '@/map/tags/TagFilter'
import { groupByTag, hasTag, tagCounts, tagsOf } from '@/map/tags/tags'
import type { FeatureLayer, MapFeature } from '@/types'

const LAYERS: FeatureLayer[] = ['existing', 'water', 'access', 'structures', 'plants', 'animals', 'networks', 'notes']

/** Every element of the map, grouped by layer or by tag, filtered by tag. Clicking one selects it. */
export default function ElementsPanel() {
  const editor = useEditor()
  const { data: planting } = usePlanting(editor.map.id)
  // A plant without a name reads as its species, so the list says what grows where.
  const label = (f: MapFeature) => {
    const species = planting?.species[String(f.properties.species_id ?? '')]
    return f.properties.name || species?.commonName || species?.latinName || t(`editor.kinds.${f.properties.kind}`)
  }
  const [tag, setTag] = useState<string | null>(null)
  const [byTag, setByTag] = useState(false)
  const all = editor.features.filter((f) => f.properties.status !== 'rejected')
  const tags = tagCounts(all)
  const visible = tag ? all.filter((f) => hasTag(f, tag)) : all

  const groups = byTag
    ? groupByTag(visible).map((g) => ({ key: g.tag ?? '', title: g.tag ?? t('tags.untagged'), color: null, items: g.items }))
    : LAYERS.map((layer) => ({
      key: layer, title: t(`editor.layers.${layer}`), color: LAYER_COLORS[layer],
      items: visible.filter((f) => f.properties.layer === layer),
    })).filter((g) => g.items.length > 0)

  if (all.length === 0) return <p className="text-sm text-loam-500">{t('editor.elements.empty')}</p>
  return (
    <div className="space-y-5">
      <TagFilter tags={tags} value={tag} onChange={setTag} grouped={byTag} onGroup={setByTag} />
      {groups.length === 0 && <p className="text-sm text-loam-500">{t('tags.no_match')}</p>}
      {groups.map(({ key, title, color, items }) => (
        <section key={key}>
          <h3 className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-loam-500">
            {color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />}
            {title} · {items.length}
          </h3>
          <ul className="divide-y divide-loam-100">
            {items.map((f) => <ElementRow key={f.properties.id} feature={f} label={label(f)} showLayer={byTag} />)}
          </ul>
        </section>
      ))}
    </div>
  )
}

function ElementRow({ feature, label, showLayer }: { feature: MapFeature; label: string; showLayer: boolean }) {
  const editor = useEditor()
  const p = feature.properties
  return (
    <li>
      <button
        type="button"
        onClick={() => editor.select(p.id)}
        className={
          'flex w-full items-center justify-between gap-2 px-1 py-1.5 text-left text-sm hover:bg-loam-50 ' +
          (editor.selectedId === p.id ? 'font-medium text-prune-700' : 'text-loam-700')
        }
      >
        <span className="flex min-w-0 items-center gap-2">
          {showLayer && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: LAYER_COLORS[p.layer] }} title={t(`editor.layers.${p.layer}`)} />}
          <span className="truncate">{label}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <TagChips tags={tagsOf(feature)} />
          {p.status === 'draft' && <span className="rounded bg-humus-100 px-1.5 text-xs text-humus-700">{t('editor.draft')}</span>}
        </span>
      </button>
    </li>
  )
}
