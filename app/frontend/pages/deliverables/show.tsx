import { Head, Link } from '@inertiajs/react'
import { Box, Camera, Download, ExternalLink, FileText, FlaskConical, Footprints, Lock, MapPin, Play } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/Button'
import { HandNote } from '@/components/ui/HandNote'
import { Pill } from '@/components/ui/Pill'
import { formatDate } from '@/collab/time'
import { DocumentIcon } from '@/documents/DocumentIcon'
import { PhotoViewer } from '@/deliverables/PhotoViewer'
import { PointsLayer, flyTo, type PointPick } from '@/deliverables/PointsLayer'
import { track } from '@/lib/analytics'
import { formatArea, t } from '@/lib/i18n'
import { useMapInstance } from '@/map/MapContext'
import SampleReading from '@/map/soil/SampleReading'
import { formatValue } from '@/map/soil/format'
import { PublicMapView } from '@/public_maps/PublicMapView'
import type { DeliverableDocument, DeliverablePhoto, DeliverableProps, DeliverableSoilSample } from '@/types/collab'
import type { DocumentKind } from '@/types/documents'
import type { Map as MapLibreMap } from 'maplibre-gl'

/**
 * The client deliverable (/livrable/:token): the project's whole file, read
 * like the last pages of a field notebook. The plan the team published (a
 * snapshot), then the documents, photos, videos and soil analyses it marked
 * for the client, read live. Photos and soil points sit on the plan too, so
 * that on site, with the phone's position, the client walks to them.
 */
