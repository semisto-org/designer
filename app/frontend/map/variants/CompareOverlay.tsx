import { useEffect, useMemo, useRef } from 'react'
import { useEditor } from '@/map/editor/EditorContext'
import { clickClaimers } from '@/map/featurePick'
import { deferred } from '@/map/panels/deferred'
import { applySheetLayers, setSheetFadeOn, sheetIds } from '@/map/phases/layers'
import { COMPARE_INK, compareWith, pickCompared, useCompareState } from './compare'
import { comparedCollection } from './variants'
import { useShownVariant, useVariants } from './store'

const CompareCard = deferred(() => import('./CompareCard'), 'none')
const IDS = sheetIds('variant-compare')

/**
 * Always mounted in the editor. While another variant is laid over the
 * one shown (« Poser sur la table »), its own elements lie on top in a
 * teammate's ink, pencil strokes as strokes; a click on one picks it in the
 * card, to copy it here. Taken away when it would compare a variant with
 * itself, when that variant is gone, or outside « Projet ».
 */
export default function CompareOverlay() {
  const editor = useEditor()
  const other = useCompareState((s) => s.other)
  const fade = useCompareState((s) => s.fade)
  const shown = useShownVariant()
  const exists = useVariants((s) => other != null && s.variants.some((v) => v.id === other))
  const active = other != null && exists && shown != null && shown.id !== other && editor.mode === 'project'
  const data = useMemo(() => (active && other != null ? comparedCollection(editor.features, other) : null), [active, other, editor.features])
  const fadeRef = useRef(fade)
  fadeRef.current = fade

  useEffect(() => {
    if (other != null && !active) compareWith(null)
  }, [other, active])

  useEffect(() => {
    const map = editor.instance
    const apply = () => {
      try {
        applySheetLayers(map, IDS, data, fadeRef.current, COMPARE_INK)
        return true
      } catch {
        return false // style not ready yet: its `styledata` brings us back
      }
    }
    const listener = data ? apply : () => { if (apply()) map.off('styledata', listener) }
    if (apply() && !data) return
    map.on('styledata', listener)
    return () => {
      map.off('styledata', listener)
    }
  }, [editor.instance, data])

  useEffect(() => {
    try {
      setSheetFadeOn(editor.instance, IDS, fade)
    } catch {
      // Style not ready: the layers take the fade when they are added.
    }
  }, [editor.instance, fade, data])

  const drawing = editor.drawing
  useEffect(() => {
    if (!data || drawing) return
    const map = editor.instance
    const hitAt = (point: { x: number; y: number }) => {
      const layers = IDS.hit.filter((id) => map.getLayer(id))
      return layers.length ? map.queryRenderedFeatures([point.x, point.y], { layers })[0] ?? null : null
    }
    const claim = (point: { x: number; y: number }) => hitAt(point) != null
    const click = (event: { point: { x: number; y: number } }) => {
      const hit = hitAt(event.point)
      if (hit) pickCompared(Number(hit.properties?.id))
    }
    clickClaimers.add(claim)
    map.on('click', click)
    return () => {
      clickClaimers.delete(claim)
      map.off('click', click)
    }
  }, [editor.instance, data, drawing])

  return active && other != null && shown ? <CompareCard other={other} shown={shown.id} empty={(data?.features.length ?? 0) === 0} /> : null
}
