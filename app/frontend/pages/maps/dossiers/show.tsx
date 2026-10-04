import { Head, Link } from '@inertiajs/react'
import clsx from 'clsx'
import { ArrowLeft, Lock, Printer, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/Button'
import { formatDate } from '@/components/plants/format'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { AlertsSection } from '@/dossier/AlertsSection'
import { ClimateSection } from '@/dossier/ClimateSection'
import { Cover } from '@/dossier/Cover'
import { DesignSection } from '@/dossier/DesignSection'
import { FinancesSection } from '@/dossier/FinancesSection'
import { PhotosSection, chosenPhotoIds } from '@/dossier/PhotosSection'
import { PlantsSection } from '@/dossier/PlantsSection'
import { ProjectSection } from '@/dossier/ProjectSection'
import { SoilSection } from '@/dossier/SoilSection'
import { SourcesSection } from '@/dossier/SourcesSection'
import { TerrainSection } from '@/dossier/TerrainSection'
import { DEFAULT_SECTIONS, useDossierPrefs } from '@/dossier/prefs'
import { DOSSIER_SECTIONS, type Dossier, type DossierPageProps, type DossierPrefs, type DossierSection } from '@/types/dossier'

type Load = { status: 'loading'; dossier: Dossier | null } | { status: 'ready'; dossier: Dossier } | { status: 'error'; dossier: Dossier | null }

/** Fetches the dossier; asking again (networks on or off) keeps the last one on screen. */
function useDossier(mapId: number, networks: boolean) {
  const [load, setLoad] = useState<Load>({ status: 'loading', dossier: null })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoad((current) => ({ status: 'loading', dossier: current.dossier }))
    api<Dossier>(`/maps/${mapId}/dossier.json${networks ? '?networks=1' : ''}`, { signal: controller.signal })
      .then((dossier) => setLoad({ status: 'ready', dossier }))
      .catch((error) => {
        if (controller.signal.aborted) return
        console.error(error)
        setLoad((current) => ({ status: 'error', dossier: current.dossier }))
      })
    return () => controller.abort()
  }, [mapId, networks, attempt])
  return { load, retry: () => setAttempt((n) => n + 1) }
}

const hasAnswer = (value: unknown) =>
  value != null && value !== '' && value !== false && !(Array.isArray(value) && value.length === 0)

/** Sections with nothing to show are left out of the document. */
function isEmpty(dossier: Dossier, section: DossierSection): boolean {
  switch (section) {
    case 'project': return !Object.values(dossier.project.values).some((answers) => Object.values(answers ?? {}).some(hasAnswer))
    case 'soil': return dossier.soil.samples.length === 0 && dossier.soil.bioindicators.observations.length === 0
    case 'design': return dossier.design.layers.length === 0
    case 'plants': return dossier.plants.rows.length === 0
    case 'photos': return dossier.photos.total === 0
    case 'finances': return !dossier.finances.exists
    default: return false
  }
}

/** Sections where part of the content is a paid analysis. */
const PARTLY_PAID: DossierSection[] = ['terrain', 'climate', 'soil']

