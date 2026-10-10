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
 */
export function FittedPhoto({ src, alt, overlay, onAspect }: {
  src: string
  alt: string
  overlay?: (aspect: number) => ReactNode
  onAspect?: (aspect: number) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [space, setSpace] = useState({ width: 0, height: 0 })
  const [aspect, setAspect] = useState<number | null>(null)

  useEffect(() => {
    const element = box.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setSpace({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => setAspect(null), [src])

  const ratio = aspect ?? 4 / 3
  const width = Math.min(space.width, space.height * ratio)
  const height = width / ratio

  return (
    <div ref={box} className="flex h-full w-full items-center justify-center">
      <div className="relative" style={{ width, height }}>
        <img
          src={src} alt={alt} draggable={false}
          className="h-full w-full select-none rounded-md object-contain shadow-2xl"
          onLoad={(event) => {
            const img = event.currentTarget
            if (img.naturalWidth && img.naturalHeight) {
              const next = img.naturalWidth / img.naturalHeight
              setAspect(next)
              onAspect?.(next)
            }
          }}
        />
        {aspect != null && overlay?.(aspect)}
      </div>
    </div>
  )
}
