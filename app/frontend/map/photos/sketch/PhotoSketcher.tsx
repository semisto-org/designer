import clsx from 'clsx'
import { Check, Download, Eraser, MousePointer2, Pencil, Redo2, Trash2, Type, Undo2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/Button'
import { api, ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import { INKS } from '@/map/drawing/SketchTool'
import { photoLabel, photoUrl } from '@/map/photos/format'
import { HAND_FONT, LINE_WIDTHS, TEXT_SIZES, markAt, markBounds, marksInRect, moveMark, simplify, type WidthKey } from '@/map/photos/sketch/marks'
import { downloadSketch } from '@/map/photos/sketch/download'
import { FittedPhoto, Mark, SketchLayer, SURFACE } from '@/map/photos/sketch/SketchLayer'
import type { MapPhotoData, PhotoSketchData, SketchMark } from '@/types/soil_photos'

type Tool = 'pen' | 'text' | 'select' | 'eraser'
type Status = 'idle' | 'saving' | 'saved' | 'error'

const SAVE_DELAY = 700
/** Below this distance (frame units) a press on the selection is a tap, not a move. */
const TAP_DISTANCE = 0.006

/** What a press in the select tool is doing until it is released. */
type Gesture =
  | { kind: 'move'; origin: [number, number]; before: SketchMark[]; moved: boolean; toggle: number | null }
  | { kind: 'marquee'; origin: [number, number]; to: [number, number] }

/**
 * Full-screen sketching over a photo: hand-drawn lines and handwritten notes,
 * saved as they are drawn. The photo itself is never changed; the sketch is
 * a layer of its own (PhotoSketch), and a photo can carry several.
 */
export function PhotoSketcher({ mapId, photo, sketch, notify, onSaved, onDeleted, onClose }: {
  mapId: number
  photo: MapPhotoData
  /** The sketch to continue, or null for a new one (created with its first mark). */
  sketch: PhotoSketchData | null
  notify: (message: string, tone?: 'info' | 'error') => void
  onSaved: (sketch: PhotoSketchData) => void
  onDeleted: (id: number) => void
  onClose: (sketch: PhotoSketchData | null) => void
}) {
  const [marks, setMarks] = useState<SketchMark[]>(sketch?.strokes ?? [])
  const [undone, setUndone] = useState<SketchMark[][]>([])
  const [history, setHistory] = useState<SketchMark[][]>([])
  const [name, setName] = useState(sketch?.name ?? '')
  const [tool, setTool] = useState<Tool>('pen')
  const [ink, setInk] = useState(INKS[0])
  const [widthKey, setWidthKey] = useState<WidthKey>('medium')
  const [live, setLive] = useState<[number, number][] | null>(null)
  const [draft, setDraft] = useState<{ x: number; y: number; value: string; px: number } | null>(null)
  const [status, setStatus] = useState<Status>(sketch ? 'saved' : 'idle')
  const [aspect, setAspect] = useState(4 / 3)
  const [selected, setSelected] = useState<number[]>([])
  const [marquee, setMarquee] = useState<[[number, number], [number, number]] | null>(null)
  const gesture = useRef<Gesture | null>(null)
  const drawingArea = useRef<HTMLDivElement>(null)

  const surface = useRef<SVGSVGElement>(null)
  const pointer = useRef<number | null>(null)
  const points = useRef<[number, number][]>([])
  const record = useRef<PhotoSketchData | null>(sketch)
  const dirty = useRef(false)
  const saving = useRef<Promise<void> | null>(null)
  const timer = useRef<number | null>(null)
  const latest = useRef({ marks, name })
  latest.current = { marks, name }

  const base = `/maps/${mapId}/photos/${photo.id}/sketches`

  const save = useCallback(async (): Promise<void> => {
    if (saving.current) {
      await saving.current
      if (!dirty.current) return
    }
    if (!dirty.current) return
    dirty.current = false
    const { marks: strokes, name: currentName } = latest.current
    const current = record.current
    if (!current && strokes.length === 0) return
    setStatus('saving')
    const run = (async () => {
      try {
        const body = { sketch: { strokes, ...(currentName.trim() ? { name: currentName.trim() } : {}), ...(current ? { lock_version: current.lockVersion } : {}) } }
        const saved = current
          ? await api<PhotoSketchData>(`${base}/${current.id}`, { method: 'PATCH', body })
          : await api<PhotoSketchData>(base, { method: 'POST', body })
        record.current = saved
        if (!currentName.trim()) setName(saved.name)
        onSaved(saved)
        setStatus(dirty.current ? 'saving' : 'saved')
      } catch (error) {
        if (error instanceof ApiError && error.status === 409 && error.data.sketch) {
          // Someone else saved meanwhile: show their version rather than overwrite it.
          const theirs = error.data.sketch as PhotoSketchData
          record.current = theirs
          setMarks(theirs.strokes)
          setName(theirs.name)
          setHistory([])
          setUndone([])
          setSelected([])
          onSaved(theirs)
          setStatus('saved')
          notify(error.message, 'error')
        } else {
          dirty.current = true
          setStatus('error')
          notify(error instanceof Error && error.message ? error.message : t('photo_sketches.save_failed'), 'error')
        }
      }
    })()
    saving.current = run
    await run
    saving.current = null
    if (dirty.current) await save()
  }, [base, notify, onSaved])

  const schedule = useCallback(() => {
    dirty.current = true
    setStatus('saving')
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = null
      void save()
    }, SAVE_DELAY)
  }, [save])

  function change(next: SketchMark[], previous: SketchMark[] = latest.current.marks) {
    setHistory((h) => [...h.slice(-99), previous])
    setUndone([])
    setMarks(next)
    latest.current = { ...latest.current, marks: next }
    schedule()
  }

  function undo() {
    if (history.length === 0) return
    const previous = history[history.length - 1]
    setUndone((u) => [...u, marks])
    setHistory((h) => h.slice(0, -1))
    setSelected([])
    setMarks(previous)
    latest.current = { ...latest.current, marks: previous }
    schedule()
  }

  function redo() {
    if (undone.length === 0) return
    const next = undone[undone.length - 1]
    setHistory((h) => [...h, marks])
    setUndone((u) => u.slice(0, -1))
    setSelected([])
    setMarks(next)
    latest.current = { ...latest.current, marks: next }
    schedule()
  }

  async function finish() {
    commitDraft()
    if (timer.current) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    await save()
    onClose(record.current)
  }

  async function destroy() {
    if (!window.confirm(t('photo_sketches.confirm_delete'))) return
    if (timer.current) window.clearTimeout(timer.current)
    dirty.current = false
    await saving.current
    const current = record.current
    if (current) {
      try {
        await api(`${base}/${current.id}`, { method: 'DELETE' })
        onDeleted(current.id)
      } catch (error) {
        notify((error as Error).message, 'error')
        return
      }
    }
    onClose(null)
  }

  async function download() {
    try {
      await downloadSketch(photoUrl(mapId, photo.id, 'large'), marks, name || photoLabel(photo))
    } catch {
      notify(t('photo_sketches.save_failed'), 'error')
    }
  }

  // --- Pointer -------------------------------------------------------

  function framePoint(event: { clientX: number; clientY: number }): [number, number] {
    const rect = surface.current!.getBoundingClientRect()
    return [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height]
  }

  function eraseAt(point: [number, number]) {
    const index = markAt(latest.current.marks, point[0], point[1], aspect)
    if (index >= 0) change(latest.current.marks.filter((_, i) => i !== index))
  }

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (pointer.current != null || event.button > 0) return
    const point = framePoint(event)
    if (tool === 'text') {
      // Keeps the browser from moving focus away from the note's field once it opens.
      event.preventDefault()
      commitDraft()
      setDraft({ x: point[0], y: point[1], value: '', px: surface.current!.getBoundingClientRect().width })
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    pointer.current = event.pointerId
    if (tool === 'eraser') return eraseAt(point)
    if (tool === 'select') return startSelectGesture(point)
    points.current = [point]
    setLive([point])
  }

  /**
   * Select tool: a press on a mark selects it (adding to the selection) and
   * dragging moves the whole selection; a tap on a mark already selected
   * takes it out; a drag on empty paper draws a box that selects what it meets.
   */
  function startSelectGesture(point: [number, number]) {
    const index = markAt(latest.current.marks, point[0], point[1], aspect)
    if (index < 0) {
      gesture.current = { kind: 'marquee', origin: point, to: point }
      setMarquee([point, point])
      return
    }
    const already = selected.includes(index)
    if (!already) setSelected((list) => [...list, index])
    gesture.current = { kind: 'move', origin: point, before: latest.current.marks, moved: false, toggle: already ? index : null }
  }

  function moveSelectGesture(point: [number, number]) {
    const current = gesture.current
    if (!current) return
    if (current.kind === 'marquee') {
      current.to = point
      return setMarquee([current.origin, point])
    }
    const dx = point[0] - current.origin[0]
    const dy = point[1] - current.origin[1]
    if (!current.moved && Math.hypot(dx, dy / aspect) < TAP_DISTANCE) return
    current.moved = true
    const moving = new Set(selected.length ? selected : [])
    if (current.toggle == null) {
      const index = markAt(current.before, current.origin[0], current.origin[1], aspect)
      if (index >= 0) moving.add(index)
    }
    const next = current.before.map((mark, i) => (moving.has(i) ? moveMark(mark, dx, dy) : mark))
    setMarks(next)
    latest.current = { ...latest.current, marks: next }
  }

  function endSelectGesture() {
    const current = gesture.current
    gesture.current = null
    if (!current) return
    if (current.kind === 'marquee') {
      const [a, b] = [current.origin, current.to]
      setMarquee(null)
      setSelected(Math.hypot(a[0] - b[0], a[1] - b[1]) < TAP_DISTANCE ? [] : marksInRect(latest.current.marks, a, b, aspect))
      return
    }
    if (current.moved) change(latest.current.marks, current.before)
    else if (current.toggle != null) setSelected((list) => list.filter((i) => i !== current.toggle))
  }

  /** Ink or width picked while marks are selected: they take it. */
  function restyleSelection(patch: { color?: string; width?: WidthKey }) {
    if (selected.length === 0) return
    const chosen = new Set(selected)
    change(latest.current.marks.map((mark, i) => {
      if (!chosen.has(i)) return mark
      const color = patch.color ?? mark.color
      if (mark.type === 'line') return { ...mark, color, width: patch.width ? LINE_WIDTHS[patch.width] : mark.width }
      return { ...mark, color, size: patch.width ? TEXT_SIZES[patch.width] : mark.size }
    }))
  }

  function deleteSelection() {
    if (selected.length === 0) return
    const chosen = new Set(selected)
    change(latest.current.marks.filter((_, i) => !chosen.has(i)))
    setSelected([])
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (pointer.current !== event.pointerId) return
    if (tool === 'eraser') return eraseAt(framePoint(event))
    if (tool === 'select') return moveSelectGesture(framePoint(event))
    const native = event.nativeEvent
    const samples = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : []
    for (const sample of samples.length ? samples : [native]) points.current.push(framePoint(sample))
    setLive([...points.current])
  }

  function onPointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (pointer.current !== event.pointerId) return
    pointer.current = null
    if (tool === 'select') return endSelectGesture()
    if (tool !== 'pen') return
    const line = simplify(points.current)
    points.current = []
    setLive(null)
    if (line.length > 0) change([...latest.current.marks, { type: 'line', color: ink, width: LINE_WIDTHS[widthKey], points: line }])
  }

  function commitDraft() {
    if (!draft) return
    const text = draft.value.trim()
    setDraft(null)
    if (!text) return
    const size = TEXT_SIZES[widthKey]
    // The input's top-left is where the person touched; the note's baseline sits one line lower.
    const baseline = Math.min(1.05, draft.y + size * aspect * 0.85)
    change([...latest.current.marks, { type: 'text', color: ink, size, x: draft.x, y: baseline, text: text.slice(0, 200) }])
  }

  // --- Keyboard ------------------------------------------------------

  const keys = useRef({ undo, redo, finish, deleteSelection, clearSelection: () => setSelected([]), hasSelection: false })
  keys.current = { undo, redo, finish, deleteSelection, clearSelection: () => setSelected([]), hasSelection: selected.length > 0 }
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) keys.current.redo()
        else keys.current.undo()
      } else if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        keys.current.redo()
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && keys.current.hasSelection) {
        event.preventDefault()
        keys.current.deleteSelection()
      } else if (event.key === 'Escape' && keys.current.hasSelection) {
        keys.current.clearSelection()
      } else if (event.key === 'Escape') {
        void keys.current.finish()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current)
  }, [])

  // iPad and iPhone: Safari does not always honour touch-action on an SVG and
  // takes a finger or Pencil stroke for a pan or a text selection after a few
  // millimetres, then cancels the pointer (the stroke stopped short). Refusing
  // its touch gestures over the photo keeps every move for the drawing; the
  // note's field still gets its taps.
  useEffect(() => {
    const area = drawingArea.current
    if (!area) return
    const block = (event: TouchEvent) => {
      if ((event.target as HTMLElement).closest('form')) return
      if (event.cancelable) event.preventDefault()
    }
    area.addEventListener('touchstart', block, { passive: false })
    area.addEventListener('touchmove', block, { passive: false })
    return () => {
      area.removeEventListener('touchstart', block)
      area.removeEventListener('touchmove', block)
    }
  }, [])

  const hint = t(`photo_sketches.hint_${tool}`)
  const statusLabel = status === 'saving' ? t('photo_sketches.saving') : status === 'saved' ? t('photo_sketches.saved') : status === 'error' ? t('photo_sketches.save_failed') : ''
  const draftSize = TEXT_SIZES[widthKey]

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={t('photo_sketches.title')} className="fixed inset-0 z-[70] flex flex-col bg-loam-950 text-white">
      <header className="flex items-center gap-2 px-3 py-2">
        <Pencil className="h-4 w-4 shrink-0 text-humus-300" aria-hidden />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => record.current && name.trim() && name.trim() !== record.current.name && schedule()}
          maxLength={80}
          placeholder={t('photo_sketches.title')}
          aria-label={t('photo_sketches.name')}
          className="min-w-0 flex-1 rounded-md border-0 bg-transparent px-2 py-1 font-serif text-lg text-white placeholder:text-loam-400 hover:bg-white/10 focus:bg-white/10 focus:outline-none"
        />
        <span className={clsx('hidden text-xs sm:inline', status === 'error' ? 'text-clay-100' : 'text-loam-300')} aria-live="polite">{statusLabel}</span>
        <button type="button" onClick={download} disabled={marks.length === 0} className="rounded-full p-2 hover:bg-white/10 disabled:opacity-40" title={t('photo_sketches.download')} aria-label={t('photo_sketches.download')}>
          <Download className="h-5 w-5" />
        </button>
        <Button size="sm" variant="leaf" onClick={finish}>
          <Check className="h-4 w-4" />
          {t('photo_sketches.done')}
        </Button>
      </header>

      <div ref={drawingArea} className="relative min-h-0 flex-1 touch-none select-none px-2 pb-2 md:px-6" style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}>
        <FittedPhoto
          src={photoUrl(mapId, photo.id, 'large')}
          alt={photoLabel(photo)}
          onAspect={setAspect}
          overlay={(ratio) => (
            <>
              <SketchLayer
                ref={surface}
                marks={marks}
                aspect={ratio}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                style={{ touchAction: 'none', cursor: tool === 'text' ? 'text' : tool === 'select' ? 'default' : 'crosshair' }}
                data-testid="sketch-surface"
              >
                {live && <Mark mark={{ type: 'line', color: ink, width: LINE_WIDTHS[widthKey], points: live }} w={SURFACE} h={SURFACE / ratio} />}
                {selected.map((index) => marks[index] && <SelectionBox key={index} bounds={markBounds(marks[index], ratio)} h={SURFACE / ratio} />)}
                {marquee && <SelectionBox bounds={[Math.min(marquee[0][0], marquee[1][0]), Math.min(marquee[0][1], marquee[1][1]), Math.max(marquee[0][0], marquee[1][0]), Math.max(marquee[0][1], marquee[1][1])]} h={SURFACE / ratio} />}
              </SketchLayer>
              {draft && (
                <form
                  className="absolute flex items-center gap-1"
                  style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%` }}
                  onSubmit={(e) => {
                    e.preventDefault()
                    commitDraft()
                  }}
                >
                  <input
                    ref={(input) => input?.focus({ preventScroll: true })}
                    value={draft.value}
                    maxLength={200}
                    placeholder={t('photo_sketches.text_placeholder')}
                    onChange={(e) => setDraft({ ...draft, value: e.target.value })}
                    onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setDraft(null))}
                    className="rounded bg-black/30 px-1 outline-none ring-1 ring-white/60 placeholder:text-white/60"
                    style={{ color: ink, fontFamily: HAND_FONT, fontWeight: 600, fontSize: Math.max(16, draftSize * draft.px), width: `${Math.max(14, draft.value.length + 2)}ch` }}
                  />
                  <button type="submit" className="rounded-full bg-white p-1 text-loam-900" aria-label={t('photo_sketches.text_add')}>
                    <Check className="h-4 w-4" />
                  </button>
                </form>
              )}
            </>
          )}
        />
      </div>

      <footer className="bg-white px-3 py-2 text-loam-800">
        <p className="mb-1.5 text-center text-xs text-loam-500">{hint}</p>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 pb-1 lg:flex-nowrap lg:justify-start" role="toolbar" aria-label={t('photo_sketches.tools.label')}>
          <div className="flex shrink-0 gap-1" role="radiogroup" aria-label={t('photo_sketches.tools.label')}>
            {([['pen', Pencil], ['text', Type], ['select', MousePointer2], ['eraser', Eraser]] as const).map(([key, Icon]) => (
              <button
                key={key} type="button" role="radio" aria-checked={tool === key}
                onClick={() => {
                  commitDraft()
                  setTool(key)
                  if (key !== 'select') setSelected([])
                }}
                className={clsx('flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold', tool === key ? 'bg-prune-600 text-white' : 'text-prune-700 hover:bg-prune-50')}
              >
                <Icon className="h-4 w-4" />
                {t(`photo_sketches.tools.${key}`)}
              </button>
            ))}
          </div>
          <span className="hidden h-6 w-px shrink-0 bg-loam-200 lg:block" />
          <div className="flex shrink-0 gap-1.5" role="radiogroup" aria-label={t('photo_sketches.tools.ink')}>
            {INKS.map((color) => (
              <button
                key={color} type="button" role="radio" aria-checked={ink === color} aria-label={color}
                onClick={() => {
                  setInk(color)
                  restyleSelection({ color })
                }}
                className={clsx('grid h-7 w-7 place-items-center rounded-full ring-1 ring-loam-300', ink === color && 'ring-2 ring-prune-600 ring-offset-1')}
                style={{ background: color }}
              >
                {ink === color && <Check className={clsx('h-3.5 w-3.5', color === '#ffffff' || color === '#ffd43b' ? 'text-loam-900' : 'text-white')} />}
              </button>
            ))}
          </div>
          <span className="hidden h-6 w-px shrink-0 bg-loam-200 lg:block" />
          <div className="flex shrink-0 gap-1" role="radiogroup" aria-label={t('photo_sketches.tools.width')}>
            {(Object.keys(LINE_WIDTHS) as WidthKey[]).map((key) => (
              <button
                key={key} type="button" role="radio" aria-checked={widthKey === key} title={t(`photo_sketches.tools.widths.${key}`)} aria-label={t(`photo_sketches.tools.widths.${key}`)}
                onClick={() => {
                  setWidthKey(key)
                  restyleSelection({ width: key })
                }}
                className={clsx('grid h-8 w-8 place-items-center rounded-full', widthKey === key ? 'bg-prune-100 ring-1 ring-prune-600' : 'hover:bg-loam-100')}
              >
                <span className="block rounded-full bg-loam-800" style={{ width: { fine: 4, medium: 7, bold: 12 }[key], height: { fine: 4, medium: 7, bold: 12 }[key] }} />
              </button>
            ))}
          </div>
          <span className="hidden h-6 w-px shrink-0 bg-loam-200 lg:block" />
          <div className="flex shrink-0 gap-1">
            <button type="button" onClick={undo} disabled={history.length === 0} className="rounded-full p-2 hover:bg-loam-100 disabled:opacity-40" title={t('photo_sketches.tools.undo')} aria-label={t('photo_sketches.tools.undo')}>
              <Undo2 className="h-4 w-4" />
            </button>
            <button type="button" onClick={redo} disabled={undone.length === 0} className="rounded-full p-2 hover:bg-loam-100 disabled:opacity-40" title={t('photo_sketches.tools.redo')} aria-label={t('photo_sketches.tools.redo')}>
              <Redo2 className="h-4 w-4" />
            </button>
            <button
              type="button" disabled={marks.length === 0}
              onClick={() => window.confirm(t('photo_sketches.confirm_clear')) && change([])}
              className="rounded-full p-2 hover:bg-loam-100 disabled:opacity-40" title={t('photo_sketches.tools.clear')} aria-label={t('photo_sketches.tools.clear')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <span className="hidden lg:ml-auto lg:block" />
          {selected.length > 0 ? (
            <button type="button" onClick={deleteSelection} className="flex shrink-0 items-center gap-1.5 rounded-full bg-clay-50 px-3 py-1.5 text-sm font-semibold text-clay-600 hover:bg-clay-100">
              <Trash2 className="h-4 w-4" />
              {t('photo_sketches.selection.delete', { count: selected.length })}
            </button>
          ) : (
            <button type="button" onClick={destroy} className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-clay-500 hover:bg-clay-50">
              <Trash2 className="h-4 w-4" />
              {t('photo_sketches.delete')}
            </button>
          )}
        </div>
      </footer>
    </div>,
    document.body,
  )
}

/** Dashed frame around a selected mark (or the box being drawn), in surface units. */
function SelectionBox({ bounds: [left, top, right, bottom], h }: { bounds: [number, number, number, number]; h: number }) {
  const pad = 6
  return (
    <rect
      x={left * SURFACE - pad} y={top * h - pad} width={(right - left) * SURFACE + pad * 2} height={(bottom - top) * h + pad * 2}
      rx={6} fill="rgba(91, 87, 129, 0.12)" stroke="#ffffff" strokeWidth={2} strokeDasharray="8 6"
      style={{ filter: 'drop-shadow(0 0 2px rgba(0, 0, 0, 0.7))' }} pointerEvents="none"
    />
  )
}
