// « Déplacer » from the keyboard: M on a selected element (the card of a
// clicked plant, or the inspector) starts its move or shape edit, Enter saves,
// Escape gives up (DrawingToolbar, editor/draw.ts). No imports, so node:test
// can load it.

type KeyEvent = { key: string; code?: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean }

/** M alone, whatever the layout or Caps Lock; ⌘M, Ctrl+M and Alt+M stay the system's. */
export function isMoveShortcut(event: KeyEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) return false
  return event.key.toLowerCase() === 'm' || event.code === 'KeyM'
}

export type MoveTarget = { id: number; from: 'peek' | 'inspector' }

/**
 * The element M moves: the plant whose card is open, else the element open
 * in the inspector. A selection of several elements has its own « Déplacer
 * ensemble », so M leaves it alone.
 */
export function moveTarget(state: { peekedId: number | null; selectedId: number | null; selection: number[] }): MoveTarget | null {
  if (state.selection.length > 1) return null
  if (state.peekedId != null) return { id: state.peekedId, from: 'peek' }
  if (state.selectedId != null) return { id: state.selectedId, from: 'inspector' }
  return null
}
