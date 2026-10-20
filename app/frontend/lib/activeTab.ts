import { useEffect, type RefObject } from 'react'

type Box = { left: number; width: number }

/**
 * The scrollLeft that centres a tab in its scrolling row, clamped to the
 * row's ends. `row` and `tab` are viewport boxes (getBoundingClientRect).
 */
export function centeredScrollLeft(scrollLeft: number, maxScroll: number, row: Box, tab: Box): number {
  const target = scrollLeft + (tab.left - row.left) - (row.width - tab.width) / 2
  return Math.max(0, Math.min(maxScroll, Math.round(target)))
}

/**
 * On a phone, a row of tabs wider than the screen opens on its active tab
 * (the element marked `aria-current`), instead of leaving it cut off at the
 * right. Only the row scrolls, never the page.
 */
export function useActiveTabInView(row: RefObject<HTMLElement | null>, key: unknown) {
  useEffect(() => {
    const el = row.current
    const tab = el?.querySelector<HTMLElement>('[aria-current]')
    if (!el || !tab || el.scrollWidth <= el.clientWidth) return
    el.scrollLeft = centeredScrollLeft(el.scrollLeft, el.scrollWidth - el.clientWidth, el.getBoundingClientRect(), tab.getBoundingClientRect())
  }, [row, key])
}
