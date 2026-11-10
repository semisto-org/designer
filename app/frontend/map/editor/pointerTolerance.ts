// How far a press may wander before it counts as a drag rather than a tap.
//
// Terra Draw (and so placing a plant, a point, the first corner of a shape,
// or picking a point to edit) turns a press into a drag after 1 pixel. A
// mouse holds still; an Apple Pencil or a finger never does: the tip slides
// a few pixels between touching the glass and lifting off, so every tap
// became a tiny drag and nothing was placed. Only freehand, which is drawn
// by dragging, worked with a pencil. A pen or a finger gets the same slack
// as MapLibre's own taps.

export type DragTolerances = {
  /** Idle modes: placing a point, starting a shape. */
  minPixelDragDistance: number
  /** Select mode: picking or dragging a point of an edited shape. */
  minPixelDragDistanceSelecting: number
  /** A shape being drawn (each further click adds a point). */
  minPixelDragDistanceDrawing: number
}

// Terra Draw's own defaults, right for a mouse.
export const MOUSE_TOLERANCES: DragTolerances = {
  minPixelDragDistance: 1,
  minPixelDragDistanceSelecting: 1,
  minPixelDragDistanceDrawing: 8,
}

export const TOUCH_TOLERANCES: DragTolerances = {
  minPixelDragDistance: 8,
  minPixelDragDistanceSelecting: 8,
  minPixelDragDistanceDrawing: 12,
}

/** The tolerances for a pointer, from its `pointerType` ('mouse', 'pen', 'touch' or ''). */
export function dragTolerances(pointerType: string): DragTolerances {
  return pointerType === 'pen' || pointerType === 'touch' ? TOUCH_TOLERANCES : MOUSE_TOLERANCES
}

/** MapLibre's click tolerance for the map: a pencil tap still opens what it touched. */
export const MAP_CLICK_TOLERANCE = 6
