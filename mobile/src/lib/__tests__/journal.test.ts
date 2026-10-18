import { entryReady, journalOf, type JournalObservation } from '../journal'

const obs = (key: string, observedOn: string, kind: JournalObservation['kind'], extra: Partial<JournalObservation> = {}): JournalObservation =>
  ({ key, observedOn, kind, survival: null, vigor: null, note: null, ...extra })

describe("a plant's journal", () => {
  it('lays the years out newest first, with the age of the plant', () => {
    const years = journalOf({
      plantedOn: '2024-11-20',
      observations: [obs('1', '2025-04-12', 'flowering'), obs('2', '2025-06-01', 'follow_up', { survival: 'established' }), obs('3', '2026-02-10', 'pruning')],
      harvests: [],
      photos: [],
    })
    expect(years.map((y) => [y.year, y.age])).toEqual([[2026, 3], [2025, 2], [2024, 1]])
    expect(years[1].entries.map((e) => e.date)).toEqual(['2025-06-01', '2025-04-12'])
    expect(years[2].entries[0]).toMatchObject({ type: 'planted', date: '2024-11-20' })
  })

  it('marks the first fruit picked, not the fruit seen on the tree', () => {
    const years = journalOf({
      plantedOn: '2022-03-01',
      observations: [],
      harvests: [
        { key: 'a', notedOn: '2025-09-20', stage: 'picked', amount: 'normal', note: null },
        { key: 'b', notedOn: '2024-08-01', stage: 'on_tree', amount: 'light', note: null },
        { key: 'c', notedOn: '2024-09-15', stage: 'picked', amount: 'light', note: null },
      ],
      photos: [],
    })
    const harvests = years.flatMap((y) => y.entries).filter((e) => e.type === 'harvest')
    expect(harvests.map((e) => e.type === 'harvest' && [e.harvest.key, e.first])).toEqual([['a', false], ['c', true], ['b', false]])
  })

  it("groups a day's photos, and leaves out a planting date nobody knows", () => {
    const years = journalOf({
      plantedOn: '2020-01-01', precision: 'unknown',
      observations: [],
      harvests: [],
      photos: [{ id: 1, takenAt: '2026-05-03T09:00:00Z' }, { id: 2, takenAt: '2026-05-03T10:00:00Z' }, { id: 3, takenAt: null }],
    })
    expect(years).toEqual([{ year: 2026, age: null, entries: [{ type: 'photos', key: 'p2026-05-03', date: '2026-05-03', ids: [1, 2] }] }])
  })

  it('asks a take for a follow-up and words for « Autre »', () => {
    expect(entryReady('follow_up', null, '')).toBe(false)
    expect(entryReady('follow_up', 'struggling', '')).toBe(true)
    expect(entryReady('other', null, '  ')).toBe(false)
    expect(entryReady('flowering', null, '')).toBe(true)
  })
})
