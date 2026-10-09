import clsx from 'clsx'

// The page's spine: a stem that climbs from the day the Designer was sown
// (roots, at the bottom) to its newest entry (a bud, at the top). Each
// entry is a leaf on it: fresh ones in light new-growth green, and a leaf
// grows a little with every thumbs up.

/** A gently waving stem, repeated down the gutter as a background. */
export const STEM_STYLE = {
  backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="96" viewBox="0 0 16 96"><path d="M8 0 C 12.5 24, 3.5 48, 8 72 S 8 92, 8 96" fill="none" stroke="#7d8900" stroke-opacity=".55" stroke-width="2" stroke-linecap="round"/></svg>',
  )}")`,
  backgroundRepeat: 'repeat-y',
  backgroundPosition: 'center top',
} as const

/** A leaf on the stem: grows with the thumbs up, up to about twice its size. */
export function Leaf({ likes, fresh, side }: { likes: number; fresh: boolean; side: 'left' | 'right' }) {
  const scale = 1.15 + Math.min(likes, 24) * 0.05
  return (
    <svg
      viewBox="0 0 40 28" aria-hidden="true"
      className="h-7 w-10 origin-left transition-transform duration-700 ease-out motion-reduce:transition-none"
      style={{ transform: `scale(${side === 'left' ? -scale : scale}, ${scale})`, transformOrigin: '20px 14px' }}
    >
      <path
        d="M20 14 C 24 4, 34 2, 39 6 C 36 16, 28 20, 20 14 Z"
        className={clsx(fresh ? 'fill-leaf-300' : 'fill-leaf-500', 'stroke-leaf-700')} strokeWidth="1" strokeOpacity=".5"
      />
      <path d="M20 14 C 26 11, 31 8, 37 6" fill="none" className="stroke-leaf-800" strokeOpacity=".45" strokeWidth=".8" />
      <circle cx="20" cy="14" r="2.6" className={fresh ? 'fill-humus-400' : 'fill-leaf-600'} />
    </svg>
  )
}

/** The bud at the tip of the stem: where the next entry will grow. */
export function Bud({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 44" aria-hidden="true" className={clsx('h-11 w-8', className)}>
      <path d="M16 44 C 16 34, 15 28, 16 22" fill="none" stroke="#7d8900" strokeOpacity=".55" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 24 C 8 20, 8 9, 16 2 C 24 9, 24 20, 16 24 Z" className="fill-leaf-300 stroke-leaf-600" strokeWidth="1" />
      <path d="M16 24 C 13 17, 13 10, 16 4" fill="none" className="stroke-leaf-600" strokeOpacity=".6" strokeWidth=".8" />
      <path d="M16 30 C 10 30, 6 27, 4 23 C 9 22, 13 24, 16 28" className="fill-leaf-400" />
      <path d="M16 32 C 22 32, 26 29, 28 25 C 23 24, 19 26, 16 30" className="fill-leaf-500" />
    </svg>
  )
}

/** The roots under the oldest entry: the day the Designer was sown. */
export function Roots({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 48" aria-hidden="true" className={clsx('h-12 w-16', className)}>
      <path d="M2 10 C 20 8, 44 8, 62 10" fill="none" className="stroke-loam-300" strokeWidth="1.5" strokeDasharray="3 4" strokeLinecap="round" />
      <g fill="none" className="stroke-loam-400" strokeOpacity=".7" strokeLinecap="round">
        <path d="M32 0 C 32 14, 31 24, 32 46" strokeWidth="2" />
        <path d="M32 16 C 26 22, 18 26, 10 36" strokeWidth="1.4" />
        <path d="M32 18 C 38 24, 46 27, 54 38" strokeWidth="1.4" />
        <path d="M31 28 C 27 32, 24 38, 20 44" strokeWidth="1" />
        <path d="M33 30 C 37 34, 40 39, 44 45" strokeWidth="1" />
        <path d="M18 27 C 15 27, 12 29, 9 28" strokeWidth=".8" />
        <path d="M46 29 C 49 29, 52 31, 56 30" strokeWidth=".8" />
      </g>
    </svg>
  )
}
