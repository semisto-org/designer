/**
 * A short white flash over the whole screen, as a camera gives when a view
 * is captured for a step: the gesture reads as taking a photo. Skipped for
 * people who ask for reduced motion.
 */
export function cameraFlash() {
  if (typeof document === 'undefined') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const flash = document.createElement('div')
  flash.setAttribute('aria-hidden', 'true')
  flash.className = 'camera-flash'
  flash.addEventListener('animationend', () => flash.remove(), { once: true })
  document.body.appendChild(flash)
  // In case the animation never runs (a hidden tab), it still goes.
  window.setTimeout(() => flash.remove(), 1000)
}
