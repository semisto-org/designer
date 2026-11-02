import { useCallback, useMemo, useState } from 'react'
import type { TeamNote, TeamNotesPayload } from '@/types/journey'

export type TeamNotesApi = {
  endpoint: string
  canEdit: boolean
  /** The team's name on a team map, null for a pro's own map. */
  teamName: string | null
  notes: Record<string, TeamNote>
  /** Keeps a section's saved note (null: removed), so it survives moving between sections. */
  setNote: (section: string, note: TeamNote | null) => void
}

/**
 * The internal notes of the sheet, one per section, for the map's team or
 * its pro owner. Null for anyone else: the server does not even send them.
 */
export function useTeamNotes(mapId: number, initial: TeamNotesPayload | null | undefined): TeamNotesApi | null {
  const [notes, setNotes] = useState<Record<string, TeamNote>>(initial?.notes ?? {})
  const setNote = useCallback((section: string, note: TeamNote | null) => {
    setNotes((current) => {
      const next = { ...current }
      if (note) next[section] = note
      else delete next[section]
      return next
    })
  }, [])
  return useMemo(() => initial ? {
    endpoint: `/maps/${mapId}/project/notes`, canEdit: initial.canEdit, teamName: initial.teamName, notes, setNote,
  } : null, [initial, mapId, notes, setNote])
}
