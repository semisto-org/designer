import { useEffect, useMemo, useRef } from 'react'
import { useEditor } from '@/map/editor/EditorContext'
import { clickClaimers } from '@/map/featurePick'
import { deferred } from '@/map/panels/deferred'
import { useVariants } from '@/map/variants/store'
import { applyPhaseLayers, PHASE_HIT_LAYERS, setPhaseFadeOn } from './layers'
import { forMap, pickPhaseElement, usePhases } from './store'
import { compareWith, phaseCollection } from './types'

const PhaseCard = deferred(() => import('./PhaseCard'), 'none')

/**
 * Always mounted in the editor. While a phase put away is reopened, its
 * elements lie over today's map like a sheet of tracing paper; a click on
 * one of them picks it in the phase card (to take it back) instead of
 * selecting what lies under it. What changed since is worked out from
 * today's elements, so it follows every edit made while the phase is open.
 */
export default function PhaseOverlay() {
  const editor = useEditor()
  useEffect(() => forMap(editor.map.id), [editor.map.id])
  const open = usePhases((s) => (s.mapId === editor.map.id ? s.open : null))
  const fade = usePhases((s) => s.fade)
  const variant = usePhases((s) => s.variant)
  const variants = useVariants((s) => s.variants)
  const retained = variants.find((v) => v.retained)?.id ?? null
  const variantIds = useMemo(() => variants.map((v) => v.id), [variants])
  const compare = useMemo(() => (open ? compareWith(open, editor.features, retained, variant, variantIds) : null), [open, editor.features, retained, variant, variantIds])
  const data = useMemo(() => (open && compare ? phaseCollection(open, compare, variant) : null), [open, compare, variant])
  const fadeRef = useRef(fade)
  fadeRef.current = fade

  useEffect(() => {
    const map = editor.instance
    const apply = () => {
      try {
        applyPhaseLayers(map, data, fadeRef.current)
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
      setPhaseFadeOn(editor.instance, fade)
    } catch {
      // Style not ready: the layers take the fade when they are added.
    }
  }, [editor.instance, fade, data])

  const drawing = editor.drawing
  useEffect(() => {
    if (!data || drawing) return
    const map = editor.instance
    const hitAt = (point: { x: number; y: number }) => {
      const layers = PHASE_HIT_LAYERS.filter((id) => map.getLayer(id))
      return layers.length ? map.queryRenderedFeatures([point.x, point.y], { layers })[0] ?? null : null
    }
    const claim = (point: { x: number; y: number }) => hitAt(point) != null
    const click = (event: { point: { x: number; y: number } }) => {
      const hit = hitAt(event.point)
      if (hit) pickPhaseElement(Number(hit.properties?.id))
    }
    clickClaimers.add(claim)
    map.on('click', click)
    return () => {
      clickClaimers.delete(claim)
      map.off('click', click)
    }
  }, [editor.instance, data, drawing])

  return open && compare ? <PhaseCard phase={open} compare={compare} /> : null
}