export default function DeliverableShow(props: DeliverableProps) {
  const { map, contents } = props
  const [openPhoto, setOpenPhoto] = useState<number | null>(null)
  const [plan, setPlan] = useState<MapLibreMap | null>(null)
  const planRef = useRef<HTMLElement>(null)

  useEffect(() => { track('deliverable_view') }, [])

  const showOnPlan = useCallback((lng: number | null, lat: number | null) => {
    planRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    flyTo(plan, lng, lat)
  }, [plan])

  const onPick = useCallback((pick: PointPick) => {
    if (pick.kind === 'photo') setOpenPhoto(pick.id)
    else document.getElementById(`sol-${pick.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const sections = [
    { id: 'plan', label: t('deliverables.page.nav.plan'), shown: true },
    { id: 'documents', label: t('deliverables.page.nav.documents'), shown: contents.documents.length > 0 },
    { id: 'photos', label: t('deliverables.page.nav.photos'), shown: contents.photos.length > 0 },
    { id: 'sol', label: t('deliverables.page.nav.soil'), shown: contents.soilSamples.length > 0 },
  ].filter((s) => s.shown)
  const located = contents.photos.some((p) => p.lat != null) || contents.soilSamples.some((s) => s.lat != null)

  return (
    <div className="min-h-dvh bg-loam-50 text-loam-900">
      <Head title={props.title}>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <header className="sticky top-0 z-20 border-b border-loam-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-6xl items-center gap-3 px-4">
          <Logo className="h-7 w-7 shrink-0" />
          <span className="truncate text-base font-medium">{props.title}</span>
          <span className="ml-auto" />
          <span title={t('deliverables.page.private_hint')}>
            <Pill tone="prune" icon={<Lock aria-hidden />}>{t('deliverables.page.private')}</Pill>
          </span>
        </div>
        {sections.length > 1 && (
          <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 pb-2" aria-label={t('deliverables.page.kicker')}>
            {sections.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="shrink-0 rounded-full px-3 py-1 text-sm text-loam-700 hover:bg-prune-50 hover:text-prune-700">{s.label}</a>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-6xl space-y-12 px-4 py-8">
        <section className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-wide text-prune-700">{t('deliverables.page.kicker')}</p>
          <h1 className="font-serif text-4xl leading-tight text-loam-900 md:text-5xl">{props.title}</h1>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-loam-600">
            {map.locality && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" aria-hidden />{map.locality}</span>}
            {map.areaM2 != null && <span>{formatArea(map.areaM2)}</span>}
            <span>{t('deliverables.page.updated_on', { date: formatDate(props.publishedAt) })}</span>
            {props.madeBy && <span>{t('deliverables.page.made_by', { name: props.madeBy })}</span>}
          </p>
          {props.description && <p className="max-w-2xl whitespace-pre-line text-lg leading-relaxed text-loam-700">{props.description}</p>}
        </section>

        <section id="plan" ref={planRef} className="scroll-mt-28 space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="font-serif text-2xl">{t('deliverables.page.plan_title')}</h2>
            {props.reliefPath && (
              <Link href={props.reliefPath} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-prune-700 ring-[1.5px] ring-inset ring-prune-600 hover:bg-prune-600 hover:text-white">
                <Box className="h-4 w-4" aria-hidden />{t('deliverables.page.open_3d')}
              </Link>
            )}
          </div>
          <div className="overflow-hidden rounded-2xl shadow-sm ring-1 ring-loam-900/10">
            <PublicMapView {...props} description={null} className="relative h-[70dvh] min-h-96">
              <PointsLayer photos={contents.photos} samples={contents.soilSamples} onPick={onPick} />
              <MapHandle onMap={setPlan} />
            </PublicMapView>
          </div>
          {props.growth && <p className="text-sm text-loam-600">{t('deliverables.page.plan_hint')}</p>}
          {located && (
            <div className="flex flex-col gap-2 rounded-2xl bg-leaf-50 p-4 md:flex-row md:items-center md:gap-4">
              <Footprints className="h-6 w-6 shrink-0 text-leaf-700" aria-hidden />
              <div className="flex-1">
                <h3 className="font-medium text-leaf-900">{t('deliverables.page.outdoors_title')}</h3>
                <p className="text-sm text-leaf-800">{t('deliverables.page.outdoors')}</p>
              </div>
              <HandNote tone="leaf" className="hidden md:inline-flex">{t('deliverables.page.outdoors_note')}</HandNote>
            </div>
          )}
        </section>

        {contents.documents.length > 0 && <Documents documents={contents.documents} />}

        {contents.photos.length > 0 && (
          <section id="photos" className="scroll-mt-28 space-y-4">
            <h2 className="flex items-center gap-2 font-serif text-2xl"><Camera className="h-6 w-6 text-loam-400" aria-hidden />{t('deliverables.page.photos_title')}</h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {contents.photos.map((photo) => (
                <li key={photo.id}><PhotoTile photo={photo} onOpen={() => setOpenPhoto(photo.id)} /></li>
              ))}
            </ul>
          </section>
        )}

        {contents.soilSamples.length > 0 && (
          <section id="sol" className="scroll-mt-28 space-y-4">
            <h2 className="flex items-center gap-2 font-serif text-2xl"><FlaskConical className="h-6 w-6 text-loam-400" aria-hidden />{t('deliverables.page.soil_title')}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {contents.soilSamples.map((sample) => (
                <SoilCard key={sample.id} sample={sample} onShow={() => showOnPlan(sample.lng, sample.lat)} onPhoto={setOpenPhoto} />
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-loam-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-sm text-loam-500">
          <span>{t('deliverables.page.private_hint')}</span>
          <a href="/" className="font-medium text-prune-700 hover:underline">{t('deliverables.page.footer')}</a>
        </div>
      </footer>

      <PhotoViewer
        photos={allPhotos(contents.photos, contents.soilSamples)}
        openId={openPhoto}
        onOpen={setOpenPhoto}
        onLocate={(photo) => showOnPlan(photo.lng, photo.lat)}
      />
    </div>
  )
}

/** Hands the plan's MapLibre instance to the page, for « Voir sur le plan ». */
function MapHandle({ onMap }: { onMap: (map: MapLibreMap | null) => void }) {
  const map = useMapInstance()
  useEffect(() => { onMap(map) }, [map, onMap])
  return null
}

/** The marked photos first, then those of the soil points, each once. */
function allPhotos(photos: DeliverablePhoto[], samples: DeliverableSoilSample[]) {
  const seen = new Set(photos.map((p) => p.id))
  const extra = samples.flatMap((s) => s.photos).filter((p) => !seen.has(p.id) && (seen.add(p.id), true))
  return [...photos, ...extra]
}

function Documents({ documents }: { documents: DeliverableDocument[] }) {
  // Grouped by their first tag, the shelves of the team's library.
  const shelves = useMemo(() => {
    const groups = new Map<string, DeliverableDocument[]>()
    for (const doc of documents) {
      const key = doc.tags[0] ?? ''
      groups.set(key, [...(groups.get(key) ?? []), doc])
    }
    return [...groups.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'fr')))
  }, [documents])

  return (
    <section id="documents" className="scroll-mt-28 space-y-4">
      <h2 className="flex items-center gap-2 font-serif text-2xl"><FileText className="h-6 w-6 text-loam-400" aria-hidden />{t('deliverables.page.documents_title')}</h2>
      {shelves.map(([tag, docs]) => (
        <div key={tag || 'untagged'} className="space-y-2">
          {shelves.length > 1 && <h3 className="text-sm font-medium text-loam-600">{tag || t('deliverables.page.untagged')}</h3>}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {docs.map((doc) => <li key={doc.id}><DocumentCard doc={doc} /></li>)}
          </ul>
        </div>
      ))}
    </section>
  )
}

function DocumentCard({ doc }: { doc: DeliverableDocument }) {
  const [broken, setBroken] = useState(false)
  const href = doc.previewUrl ?? doc.downloadUrl
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-loam-900/10">
      <a href={href} target={doc.previewUrl ? '_blank' : undefined} rel="noopener" className="relative block aspect-[4/3] overflow-hidden border-b border-loam-900/5 bg-loam-100">
        {doc.thumbUrl && !broken ? (
          <img src={doc.thumbUrl} alt="" loading="lazy" onError={() => setBroken(true)}
            className={doc.preview === 'image' ? 'h-full w-full object-cover' : 'h-full w-full object-contain object-top p-3 drop-shadow'} />
        ) : (
          <span className="grid h-full place-items-center"><DocumentIcon kind={doc.kind as DocumentKind} filename={doc.filename} className="h-14 w-14" /></span>
        )}
      </a>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="line-clamp-2 break-words text-sm font-medium text-loam-900">{doc.title}</p>
        {doc.description && <p className="line-clamp-3 text-sm text-loam-600">{doc.description}</p>}
        <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1">
          {doc.previewUrl && (
            <a href={doc.previewUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-sm font-medium text-prune-700 hover:underline">
              <ExternalLink className="h-4 w-4" aria-hidden />{t('deliverables.page.open')}
            </a>
          )}
          <a href={doc.downloadUrl} className="inline-flex items-center gap-1 text-sm font-medium text-prune-700 hover:underline">
            <Download className="h-4 w-4" aria-hidden />{t('deliverables.page.download')}
          </a>
        </div>
      </div>
    </div>
  )
}

function PhotoTile({ photo, onOpen }: { photo: DeliverablePhoto; onOpen: () => void }) {
  return (
    <a
      href={photo.largeUrl}
      onClick={(e) => { e.preventDefault(); onOpen() }}
      className="group block overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-loam-900/10 focus-visible:outline-2 focus-visible:outline-prune-500"
    >
      <span className="relative block aspect-[4/3] overflow-hidden bg-loam-100">
        <img src={photo.thumbUrl} alt={photo.caption ?? ''} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
        {photo.kind === 'video' && (
          <span className="absolute inset-0 grid place-items-center">
            <span className="rounded-full bg-black/55 p-3 text-white"><Play className="h-5 w-5" aria-label={t('deliverables.page.video')} /></span>
          </span>
        )}
      </span>
      {(photo.caption || photo.takenAt) && (
        <span className="block p-2.5">
          {photo.caption && <span className="line-clamp-2 block text-sm text-loam-800">{photo.caption}</span>}
          {photo.takenAt && <span className="block text-sm text-loam-500">{formatDate(photo.takenAt)}</span>}
        </span>
      )}
    </a>
  )
}

function SoilCard({ sample, onShow, onPhoto }: { sample: DeliverableSoilSample; onShow: () => void; onPhoto: (id: number) => void }) {
  return (
    <article id={`sol-${sample.id}`} className="scroll-mt-28 space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-loam-900/10">
      <header className="space-y-1">
        <h3 className="font-serif text-xl text-loam-900">{sample.label}</h3>
        <p className="text-sm text-loam-600">
          {sample.depthFromCm != null && sample.depthToCm != null && t('deliverables.page.soil_depth', { from: sample.depthFromCm, to: sample.depthToCm })}
          {sample.sampledOn && ` ${t('deliverables.page.soil_sampled_on', { date: formatDate(sample.sampledOn) })}`}
          {sample.lab && <><br />{t('deliverables.page.soil_lab', { lab: sample.lab })}</>}
        </p>
      </header>
      {sample.photos.length > 0 && (
        <ul className="flex gap-2 overflow-x-auto">
          {sample.photos.map((photo) => (
            <li key={photo.id} className="shrink-0">
              <a href={photo.largeUrl} onClick={(e) => { e.preventDefault(); onPhoto(photo.id) }} className="block h-20 w-24 overflow-hidden rounded-lg bg-loam-100">
                <img src={photo.thumbUrl} alt={photo.caption ?? ''} loading="lazy" className="h-full w-full object-cover" />
              </a>
            </li>
          ))}
        </ul>
      )}
      {sample.interpretation ? (
        <SampleReading reading={sample.interpretation} />
      ) : Object.keys(sample.results).length > 0 ? (
        <ul className="space-y-1 text-sm">
          {Object.entries(sample.results).map(([key, value]) => (
            <li key={key}><span className="font-medium">{t(`soil.fields.${key}.name`)}</span> {formatValue(value)}</li>
          ))}
        </ul>
      ) : null}
      {sample.otherResults.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-loam-700">{t('deliverables.page.soil_other')}</h4>
          <ul className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm text-loam-700">
            {sample.otherResults.map((r, i) => <li key={i}>{r.name} : {r.value}{r.unit ? ` ${r.unit}` : ''}</li>)}
          </ul>
        </div>
      )}
      <footer className="flex flex-wrap gap-2 border-t border-loam-100 pt-3">
        {sample.reports.map((report) => (
          <a key={report.url} href={report.url} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-prune-700 ring-[1.5px] ring-inset ring-prune-600 hover:bg-prune-600 hover:text-white">
            <FileText className="h-4 w-4" aria-hidden />{t('deliverables.page.soil_report')}
          </a>
        ))}
        {sample.lng != null && sample.lat != null && (
          <Button variant="ghost" size="sm" onClick={onShow}><MapPin className="h-4 w-4" aria-hidden />{t('deliverables.page.soil_on_plan')}</Button>
        )}
      </footer>
    </article>
  )
}
