import { formatDate } from '@/components/plants/format'
import { t } from '@/lib/i18n'
import { Muted, Section, SubTitle } from '@/dossier/parts'
import type { Dossier, DossierPhoto } from '@/types/dossier'

/** The ids to print: the reader's choice when there is one, else the defaults. */
export function chosenPhotoIds(dossier: Dossier, chosen: number[] | null): number[] {
  const known = new Set(dossier.photos.items.map((p) => p.id))
  return (chosen ?? dossier.photos.defaults).filter((id) => known.has(id))
}

function dateLine(photo: DossierPhoto) {
  return t(photo.dated ? 'dossier.photos.taken' : 'dossier.photos.added', { date: formatDate(photo.takenAt) })
}

function Photo({ photo, label }: { photo: DossierPhoto; label?: string }) {
  const ratio = photo.width && photo.height ? `${photo.width} / ${photo.height}` : '4 / 3'
  return (
    <figure className="dossier-keep">
      <div className="relative overflow-hidden rounded-lg bg-loam-100" style={{ aspectRatio: ratio, maxHeight: '90mm' }}>
        <img src={photo.largeUrl} alt={photo.caption ?? ''} loading="eager" className="h-full w-full object-cover" />
        {label && (
          <span className="absolute left-2 top-2 rounded bg-white/90 px-2 py-0.5 text-xs font-semibold text-loam-900">{label}</span>
        )}
      </div>
      <figcaption className="mt-1 text-xs text-loam-600">
        {photo.caption && <span className="text-loam-800">{photo.caption} · </span>}
        {dateLine(photo)}
      </figcaption>
    </figure>
  )
}

/** A few chosen photos; before/after pairs side by side. */
export function PhotosSection({ dossier, number, chosen }: { dossier: Dossier; number: number; chosen: number[] | null }) {
  const ids = chosenPhotoIds(dossier, chosen)
  const byId = new Map(dossier.photos.items.map((p) => [p.id, p]))
  const selected = new Set(ids)
  const pairs = dossier.photos.pairs.filter((p) => selected.has(p.beforeId) && selected.has(p.afterId))
  const paired = new Set(pairs.flatMap((p) => [p.beforeId, p.afterId]))
  const singles = ids.filter((id) => !paired.has(id)).map((id) => byId.get(id)!)

  return (
    <Section id="photos" number={number} title={t('dossier.sections.photos')}>
      {dossier.photos.total === 0 ? (
        <Muted>{t('dossier.photos.no_photos')}</Muted>
      ) : ids.length === 0 ? (
        <Muted>{t('dossier.photos.none')}</Muted>
      ) : (
        <>
          {pairs.map((pair) => (
            <div key={`${pair.beforeId}-${pair.afterId}`} className="dossier-keep space-y-2">
              <SubTitle>{t('dossier.photos.before_after')} · {t('dossier.photos.later', { count: pair.days })}</SubTitle>
              <div className="grid grid-cols-2 gap-3">
                <Photo photo={byId.get(pair.beforeId)!} label={t('dossier.photos.before')} />
                <Photo photo={byId.get(pair.afterId)!} label={t('dossier.photos.after')} />
              </div>
            </div>
          ))}
          {singles.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 print:grid-cols-2">
              {singles.map((photo) => <Photo key={photo.id} photo={photo} />)}
            </div>
          )}
        </>
      )}
    </Section>
  )
}
