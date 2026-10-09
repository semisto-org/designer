import { Link, usePage } from '@inertiajs/react'
import { ArrowRight } from 'lucide-react'
import { t } from '@/lib/i18n'
import type { SharedProps } from '@/types'

/** On « Mes cartes », while something new is not seen yet: a note pinned under the title. */
export function WhatsNewNote() {
  const { releaseNotes } = usePage().props as unknown as SharedProps
  if (!releaseNotes?.latest) return null
  const rest = releaseNotes.unseen - 1
  return (
    <Link
      href="/nouveautes"
      className="group mt-5 flex w-fit max-w-full items-center gap-3 rounded-full bg-humus-50 py-1.5 pr-4 pl-1.5 text-sm text-loam-700 ring-1 ring-humus-200 transition-colors hover:bg-humus-100"
    >
      <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-base shadow-sm">🌱</span>
      <span className="min-w-0">
        {rest > 0
          ? t('release_notes.teaser_more', { title: releaseNotes.latest.title, count: rest })
          : t('release_notes.teaser', { title: releaseNotes.latest.title })}
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-humus-600 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  )
}
