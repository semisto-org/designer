import { pickFeatureId } from '../pick'

describe('pickFeatureId', () => {
  it('prefers the plant over the zone around it', () => {
    const zone = { geometry: { type: 'Polygon' }, properties: { fid: 3 } }
    const tree = { geometry: { type: 'Point' }, properties: { fid: 579 } }
    expect(pickFeatureId([zone, tree])).toBe(579)
  })

  it('reads ids sent as text and ignores features without one', () => {
    expect(pickFeatureId([{ geometry: { type: 'LineString' }, properties: { fid: '12' } }, { geometry: { type: 'Point' }, properties: {} }])).toBe(12)
    expect(pickFeatureId([])).toBeNull()
    expect(pickFeatureId(undefined)).toBeNull()
  })

  it('keeps a feature drawn offline (negative id)', () => {
    expect(pickFeatureId([{ geometry: { type: 'Point' }, properties: { fid: -2 } }])).toBe(-2)
  })
})
