import { abundanceForCover, COVERS, coverPercent, inPalette, nextOrgan, surveyReading } from '../survey'

describe('cover', () => {
  it('maps a cover to the same abundance as the server', () => {
    expect([0, 4, 5, 24, 25, 49, 50, 100].map(abundanceForCover))
      .toEqual(['rare', 'rare', 'present', 'present', 'frequent', 'frequent', 'dominant', 'dominant'])
  })

  it('sends each class midpoint, which falls in the right abundance', () => {
    expect(COVERS.map((c) => abundanceForCover(c.percent))).toEqual(['rare', 'present', 'frequent', 'dominant', 'dominant'])
    expect(coverPercent('to_50')).toBe(37)
  })
})

describe('nextOrgan', () => {
  it('cycles through the organs and comes back to « auto »', () => {
    expect(nextOrgan('auto')).toBe('leaf')
    expect(nextOrgan('habit')).toBe('auto')
  })
})

describe('surveyReading', () => {
  const nettle = { name: 'Ortie', coverPercent: 37, indicates: ['nitrogen', 'moist'], unverified: [] }
  const plantain = { name: 'Plantain', coverPercent: 15, indicates: ['compaction', 'trampled'], unverified: ['compaction'] }
  const grass = { name: 'Graminée', coverPercent: 37, indicates: [], unverified: [] }

  it('says nothing before a plant is noted', () => {
    expect(surveyReading([])).toEqual([])
  })

  it('weights each indicator by the cover of the plants that show it, strongest first', () => {
    const reading = surveyReading([plantain, nettle])
    expect(reading.map((l) => l.key)).toEqual(['moist', 'nitrogen', 'compaction', 'trampled'])
    expect(reading[0]).toEqual({ key: 'moist', share: 71, plants: ['Ortie'], unverified: false })
  })

  it('counts plants outside the list in the total cover', () => {
    expect(surveyReading([nettle, grass])[0].share).toBe(50)
  })

  it('adds up two plants that say the same, verified when one of them is', () => {
    const rumex = { name: 'Rumex', coverPercent: 15, indicates: ['compaction'], unverified: [] }
    const compaction = surveyReading([plantain, rumex]).find((l) => l.key === 'compaction')!
    expect(compaction).toEqual({ key: 'compaction', share: 100, plants: ['Plantain', 'Rumex'], unverified: false })
    expect(surveyReading([plantain]).find((l) => l.key === 'compaction')!.unverified).toBe(true)
  })
})

describe('inPalette', () => {
  it('knows a species of the palette, and nothing without a species', () => {
    const palette = [{ speciesId: 4 }, { speciesId: 9 }]
    expect(inPalette(9, palette)).toBe(true)
    expect(inPalette(5, palette)).toBe(false)
    expect(inPalette(null, palette)).toBe(false)
    expect(inPalette(4, undefined)).toBe(false)
  })
})
