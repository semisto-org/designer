// The overview's keyboard: arrows slide over the terrain, Shift + arrows
// turn around the point looked at and come closer (flyKeys.ts). Off while
// walking, driving the Niva or presenting: those have their own keys.

import { useEffect, type RefObject } from 'react'
import type { FlyKey } from './flyKeys'

type FlyTarget = {
  setFlyKey(key: FlyKey, down: boolean): void
  resetFlyKeys(): void
}

const ARROWS: Record<string, FlyKey> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }

/** A field, a list or a slider keeps its arrows. */
function ownsArrows(target: EventTarget | null): boolean {
  return !!(target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable], [role="slider"], [role="listbox"], [role="menu"]')
}

export function useFlyKeys(controller: RefObject<FlyTarget | null>, active: boolean) {
  useEffect(() => {
    if (!active) return
    const onKey = (event: KeyboardEvent) => {
      const c = controller.current
      if (!c) return
      const down = event.type === 'keydown'
      if (event.key === 'Shift') {
        c.setFlyKey('turn', down)
        return
      }
      const key = ARROWS[event.key]
      if (!key) return
      // Releasing always counts, so a key never stays held.
      if (down && (event.metaKey || event.ctrlKey || event.altKey || ownsArrows(event.target))) return
      if (down) event.preventDefault()
      c.setFlyKey('turn', event.shiftKey)
      c.setFlyKey(key, down)
    }
    const onBlur = () => controller.current?.resetFlyKeys()
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      window.removeEventListener('blur', onBlur)
      controller.current?.resetFlyKeys()
    }
  }, [controller, active])
}
