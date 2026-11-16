// The screenshot of « Un retour ? »: the page as the person sees it, map
// included (MapView keeps its drawing buffer, so its canvas can be read),
// drawn in the browser by modern-screenshot. Nothing leaves the browser
// until the person sends their feedback.

/** Pixels on the longest side of the image that is sent: sharp enough to read a label, light to send. */
const MAX_SIDE = 2400
/** Above this many pixels, browsers (Safari first) refuse to draw a canvas. */
const MAX_PIXELS = 16_000_000

export type Capture = {
  /** The page, as an image URL (object URL of a PNG). */
  url: string
  width: number
  height: number
  /** The part that was on screen, in image pixels: the crop it starts with. */
  visible: Rect
}

/** Inks that stand out on Terranova's paper and on a map (the sketch tool's). */
export const FEEDBACK_INKS = ['#d64545', '#ef9b0d', '#ffd43b', '#2a6fdb', '#5b5781', '#1b1712']
/** The one ink a white check mark would vanish on. */
export const LIGHT_INK = '#ffd43b'

export type Rect = { x: number; y: number; w: number; h: number }
export type Stroke = { color: string; width: number; points: [number, number][] }

/**
 * Draws the page, up to the bottom of the screen, leaving out `exclude`
 * (the feedback dialog itself).
 */
export async function capturePage(exclude: Element | null): Promise<Capture> {
  const { domToBlob } = await import('modern-screenshot')
  const root = document.documentElement
  const width = root.clientWidth
  const height = Math.min(Math.max(root.scrollHeight, window.innerHeight), window.scrollY + window.innerHeight)
  let scale = Math.min(window.devicePixelRatio || 1, 2)
  while (width * height * scale * scale > MAX_PIXELS && scale > 0.5) scale -= 0.25
  const blob = await domToBlob(document.body, {
    width,
    height,
    scale,
    type: 'image/png',
    backgroundColor: getComputedStyle(document.body).backgroundColor || '#ffffff',
    timeout: 15_000,
    filter: (node) => !(exclude && node instanceof Element && (node === exclude || exclude.contains(node))),
    // An image that cannot be read (another origin without CORS) is left blank, not fatal.
    fetch: { placeholderImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=' },
  })
  const url = URL.createObjectURL(blob)
  const image = await loadImage(url)
  const ratio = image.naturalWidth / width
  return {
    url,
    width: image.naturalWidth,
    height: image.naturalHeight,
    visible: { x: 0, y: Math.round(window.scrollY * ratio), w: image.naturalWidth, h: Math.round(Math.min(window.innerHeight * ratio, image.naturalHeight - window.scrollY * ratio)) },
  }
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('image'))
    image.src = url
  })
}

/** The path of a hand-drawn line through its points, smoothed through their midpoints. */
export function tracePath(context: CanvasRenderingContext2D | Path2D, points: [number, number][]) {
  if (points.length === 0) return
  const [first, ...rest] = points
  context.moveTo(first[0], first[1])
  if (rest.length === 0) {
    context.lineTo(first[0] + 0.01, first[1])
    return
  }
  for (let i = 0; i < rest.length - 1; i++) {
    const [x, y] = rest[i]
    const [nx, ny] = rest[i + 1]
    context.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2)
  }
  const last = rest[rest.length - 1]
  context.lineTo(last[0], last[1])
}

/** The SVG path of the same line, for the live drawing. */
export function svgPath(points: [number, number][]): string {
  if (points.length === 0) return ''
  const [first, ...rest] = points
  if (rest.length === 0) return `M${first[0]},${first[1]} l0.01,0`
  let d = `M${first[0]},${first[1]}`
  for (let i = 0; i < rest.length - 1; i++) {
    const [x, y] = rest[i]
    const [nx, ny] = rest[i + 1]
    d += ` Q${x},${y} ${(x + nx) / 2},${(y + ny) / 2}`
  }
  const last = rest[rest.length - 1]
  return `${d} L${last[0]},${last[1]}`
}

/**
 * The image that is sent: the cropped part of the capture with the strokes
 * on it, as a JPEG no larger than MAX_SIDE on its longest side.
 */
export async function flatten(capture: Capture, crop: Rect, strokes: Stroke[]): Promise<Blob> {
  const image = await loadImage(capture.url)
  const scale = Math.min(1, MAX_SIDE / Math.max(crop.w, crop.h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(crop.w * scale))
  canvas.height = Math.max(1, Math.round(crop.h * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('canvas')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.scale(scale, scale)
  context.drawImage(image, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h)
  context.translate(-crop.x, -crop.y)
  context.lineCap = 'round'
  context.lineJoin = 'round'
  for (const stroke of strokes) {
    // A light halo under each line, so it reads on any background.
    for (const [color, extra] of [['rgba(255, 255, 255, 0.75)', stroke.width * 0.8], [stroke.color, 0]] as const) {
      context.beginPath()
      tracePath(context, stroke.points)
      context.strokeStyle = color
      context.lineWidth = stroke.width + extra
      context.stroke()
    }
  }
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('blob'))), 'image/jpeg', 0.88))
}

/** What the browser says of itself, sent with the feedback (FeedbackContext on the server). */
export function browserContext(): Record<string, string> {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  return {
    user_agent: nav.userAgent,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    screen: `${window.screen.width}×${window.screen.height}`,
    pixel_ratio: String(window.devicePixelRatio || 1),
    language: nav.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    platform: nav.userAgentData?.platform || nav.platform || '',
  }
}
