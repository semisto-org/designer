/**
 * Which tools the rail lists in a step. A first visit should not meet thirty
 * panels at once: each step shows its essential tools, and the others wait
 * behind « N autres outils » until the person unfolds the step. The open
 * panel and the one the « À faire maintenant » card points to always stay in
 * view.
 */
export type RailCandidate = { id: string; essential?: boolean }

export type RailContext = {
  /** Unfolded by the person (kept in this browser). */
  expanded: boolean
  /** Panels that never hide: the open one, the one to do now. */
  pinned: ReadonlyArray<string | null>
}

export type RailGroupItems<T> = { shown: T[]; hidden: number }

export function railItems<T extends RailCandidate>(items: T[], context: RailContext): RailGroupItems<T> {
  if (context.expanded) return { shown: items, hidden: 0 }
  const shown = items.filter((item) => item.essential || context.pinned.includes(item.id))
  // A step without any essential tool lists them all: never an empty step.
  if (shown.length === 0) return { shown: items, hidden: 0 }
  return { shown, hidden: items.length - shown.length }
}

/** The steps unfolded in this browser, read from localStorage (a JSON list). */
export function parseExpanded(raw: string | null): string[] {
  if (!raw) return []
  try {
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}
