import { ArrowRight, ChevronDown, ChevronLeft, ExternalLink } from 'lucide-react'
import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { ProjectFormLink } from '@/components/journey/ProjectFormLink'
import { DraftCount, DraftsBanner, ProgressBar, SaveIndicator, SectionBody, StatusMark, sectionTitle } from '@/components/journey/ProjectSheetParts'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useProjectSheet } from '@/lib/projectSheet'
import { relativeTime } from '@/lib/relativeTime'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { useEditor } from '@/map/editor/EditorContext'
import { MODAL_PANEL_QUERY } from '@/map/panels/registry'
import type { ProjectPayload } from '@/types/journey'

/**
 * "Fiche projet" in the editor: the same form as the full page. A centered
 * modal with comfortable reading sizes on wide screens, a side panel with
 * one section open at a time on smaller ones.
 */
export default function ProjectPanel() {
  const editor = useEditor()
  const inModal = useMediaQuery(MODAL_PANEL_QUERY)
  const [payload, setPayload] = useState<ProjectPayload | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setPayload(null)
    setFailed(false)
    api<ProjectPayload>(`/maps/${editor.map.id}/project`)
      .then((data) => { if (!cancelled) setPayload(data) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [editor.map.id])

  if (failed || !payload) {
    const message = failed
      ? <p className="text-sm text-clay-600">{t('journey.panel.unavailable')}</p>
      : <p className="text-sm text-loam-500">{t('common.loading')}</p>
    return inModal ? <div className="px-6 py-5">{message}</div> : message
  }
  return inModal ? <ModalBody payload={payload} /> : <PanelBody payload={payload} />
}

function PanelBody({ payload }: { payload: ProjectPayload }) {
  const sheet = useProjectSheet(`/maps/${payload.map.id}/project`, payload.project, payload.progress, payload.canEdit, payload.drafts)
  const sections = payload.schema.sections.map((s) => s.key)
  const [open, setOpen] = useState<string | null>(payload.progress.nextSection ?? sections[0])
  const { progress } = sheet

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="font-medium text-loam-800">{t('journey.project.overall', { percent: progress.percent })}</span>
        </div>
        <ProgressBar percent={progress.percent} label={t('journey.project.overall', { percent: progress.percent })} className="mt-1.5" />
        {payload.canEdit
          ? <div className="mt-2 min-h-4"><SaveIndicator status={sheet.status} onRetry={sheet.retry} /></div>
          : <p className="mt-2 text-xs text-humus-700">{t('journey.project.read_only')}</p>}
      </div>

      <DraftsBanner sheet={sheet} canEdit={payload.canEdit} onOpen={setOpen} />

      <ul className="divide-y divide-loam-100 rounded-lg ring-1 ring-loam-200">
        {sections.map((section) => {
          const p = progress.sections[section]
          const isOpen = open === section
          return (
            <li key={section}>
              <h3>
                <button
                  type="button" aria-expanded={isOpen} aria-controls={`panel-section-${section}`}
                  onClick={() => setOpen(isOpen ? null : section)}
                  className={clsx('flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-loam-50', isOpen && 'bg-loam-50')}
                >
                  <StatusMark status={p.status} />
                  <span className="flex-1 font-medium text-loam-800">{sectionTitle(section)}</span>
                  <DraftCount sheet={sheet} section={section} />
                  <span className="text-xs text-loam-500">{p.percent} %</span>
                  <ChevronDown className={clsx('h-4 w-4 text-loam-400 transition-transform', isOpen && 'rotate-180')} aria-hidden />
                </button>
              </h3>
              {isOpen && (
                <div id={`panel-section-${section}`} className="border-t border-loam-100 px-3 pb-4 pt-3">
                  <SectionBody sheet={sheet} schema={payload.schema} section={section} canEdit={payload.canEdit} />
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {payload.canEdit && <ProjectFormLink mapId={payload.map.id} initial={payload.formLink} />}

      <a
        href={`/maps/${payload.map.id}/project`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-prune-700 hover:underline"
      >
        <ExternalLink className="h-4 w-4" aria-hidden />{t('journey.project.open_page')}
      </a>
    </div>
  )
}

/**
 * The modal layout: sections and progress on the left, the open section on
 * the right at reading size (small text is bumped up one step), with
 * previous / next to walk through the sheet.
 */
function ModalBody({ payload }: { payload: ProjectPayload }) {
  const sheet = useProjectSheet(`/maps/${payload.map.id}/project`, payload.project, payload.progress, payload.canEdit, payload.drafts)
  const sections = payload.schema.sections.map((s) => s.key)
  const [active, setActive] = useState<string>(payload.progress.nextSection ?? sections[0])
  const content = useRef<HTMLDivElement>(null)
  const { progress } = sheet
  const index = sections.indexOf(active)
  const current = progress.sections[active]

  useEffect(() => { content.current?.scrollTo({ top: 0 }) }, [active])

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto border-r border-loam-100 bg-loam-50/60 p-4">
        <div>
          <p className="text-sm font-medium text-loam-800">{t('journey.project.overall', { percent: progress.percent })}</p>
          <ProgressBar percent={progress.percent} label={t('journey.project.overall', { percent: progress.percent })} className="mt-1.5" />
          {payload.canEdit
            ? <div className="mt-2 min-h-4"><SaveIndicator status={sheet.status} onRetry={sheet.retry} /></div>
            : <p className="mt-2 text-xs text-humus-700">{t('journey.project.read_only')}</p>}
        </div>
        <nav aria-label={t('journey.project.sections_nav')}>
          <ol className="space-y-1">
            {sections.map((section) => {
              const p = progress.sections[section]
              const isActive = section === active
              return (
                <li key={section}>
                  <button
                    type="button" aria-current={isActive ? 'step' : undefined} onClick={() => setActive(section)}
                    className={clsx(
                      'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      isActive ? 'bg-prune-600 text-white' : 'text-loam-700 hover:bg-loam-100',
                    )}
                  >
                    <StatusMark status={p.status} className={isActive ? 'border-white' : undefined} />
                    <span className="flex-1">{sectionTitle(section)}</span>
                    <DraftCount sheet={sheet} section={section} />
                    <span className={clsx('text-xs', isActive ? 'text-prune-100' : 'text-loam-500')}>{p.percent} %</span>
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>
        {payload.canEdit && <ProjectFormLink mapId={payload.map.id} initial={payload.formLink} className="p-3!" />}
        <a
          href={`/maps/${payload.map.id}/project#${active}`}
          className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-prune-700 hover:underline"
        >
          <ExternalLink className="h-4 w-4" aria-hidden />{t('journey.project.open_page')}
        </a>
      </aside>

      <div ref={content} className="min-h-0 overflow-y-auto">
        <article className="mx-auto max-w-2xl px-8 py-7 text-base leading-relaxed [&_.text-sm]:text-base [&_.text-sm]:leading-relaxed [&_.text-xs]:text-sm">
          <div className="mb-6 empty:hidden"><DraftsBanner sheet={sheet} canEdit={payload.canEdit} onOpen={setActive} /></div>
          <p className="text-xs font-medium uppercase tracking-wide text-loam-500">{index + 1} / {sections.length}</p>
          <h2 className="text-2xl">{sectionTitle(active)}</h2>
          <p className="mt-0.5 text-xs text-loam-500">
            {current?.touchedAt ? t('journey.project.touched', { when: relativeTime(current.touchedAt) }) : t('journey.project.untouched')}
          </p>
          <div className="mt-6">
            <SectionBody sheet={sheet} schema={payload.schema} section={active} canEdit={payload.canEdit} />
          </div>
          <div className="mt-10 flex items-center justify-between gap-3 border-t border-loam-100 pt-4">
            <Button variant="secondary" disabled={index === 0} onClick={() => setActive(sections[index - 1])}>
              <ChevronLeft className="h-4 w-4" />{t('journey.project.previous')}
            </Button>
            {index < sections.length - 1 && (
              <Button onClick={() => setActive(sections[index + 1])}>{t('journey.project.next')}<ArrowRight className="h-4 w-4" /></Button>
            )}
          </div>
        </article>
      </div>
    </div>
  )
}
