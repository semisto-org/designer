import { Head, Link } from '@inertiajs/react'
import { ArrowLeft, ArrowRight, ChevronLeft } from 'lucide-react'
import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import { HelpButton } from '@/components/help/HelpButton'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ProgressBar, SaveIndicator, SectionBody, StatusMark, sectionTitle } from '@/components/journey/ProjectSheetParts'
import { t } from '@/lib/i18n'
import { useProjectSheet } from '@/lib/projectSheet'
import { relativeTime } from '@/lib/relativeTime'
import type { ProjectPayload } from '@/types/journey'

/**
 * The project sheet on a full page: one section at a time, a list of
 * sections with their progress, autosave. Comfortable on desktop and phone.
 */
export default function MapProject({ map, project, progress: initialProgress, schema, canEdit }: ProjectPayload) {
  const sheet = useProjectSheet(map.id, project, initialProgress, canEdit)
  const sections = useMemo(() => schema.sections.map((s) => s.key), [schema])
  const [active, setActive] = useState<string>(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash.slice(1) : ''
    return sections.includes(hash) ? hash : (initialProgress.nextSection ?? sections[0])
  })

  useEffect(() => {
    window.history.replaceState(null, '', `#${active}`)
    window.scrollTo({ top: 0 })
  }, [active])

  const index = sections.indexOf(active)
  const { progress } = sheet
  const current = progress.sections[active]
  const resume = progress.nextSection && progress.nextSection !== active ? progress.nextSection : null

  return (
    <div className="mx-auto max-w-5xl">
      <Head title={t('journey.project.page_title', { map: map.name })} />
      <Link href={`/maps/${map.id}`} className="inline-flex items-center gap-1.5 text-sm text-loam-500 hover:text-loam-800">
        <ArrowLeft className="h-4 w-4" />{t('journey.project.back_to_map')}
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl">{t('journey.project.title')}</h1>
            <HelpButton compact slug="remplir-la-fiche-projet" />
          </div>
          <p className="text-loam-500">{map.name}</p>
        </div>
        <div className="w-full max-w-xs sm:w-64">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-medium text-loam-800">{t('journey.project.overall', { percent: progress.percent })}</span>
          </div>
          <ProgressBar percent={progress.percent} label={t('journey.project.overall', { percent: progress.percent })} className="mt-1.5" />
        </div>
      </div>
      <p className="mt-4 max-w-3xl text-sm text-loam-600">{t('journey.project.intro')}</p>
      {!canEdit && <p className="mt-3 rounded-lg bg-humus-50 px-3 py-2 text-sm text-humus-700">{t('journey.project.read_only')}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label={t('journey.project.sections_nav')} className="-mx-4 overflow-x-auto px-4 lg:sticky lg:top-4 lg:mx-0 lg:self-start lg:overflow-visible lg:px-0">
          <ol className="flex gap-2 lg:flex-col lg:gap-1">
            {sections.map((section) => {
              const p = progress.sections[section]
              const isActive = section === active
              return (
                <li key={section} className="shrink-0">
                  <button
                    type="button" aria-current={isActive ? 'step' : undefined} onClick={() => setActive(section)}
                    className={clsx(
                      'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      isActive ? 'bg-prune-600 text-white' : 'bg-white text-loam-700 ring-1 ring-inset ring-loam-200 hover:bg-loam-50 lg:ring-0 lg:bg-transparent',
                    )}
                  >
                    <StatusMark status={p.status} className={isActive ? 'border-white' : undefined} />
                    <span className="flex-1 whitespace-nowrap">{sectionTitle(section)}</span>
                    <span className={clsx('hidden text-xs lg:inline', isActive ? 'text-prune-100' : 'text-loam-500')}>{p.percent} %</span>
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>

        <Card className="min-w-0 p-5! sm:p-7!">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-loam-500">
                {index + 1} / {sections.length}
              </p>
              <h2 className="text-xl">{sectionTitle(active)}</h2>
              <p className="mt-0.5 text-xs text-loam-500">
                {current?.touchedAt ? t('journey.project.touched', { when: relativeTime(current.touchedAt) }) : t('journey.project.untouched')}
              </p>
            </div>
            {canEdit && <SaveIndicator status={sheet.status} onRetry={sheet.retry} />}
          </div>
          {resume && (
            <button type="button" onClick={() => setActive(resume)} className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-prune-700 hover:underline">
              {t('journey.project.resume', { section: sectionTitle(resume) })}<ArrowRight className="h-4 w-4" />
            </button>
          )}
          <div className="mt-5">
            <SectionBody sheet={sheet} schema={schema} section={active} canEdit={canEdit} />
          </div>
          <div className="mt-8 flex items-center justify-between gap-3 border-t border-loam-100 pt-4">
            <Button variant="secondary" disabled={index === 0} onClick={() => setActive(sections[index - 1])}>
              <ChevronLeft className="h-4 w-4" />{t('journey.project.previous')}
            </Button>
            {index < sections.length - 1 ? (
              <Button onClick={() => setActive(sections[index + 1])}>{t('journey.project.next')}<ArrowRight className="h-4 w-4" /></Button>
            ) : (
              <Link href={`/maps/${map.id}`} className="text-sm font-medium text-prune-700 hover:underline">{t('journey.project.back_to_map')}</Link>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
