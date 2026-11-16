// When the 3D view draws a new image.
//
// The relief is a heavy mesh (up to 300 000 vertices, at the screen's full
// Retina resolution). Drawn at every display frame it kept the GPU busy even
// with nothing moving: 120 images a second on a ProMotion screen. Chrome runs
// every tab through one GPU process, so a video call in another tab (Google
// Meet decoding, encoding and blurring on the GPU) or a screen recorder lost
// its frames, froze and announced a weak connection.
//
// So the view draws only when something changed (`invalidate`) or keeps
// moving (`draw` returns true: damped camera, walk, rain, Niva, cold mist),
// at most 60 times a second, and never while the tab is hidden.

export type FrameClock = {
  request(callback: (now: number) => void): number
  cancel(id: number): void
  hidden(): boolean
}

/** 60 images a second at most; one millisecond of slack for the display's jitter. */
export const MIN_FRAME_MS = 1000 / 60 - 1

export const browserClock: FrameClock = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (id) => cancelAnimationFrame(id),
  hidden: () => typeof document !== 'undefined' && document.hidden,
}

export class RenderLoop {
  /** Images drawn since the start (read by the opening probe and the tests). */
  frames = 0
  private draw: () => boolean
  private clock: FrameClock
  private request: number | null = null
  private dirty = true
  private last = -Infinity
  private stopped = false

  /** `draw` draws one image and says whether the scene is still moving. */
  constructor(draw: () => boolean, clock: FrameClock = browserClock) {
    this.draw = draw
    this.clock = clock
  }

  /** Something changed: draw a new image at the next display frame. */
  invalidate() {
    this.dirty = true
    this.wake()
  }

  /** The tab is visible again: draw what changed meanwhile. */
  resume() {
    if (this.dirty) this.wake()
  }

  get idle(): boolean {
    return this.request === null
  }

  stop() {
    this.stopped = true
    if (this.request !== null) this.clock.cancel(this.request)
    this.request = null
  }

  private wake() {
    if (this.request !== null || this.stopped || this.clock.hidden()) return
    this.request = this.clock.request((now) => this.tick(now))
  }

  private tick(now: number) {
    this.request = null
    if (this.stopped) return
    if (now - this.last < MIN_FRAME_MS) {
      // A 120 Hz screen: skip one display frame out of two.
      this.wake()
      return
    }
    this.last = now
    this.dirty = false
    const moving = this.draw()
    this.frames++
    // `draw` may itself have changed the scene (a simulation step).
    if (moving || this.dirty) {
      this.dirty = true
      this.wake()
    }
  }
}
