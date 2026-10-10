import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

/** Horizontal distance, in CSS pixels, past which a swipe turns the photo. */
const SWIPE_DISTANCE = 60
/** A flick shorter than this still counts when it is fast enough. */
const FLICK_DISTANCE = 30
const FLICK_MS = 250

/**
 * Swipe left or right with a finger to go to the next or previous photo
 * (iPad, phone). Only one finger counts: a second one is a pinch, and a page
 * already zoomed in pans instead of turning. Mouse and pen are left alone.
 * `offset` follows the finger, so the photo moves with it before it turns.
 */
export function useSwipe({ enabled, onPrevious, onNext }: { enabled: boolean; onPrevious?: () => void; onNext?: () => void }) {
  const start = useRef<{ id: number; x: number; y: number; at: number } | null>(null)
  const fingers = useRef(new Set<number>())
  const [offset, setOffset] = useState(0)

  function reset() {
    start.current = null
    setOffset(0)
  }

  function zoomedIn() {
    return (window.visualViewport?.scale ?? 1) > 1.01
  }

  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType !== 'touch') return
    fingers.current.add(event.pointerId)
    if (!enabled || fingers.current.size > 1 || zoomedIn()) return reset()
    start.current = { id: event.pointerId, x: event.clientX, y: event.clientY, at: event.timeStamp }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLElement>) {
    const from = start.current
    if (!from || from.id !== event.pointerId) return
    const dx = event.clientX - from.x
    const dy = event.clientY - from.y
    // A mostly vertical gesture is not a swipe.
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 20) return reset()
    // Resists at the ends, where there is no photo to turn to.
    const blocked = (dx > 0 && !onPrevious) || (dx < 0 && !onNext)
    setOffset(blocked ? dx / 4 : dx)
  }

  function onPointerEnd(event: ReactPointerEvent<HTMLElement>) {
    fingers.current.delete(event.pointerId)
    const from = start.current
    if (!from || from.id !== event.pointerId) return
    const dx = event.clientX - from.x
    const dy = event.clientY - from.y
    const fast = event.timeStamp - from.at < FLICK_MS && Math.abs(dx) > FLICK_DISTANCE
    const horizontal = Math.abs(dx) > Math.abs(dy) * 1.5
    reset()
    if (event.type === 'pointercancel' || !horizontal || (Math.abs(dx) < SWIPE_DISTANCE && !fast)) return
    if (dx < 0) onNext?.()
    else onPrevious?.()
  }

  return {
    offset,
    handlers: { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd },
  }
}
