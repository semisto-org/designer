import { useSyncExternalStore } from 'react'

/**
 * The plant whose card is open on the map (a click on a plant opens a small
 * card before the full inspector). Shared between the editor's click handler
 * and the overlay that draws the card.
 */
let peekedId: number | null = null
const listeners = new Set<() => void>()

function set(id: number | null) {
  if (id === peekedId) return
  peekedId = id
  listeners.forEach((l) => l())
}

export const plantPeek = {
  open: (id: number) => set(id),
  close: () => set(null),
  current: () => peekedId,
}

export function usePlantPeek(): number | null {
  return useSyncExternalStore((l) => { listeners.add(l); return () => void listeners.delete(l) }, () => peekedId, () => null)
}
