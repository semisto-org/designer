import clsx from 'clsx'
import { ArrowRight, ChevronDown, Circle, Droplets, Fence, Footprints, Layers, Sprout, TreeDeciduous, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { HandNote } from '@/components/ui/HandNote'
import { IconButton } from '@/components/ui/IconButton'
import { Segmented } from '@/components/ui/Segmented'
import { t } from '@/lib/i18n'
import { drawingStore, useDrawingState } from '@/map/drawing/store'
import { useEditor } from '@/map/editor/EditorContext'
import { ZoneCard } from '@/map/layout/ZoneLayer'
import { SHEETS, sheetLook, sheetRank, sheetAt, suggestedSheet, type Sheet, type SheetCounts } from './sheets'
import { setSheet, useSheet } from './store'

type Action = { key: string; icon: LucideIcon; run: (editor: ReturnType<typeof useEditor>) => void }

function openPicker(layer: string) {
  drawingStore.set({ pickerLayer: layer, tool: 'draw' })
}

/** What each sheet offers first: its own tools, in the order of the method. */
const ACTIONS: Record<Sheet, Action[]> = {
  bubbles: [
    { key: 'draw_bubble', icon: Circle, run: () => drawingStore.set({ tool: 'bubble' }) },
  ],
  frame: [
    { key: 'water', icon: Droplets, run: () => openPicker('water') },
    { key: 'access', icon: Footprints, run: () => openPicker('access') },
    { key: 'structures', icon: Fence, run: () => openPicker('structures') },
  ],
  planting: [
    { key: 'palette', icon: Sprout, run: (editor) => editor.openPanel('palette') },
    { key: 'plants', icon: TreeDeciduous, run: () => openPicker('plants') },
  ],
}

const NOTE_KEY = 'designer:tracing-note-open'

/** Open by default on a computer, folded on a phone where the map is small. */
function readNoteOpen(): boolean {
  const wide = typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 768px)').matches
  try {
    const stored = window.localStorage.getItem(NOTE_KEY)
    return stored == null ? wide : stored === '1'
  } catch {
    return wide
  }
}

/**
 * « Feuilles du dessin », beside the drawing tools in « Projet »: the
 * three tracing sheets a design goes through, bubbles, frame, planting.
 * The one on the table is drawn whole, the ones under it show through the
 * paper, the ones above wait. Under the tabs, each sheet says in the margin
 * what to draw on it and why, offers its own tools, and sends the person
 * outside once; the note folds away, and steps aside while a tool is open.
 */
export default function TracingCard({ counts }: { counts: SheetCounts }) {
  const editor = useEditor()
  const sheet = useSheet()
  const tool = useDrawingState((s) => s.tool)
  const [noteOpen, setNoteOpen] = useState(readNoteOpen)
  const value = sheet ?? 'all'

  function choose(next: Sheet | 'all') {
    const chosen = next === 'all' ? null : next
    // What the new sheet hides leaves the selection, rather than lifting the sheet back up.
    const hidden = (id: number | null) => {
      const f = id == null ? null : editor.features.find((x) => x.properties.id === id)
      return f != null && sheetLook(f.properties, chosen) === 'hidden'
    }
    if (hidden(editor.selectedId) || editor.selection.some(hidden)) editor.select(null)
    setSheet(chosen)
  }

  function toggleNote() {
    const next = !noteOpen
    setNoteOpen(next)
    try {
      window.localStorage.setItem(NOTE_KEY, next ? '1' : '0')
    } catch {
      // Private mode: the choice lasts for this visit.
    }
  }

  const options = [
    { value: 'all' as const, label: t('tracing.all') },
    ...SHEETS.map((s) => ({ value: s, label: t(`tracing.sheets.${s}`) })),
  ]
  const next = sheet ? sheetAt(sheetRank(sheet) + 1) : null
  const start = suggestedSheet(counts)
  // Once a sheet holds something, the next one continues the drawing rather than starting it.
  const started = Object.values(counts).some((n) => n > 0)
  // The note steps aside while a tool is open or an element's sheet is shown, so it never covers what one works on.
  const showNote = noteOpen && tool == null && editor.selectedId == null

  return (
    <ZoneCard id="tracing" zone="toolbar" className="max-w-full">
      <section aria-label={t('tracing.title')} className="w-full max-w-[30rem] rounded-xl bg-white p-1 shadow-[0_6px_16px_rgb(26_26_26/0.14)]">
        <div className="flex items-center gap-1">
          <Layers className="ml-1.5 hidden h-4 w-4 shrink-0 text-loam-500 md:block" aria-hidden />
          <Segmented value={value} options={options} onChange={choose} label={t('tracing.title')} className="min-w-0 flex-1 overflow-x-auto" />
          <IconButton size="sm" label={t(noteOpen ? 'tracing.fold' : 'tracing.unfold')} aria-expanded={noteOpen} onClick={toggleNote}>
            <ChevronDown className={clsx('transition-transform', noteOpen && 'rotate-180')} aria-hidden />
          </IconButton>
        </div>
        {showNote && (sheet ? (
          <div className="px-2 pb-2 pt-1.5">
            <HandNote tone={sheet === 'planting' ? 'leaf' : 'prune'}>{t(`tracing.notes.${sheet}`)}</HandNote>
            <p className="mt-1 text-sm text-loam-600">{t(`tracing.why.${sheet}`, { count: counts[sheet] })}</p>
            {editor.canEdit && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ACTIONS[sheet].map(({ key, icon: Icon, run }, index) => (
                  <Button key={key} size="sm" variant={index === 0 ? 'primary' : 'secondary'} onClick={() => run(editor)}>
                    <Icon className="h-4 w-4" aria-hidden />
                    {t(`tracing.actions.${key}`)}
                  </Button>
                ))}
                {next && counts[sheet] > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => choose(next)}>
                    {t('tracing.next', { sheet: t(`tracing.sheets.${next}`) })}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Button>
                )}
              </div>
            )}
            <p className="mt-2 flex items-start gap-1.5 border-t border-dashed border-loam-200 pt-1.5 text-sm text-leaf-800">
              <Footprints className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {t(`tracing.outside.${sheet}`)}
            </p>
          </div>
        ) : (
          <p className="px-2 pb-1.5 pt-1 text-sm text-loam-600">
            {t('tracing.all_hint')}{' '}
            <Button variant="ghost" size="sm" className="-ml-2" onClick={() => choose(start)}>
              {started
                ? t('tracing.continue', { sheet: t(`tracing.sheets.${start}`) })
                : t('tracing.start', { sheet: t(`tracing.sheets.${start}`) })}
            </Button>
          </p>
        ))}
      </section>
    </ZoneCard>
  )
}
