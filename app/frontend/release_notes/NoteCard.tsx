import { Link } from '@inertiajs/react'
import { ArrowRight } from 'lucide-react'
import { t } from '@/lib/i18n'
import type { ReleaseNoteEntry, ReleaseNoteLikes } from '@/types/releaseNotes'
import { formatDay } from './format'
import { LikeBar } from './LikeBar'
import { TapedScreenshot } from './TapedScreenshot'

/**
 * One page of the Designer's notebook: the day written by hand, the title,
 * a few lines, the screenshot taped beside them, and the thumbs up.
 */
export function NoteCard({ note, onLikes, tilt = 'left', preview = false }: {
  note: ReleaseNoteEntry
  onLikes: (value: ReleaseNoteLikes) => void
  tilt?: 'left' | 'right'
  preview?: boolean
}) {
  const day = formatDay(note.publishedOn)
  return (
    <article
      aria-labelledby={`note-${note.id}-title`}
      className="relative rounded-2xl border border-loam-200 bg-[#fffdf7] px-5 pt-4 pb-5 shadow-[0_1px_0_var(--color-loam-200)] sm:px-7 sm:pt-5 sm:pb-6"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <time dateTime={note.publishedOn} className="font-hand text-[1.35rem] leading-none text-prune-600">
          {day.charAt(0).toUpperCase() + day.slice(1)}
        </time>
        {note.fresh && (
          <span title={t('release_notes.fresh_since')} className="rounded-full bg-humus-100 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-humus-700 uppercase">
            {t('release_notes.fresh')}
          </span>
        )}
      </div>
      <h2 id={`note-${note.id}-title`} className="mt-1.5 font-serif text-2xl leading-tight text-prune-800 sm:text-[1.75rem]">{note.title}</h2>

      <div className={note.screenshot ? 'mt-4 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:items-start' : 'mt-3'}>
        <div className="max-w-prose space-y-3 text-[15px] leading-relaxed text-loam-700">
          {note.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          {note.link && (
            <p className="pt-1">
              <Link href={note.link.path} className="inline-flex items-center gap-1.5 text-sm font-semibold text-prune-700 underline decoration-prune-200 underline-offset-4 hover:decoration-prune-600">
                {note.link.label || note.link.path}<ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </p>
          )}
        </div>
        {note.screenshot && (
          <div className="pt-2 md:pt-1">
            <TapedScreenshot url={note.screenshot.url} alt={note.screenshot.alt} title={note.title} tilt={tilt} />
          </div>
        )}
      </div>

      <div className="mt-5 border-t border-dashed border-loam-200 pt-4">
        <LikeBar noteId={note.id} title={note.title} value={note} onChange={onLikes} preview={preview} />
      </div>
    </article>
  )
}
