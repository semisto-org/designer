import { Link } from '@inertiajs/react'
import type { MultiPolygon, Position } from 'geojson'
import { tf } from '@/lib/content'
import { formatArea, t } from '@/lib/i18n'
import { Tape } from './Standouts'

/** A card of « Carnets ouverts » (MapPublication#as_gallery_card). */
export type GalleryCard = {
  token: string
  title: string
  path: string
  previewPath: string | null
  regionName: string | null
  locality: string | null
  areaM2: number | null
  boundary: MultiPolygon | null
  origin: string | null
  today: string | null
  plants: number
}

/** Years since the garden's year 0 (its first planting), whole years. */
export function gardenAge(card: Pick<GalleryCard, 'origin' | 'today'>, now = new Date()): number | null {
  if (!card.origin) return null
  const years = (now.getTime() - new Date(card.origin).getTime()) / (365.25 * 86_400_000)
  return Math.max(0, Math.floor(years))
}

/**
 * The published notebooks Semisto shows, with their owners' consent: the
 * painted page of each (the link preview, year 15), how old the garden is
 * and where it grows. Each opens on its public page.
 */
export function Gallery({ cards, headingLevel = 2, compact = false }: { cards: GalleryCard[]; headingLevel?: 1 | 2; compact?: boolean }) {
  return (
    <ul className={compact ? 'grid gap-10 sm:grid-cols-2 lg:grid-cols-3' : 'grid gap-12 sm:grid-cols-2'}>
      {cards.map((card, index) => <Notebook key={card.token} card={card} index={index} headingLevel={headingLevel} />)}
    </ul>
  )
}

function Notebook({ card, index, headingLevel }: { card: GalleryCard; index: number; headingLevel: 1 | 2 }) {
  const tilt = [-1.2, 0.9, -0.6, 1.3, -1, 0.7][index % 6]
  const age = gardenAge(card)
  const place = card.locality || card.regionName
  const Heading = headingLevel === 1 ? 'h2' : 'h3'
  return (
    <li className="min-w-0">
      <Link href={card.path} className="group block" aria-label={tf('site.features.gallery.open', { title: card.title })}>
        <div className="relative bg-white p-2 pb-3 shadow-[0_1px_0_rgb(43_41_64/0.08),0_24px_40px_-24px_rgb(43_41_64/0.45)] ring-1 ring-loam-900/5 transition-transform duration-700 ease-out group-hover:rotate-0 motion-reduce:transition-none" style={{ transform: `rotate(${tilt}deg)` }}>
          <Tape className="-top-3 left-6 -rotate-6" />
          {card.previewPath ? (
            <img src={card.previewPath} alt="" loading="lazy" decoding="async" className="block aspect-[1200/630] w-full bg-loam-100 object-cover" />
          ) : (
            <Outline boundary={card.boundary} />
          )}
          <p className="mt-2 px-1 font-hand text-xl leading-tight text-leaf-700">
            {age === null || age === 0 ? tf('site.features.gallery.age.start') : t('site.features.gallery.age', { count: age })}
            {card.origin && age !== null && age > 0 && <span className="text-loam-500"> · {tf('site.features.gallery.started', { year: new Date(card.origin).getFullYear() })}</span>}
          </p>
        </div>
        <Heading className="mt-5 text-balance font-serif text-2xl font-medium leading-snug text-prune-900 group-hover:text-prune-700">{card.title}</Heading>
        <p className="mt-1 text-sm text-loam-500">
          {[card.areaM2 ? formatArea(card.areaM2) : null, place, card.plants ? t('site.features.gallery.plants', { count: card.plants }) : null].filter(Boolean).join(' · ')}
        </p>
      </Link>
    </li>
  )
}

/** The terrain's outline in pencil, when its painted page is not there yet. */
function Outline({ boundary }: { boundary: MultiPolygon | null }) {
  const rings: Position[][] = boundary?.coordinates.flatMap((polygon) => polygon) ?? []
  const all = rings.flat()
  if (all.length === 0) return <div className="aspect-[1200/630] w-full bg-loam-100" />
  const lat0 = all.reduce((s, p) => s + p[1], 0) / all.length
  const kx = Math.cos((lat0 * Math.PI) / 180)
  const xs = all.map((p) => p[0] * kx)
  const ys = all.map((p) => -p[1])
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const w = 1200
  const h = 630
  const scale = Math.min((w * 0.7) / Math.max(maxX - minX, 1e-9), (h * 0.7) / Math.max(maxY - minY, 1e-9))
  const ox = (w - (maxX - minX) * scale) / 2
  const oy = (h - (maxY - minY) * scale) / 2
  const d = rings.map((ring) => ring.map(([lng, lat], i) => `${i ? 'L' : 'M'}${(ox + (lng * kx - minX) * scale).toFixed(1)} ${(oy + (-lat - minY) * scale).toFixed(1)}`).join('') + 'Z').join('')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="block aspect-[1200/630] w-full bg-loam-100" aria-hidden="true">
      <path d={d} className="fill-leaf-600/10 stroke-prune-900" strokeWidth="5" strokeLinejoin="round" />
    </svg>
  )
}
