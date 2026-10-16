import clsx from 'clsx'
import { Sprout } from 'lucide-react'
import { t } from '@/lib/i18n'
import { STRATA_COLORS } from '@/map/plants/strata'
import type { SpeciesPhoto, Strata } from '@/types/plants'

/** « Photo : Jean Dupont · CC BY-SA 4.0 », what the photo's licence asks to show. */
export function photoCredit(photo: SpeciesPhoto) {
  return photo.author
    ? t('plants.photo.credit', { author: photo.author, license: photo.license })
    : t('plants.photo.credit_no_author', { license: photo.license })
}

/** Top of a catalogue card: the photo, or a quiet wash of the strata colour. */
export function SpeciesCardPhoto({ photo, name, strata }: { photo?: SpeciesPhoto | null; name: string; strata: Strata }) {
  if (!photo) {
    return (
      <div
        className="flex aspect-[4/3] items-center justify-center rounded-t-xl text-loam-400"
        style={{ background: `color-mix(in srgb, ${STRATA_COLORS[strata]} 14%, var(--color-loam-50))` }}
        aria-hidden
      >
        <Sprout className="h-7 w-7 opacity-60" />
      </div>
    )
  }
  const credit = photoCredit(photo)
  return (
    <img
      src={photo.cardUrl}
      alt={t('plants.photo.alt', { name })}
      title={credit}
      loading="lazy"
      decoding="async"
      width={640}
      height={480}
      className="aspect-[4/3] w-full rounded-t-xl bg-loam-100 object-cover"
    />
  )
}

/**
 * The species sheet's photo, pinned in the notebook like a print taped to the
 * page, with its credit written in the margin and a link to the Commons file.
 */
export function SpeciesSheetPhoto({ photo, name, strata, className }: { photo?: SpeciesPhoto | null; name: string; strata: Strata; className?: string }) {
  return (
    <figure className={clsx('relative mx-auto w-full max-w-sm rotate-[-1.5deg] bg-white p-2.5 pb-3 shadow-md ring-1 ring-loam-200/70', className)}>
      <span aria-hidden className="absolute -top-2.5 left-1/2 h-5 w-20 -translate-x-1/2 rotate-[3deg] bg-humus-200/70 shadow-sm" />
      {photo ? (
        <a href={photo.url} target="_blank" rel="noopener" className="block">
          <img src={photo.url} alt={t('plants.photo.alt', { name })} decoding="async" className="aspect-[4/3] w-full bg-loam-100 object-cover" />
        </a>
      ) : (
        <div
          className="flex aspect-[4/3] flex-col items-center justify-center gap-2 text-sm text-loam-500"
          style={{ background: `color-mix(in srgb, ${STRATA_COLORS[strata]} 14%, var(--color-loam-50))` }}
        >
          <Sprout className="h-8 w-8 opacity-60" aria-hidden />
          {t('plants.photo.none')}
        </div>
      )}
      {photo && (
        <figcaption className="mt-2 text-sm leading-snug text-loam-600">
          {photo.licenseUrl ? (
            <a href={photo.licenseUrl} target="_blank" rel="noopener license" className="hover:text-loam-900">{photoCredit(photo)}</a>
          ) : photoCredit(photo)}
          {' · '}
          <a href={photo.pageUrl} target="_blank" rel="noopener" className="underline decoration-loam-300 underline-offset-2 hover:text-loam-900">
            {t('plants.photo.on_commons')}
          </a>
        </figcaption>
      )}
    </figure>
  )
}
