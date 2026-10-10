import clsx from 'clsx'
import { ImageOff, Loader2 } from 'lucide-react'
import { forwardRef, useEffect, useRef, useState, type ReactNode, type SVGProps } from 'react'
import type { SketchMark } from '@/types/soil_photos'
import { HAND_FONT, haloFor, linePath } from '@/map/photos/sketch/marks'

/** Units of the SVG surface along the photo's width (the height follows its aspect). */
export const SURFACE = 1000

/** The marks of a sketch as SVG, over a photo of the given aspect (width / height). */
export const SketchLayer = forwardRef<SVGSVGElement, { marks: SketchMark[]; aspect: number; children?: ReactNode } & SVGProps<SVGSVGElement>>(
  function SketchLayer({ marks, aspect, children, ...rest }, ref) {
    const w = SURFACE
    const h = SURFACE / aspect
    return (
      <svg ref={ref} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" {...rest}>
        {marks.map((mark, index) => <Mark key={index} mark={mark} w={w} h={h} />)}
        {children}
      </svg>
    )
  },
)

export function Mark({ mark, w, h, opacity }: { mark: SketchMark; w: number; h: number; opacity?: number }) {
  const halo = haloFor(mark.color)
  if (mark.type === 'line') {
    const d = linePath(mark.points, w, h)
    const width = mark.width * w
    return (
      <g opacity={opacity} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d={d} stroke={halo} strokeWidth={width + Math.max(1.5, width * 0.6)} />
        <path d={d} stroke={mark.color} strokeWidth={width} />
      </g>
    )
  }
  const size = mark.size * w
  return (
    <text
      x={mark.x * w} y={mark.y * h} opacity={opacity}
      fill={mark.color} stroke={halo} strokeWidth={Math.max(1, size * 0.08)} paintOrder="stroke" strokeLinejoin="round"
      style={{ fontFamily: HAND_FONT, fontWeight: 600, fontSize: size, whiteSpace: 'pre' }}
    >
      {mark.text}
    </text>
  )
}

/**
 * A photo fitted in the space it is given (like object-contain), with an
 * overlay of exactly the image's size on top. The aspect comes from the
 * loaded image, which the server has already rotated upright.
 *
 * A large photo takes a moment to arrive: with a `placeholder` (the small
 * variant, usually already in the browser's cache) and an `initialAspect`,
 * the frame is right at once and shows the blurred thumbnail with a
 * « loading » note until the full image is there.
 */
export function FittedPhoto({ src, alt, overlay, onAspect, placeholder, initialAspect, loadingLabel, errorLabel }: {
  src: string
  alt: string
  overlay?: (aspect: number) => ReactNode
  onAspect?: (aspect: number) => void
  placeholder?: string
  initialAspect?: number | null
  loadingLabel?: string
  errorLabel?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const [space, setSpace] = useState({ width: 0, height: 0 })
  const [aspect, setAspect] = useState<number | null>(null)
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>('loading')
  // The note only shows when the wait is noticeable, not for a cached image.
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const element = box.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setSpace({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setAspect(null)
    setStatus('loading')
    setSlow(false)
    const timer = window.setTimeout(() => setSlow(true), 250)
    return () => window.clearTimeout(timer)
  }, [src])

  const ratio = aspect ?? initialAspect ?? 4 / 3
  const width = Math.min(space.width, space.height * ratio)
  const height = width / ratio

  return (
    <div ref={box} className="flex h-full w-full items-center justify-center">
      <div className="relative" style={{ width, height }} aria-busy={status === 'loading'}>
        {placeholder && status !== 'loaded' && (
          <img
            key={placeholder} src={placeholder} alt="" aria-hidden draggable={false}
            className="absolute inset-0 h-full w-full select-none rounded-md object-cover blur-md brightness-75"
          />
        )}
        <img
          src={src} alt={alt} draggable={false}
          className={clsx(
            'h-full w-full select-none rounded-md object-contain shadow-2xl transition-opacity duration-500',
            placeholder && status !== 'loaded' && 'opacity-0',
          )}
          onError={() => setStatus('failed')}
          onLoad={(event) => {
            const img = event.currentTarget
            setStatus('loaded')
            if (img.naturalWidth && img.naturalHeight) {
              const next = img.naturalWidth / img.naturalHeight
              setAspect(next)
              onAspect?.(next)
            }
          }}
        />
        {(status === 'loading' && slow && loadingLabel) || (status === 'failed' && errorLabel) ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" role="status">
            <span className="inline-flex items-center gap-2 rounded-full bg-black/60 px-3.5 py-2 text-sm text-white">
              {status === 'failed' ? <ImageOff className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
              {status === 'failed' ? errorLabel : loadingLabel}
            </span>
          </div>
        ) : null}
        {aspect != null && overlay?.(aspect)}
      </div>
    </div>
  )
}