/** The « Dossier du projet »: chosen sections on A4 paper, printed (or saved as PDF) by the browser. */
export default function DossierShow({ map, canEdit }: DossierPageProps) {
  const { prefs, update, reset } = useDossierPrefs(map.id)
  const [networks, setNetworks] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const { load, retry } = useDossier(map.id, networks)
  const dossier = load.dossier

  return (
    <div className="min-h-dvh bg-loam-100 text-loam-900 print:min-h-0 print:bg-white">
      <Head title={t('dossier.page_title', { map: map.name })} />
      {dossier && <PrintStyles dossier={dossier} />}

      <header className="sticky top-0 z-20 border-b border-loam-200 bg-white/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <Link href={`/maps/${map.id}`} className="inline-flex shrink-0 items-center gap-1 text-sm text-loam-500 hover:text-loam-800">
            <ArrowLeft className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">{t('dossier.back')}</span>
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-loam-900">{t('dossier.title')}</p>
            <p className="truncate text-xs text-loam-500">{map.name}</p>
          </div>
          <Button variant="secondary" size="sm" className="lg:hidden" aria-label={t('dossier.picker.toggle')} title={t('dossier.picker.toggle')} aria-expanded={pickerOpen} aria-controls="dossier-picker" onClick={() => setPickerOpen((open) => !open)}>
            <SlidersHorizontal className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">{t('dossier.picker.toggle')}</span>
          </Button>
          <Button size="sm" onClick={() => window.print()} disabled={!dossier}>
            <Printer className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">{t('dossier.print')}</span>
            <span className="sm:hidden">{t('dossier.print_short')}</span>
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl gap-6 px-3 py-4 sm:px-4 sm:py-6 lg:grid lg:grid-cols-[18rem_minmax(0,1fr)] print:block print:max-w-none print:p-0">
        <aside id="dossier-picker" className={clsx('mb-4 lg:mb-0 lg:block print:hidden', pickerOpen ? 'block' : 'hidden')}>
          <div className="lg:sticky lg:top-20">
            {dossier && (
              <Picker
                dossier={dossier}
                prefs={prefs}
                update={update}
                reset={reset}
                canEdit={canEdit}
                networks={networks}
                setNetworks={setNetworks}
              />
            )}
          </div>
        </aside>

        <main className="min-w-0">
          {!dossier ? (
            <Paper>
              {load.status === 'error' ? (
                <div className="space-y-3 py-16 text-center">
                  <p className="text-sm text-loam-600">{t('dossier.error')}</p>
                  <Button variant="secondary" onClick={retry}>{t('dossier.retry')}</Button>
                </div>
              ) : (
                <p className="py-16 text-center text-sm text-loam-500" role="status">{t('dossier.loading')}</p>
              )}
            </Paper>
          ) : (
            <>
              {load.status === 'error' && (
                <div className="mx-auto mb-3 flex max-w-[210mm] items-center justify-between gap-3 rounded-lg bg-clay-50 px-3 py-2 text-sm text-clay-800 print:hidden">
                  {t('dossier.error')}
                  <Button variant="secondary" size="sm" onClick={retry}>{t('dossier.retry')}</Button>
                </div>
              )}
              <Document dossier={dossier} prefs={prefs} busy={load.status === 'loading'} />
            </>
          )}
        </main>
      </div>
    </div>
  )
}

// No app chrome on paper: a layout resolver returning null renders the page alone.
DossierShow.layout = () => null

function Paper({ children, busy }: { children: ReactNode; busy?: boolean }) {
  return (
    <article
      className={clsx(
        'dossier-paper mx-auto w-full max-w-[210mm] bg-white px-5 py-6 shadow-sm ring-1 ring-loam-200 transition-opacity sm:px-[14mm] sm:py-[14mm]',
        'print:max-w-none print:p-0 print:shadow-none print:ring-0',
        busy && 'opacity-60',
      )}
      aria-busy={busy || undefined}
    >
      {children}
    </article>
  )
}

