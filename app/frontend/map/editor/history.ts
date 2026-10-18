// « Annuler » / « Rétablir » of the map editor (⌘Z, ⌘⇧Z / Ctrl+Z, Ctrl+Y).
// Each change made through the editor records how to undo and redo itself;
// the editor wires the entries to the server (pages/maps/show.tsx), this
// file only keeps the order. No imports, so node:test can load it.

export type UndoEntry = {
  /** What was done, as the toast says it: « la suppression de « Noyer » ». */
  label: string
  undo: () => Promise<void>
  redo: () => Promise<void>
}

export type HistoryShortcut = 'undo' | 'redo' | null

/** ⌘Z / Ctrl+Z undoes; ⌘⇧Z, Ctrl+Shift+Z and Ctrl+Y redo. */
export function historyShortcut(event: { key: string; code?: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }): HistoryShortcut {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null
  const key = event.key.toLowerCase()
  if (key === 'z' || event.code === 'KeyZ') return event.shiftKey ? 'redo' : 'undo'
  if ((key === 'y' || event.code === 'KeyY') && event.ctrlKey && !event.shiftKey) return 'redo'
  return null
}

/** Typing in a field keeps the browser's own undo of the text. */
export function isTextTarget(target: EventTarget | null): boolean {
  const element = target as { tagName?: string; isContentEditable?: boolean; type?: string } | null
  if (!element?.tagName) return false
  if (element.isContentEditable) return true
  const tag = element.tagName.toLowerCase()
  if (tag === 'textarea' || tag === 'select') return true
  return tag === 'input' && !['checkbox', 'radio', 'button', 'submit', 'range', 'color', 'file'].includes(element.type ?? 'text')
}

export class UndoHistory {
  private done: UndoEntry[] = []
  private undone: UndoEntry[] = []
  private batch: UndoEntry[] | null = null
  private running_ = false

  private readonly limit: number

  constructor(limit = 100) {
    this.limit = limit
  }

  /** An undo or redo is on its way to the server. */
  get running() {
    return this.running_
  }

  get canUndo() {
    return this.done.length > 0
  }

  get canRedo() {
    return this.undone.length > 0
  }

  /** A new change: it can be undone, and what was undone can no longer be redone. */
  record(entry: UndoEntry) {
    if (this.batch) return void this.batch.push(entry)
    this.done.push(entry)
    if (this.done.length > this.limit) this.done.shift()
    this.undone = []
  }

  /**
   * Every change recorded while `run` works is one step (« Tout accepter »,
   * moving several elements at once), undone last to first.
   */
  async group<T>(label: string, run: () => Promise<T>): Promise<T> {
    if (this.batch) return run()
    const entries: UndoEntry[] = []
    this.batch = entries
    try {
      return await run()
    } finally {
      this.batch = null
      if (entries.length === 1) this.record(entries[0])
      else if (entries.length > 1) {
        this.record({
          label,
          undo: async () => {
            for (const entry of [...entries].reverse()) await entry.undo()
          },
          redo: async () => {
            for (const entry of entries) await entry.redo()
          },
        })
      }
    }
  }

  /** Undo the last change; null when there is none (or one is still running). A failed step is dropped. */
  undo(): Promise<UndoEntry | null> {
    return this.step(this.done, this.undone, 'undo')
  }

  redo(): Promise<UndoEntry | null> {
    return this.step(this.undone, this.done, 'redo')
  }

  clear() {
    this.done = []
    this.undone = []
  }

  private async step(from: UndoEntry[], to: UndoEntry[], direction: 'undo' | 'redo') {
    if (this.running_) return null
    const entry = from.pop()
    if (!entry) return null
    this.running_ = true
    try {
      await entry[direction]()
      to.push(entry)
      return entry
    } finally {
      this.running_ = false
    }
  }
}
