import { renderSketchJpeg } from '@/map/photos/sketch/marks'
import type { SketchMark } from '@/types/soil_photos'

/** Saves the photo with its sketch as a JPEG file named after `name`. */
export async function downloadSketch(imageUrl: string, marks: SketchMark[], name: string) {
  const blob = await renderSketchJpeg(imageUrl, marks)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${name.replace(/[\\/:*?"<>|]+/g, '-')}.jpg`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