function Document({ dossier, prefs, busy }: { dossier: Dossier; prefs: DossierPrefs; busy: boolean }) {
  const enabled = DOSSIER_SECTIONS.filter((s) => prefs.sections[s] && !isEmpty(dossier, s))
  const numbered: DossierSection[] = enabled.filter((s) => s !== 'cover')
  const number = (s: DossierSection) => numbered.indexOf(s) + 1
  const on = new Set(enabled)
  const isOwner = dossier.viewer.role === 'owner'
  const photoCount = chosenPhotoIds(dossier, prefs.photos).length

  return (
    <Paper busy={busy}>
      {on.has('cover') ? (
        <>
          <Cover dossier={dossier} cadastre={prefs.cadastre} contents={numbered} />
          <div className="my-10 border-t-2 border-dashed border-loam-200 print:hidden" aria-hidden />
        </>
      ) : (
        <header className="mb-8 flex items-start justify-between gap-4 border-b border-loam-200 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-prune-600">{t('dossier.title')}</p>
            <h1 className="mt-1 text-2xl text-loam-900">{dossier.map.name}</h1>
            <p className="mt-0.5 text-sm text-loam-600">{dossier.map.ownerName} · {formatDate(dossier.generatedOn)}</p>
          </div>
          <Logo className="h-8 w-8" />
        </header>
      )}
      {on.has('project') && <ProjectSection dossier={dossier} number={number('project')} canEdit={dossier.viewer.canEdit} />}
      {on.has('terrain') && <TerrainSection dossier={dossier} number={number('terrain')} isOwner={isOwner} />}
      {on.has('climate') && <ClimateSection dossier={dossier} number={number('climate')} isOwner={isOwner} />}
      {on.has('soil') && <SoilSection dossier={dossier} number={number('soil')} isOwner={isOwner} />}
      {on.has('design') && <DesignSection dossier={dossier} number={number('design')} />}
      {on.has('plants') && <PlantsSection dossier={dossier} number={number('plants')} />}
      {on.has('alerts') && <AlertsSection dossier={dossier} number={number('alerts')} />}
      {on.has('photos') && <PhotosSection dossier={dossier} number={number('photos')} chosen={prefs.photos} />}
      {on.has('finances') && <FinancesSection dossier={dossier} number={number('finances')} />}
      {on.has('sources') && <SourcesSection dossier={dossier} number={number('sources')} enabled={on} photoCount={photoCount} />}
      {numbered.length === 0 && !on.has('cover') && <p className="text-sm text-loam-500">{t('dossier.picker.nothing')}</p>}
    </Paper>
  )
}

