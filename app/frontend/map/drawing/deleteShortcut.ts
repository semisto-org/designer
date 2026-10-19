// « Supprimer » from the keyboard: Backspace (or Delete) on the selected
// plants or elements offers to put them in the trash, but only what is still
// a project: a plant in the ground or a pond already dug has a history and
// leaves through its card (DrawingToolbar). No imports, so node:test can
// load it.

type KeyEvent = { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey?: boolean }

/** Backspace or Delete alone; ⌘⌫ and the others stay the system's. */
export function isDeleteShortcut(event: KeyEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false
  return event.key === 'Backspace' || event.key === 'Delete'
}

type Properties = Record<string, unknown> | null | undefined
type Feature = { properties: Properties & { id: number } }

function plant(properties: Properties): boolean {
  return properties?.kind === 'plant' && properties?.layer === 'plants'
}

/** Twin of isPlanned (map/scenario.ts), kept here so this file has no imports. */
function planned(properties: Properties): boolean {
  return plant(properties) ? typeof properties?.planted_on !== 'string' : properties?.planned === true
}

export type DeleteTargets = { planned: number[]; kept: number; plantsOnly: boolean }

/**
 * What Backspace would delete: the selection of several elements, else the
 * plant whose card is open, else the element in the inspector. Only what is
 * still a project is kept (a plant not planted, an element marked « En
 * projet »); `kept` counts what is already on the ground and stays.
 * `plantsOnly` lets the question speak of plants rather than elements.
 * AI drafts have their own review and are left out. Null when nothing is picked.
 */
export function deleteTargets(
  state: { peekedId: number | null; selectedId: number | null; selection: number[] },
  features: Feature[],
): DeleteTargets | null {
  const ids = state.selection.length > 1 ? state.selection : [state.peekedId ?? state.selectedId].filter((id): id is number => id != null)
  const picked = features.filter((f) => ids.includes(f.properties.id) && f.properties.status !== 'draft')
  if (!picked.length) return null
  const ready = picked.filter((f) => planned(f.properties)).map((f) => f.properties.id)
  return { planned: ready, kept: picked.length - ready.length, plantsOnly: picked.every((f) => plant(f.properties)) }
}
