import clsx from 'clsx'
import { Check, Crop, Maximize, Pencil, Undo2, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { FEEDBACK_INKS, LIGHT_INK, svgPath, type Capture, type Rect, type Stroke } from '@/components/feedback/capture'
import { t } from '@/lib/i18n'

type Tool = 'pen' | 'crop'

/** Below this size (image pixels) a crop is a slip, not a choice. */
const MIN_CROP = 24

/**
 * Full-screen, over the feedback dialog: the person crops the screenshot to
 * what matters and circles it with a pencil. Its own native <dialog>, so it
 * sits above the feedback dialog in the browser's top layer.
 */
export function ScreenshotAnnotator({ capture, crop: initialCrop, strokes: initialStrokes, onDone, onCancel }: {
  capture: Capture
  crop: Rect
  strokes: Stroke[]
  onDone: (crop: Rect, strokes: Stroke[]) => void
  onCancel: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const area = useRef<HTMLDivElement>(null)
  const surface = useRef<SVGSVGElement>(null)
  const [tool, setTool] = useState<Tool>('pen')
  const [ink, setInk] = useState(FEEDBACK_INKS[0])
  const [crop, setCrop] = useState<Rect>(initialCrop)
  const [strokes, setStrokes] = useState<Stroke[]>(initialStrokes)
  const [live, setLive] = useState<Stroke | null>(null)
  const [dragCrop, setDragCrop] = useState<Rect | null>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const origin = useRef<[number, number] | null>(null)
  const pointer = useRef<number | null>(null)
  const { width: W, height: H } = capture
  const lineWidth = Math.max(3, Math.round(W * 0.005))

  useEffect(() => {
    const element = dialog.current
    if (element && !element.open) element.showModal()
    return () => element?.close()
  }, [])

  // The capture fits the free space, whatever its shape.
  useLayoutEffect(() => {
    const element = area.current
    if (!element) return
    const fit = () => {
      const scale = Math.min(element.clientWidth / W, element.clientHeight / H)
      setBox({ w: Math.floor(W * scale), h: Math.floor(H * scale) })
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(element)
    return () => observer.disconnect()
  }, [W, H])

  function at(event: ReactPointerEvent): [number, number] {
    const rect = surface.current!.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * W
    const y = ((event.clientY - rect.top) / rect.height) * H
    return [Math.round(Math.max(0, Math.min(W, x))), Math.round(Math.max(0, Math.min(H, y)))]
  }

  function rectFrom([x0, y0]: [number, number], [x1, y1]: [number, number]): Rect {
    return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) }
  }

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (pointer.current !== null) return
    pointer.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = at(event)
    origin.current = point
    if (tool === 'pen') setLive({ color: ink, width: lineWidth, points: [point] })
    else setDragCrop({ x: point[0], y: point[1], w: 0, h: 0 })
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (pointer.current !== event.pointerId || !origin.current) return
    const point = at(event)
    if (tool === 'pen') {
      setLive((current) => {
        if (!current) return current
        const last = current.points[current.points.length - 1]
        return Math.hypot(point[0] - last[0], point[1] - last[1]) < 2 ? current : { ...current, points: [...current.points, point] }
      })
    } else {
      setDragCrop(rectFrom(origin.current, point))
    }
  }

  function onPointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (pointer.current !== event.pointerId) return
    pointer.current = null
    origin.current = null
    if (tool === 'pen' && live) setStrokes((current) => [...current, live])
    if (tool === 'crop' && dragCrop && dragCrop.w >= MIN_CROP && dragCrop.h >= MIN_CROP) setCrop(dragCrop)
    setLive(null)
    setDragCrop(null)
  }

  const shown = dragCrop ?? crop
  const whole = shown.x <= 0 && shown.y <= 0 && shown.w >= W && shown.h >= H

  return (
    <dialog
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
      aria-label={t('feedback.capture.title')}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-loam-950 p-0 text-white open:flex open:flex-col backdrop:bg-loam-950"
    >
      <header className="flex items-center gap-3 px-4 py-2">
        <h2 className="min-w-0 flex-1 truncate font-serif text-lg text-white">{t('feedback.capture.title')}</h2>
        <IconButton label={t('feedback.capture.cancel')} tone="onDark" onClick={onCancel}><X /></IconButton>
      </header>

      <div ref={area} className="grid min-h-0 flex-1 touch-none select-none place-items-center px-3 pb-3" style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}>
        <div className="relative shadow-2xl" style={{ width: box.w, height: box.h }}>
          <img src={capture.url} alt="" draggable={false} className="absolute inset-0 h-full w-full" />
          <svg
            ref={surface}
            viewBox={`0 0 ${W} ${H}`}
            className="absolute inset-0 h-full w-full"
            style={{ touchAction: 'none', cursor: 'crosshair' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            data-testid="feedback-capture-surface"
          >
            {!whole && (
              <path
                d={`M0,0 H${W} V${H} H0 Z M${shown.x},${shown.y} v${shown.h} h${shown.w} v${-shown.h} Z`}
                fillRule="evenodd" fill="rgba(27, 23, 18, 0.6)" pointerEvents="none"
              />
            )}
            {!whole && (
              <rect
                x={shown.x} y={shown.y} width={shown.w} height={shown.h} fill="none"
                stroke="white" strokeWidth={Math.max(2, W / 500)} strokeDasharray={`${W / 120} ${W / 180}`} pointerEvents="none"
              />
            )}
            {[...strokes, ...(live ? [live] : [])].map((stroke, index) => (
              <g key={index} pointerEvents="none" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path d={svgPath(stroke.points)} stroke="rgba(255, 255, 255, 0.75)" strokeWidth={stroke.width * 1.8} />
                <path d={svgPath(stroke.points)} stroke={stroke.color} strokeWidth={stroke.width} />
              </g>
            ))}
          </svg>
        </div>
      </div>

      <footer className="bg-white px-3 py-2 text-loam-800">
        <p className="mb-1.5 text-center text-sm text-loam-500">{t(`feedback.capture.hint_${tool}`)}</p>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 pb-1" role="toolbar" aria-label={t('feedback.capture.tools')}>
          <div className="flex shrink-0 gap-1" role="radiogroup" aria-label={t('feedback.capture.tools')}>
            {([['pen', Pencil], ['crop', Crop]] as const).map(([key, Icon]) => (
              <Button
                key={key} size="sm" variant={tool === key ? 'primary' : 'ghost'} role="radio" aria-checked={tool === key}
                onClick={() => setTool(key)}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {t(`feedback.capture.${key}`)}
              </Button>
            ))}
          </div>
          {tool === 'pen' ? (
            <div className="flex shrink-0 gap-1" role="radiogroup" aria-label={t('feedback.capture.ink')}>
              {FEEDBACK_INKS.map((color, index) => (
                <IconButton
                  key={color} size="sm" role="radio" aria-checked={ink === color} label={t('feedback.capture.ink_n', { n: index + 1 })}
                  onClick={() => setInk(color)}
                  className={clsx('ring-1 ring-loam-300', ink === color && 'ring-2 ring-prune-600 ring-offset-1')}
                  style={{ background: color }}
                >
                  {ink === color ? <Check className={color === LIGHT_INK ? 'text-loam-900' : 'text-white'} /> : <span />}
                </IconButton>
              ))}
            </div>
          ) : (
            <Button size="sm" variant="ghost" disabled={whole} onClick={() => setCrop({ x: 0, y: 0, w: W, h: H })}>
              <Maximize className="h-4 w-4" aria-hidden />
              {t('feedback.capture.whole')}
            </Button>
          )}
          <IconButton label={t('feedback.capture.undo')} size="sm" disabled={strokes.length === 0} onClick={() => setStrokes((current) => current.slice(0, -1))}>
            <Undo2 />
          </IconButton>
          <Button size="sm" variant="leaf" onClick={() => onDone(crop, strokes)}>
            <Check className="h-4 w-4" aria-hidden />
            {t('feedback.capture.done')}
          </Button>
        </div>
      </footer>
    </dialog>
  )
}
