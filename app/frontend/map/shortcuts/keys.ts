// The keyboard sheet of the map editor: « ? » opens it, and the keys shown
// follow the computer (⌘ on a Mac, Ctrl elsewhere). No imports, so node:test
// can load it.

type KeyEvent = { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean }

/** « ? » alone, whatever the layout (Shift is part of typing it). */
export function isShortcutsKey(event: KeyEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) return false
  return event.key === '?'
}

/** The modifier key's symbol on this computer. */
export function commandKey(platform: string): string {
  return /mac|iphone|ipad/i.test(platform) ? '⌘' : 'Ctrl'
}

export type ShortcutRow = { keys: string[]; label: string }

/** The rows of the sheet, in the order a person meets them, by group. */
export const SHORTCUT_GROUPS: { key: string; rows: { keys: string[]; label: string }[] }[] = [
  {
    key: 'select',
    rows: [
      { keys: ['shift', 'click'], label: 'select_add' },
      { keys: ['shift', 'drag'], label: 'select_box' },
      { keys: ['escape'], label: 'escape' },
    ],
  },
  {
    key: 'edit',
    rows: [
      { keys: ['m'], label: 'move' },
      { keys: ['backspace'], label: 'delete' },
      { keys: ['cmd', 'z'], label: 'undo' },
      { keys: ['cmd', 'shift', 'z'], label: 'redo' },
    ],
  },
  {
    key: 'draw',
    rows: [
      { keys: ['enter'], label: 'finish' },
      { keys: ['a'], label: 'points_move' },
      { keys: ['+'], label: 'points_add' },
      { keys: ['-'], label: 'points_remove' },
    ],
  },
  {
    key: 'anywhere',
    rows: [
      { keys: ['cmd', 'j'], label: 'search' },
      { keys: ['?'], label: 'sheet' },
    ],
  },
]
