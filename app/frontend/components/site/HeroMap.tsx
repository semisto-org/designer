import { Sparkles } from 'lucide-react'
import { useMemo } from 'react'
import { CONTOURS } from '@/components/site/heroContours'
import { tf } from '@/lib/content'

// An illustration, not real data: a small hill with its contour lines, a
// parcel, a forest garden, a pond, a path, and a draft proposed by Claude.
// Colours are the Semisto tokens (application.css), written as hex because an
// SVG cannot read Tailwind classes for gradients and patterns.
const C = {
  ground: '#f3f5f0',
  field: '#e3e8dc',
  fieldAlt: '#f9edcc',
  contour: '#a9b89a',
  contourIndex: '#899e79',
  boundary: '#5b5781',
  path: '#c3b8aa',
  water: '#a9cbd8',
  waterEdge: '#7fb0c4',
  roof: '#9189b8',
  wall: '#ede9e3',
  leaf: ['#5a9a5e', '#3d7d42', '#87b88a', '#2f6334'],
  fruit: '#d9a527',
  blossom: '#b4acce',
} as const

const PARCEL = 'M142 158 L246 112 L398 92 L488 150 L520 238 L498 352 L408 410 L290 428 L176 388 L128 296 Z'
const POND = 'M430 322 C 452 306 492 312 500 336 C 508 360 478 382 450 378 C 424 374 412 342 430 322 Z'
const PATH = 'M214 214 C 250 238 262 262 292 282 C 322 302 352 306 392 336 C 410 350 424 352 440 352'
const SWALE = 'M168 330 C 230 318 300 346 372 300 C 410 276 436 256 468 262'
const HEDGE = 'M246 112 L398 92 L488 150 L520 238'
const DRAFT = 'M268 168 L372 142 L430 186 L420 250 L330 262 L276 226 Z'

// Seeded so the trees are the same at every render (and in the server HTML).
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

type Tree = { x: number; y: number; r: number; color: string; fruit?: boolean }

function useTrees(): { forest: Tree[]; orchard: Tree[]; proposed: { x: number; y: number }[] } {
  return useMemo(() => {
    const random = rng(7)
    const forest: Tree[] = []
    // Forest garden: a loose cluster on the lower slope, away from the path and the pond.
    const centre = { x: 262, y: 346 }
    for (let tries = 0; tries < 600 && forest.length < 26; tries++) {
      const a = random() * Math.PI * 2
      const d = Math.sqrt(random())
      const x = centre.x + Math.cos(a) * d * 108
      const y = centre.y + Math.sin(a) * d * 56
      const r = 7 + random() * 8
      const nearOther = forest.some((t) => Math.hypot(t.x - x, t.y - y) < (t.r + r) * 0.9)
      const nearPond = Math.hypot(x - 452, y - 346) < 62
      const nearPath = Math.hypot(x - 300, y - 292) < 22 || Math.hypot(x - 350, y - 310) < 20
      const inside = x > 150 && y < 410 && y > 290
      if (!nearOther && !nearPond && !nearPath && inside) {
        forest.push({ x, y, r, color: C.leaf[Math.floor(random() * C.leaf.length)] })
      }
    }
    // Orchard on the upper right: fruit trees on a slightly rotated grid.
    const orchard: Tree[] = []
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) {
        const x = 410 + col * 22 - row * 12
        const y = 170 + row * 24 + col * 10
        if (x > 432 || y > 262) continue
        orchard.push({ x, y, r: 8, color: C.leaf[(row + col) % 2], fruit: (row + col) % 3 === 0 })
      }
    }
    // Trees proposed by Claude (dashed outlines, inside the draft area).
    const proposed = [
      [296, 192], [326, 184], [356, 176], [310, 222], [340, 214], [370, 206], [320, 246], [350, 240], [386, 232],
    ].map(([x, y]) => ({ x, y }))
    return { forest, orchard, proposed }
  }, [])
}

