import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { deferred } from '@/map/panels/deferred'
import { usePresentRender } from '@/map/presentation/render'
import { sheetCounts, sheetOf, sheetRank, TRACING_STATE, type Sheet } from './sheets'
import { initTracing, setSheet, useSheet } from './store'

const TracingCard = deferred(() => import('./TracingCard'), 'none')

/**
 * Always mounted in the editor. Hands the sheet on the table to the map's
 * paint (MapLibre global state, map/tracing/sheets) while designing in
 * « Projet », and shows the sheets' card there. Presenting, or looking at
 * « Existant », every sheet shows.
 */
export default function TracingOverlay() {
  const editor = useEditor()
  const map = editor.instance
  useLayoutEffect(() => initTracing(editor.map.id), [editor.map.id])
  const sheet = useSheet()
  const render = usePresentRender()
  const designing = editor.mode === 'project' && !render
  const rank = designing ? sheetRank(sheet) : 0

  useEffect(() => {
    const apply = () => {
      if (map.getGlobalState?.()[TRACING_STATE] !== rank) map.setGlobalStateProperty(TRACING_STATE, rank)
    }
    apply()
    // A new style (another base map) starts without the global state.
    map.on('styledata', apply)
    return () => {
      map.off('styledata', apply)
    }
  }, [map, rank])

  useSheetFollowsWork(designing ? sheet : null)

  const counts = useMemo(() => sheetCounts(editor.features), [editor.features])
  if (editor.mode !== 'project' || render) return null
  return <TracingCard counts={counts} />
}

/**
 * What one draws or selects is never hidden: a new pond drawn while the
 * bubbles are on the table, or a plant picked in a list, lays its own
 * sheet on the table and says so.
 */
function useSheetFollowsWork(sheet: Sheet | null) {
  const editor = useEditor()
  const known = useRef<Set<number> | null>(null)
  const latest = useRef(editor)
  latest.current = editor

  useEffect(() => {
    const ids = new Set(editor.features.map((f) => f.properties.id))
    const before = known.current
    known.current = ids
    if (!before || !sheet) return
    const fresh = editor.features.filter((f) => !before.has(f.properties.id))
    // One gesture adds one or a few elements; a batch (a variant shown, an AI's drafts, a sync) leaves the table as it is.
    if (fresh.length === 0 || fresh.length > 3) return
    raiseFor(fresh.map((f) => sheetOf(f.properties)), sheet, true)
  }, [editor.features, sheet])

  // On a new selection only: choosing a lower sheet clears what it hides (TracingCard).
  const sheetNow = useRef(sheet)
  sheetNow.current = sheet
  useEffect(() => {
    const on = sheetNow.current
    if (!on) return
    const picked = [latest.current.selectedId, ...latest.current.selection]
      .map((id) => latest.current.features.find((f) => f.properties.id === id))
      .filter((f) => f != null)
    raiseFor(picked.map((f) => sheetOf(f.properties)), on, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.selectedId, editor.selection])

  function raiseFor(sheets: (Sheet | null)[], on: Sheet, drawn: boolean) {
    const top = sheets.reduce<Sheet | null>((best, s) => (sheetRank(s) > sheetRank(best) ? s : best), null)
    if (!top || sheetRank(top) <= sheetRank(on)) return
    setSheet(top)
    latest.current.notify(t(drawn ? 'tracing.raised_drawn' : 'tracing.raised_selected', { sheet: t(`tracing.sheets.${top}`) }))
  }
}
