// A double-click zooms the map, but MapLibre fires `click` for each of its
// two presses first. Handlers that open something on a plain click (the
// "What is here?" popup) go through `onSingleClick`: the click is held for
// the double-click window and dropped if a `dblclick` follows.

type ClickSource<E> = {
  on(type: 'click' | 'dblclick', listener: (event: E) => void): unknown
  off(type: 'click' | 'dblclick', listener: (event: E) => void): unknown
}

// Slightly above the browsers' usual double-click interval on a mouse.
export const DOUBLE_CLICK_MS = 300

/** Calls `handler` for clicks that are not part of a double-click. Returns the unsubscribe. */
export function onSingleClick<E>(map: ClickSource<E>, handler: (event: E) => void, delay = DOUBLE_CLICK_MS): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const cancel = () => {
    if (timer != null) clearTimeout(timer)
    timer = null
  }
  const onClick = (event: E) => {
    cancel()
    timer = setTimeout(() => {
      timer = null
      handler(event)
    }, delay)
  }
  map.on('click', onClick)
  map.on('dblclick', cancel)
  return () => {
    cancel()
    map.off('click', onClick)
    map.off('dblclick', cancel)
  }
}
