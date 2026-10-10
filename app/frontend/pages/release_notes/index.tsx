import { Head } from '@inertiajs/react'
import { Fragment, useState } from 'react'
import { EmptyState } from '@/components/ui/Card'
import { t } from '@/lib/i18n'
import { Bud, Leaf, Roots, STEM_STYLE } from '@/release_notes/Vine'
import { NoteCard } from '@/release_notes/NoteCard'
import { formatLongDay, formatMonth, monthKey, seasonOf } from '@/release_notes/format'
import type { ReleaseNoteEntry, ReleaseNoteLikes } from '@/types/releaseNotes'

type Props = { notes: ReleaseNoteEntry[] }

// « Nouveautés » as the Designer's own growth: a stem climbs the left of
// the page from the day it was sown (roots, at the bottom) to its newest
// entry (a bud, at the top). Each entry is a leaf on it, written up as a
// notebook page; months are marked on the stem with their season.
export default function ReleaseNotesIndex({ notes: initialNotes }: Props) {
  const [notes, setNotes] = useState(initialNotes)
  const setLikes = (id: number) => (value: ReleaseNoteLikes) =>
    setNotes((current) => current.map((note) => (note.id === id ? { ...note, ...value } : note)))
  const first = notes[notes.length - 1]

  return (
    <div className="mx-auto max-w-4xl">
      <Head title={t('release_notes.title')} />
      <header className="pl-12 sm:pl-16">
        <p className="font-hand text-xl leading-none text-leaf-600">{t('release_notes.kicker')}</p>
        <h1 className="mt-1 text-4xl sm:text-5xl">{t('release_notes.title')}</h1>
        <p className="mt-3 max-w-2xl text-loam-600">{t('release_notes.intro')}</p>
      </header>

      {notes.length === 0 ? (
        <div className="mt-8">
          <EmptyState title={t('release_notes.empty.title')}>{t('release_notes.empty.body')}</EmptyState>
        </div>
      ) : (
        <div className="relative mt-6">
          {/* The bud: where the next entry will grow. */}
          <div className="flex items-end gap-2">
            <div className="flex w-10 shrink-0 justify-center sm:w-14"><Bud /></div>
            <p className="pb-1 font-hand text-lg leading-none text-loam-400">
              {first && t('release_notes.count', { count: notes.length, date: formatLongDay(first.publishedOn) })}
            </p>
          </div>

          <ol>
            {notes.map((note, index) => {
              const month = monthKey(note.publishedOn)
              const newMonth = index === 0 || monthKey(notes[index - 1].publishedOn) !== month
              const side = index % 2 === 0 ? 'right' : 'left'
              return (
                <Fragment key={note.id}>
                  {newMonth && (
                    <li aria-hidden="true" className="flex items-center">
                      <div className="flex w-10 shrink-0 justify-center self-stretch sm:w-14" style={STEM_STYLE} />
                      <p className="py-3 font-serif text-lg text-loam-500">
                        {formatMonth(note.publishedOn)}
                        <span className="ml-2 font-hand text-lg text-leaf-600">· {t(`release_notes.seasons.${seasonOf(note.publishedOn)}`)}</span>
                      </p>
                    </li>
                  )}
                  <li className="flex">
                    <div className="relative w-10 shrink-0 sm:w-14" style={STEM_STYLE}>
                      <div className="absolute top-6 left-1/2 -translate-x-1/2">
                        <Leaf likes={note.likesCount} fresh={note.fresh} side={side} />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1 pb-8">
                      <NoteCard note={note} onLikes={setLikes(note.id)} tilt={side === 'right' ? 'right' : 'left'} />
                    </div>
                  </li>
                </Fragment>
              )
            })}
          </ol>

          {/* The roots: the day the Designer was sown. */}
          {first && (
            <div className="flex items-start gap-2">
              <div className="flex w-10 shrink-0 justify-center sm:w-14"><Roots /></div>
              <p className="pt-3 font-hand text-lg leading-none text-loam-400">{t('release_notes.sown', { date: formatLongDay(first.publishedOn) })}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
