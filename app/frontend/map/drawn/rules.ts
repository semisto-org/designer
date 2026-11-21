/**
 * Pure rules of the « vue dessinée » (map/drawn): while the editor shows the
 * project, the land is drawn as a designer's base plan instead of a photo.
 * Kept apart from React and MapLibre so they can be tested on their own.
 */

/** How much of the aerial photo shows through the paper, by default (0 = none). */
export const PHOTO_DEFAULT = 0.15
/** Beyond this the photo takes over again: the person switches the view off instead. */
export const PHOTO_MAX = 0.6

/**
 * The drawn view is on while the editor shows « Projet » and the person kept
 * it on. While presenting, the « rendu présentation » dresses the map itself.
 */
export function drawnViewOn(mode: string, enabled: boolean, presenting: boolean): boolean {
  return mode === 'project' && enabled && !presenting
}

/** A photo share the slider can hold, whatever was stored. */
export function clampPhoto(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : PHOTO_DEFAULT
  return Math.min(PHOTO_MAX, Math.max(0, n))
}

/** The paper's opacity for a photo share: the paper is what the photo is not. */
export function paperOpacity(photo: number): number {
  return Math.round((1 - clampPhoto(photo)) * 100) / 100
}

/** Prefixes of what the paper is laid under: sketches traced on the land (« Fonds de plan »), the relief read from the land (flow axes, hillshade) and the plan. */
const ABOVE_PAPER_PREFIXES = ['plan-image-', 'relief-overlay']
/** Sources of the plan: the elements, the plants' crowns, the terrain's outline. */
const PLAN_SOURCES = new Set(['features', 'plant-crowns', 'boundary', 'boundary-mask'])

/**
 * The layer the paper goes under: the first sketch laid on the land, else
 * the first layer of the plan. Base maps, region overlays and drone views
 * stay below it, so the slider pales all of them alike.
 */
export function paperBefore(order: string[], sourceOf: (id: string) => string, paperId: string): string | undefined {
  return order.find((id) => id !== paperId && (ABOVE_PAPER_PREFIXES.some((p) => id.startsWith(p)) || PLAN_SOURCES.has(sourceOf(id))))
}

/** The stored choice of a viewer for a map, read back safely. */
export type DrawnViewChoice = { enabled: boolean; photo: number }

export function parseChoice(raw: unknown): DrawnViewChoice {
  const saved = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return { enabled: saved.enabled !== false, photo: clampPhoto(saved.photo) }
}
