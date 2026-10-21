import { Link } from '@inertiajs/react'
import { ArrowRight } from 'lucide-react'
import { Gallery, type GalleryCard } from '@/components/site/Gallery'
import { Tour, type TourMap } from '@/components/site/tour/Tour'
import { ButtonLink } from '@/components/ui/Button'
import { tf } from '@/lib/content'
import { formatArea } from '@/lib/i18n'

/**
 * « Fonctionnalités »: the visit of a real notebook (the published map Semisto
 * chose), station after station along the journey, then the open notebooks.
 */
export default function Features({ tour, gallery }: { tour: TourMap | null; gallery: GalleryCard[] }) {
  const place = tour ? tour.map.locality || tour.map.regionName : null
  return (
    <>
      <header className="border-b border-loam-200/70 bg-loam-50">
        <div className="mx-auto max-w-6xl px-4 pb-10 pt-14 sm:pb-14 sm:pt-20">
          <p className="font-hand text-2xl text-leaf-600">{tf('site.features.hero.kicker')}</p>
          <h1 className="mt-1 max-w-3xl text-balance text-4xl font-medium leading-[1.05] text-prune-900 sm:text-6xl">{tf('site.features.hero.title')}</h1>
          <p className="mt-5 max-w-2xl text-pretty text-lg leading-relaxed text-loam-600">
            {tour ? tf('site.features.hero.lead', { place: tour.title }) : tf('site.features.hero.lead_plain')}
          </p>
          {tour && (
            <p className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-loam-500">
              {(tour.map.areaM2 || place) && <span>{[tour.map.areaM2 ? formatArea(tour.map.areaM2) : null, place].filter(Boolean).join(' · ')}</span>}
              <Link href={tour.path} className="inline-flex items-center gap-1.5 font-medium text-prune-600 hover:text-prune-800">
                {tf('site.features.hero.open')}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </p>
          )}
          {tour && (
            <p className="mt-8 flex items-center gap-2.5 font-hand text-2xl text-prune-600">
              <svg width="18" height="26" viewBox="0 0 18 26" aria-hidden="true" className="motion-safe:animate-bounce"><path d="M9 2v20M2 15l7 8 7-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              {tf('site.features.hero.scroll')}
            </p>
          )}
        </div>
      </header>

      <Tour map={tour} />

      {gallery.length > 0 && (
        <section className="relative z-10 border-t border-loam-200 bg-loam-50" aria-labelledby="gallery-title">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
            <p className="font-hand text-2xl text-leaf-600">{tf('site.features.gallery.kicker')}</p>
            <h2 id="gallery-title" className="mt-1 max-w-3xl text-balance text-3xl font-medium leading-tight text-prune-900 sm:text-[2.75rem]">{tf('site.features.gallery.title')}</h2>
            <p className="mt-4 max-w-2xl text-pretty text-lg leading-relaxed text-loam-500">{tf('site.features.gallery.intro')}</p>
            <div className="mt-12">
              <Gallery cards={gallery.slice(0, 6)} compact />
            </div>
            <Link href="/carnets-ouverts" className="mt-12 inline-flex items-center gap-1.5 font-medium text-prune-600 hover:text-prune-800">
              {tf('site.features.gallery.all')}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      )}

      <section className="relative z-10 border-t border-loam-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-16 text-center sm:py-24">
          <h2 className="text-balance font-serif text-3xl font-medium leading-tight text-prune-900 sm:text-4xl">{tf('site.features.cta.title')}</h2>
          <p className="mt-3 max-w-xl text-pretty text-lg text-loam-500">{tf('site.features.cta.body')}</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/session/new" size="lg">{tf('site.common.start_free')}</ButtonLink>
            <ButtonLink href="/tarifs" size="lg" variant="secondary">{tf('site.common.see_pricing')}</ButtonLink>
          </div>
        </div>
      </section>
    </>
  )
}