function Picker({ dossier, prefs, update, reset, canEdit, networks, setNetworks }: {
  dossier: Dossier
  prefs: DossierPrefs
  update: (change: Partial<DossierPrefs>) => void
  reset: () => void
  canEdit: boolean
  networks: boolean
  setNetworks: (value: boolean) => void
}) {
  const locked = !dossier.entitlements.analyses
  const chosen = chosenPhotoIds(dossier, prefs.photos)
  const toggleSection = (section: DossierSection, value: boolean) => update({ sections: { ...prefs.sections, [section]: value } })
  const togglePhoto = useCallback((id: number) => {
    update({ photos: chosen.includes(id) ? chosen.filter((p) => p !== id) : [...chosen, id] })
  }, [chosen, update])
  const allOn = useMemo(() => DOSSIER_SECTIONS.every((s) => prefs.sections[s]), [prefs.sections])

  return (
    <div className="space-y-4 rounded-xl bg-white p-4 text-sm shadow-sm ring-1 ring-loam-200">
      <div>
        <h2 className="text-base font-semibold text-loam-900">{t('dossier.picker.title')}</h2>
        <p className="mt-1 text-xs text-loam-500">{t('dossier.picker.intro')}</p>
      </div>

      <fieldset className="space-y-1">
        <legend className="sr-only">{t('dossier.picker.title')}</legend>
        {DOSSIER_SECTIONS.map((section) => {
          const empty = isEmpty(dossier, section)
          return (
            <label key={section} className={clsx('flex items-start gap-2 rounded-md px-1.5 py-1', empty ? 'text-loam-400' : 'cursor-pointer hover:bg-loam-50')}>
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-loam-300 text-prune-600"
                checked={prefs.sections[section] && !empty}
                disabled={empty}
                onChange={(e) => toggleSection(section, e.target.checked)}
              />
              <span className="min-w-0 flex-1">
                <span className={empty ? '' : 'text-loam-800'}>{t(`dossier.sections.${section}`)}</span>
                {empty && <span className="block text-[11px]">{t('dossier.picker.empty_section')}</span>}
              </span>
              {locked && PARTLY_PAID.includes(section) && (
                <span title={t('dossier.picker.locked')} className="mt-0.5 text-humus-700"><Lock className="h-3.5 w-3.5" aria-label={t('dossier.picker.locked')} /></span>
              )}
            </label>
          )
        })}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        {!allOn && <Button variant="secondary" size="sm" onClick={() => update({ sections: { ...DEFAULT_SECTIONS } })}>{t('dossier.picker.all')}</Button>}
        <Button variant="ghost" size="sm" onClick={reset}><RotateCcw className="h-3.5 w-3.5" aria-hidden />{t('dossier.picker.reset')}</Button>
      </div>

      <div className="space-y-2 border-t border-loam-100 pt-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-loam-500">{t('dossier.picker.options')}</h3>
        {dossier.cover.cadastre && (
          <label className="flex cursor-pointer items-start gap-2">
            <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-loam-300 text-prune-600" checked={prefs.cadastre} onChange={(e) => update({ cadastre: e.target.checked })} />
            <span className="text-loam-800">{t('dossier.picker.cadastre')}</span>
          </label>
        )}
        {canEdit && dossier.networks.count > 0 && (
          <label className="flex cursor-pointer items-start gap-2">
            <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-loam-300 text-prune-600" checked={networks} onChange={(e) => setNetworks(e.target.checked)} />
            <span>
              <span className="text-loam-800">{t('dossier.picker.networks')}</span>
              <span className="block text-[11px] text-loam-500">
                {t('dossier.picker.networks_count', { count: dossier.networks.count })} {t('dossier.picker.networks_hint')}
              </span>
            </span>
          </label>
        )}
      </div>

      {prefs.sections.photos && dossier.photos.items.length > 0 && (
        <div className="space-y-2 border-t border-loam-100 pt-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-loam-500">{t('dossier.picker.photos')}</h3>
            <span className="text-[11px] text-loam-500">{t('dossier.picker.photos_count', { count: chosen.length })}</span>
          </div>
          <p className="text-[11px] text-loam-500">{t('dossier.picker.photos_hint')}</p>
          <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-4">
            {dossier.photos.items.map((photo) => {
              const on = chosen.includes(photo.id)
              return (
                <li key={photo.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => togglePhoto(photo.id)}
                    title={photo.caption ?? undefined}
                    aria-label={t('dossier.picker.photo_toggle', { date: formatDate(photo.takenAt) })}
                    className={clsx(
                      'relative block aspect-square w-full overflow-hidden rounded-md bg-loam-100 ring-2 transition',
                      on ? 'ring-prune-600' : 'opacity-60 ring-transparent hover:opacity-100',
                    )}
                  >
                    <img src={photo.thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                    {on && <span className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-prune-600 text-[10px] font-bold text-white">{chosen.indexOf(photo.id) + 1}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {!canEdit && <p className="rounded-lg bg-loam-50 p-2 text-xs text-loam-600">{t('dossier.picker.read_only')}</p>}
      <p className="border-t border-loam-100 pt-3 text-[11px] text-loam-500">{t('dossier.picker.print_tip')}</p>
    </div>
  )
}

/** A string literal for CSS `content:`. */
const cssString = (text: string) => `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\n\r]+/g, ' ')}"`

/**
 * A4 pages: margins, a footer with the map's name and the page number (CSS
 * margin boxes), no footer on the cover, and sections that don't break in
 * awkward places. Only applies to this page.
 */
function PrintStyles({ dossier }: { dossier: Dossier }) {
  const footer = t('dossier.footer', { map: dossier.map.name, date: formatDate(dossier.generatedOn) })
  return (
    <style>{`
@page {
  size: A4;
  margin: 14mm 14mm 16mm;
  @bottom-left { content: ${cssString(footer)}; font: 8pt 'Inter Variable', system-ui, sans-serif; color: #6b665c; }
  @bottom-right { content: counter(page) " / " counter(pages); font: 8pt 'Inter Variable', system-ui, sans-serif; color: #6b665c; }
}
@page :first {
  @bottom-left { content: none; }
  @bottom-right { content: none; }
}
@media print {
  html, body { background: #fff !important; }
  .dossier-paper { font-size: 10pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .dossier-cover { min-height: 255mm; break-after: page; }
  .dossier-section { break-before: auto; }
  .dossier-keep, figure, tr { break-inside: avoid; }
  .dossier-heading { break-inside: avoid; break-after: avoid; }
  .dossier-keep-next { break-after: avoid; }
  thead { display: table-header-group; }
  a { color: inherit; text-decoration: none; }
}
`}</style>
  )
}
