import clsx from 'clsx'
import { ClipboardPaste, Scissors } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { MarkdownEditor } from '@/documents/markdown/MarkdownEditor'
import { t } from '@/lib/i18n'
import { SLIDE_PROSE, slideSize } from './SlideBody'
import { slideMarkdown, splitByHeadings } from './slideMarkdown'
import type { PresentationStep } from './types'

/** As much as the server keeps of a slide (MapPresentation::MAX_BODY). */
export const MAX_BODY = 20_000

/**
 * Writing a text slide on a page the size of the slide: titles, bold, lists,
 * numbered points and tables, and above all pasting what was written
 * elsewhere (a Word analysis, a PDF pre-project, a spreadsheet) without
 * losing its shape. The text is saved as it is written; a text with several
 * titles can become one slide per title.
 */
export function SlideEditorDialog({ step, open, onClose, onSave, onSplit }: {
  step: PresentationStep
  open: boolean
  onClose: () => void
  onSave: (body: string) => void
  /** Absent when the presentation has no room for more slides. */
  onSplit?: (body: string) => void
}) {
  const initial = useRef(slideMarkdown(step.slide?.body ?? ''))
  const [body, setBody] = useState(initial.current)
  const saved = useRef(step.slide?.body ?? '')
  const save = useRef(onSave)
  save.current = onSave
  const timer = useRef<number | undefined>(undefined)

  // Opened again on another text (an AI draft accepted meanwhile): start from it.
  useEffect(() => {
    if (!open) return
    initial.current = slideMarkdown(step.slide?.body ?? '')
    saved.current = step.slide?.body ?? ''
    setBody(initial.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const flush = useCallback((text: string) => {
    window.clearTimeout(timer.current)
    if (text === saved.current) return
    saved.current = text
    save.current(text)
  }, [])

  const change = useCallback((markdown: string) => {
    setBody(markdown)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => flush(markdown), 1200)
  }, [flush])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const close = () => {
    flush(body)
    onClose()
  }
  const sections = splitByHeadings(body).sections.length
  const tooLong = body.length > MAX_BODY

  return (
    <Dialog open={open} onClose={close} size="wide" dismissOnBackdrop={false} title={t('presentations.slide_editor.title', { title: step.title })}
      footer={(
        <>
          <p className={clsx('mr-auto flex items-center gap-2 text-sm', tooLong ? 'text-clay-700' : 'text-loam-600')}>
            {!tooLong && <ClipboardPaste className="h-4 w-4 shrink-0" aria-hidden />}
            {tooLong ? t('presentations.slide_editor.too_long', { max: MAX_BODY.toLocaleString('fr-BE') }) : t('presentations.slide_editor.paste_hint')}
          </p>
          {onSplit && sections >= 2 && (
            <Button variant="secondary" onClick={() => { window.clearTimeout(timer.current); saved.current = body; onSplit(body); onClose() }}>
              <Scissors className="h-4 w-4" aria-hidden />
              {t('presentations.slide_editor.split', { count: sections })}
            </Button>
          )}
          <Button onClick={close}>{t('presentations.done')}</Button>
        </>
      )}
    >
      {open && (
        <div className="flex min-h-0 flex-1 flex-col bg-loam-100/60">
          <MarkdownEditor
            key={step.id}
            content={initial.current}
            editable
            autofocus
            onChange={(markdown) => change(markdown)}
            prose={clsx(SLIDE_PROSE, 'mx-auto min-h-full max-w-4xl rounded-2xl bg-loam-50 px-6 py-8 shadow-sm ring-1 ring-loam-200 sm:px-14 sm:py-12')}
            placeholder={t('presentations.slide_editor.placeholder')}
            toolbarClassName="shrink-0 border-b border-loam-900/10 bg-loam-50 px-2 py-1.5"
            className={clsx(slideSize(body), 'flex min-h-0 flex-1 flex-col [&>div:last-child]:min-h-0 [&>div:last-child]:flex-1 [&>div:last-child]:overflow-y-auto [&>div:last-child]:p-3 sm:[&>div:last-child]:p-6')}
          />
        </div>
      )}
    </Dialog>
  )
}
