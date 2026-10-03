import { ChevronDown, ExternalLink } from 'lucide-react'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { ProgressBar, SaveIndicator, SectionBody, StatusMark, sectionTitle } from '@/components/journey/ProjectSheetParts'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useProjectSheet } from '@/lib/projectSheet'
import { useEditor } from '@/map/editor/EditorContext'
import type { ProjectPayload } from '@/types/journey'

/** "Fiche projet" in the editor: the same form as the full page, one section open at a time. */
export default function ProjectPanel() {
  const editor = useEditor()
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

  if (failed) return <p className="text-sm text-clay-600">{t('journey.panel.unavailable')}</p>
  if (!payload) return <p className="text-sm text-loam-500">{t('common.loading')}</p>
  return <PanelBody payload={payload} />
}

function PanelBody({ payload }: { payload: ProjectPayload }) {
  const sheet = useProjectSheet(payload.map.id, payload.project, payload.progress, payload.canEdit)
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

      <a
        href={`/maps/${payload.map.id}/project`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-prune-700 hover:underline"
      >
        <ExternalLink className="h-4 w-4" aria-hidden />{t('journey.project.open_page')}
      </a>
    </div>
  )
}
