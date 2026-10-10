import { Head } from '@inertiajs/react'
import { ArrowRight, Check, ChevronLeft, Lock } from 'lucide-react'
import clsx from 'clsx'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ProgressBar, SaveIndicator, SectionBody, StatusMark, sectionTitle } from '@/components/journey/ProjectSheetParts'
import { Wordmark } from '@/components/Logo'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useProjectSheet } from '@/lib/projectSheet'
import { relativeTime } from '@/lib/relativeTime'
import type { ProjectFormPayload } from '@/types/journey'

/**
 * The project sheet opened from its private link: the people behind the
 * project answer it on their own, one section at a time, without an
 * account and without the map. Autosave, then « J'ai terminé » tells the
 * people working on the map.
 */
export default function ProjectForm({ token, mapName, invitedBy, project, progress: initialProgress, schema, canEdit, submittedAt: initialSubmittedAt }: ProjectFormPayload) {
  const endpoint = `/fiche-projet/${token}`
  const sheet = useProjectSheet(endpoint, project, initialProgress, canEdit)
  const sections = useMemo(() => schema.sections.map((s) => s.key), [schema])
  const [active, setActive] = useState<string>(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash.slice(1) : ''
    return sections.includes(hash) ? hash : (initialProgress.nextSection ?? sections[0])
  })
  const [submittedAt, setSubmittedAt] = useState(initialSubmittedAt)
  const [thanks, setThanks] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendFailed, setSendFailed] = useState(false)

  useEffect(() => {
    window.history.replaceState(null, '', `#${active}`)
    window.scrollTo({ top: 0 })
  }, [active])

  const index = sections.indexOf(active)
  const { progress } = sheet
  const last = index === sections.length - 1

  async function finish() {
    setSending(true)
    setSendFailed(false)
    try {
      await sheet.flush()
      const result = await api<{ submittedAt: string }>(`${endpoint}/submit`, { method: 'POST' })
      setSubmittedAt(result.submittedAt)
      setThanks(true)
      window.scrollTo({ top: 0 })
    } catch {
      setSendFailed(true)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:pt-10">
      <Head title={t('journey.form.page_title', { map: mapName })} />
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-leaf-700">{t('journey.form.eyebrow')}</p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="font-serif text-3xl text-loam-900 sm:text-4xl">{mapName}</h1>
          <p className="mt-1 text-loam-600">{t('journey.form.invited_by', { name: invitedBy })}</p>
        </div>
        <div className="w-full max-w-xs sm:w-64">
          <p className="text-sm font-medium text-loam-800">{t('journey.project.overall', { percent: progress.percent })}</p>
          <ProgressBar percent={progress.percent} label={t('journey.project.overall', { percent: progress.percent })} className="mt-1.5" />
        </div>
      </div>

      {thanks ? (
        <Card className="mt-8 max-w-2xl p-6! sm:p-8!">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-leaf-500 text-white"><Check className="h-5 w-5" aria-hidden /></span>
          <h2 className="mt-4 font-serif text-2xl">{t('journey.form.thanks_title')}</h2>
          <p className="mt-2 text-loam-700">{t('journey.form.thanks_body')}</p>
          <p className="mt-2 text-sm text-loam-500">{t('journey.form.finish_hint')}</p>
          <Button variant="secondary" className="mt-6" onClick={() => setThanks(false)}>{t('journey.form.thanks_back')}</Button>
        </Card>
      ) : (
        <>
          <p className="mt-5 max-w-3xl text-sm text-loam-700">{t('journey.form.intro')}</p>
          <p className="mt-2 flex max-w-3xl items-start gap-1.5 text-xs text-loam-500">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{t('journey.form.private_note')}
          </p>
          {!canEdit && <p className="mt-3 max-w-3xl rounded-lg bg-humus-50 px-3 py-2 text-sm text-humus-700">{t('journey.form.read_only')}</p>}
          {canEdit && submittedAt && (
            <p className="mt-3 max-w-3xl rounded-lg bg-leaf-50 px-3 py-2 text-sm text-leaf-800">
              {t('journey.form.submitted_on', { when: relativeTime(submittedAt) })}
            </p>
          )}

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
                          isActive ? 'bg-prune-600 text-white' : 'bg-white text-loam-700 ring-1 ring-inset ring-loam-200 hover:bg-loam-50 lg:bg-transparent lg:ring-0',
                        )}
                      >
                        <StatusMark status={p.status} className={isActive ? 'border-white' : undefined} />
                        <span className="flex-1 whitespace-nowrap">{sectionTitle(section)}</span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            </nav>

            <Card className="min-w-0 p-5! sm:p-7!">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-loam-500">{index + 1} / {sections.length}</p>
                  <h2 className="text-xl">{sectionTitle(active)}</h2>
                </div>
                {canEdit && <SaveIndicator status={sheet.status} onRetry={sheet.retry} />}
              </div>
              <div className="mt-5">
                <SectionBody sheet={sheet} schema={schema} section={active} canEdit={canEdit} />
              </div>
              <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-loam-100 pt-4">
                <Button variant="secondary" disabled={index === 0} onClick={() => setActive(sections[index - 1])}>
                  <ChevronLeft className="h-4 w-4" />{t('journey.project.previous')}
                </Button>
                {!last && <Button onClick={() => setActive(sections[index + 1])}>{t('journey.project.next')}<ArrowRight className="h-4 w-4" /></Button>}
                {last && canEdit && (
                  <Button variant="leaf" disabled={sending} onClick={finish}>
                    <Check className="h-4 w-4" aria-hidden />{sending ? t('journey.form.finishing') : t('journey.form.finish')}
                  </Button>
                )}
              </div>
              {last && canEdit && (
                <p className="mt-2 text-right text-xs text-loam-500">{t('journey.form.finish_hint')}</p>
              )}
              {sendFailed && <p className="mt-2 text-right text-sm text-clay-600">{t('journey.form.errors.submit')}</p>}
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

/** A quiet frame: the wordmark only, no navigation away from the form. */
export function FormLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-loam-50">
      <header className="border-b border-loam-900/10 bg-white/90">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-4"><Wordmark /></div>
      </header>
      <main>{children}</main>
    </div>
  )
}

ProjectForm.layout = (page: ReactNode) => <FormLayout>{page}</FormLayout>
