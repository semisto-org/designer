import { useMemo, useSyncExternalStore } from 'react'
import { formatNumber, t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { measure } from '@/map/editor/measure'
import { earthworksBalance, type Balance, type Measure } from '@/map/earthworks/earthworks'
import { inVariant } from '@/map/variants/variants'
import { shownVariantId, useVariants } from '@/map/variants/store'
import { displayGeometry } from '@/map/zones/zones'
import type { MapFeature } from '@/types'

/** « 12,4 m³ », or litres under one cubic metre would mislead here: soil is counted in m³. */
export function m3(value: number): string {
  const rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value)
  return t('earthworks.m3', { value: formatNumber(rounded) })
}

/** « 194 brouettes ou 2 camions ». */
export function loadsText(wheelbarrows: number, trucks: number): string {
  return t('earthworks.section.loads', {
    wheelbarrows: t('earthworks.section.wheelbarrows', { count: wheelbarrows }),
    trucks: t('earthworks.section.trucks', { count: trucks }),
  })
}

/** A feature's name, or its kind. */
export function featureName(feature: MapFeature | undefined): string {
  if (!feature) return ''
  return feature.properties.name?.trim() || t(`editor.kinds.${feature.properties.kind}`)
}

export function measureOf(feature: MapFeature): Measure {
  return measure(displayGeometry(feature))
}

/** The features the balance counts: active ones of the project variant shown on the map. */
export function countedFeatures(features: MapFeature[], variant: number | null): MapFeature[] {
  return features.filter((f) => f.properties.status === 'active' && inVariant(f.properties, variant))
}

/** The earthworks balance of the open map, as the person sees it (variant shown included). */
export function useEarthworks(): { balance: Balance; byId: Map<number, MapFeature>; counted: MapFeature[] } {
  const { features } = useEditor()
  const variant = useVariants(shownVariantId)
  return useMemo(() => {
    const counted = countedFeatures(features, variant)
    const balance = earthworksBalance(counted.map((f) => ({ id: f.properties.id, kind: f.properties.kind, properties: f.properties, measure: measureOf(f) })))
    return { balance, byId: new Map(features.map((f) => [f.properties.id, f])), counted }
  }, [features, variant])
}

// --- « Montrer sur la carte où va la terre » (per viewer, kept in localStorage) ---

const ARROWS_KEY = 'designer:earthworks:arrows'
let arrows = readArrows()
const listeners = new Set<() => void>()

function readArrows(): boolean {
  try {
    return typeof window === 'undefined' || window.localStorage.getItem(ARROWS_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setArrowsShown(shown: boolean) {
  arrows = shown
  try {
    window.localStorage.setItem(ARROWS_KEY, shown ? 'on' : 'off')
  } catch {
    // Private browsing: the choice lasts for the visit.
  }
  listeners.forEach((listener) => listener())
}

export function useArrowsShown(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => arrows,
  )
}
