import { countByTheme, minutesSince, noteFeature, questionsOf, TITLE_MAX, visitNotes } from '../visit-core'
import type { MapBundle, MapFeature } from '../types'

const visit = { key: 'visit-1234abcd', startedAt: '2026-10-18T14:00:00Z' }
const note = (id: number, properties: Record<string, unknown>, name = `note ${id}`): MapFeature => ({
  type: 'Feature', id, geometry: { type: 'Point', coordinates: [4.9, 50.3] },
  properties: { id, layer: 'notes', kind: 'note_point', name, notes: null, status: 'active', lockVersion: 0, ...properties },
})
const bundle = (features: MapFeature[]) => ({ features } as MapBundle)

describe('visit notes', () => {
  it('makes a note point carrying the visit, its theme and when it was taken', () => {
    const feature = noteFeature('  Mare qui déborde  ', 'water', visit, [4.9, 50.3], '2026-10-18T14:05:00Z')
    expect(feature).toEqual({
      layer: 'notes', kind: 'note_point', name: 'Mare qui déborde', notes: null,
      properties: { visit: 'visit-1234abcd', taken_at: '2026-10-18T14:05:00Z', theme: 'water' },
      geometry: { type: 'Point', coordinates: [4.9, 50.3] },
    })
    expect(noteFeature('', null, visit, [4.9, 50.3]).properties).not.toHaveProperty('theme')
  })

  it('keeps a long note whole in its notes and a one-line title', () => {
    const long = `${'argile '.repeat(20)}\nà 20 cm`
    const feature = noteFeature(long, 'soil', visit, [4.9, 50.3])
    expect(feature.name!.length).toBe(TITLE_MAX)
    expect(feature.name!.endsWith('…')).toBe(true)
    expect(feature.notes).toBe(long.trim())
  })

  it('lists the notes of this visit only, in the order they were taken', () => {
    const notes = visitNotes(bundle([
      note(1, { visit: visit.key, taken_at: '2026-10-18T14:20:00Z' }),
      note(-1, { visit: visit.key, taken_at: '2026-10-18T14:10:00Z' }),
      note(2, { visit: 'other-visit-key', taken_at: '2026-10-18T14:00:00Z' }),
      note(3, { visit: visit.key, status: 'rejected' }),
      { ...note(4, { visit: visit.key }), properties: { ...note(4, { visit: visit.key }).properties, layer: 'plants' } },
    ]), visit.key)
    expect(notes.map((n) => n.id)).toEqual([-1, 1])
  })

  it('counts notes by theme in the report order, and finds the questions', () => {
    const notes = [note(1, { theme: 'question' }), note(2, { theme: 'water' }), note(3, {}), note(4, { theme: 'water' }), note(5, { theme: 'nonsense' })]
    expect(countByTheme(notes)).toEqual([{ theme: 'water', count: 2 }, { theme: 'question', count: 1 }, { theme: 'other', count: 2 }])
    expect(questionsOf(notes).map((n) => n.id)).toEqual([1])
  })

  it('counts the minutes of the walk', () => {
    expect(minutesSince('2026-10-18T14:00:00Z', new Date('2026-10-18T14:42:30Z'))).toBe(42)
    expect(minutesSince('2026-10-18T14:00:00Z', new Date('2026-10-18T13:00:00Z'))).toBe(0)
  })
})
