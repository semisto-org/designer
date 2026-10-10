import type { LayerLegendData, LayerLegendItem } from '../../types/index.ts'

/** Beyond this many classes, a legend folds to its first few. */
export const FOLD_AFTER = 8
export const FOLDED_COUNT = 6

export type Legendable = { name: string; legend?: LayerLegendData | null; legendUrl?: string | null }

/** Whether the layer has a legend of its own (scale, classes or note). */
export function hasOwnLegend(layer: Legendable): boolean {
  const legend = layer.legend
  return Boolean(legend?.gradient || legend?.items?.length || legend?.note)
}

/** Whether there is anything to show: its own legend, or its service's image. */
export function hasLegend(layer: Legendable): boolean {
  return hasOwnLegend(layer) || Boolean(layer.legendUrl)
}

export function classCount(items: LayerLegendItem[]): number {
  return items.filter((item) => !('heading' in item)).length
}

/** The items a folded legend shows: its first classes, with the headings above them. */
export function foldedItems(items: LayerLegendItem[]): LayerLegendItem[] {
  if (classCount(items) <= FOLD_AFTER) return items
  let count = 0
  return items.filter((item) => ('heading' in item ? count < FOLDED_COUNT : ++count <= FOLDED_COUNT))
}
