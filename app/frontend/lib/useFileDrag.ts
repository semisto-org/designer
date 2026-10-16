import { useEffect, useState } from 'react'

/** The drag type photo tiles carry when they are dragged onto an album. */
export const PHOTO_DRAG_TYPE = 'application/x-designer-photos'

/**
 * Whether files from the computer are being dragged over the window, to show
 * a drop overlay. Listens on the window in the capture phase, so a drop
 * handled (and stopped) by an inner target, a drag that leaves the window or
 * one that is cancelled always clears it. Drags started inside the page (a
 * photo tile, whose image the browser also lists as « Files ») don't count.
 */
export function useFileDrag(enabled: boolean) {
  const [active, setActive] = useState(false)
  useEffect(() => {
    if (!enabled) {
      setActive(false)
      return
    }
    let depth = 0
    const isFileDrag = (event: DragEvent) => {
      const types = Array.from(event.dataTransfer?.types ?? [])
      return types.includes('Files') && !types.includes(PHOTO_DRAG_TYPE)
    }
    const enter = (event: DragEvent) => {
      if (!isFileDrag(event)) return
      depth += 1
      setActive(true)
    }
    const leave = (event: DragEvent) => {
      if (!isFileDrag(event)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setActive(false)
    }
    const reset = () => {
      depth = 0
      setActive(false)
    }
    window.addEventListener('dragenter', enter, true)
    window.addEventListener('dragleave', leave, true)
    window.addEventListener('drop', reset, true)
    window.addEventListener('dragend', reset, true)
    return () => {
      window.removeEventListener('dragenter', enter, true)
      window.removeEventListener('dragleave', leave, true)
      window.removeEventListener('drop', reset, true)
      window.removeEventListener('dragend', reset, true)
    }
  }, [enabled])
  return active
}