export function HeroMap({ className }: { className?: string }) {
  const { forest, orchard, proposed } = useTrees()
  return (
    <div className={className}>
      <div className="relative aspect-[640/520] w-full overflow-hidden rounded-2xl bg-lichen-50 shadow-xl ring-1 ring-loam-200">
        <svg viewBox="0 0 640 520" className="absolute inset-0 h-full w-full" role="img" aria-label={tf('site.home.hero.map_alt')}>
          <defs>
            <pattern id="hero-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
              <line x1="0" y1="0" x2="0" y2="8" stroke={C.boundary} strokeWidth="1.4" opacity="0.28" />
            </pattern>
            <clipPath id="hero-parcel"><path d={PARCEL} /></clipPath>
          </defs>
          <rect width="640" height="520" fill={C.ground} />
          {/* neighbouring fields */}
          <path d="M-10 40 L120 28 L150 160 L126 300 L-10 330 Z" fill={C.field} />
          <path d="M520 -10 L650 -10 L650 190 L534 240 L492 150 Z" fill={C.fieldAlt} opacity="0.55" />
          <path d="M-10 330 L126 300 L176 392 L290 430 L300 530 L-10 530 Z" fill={C.field} opacity="0.7" />
          <path d="M520 238 L650 196 L650 330 L500 352 Z" fill={C.field} opacity="0.6" />
          {/* road */}
          <path d="M-10 470 C 120 440 250 470 380 500 C 470 520 560 500 650 470" fill="none" stroke="#fff" strokeWidth="14" strokeLinecap="round" />
          <path d="M-10 470 C 120 440 250 470 380 500 C 470 520 560 500 650 470" fill="none" stroke={C.path} strokeWidth="1" opacity="0.8" />
          {/* contour lines */}
          <g fill="none" strokeLinejoin="round" strokeLinecap="round">
            {CONTOURS.map((line, i) => (
              <path
                key={i}
                d={line.d}
                stroke={line.index ? C.contourIndex : C.contour}
                strokeWidth={line.index ? 1.5 : 0.9}
                opacity={line.index ? 0.85 : 0.7}
              />
            ))}
          </g>
          {/* parcel */}
          <path d={PARCEL} fill="#87b88a" fillOpacity="0.16" />
          <g clipPath="url(#hero-parcel)">
            <path d={SWALE} fill="none" stroke={C.waterEdge} strokeWidth="2.5" strokeDasharray="7 5" strokeLinecap="round" />
            <path d={PATH} fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" opacity="0.9" />
            <path d={PATH} fill="none" stroke={C.path} strokeWidth="5.5" strokeLinecap="round" />
          </g>
          <path d={POND} fill={C.water} stroke={C.waterEdge} strokeWidth="2" />
          <path d="M440 336 C 452 330 470 332 478 340" fill="none" stroke="#fff" strokeWidth="1.6" opacity="0.7" strokeLinecap="round" />
          <path d={HEDGE} fill="none" stroke={C.leaf[3]} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="0.1 9" />
          {/* trees: shadow first, then crowns */}
          <g>
            {[...forest, ...orchard].map((tree, i) => (
              <circle key={`s${i}`} cx={tree.x + 3} cy={tree.y + 4} r={tree.r} fill="#17301b" opacity="0.14" />
            ))}
            {[...forest, ...orchard].map((tree, i) => (
              <g key={`t${i}`}>
                <circle cx={tree.x} cy={tree.y} r={tree.r} fill={tree.color} />
                <circle cx={tree.x - tree.r * 0.28} cy={tree.y - tree.r * 0.3} r={tree.r * 0.5} fill="#fff" opacity="0.14" />
                {tree.fruit && <circle cx={tree.x + tree.r * 0.35} cy={tree.y + tree.r * 0.2} r={2.2} fill={C.fruit} />}
              </g>
            ))}
          </g>
          {/* house */}
          <g transform="translate(176 188) rotate(-12)">
            <rect x="0" y="0" width="46" height="30" rx="2" fill={C.wall} stroke={C.boundary} strokeWidth="1.4" />
            <path d="M-3 0 L23 -12 L49 0 Z" fill={C.roof} stroke={C.boundary} strokeWidth="1.4" strokeLinejoin="round" />
            <rect x="19" y="14" width="8" height="16" fill={C.blossom} />
          </g>
          {/* Claude's draft */}
          <path d={DRAFT} fill="url(#hero-hatch)" stroke={C.boundary} strokeWidth="1.6" strokeDasharray="6 4" />
          {proposed.map((tree, i) => (
            <circle key={i} cx={tree.x} cy={tree.y} r="8" fill="#fff" fillOpacity="0.55" stroke={C.boundary} strokeWidth="1.3" strokeDasharray="3 2.5" />
          ))}
          <path d={PARCEL} fill="none" stroke={C.boundary} strokeWidth="2.6" strokeDasharray="10 5" strokeLinejoin="round" />
          {PARCEL.match(/[ML] ?(\d+) (\d+)/g)?.map((point, i) => {
            const [x, y] = point.slice(1).trim().split(' ')
            return <circle key={i} cx={x} cy={y} r="3.4" fill="#fff" stroke={C.boundary} strokeWidth="1.6" />
          })}
          {/* north arrow and scale bar */}
          <g transform="translate(590 50)">
            <circle r="17" fill="#fff" opacity="0.85" />
            <path d="M0 -11 L5 7 L0 3 L-5 7 Z" fill={C.boundary} />
          </g>
          <g transform="translate(36 484)">
            <rect x="-6" y="-28" width="124" height="46" rx="6" fill="#fff" opacity="0.8" />
            <path d="M0 0 H104 M0 -4 V4 M52 -3 V3 M104 -4 V4" stroke="#332d25" strokeWidth="1.6" fill="none" />
          </g>
        </svg>
        <span className="pointer-events-none absolute left-[13.75%] top-[87%] -translate-x-1/2 text-[11px] font-medium leading-none text-loam-700">
          {tf('site.home.hero.scale')}
        </span>
        <span className="pointer-events-none absolute left-[92.2%] top-[1.6%] -translate-x-1/2 text-[11px] font-semibold leading-none text-prune-700">
          {tf('site.home.hero.north')}
        </span>
        {/* labels: HTML, so they stay readable on small screens */}
        <div className="absolute left-[4%] top-[5%] max-w-[46%] rounded-lg bg-white/95 px-2.5 py-1.5 shadow-sm ring-1 ring-loam-200 sm:px-3 sm:py-2">
          <div className="text-xs font-semibold text-prune-700 sm:text-[13px]">{tf('site.home.hero.chip_parcel')}</div>
          <div className="text-[11px] leading-tight text-loam-500 sm:text-xs">{tf('site.home.hero.chip_parcel_detail')}</div>
        </div>
        <div className="absolute bottom-[7%] right-[3%] flex max-w-[60%] items-start gap-2 rounded-lg bg-white/95 px-2.5 py-1.5 shadow-md ring-1 ring-prune-300 sm:px-3 sm:py-2">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-prune-600 sm:h-4 sm:w-4" aria-hidden="true" />
          <div>
            <div className="text-xs font-semibold text-loam-900 sm:text-[13px]">{tf('site.home.hero.chip_claude')}</div>
            <div className="text-[11px] leading-tight text-loam-500 sm:text-xs">{tf('site.home.hero.chip_claude_detail')}</div>
          </div>
        </div>
        <span className="absolute left-[79%] top-[56%] rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-[#3b7a93] ring-1 ring-[#a9cbd8] sm:text-xs">
          {tf('site.home.hero.chip_pond')}
        </span>
      </div>
    </div>
  )
}
