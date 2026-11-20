import { ScanLine } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { formatLength, t } from '@/lib/i18n'
import { storedProperties } from '@/map/drawing/catalog'
import { saveFeature } from '@/map/drawing/save'
import { useEditor } from '@/map/editor/EditorContext'
import type { MapFeature } from '@/types'

type TreeHeights = { available: boolean; source: string | null; heights: Record<string, number> }

/**
 * How tall a tree already on the land is, seen from above by the relief's
 * surface model (LiDAR in Wallonia): the person keeps that height for the
 * tree, or for every tree that has none yet. Hidden when the relief cannot say.
 */
export default function TreeHeightSection({ feature }: { feature: MapFeature }) {
  const editor = useEditor()
  const [data, setData] = useState<TreeHeights | null>(null)
  const [busy, setBusy] = useState(false)
  const id = feature.properties.id

  useEffect(() => {
    const controller = new AbortController()
    api<TreeHeights>(`/maps/${editor.map.id}/tree_heights`, { signal: controller.signal })
      .then(setData)
      .catch(() => {})
    return () => controller.abort()
  }, [editor.map.id])

  if (!data?.available) return null
  const seen = data.heights[String(id)]
  const noted = Number(feature.properties.height_m) || null
  const missing = editor.features.filter((f) => f.properties.kind === 'existing_tree' && f.properties.status === 'active'
    && !(Number(f.properties.height_m) > 0) && data.heights[String(f.properties.id)] != null)

  const keep = async (targets: MapFeature[]) => {
    setBusy(true)
    let saved = 0
    for (const tree of targets) {
      const height = data.heights[String(tree.properties.id)]
      if (height != null && await saveFeature(editor, tree.properties.id, { properties: { ...storedProperties(tree), height_m: height } })) saved++
    }
    setBusy(false)
    if (saved > 0) editor.notify(t('relief.tree_height.saved', { count: saved }))
  }

  return (
    <div className="space-y-2 rounded-2xl bg-loam-50 p-3 text-sm text-loam-700 ring-1 ring-loam-200">
      <p className="flex items-start gap-2">
        <ScanLine className="mt-0.5 h-4 w-4 shrink-0 text-leaf-700" />
        <span>
          {seen != null ? t('relief.tree_height.seen', { height: formatLength(seen) }) : t('relief.tree_height.nothing')}
          {data.source && <span className="text-loam-500"> {t('relief.tree_height.source', { source: data.source })}</span>}
        </span>
      </p>
      {editor.canEdit && (
        <div className="flex flex-wrap gap-2">
          {seen != null && (noted == null || Math.abs(noted - seen) >= 0.5) && (
            <Button variant="secondary" size="sm" disabled={busy || editor.drawing} onClick={() => keep([feature])}>
              {noted == null ? t('relief.tree_height.keep') : t('relief.tree_height.replace', { height: formatLength(noted) })}
            </Button>
          )}
          {missing.filter((f) => f.properties.id !== id).length > 0 && (
            <Button variant="ghost" size="sm" disabled={busy || editor.drawing} onClick={() => keep(missing)}>
              {t('relief.tree_height.keep_all', { count: missing.length })}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
