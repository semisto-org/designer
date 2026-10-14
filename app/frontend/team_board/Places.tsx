import { Link } from '@inertiajs/react'
import { Settings2, Trees } from 'lucide-react'
import { useState } from 'react'
import { t } from '@/lib/i18n'
import type { BoardProject } from '@/types/teamBoard'
import { BoardSection, Faces } from './board'
import { ProjectDialog } from './ProjectDialog'

/**
 * The team's own places (its teaching food forest, its nursery…): maps with
 * no client and no phase, kept apart from the timeline. Their settings turn
 * one back into a project. Nothing shows while the team has none.
 */
export function Places({ places }: { places: BoardProject[] }) {
  const [editing, setEditing] = useState<number | null>(null)
  if (places.length === 0) return null
  const editingNow = places.find((p) => p.id === editing) ?? null

  return (
    <BoardSection id="board-places" title={t('team_board.places.title')}>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {places.map((place) => (
          <li key={place.id} className="flex min-w-0 items-center gap-3 rounded-2xl border border-loam-200 bg-[#fffdf7] px-4 py-3">
            <Trees className="h-5 w-5 shrink-0 text-leaf-700" aria-hidden />
            <Link href={`/maps/${place.id}`} className="min-w-0 flex-1 truncate font-serif text-lg leading-tight text-loam-900 hover:text-prune-700">
              {place.name}
            </Link>
            {(place.lead || place.crew.length > 0) && <Faces lead={place.lead} crew={place.crew} size="sm" />}
            <button
              type="button"
              onClick={() => setEditing(place.id)}
              aria-label={t('team_board.places.settings', { name: place.name })}
              className="rounded-full p-1 text-loam-500 hover:bg-loam-100 hover:text-loam-800"
            >
              <Settings2 className="h-5 w-5" />
            </button>
          </li>
        ))}
      </ul>
      <ProjectDialog project={editingNow} onClose={() => setEditing(null)} />
    </BoardSection>
  )
}
