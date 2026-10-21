import { Gallery, type GalleryCard } from '@/components/site/Gallery'
import { ButtonLink } from '@/components/ui/Button'
import { tf } from '@/lib/content'

/** « Carnets ouverts »: every published notebook Semisto shows, with its owner's consent. */
export default function GalleryPage({ gallery }: { gallery: GalleryCard[] }) {
  return (
    <div className="bg-loam-50">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
        <p className="font-hand text-2xl text-leaf-600">{tf('site.features.gallery.kicker')}</p>
        <h1 className="mt-1 max-w-3xl text-balance text-4xl font-medium leading-[1.05] text-prune-900 sm:text-6xl">{tf('site.features.gallery.page_title')}</h1>
        <p className="mt-5 max-w-2xl text-pretty text-lg leading-relaxed text-loam-600">{tf('site.features.gallery.page_lead')}</p>
        <div className="mt-14">
          {gallery.length > 0 ? (
            <Gallery cards={gallery} headingLevel={1} />
          ) : (
            <div className="max-w-xl border-l-2 border-dashed border-leaf-300 pl-5">
              <p className="font-hand text-2xl leading-snug text-prune-600">{tf('site.features.gallery.empty')}</p>
              <ButtonLink href="/help/publier-sa-carte" variant="secondary" className="mt-5">{tf('site.features.gallery.offer')}</ButtonLink>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
