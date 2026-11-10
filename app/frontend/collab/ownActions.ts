import clsx from 'clsx'
import type { MouseEvent } from 'react'

/**
 * Edit and delete are rarely used, so they stay out of sight until the
 * pointer rests on the message (or keyboard focus reaches them). A touch
 * screen has no hover: a tap on the message shows them, a second tap hides
 * them again. The applause stays visible for everyone.
 */
export function ownActionsClass(revealed: boolean) {
  return clsx('transition-opacity', !revealed && 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100')
}

/** True when a click on a message is a bare tap, not on a link, a button or a text selection. */
export function isBareTap(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (target.closest('a, button, input, textarea, select, [contenteditable="true"]')) return false
  return !window.getSelection()?.toString()
}

export function revealOnTap(event: MouseEvent, setRevealed: (update: (value: boolean) => boolean) => void) {
  if (isBareTap(event)) setRevealed((value) => !value)
}
