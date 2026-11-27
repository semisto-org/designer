/**
 * How many tabs of a row fit on one line, the others going under « Plus ▾ ».
 * Tabs keep their order; the current one always stays on the line, taking
 * the place of the last tab that would have fitted. Returns the indexes of
 * the tabs shown on the line (all of them when everything fits).
 */
export function tabsOnLine(widths: number[], available: number, moreWidth: number, current: number): number[] {
  const all = widths.map((_, i) => i)
  const total = widths.reduce((sum, w) => sum + w, 0)
  if (total <= available) return all
  const room = available - moreWidth
  const shown: number[] = []
  let used = 0
  for (const i of all) {
    if (used + widths[i] > room) break
    shown.push(i)
    used += widths[i]
  }
  if (current >= 0 && !shown.includes(current)) {
    while (shown.length > 0 && used + widths[current] > room) used -= widths[shown.pop()!]
    shown.push(current)
  }
  return shown
}
