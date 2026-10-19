// « Supprimer » from the keyboard: Backspace (or Delete) on the selected
// plants offers to put them in the trash, but only the ones still planned:
// a plant already in the ground has a history (date, observations, harvests)
// and leaves through its card (DrawingToolbar). No imports, so node:test can
// load it.

type KeyEvent = { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey?: boolean }

/** Backspace or Delete alone; ⌘⌫ and the others stay the system's. */
export function isDeleteShortcut(event: KeyEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false
  return event.key === 'Backspace' || event.key === 'Delete'
}

type Properties = Record<string, unknown> | null | undefined
type Feature = { properties: Properties & { id: number } }

/** Twin of isPlannedPlant (map/scenario.ts), kept here so this file has no imports. */
function plannedPlant(properties: Properties): boolean {
  return properties?.kind === 'plant' && properties?.layer === 'plants' && typeof properties?.planted_on !== 'string'
}

function plant(properties: Properties): boolean {
  return properties?.kind === 'plant' && properties?.layer === 'plants'
}

export type DeleteTargets = { planned: number[]; planted: number }

/**
 * What Backspace would delete: the selection of several elements, else the
 * plant whose card is open, else the element in the inspector. Only planned
 * plants are kept; `planted` counts the plants in the ground left alone.
 * Null when no plant is picked at all, so the key does nothing.
 */
export function deleteTargets(
  state: { peekedId: number | null; selectedId: number | null; selection: number[] },
  features: Feature[],
): DeleteTargets | null {
  const ids = state.selection.length > 1 ? state.selection : [state.peekedId ?? state.selectedId].filter((id): id is number => id != null)
  const picked = features.filter((f) => ids.includes(f.properties.id) && plant(f.properties))
  if (!picked.length) return null
  const planned = picked.filter((f) => plannedPlant(f.properties)).map((f) => f.properties.id)
  return { planned, planted: picked.length - planned.length }
}
