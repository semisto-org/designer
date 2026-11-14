import { cameraPadding, floatingPanel, layoutFor, WIDE } from '../layout'

describe('layoutFor', () => {
  it('keeps the bottom sheet on a phone, in portrait', () => {
    expect(layoutFor(393)).toEqual({ wide: false, panel: 393 })
    expect(floatingPanel(layoutFor(393))).toBeNull()
    expect(cameraPadding(layoutFor(393), 360)).toEqual({ top: 120, bottom: 360, left: 0, right: 0 })
  })

  it('puts the notebook beside the map on an iPad, in both orientations', () => {
    const portrait = layoutFor(834)
    const landscape = layoutFor(1194)
    expect(portrait.wide).toBe(true)
    expect(landscape.wide).toBe(true)
    expect(portrait.panel).toBe(360)
    expect(landscape.panel).toBe(430)
    // The camera keeps the column clear, not the bottom of the screen.
    expect(cameraPadding(landscape, 360).left).toBeGreaterThan(landscape.panel)
    expect(cameraPadding(landscape, 360).bottom).toBeLessThan(360)
  })

  it('never makes the column wider than 440 points', () => {
    expect(layoutFor(1366).panel).toBe(440)
    expect(layoutFor(WIDE).wide).toBe(true)
    expect(layoutFor(WIDE - 1).wide).toBe(false)
  })
})
