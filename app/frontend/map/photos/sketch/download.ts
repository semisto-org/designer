import { renderSketchPng } from '@/map/photos/sketch/marks'
import type { SketchMark } from '@/types/soil_photos'

/** Saves the photo with its sketch as a PNG file. */
export async function downloadSketch(imageUrl: string, marks: SketchMark[], filename: string) {
  const blob = await renderSketchPng(imageUrl, marks)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.replace(/[\\/:*?"<>|]+/g, '-')
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
