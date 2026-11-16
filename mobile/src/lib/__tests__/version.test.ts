import { versionLabel } from '../version'

describe('versionLabel', () => {
  it('names the version, the build and the date of the code', () => {
    expect(versionLabel({ version: '1.0.0', build: '14', createdAt: new Date('2026-11-14T08:50:00Z') }))
      .toBe('Version 1.0.0 (build 14) · mise à jour du 14 novembre 2026')
  })

  it('leaves the date out when it is unknown', () => {
    expect(versionLabel({ version: '1.0.0', build: null, createdAt: null })).toBe('Version 1.0.0 (build ?)')
  })
})
