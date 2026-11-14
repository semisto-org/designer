// The phone and the tablet. On an iPad (or any window at least WIDE wide,
// in either orientation and in Split View) the map keeps the whole screen and
// the notebook becomes a column on the left, beside it, as in a field
// notebook open next to the plan; lists and forms keep a readable width
// instead of stretching across the screen. A phone keeps its bottom sheet.
import { useWindowDimensions, type ViewStyle } from 'react-native'
import { radius, space } from './theme'

/** From this window width on (points), the notebook sits beside the map. */
export const WIDE = 700

/** The widest a list or a form grows: a line stays easy to read. */
export const READABLE = 680

export type Layout = {
  wide: boolean
  /** The width of the notebook column beside the map (the window's width on a phone). */
  panel: number
}

export function layoutFor(width: number): Layout {
  const wide = width >= WIDE
  return { wide, panel: wide ? Math.round(Math.min(440, Math.max(360, width * 0.36))) : width }
}

export function useLayout(): Layout {
  return layoutFor(useWindowDimensions().width)
}

/** A scroll's content that stays at a readable width, centred, on a tablet. */
export const readable: ViewStyle = { width: '100%', maxWidth: READABLE, alignSelf: 'center' }

/**
 * Room the camera keeps clear when it moves to something: under the bottom
 * sheet on a phone (`bottom`), beside the notebook column on a tablet.
 */
export function cameraPadding(layout: Layout, bottom: number, top = 120) {
  return layout.wide
    ? { top, bottom: 48, left: layout.panel + space.md * 2, right: 48 }
    : { top, bottom, left: 0, right: 0 }
}

/** A panel at the bottom of a full-screen map: a card in the left column on a tablet. */
export function floatingPanel(layout: Layout): ViewStyle | null {
  return layout.wide
    ? { left: space.md, right: undefined, bottom: space.md, width: layout.panel, borderRadius: radius.sheet }
    : null
}
