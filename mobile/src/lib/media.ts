// What kind of file a photo waiting on the phone is, from its name: the
// server keeps photos as JPEG and videos as the phone recorded them.
import type { UploadFile } from './api'

const VIDEO = /\.(mov|mp4|m4v|webm)$/i
const VIDEO_TYPES: Record<string, string> = { mov: 'video/quicktime', mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm' }

export function isVideo(uri: string): boolean {
  return VIDEO.test(uri.split('?')[0])
}

/** The extension a video keeps on the phone (MP4 when the name gives none). */
export function videoExtension(uri: string): string {
  const match = uri.split('?')[0].match(VIDEO)
  const ext = match ? match[1].toLowerCase() : 'mp4'
  return ext === 'm4v' ? 'mp4' : ext
}

/**
 * Where a kept photo is now. iOS moves the app's folder to a new path when
 * the app is updated (TestFlight, store), so a full file:// address saved
 * by an earlier version points nowhere: the file is still there, under the
 * same name, in today's photos folder.
 */
export function relocated(uri: string, photosDir: string): string {
  const marker = '/designer/photos/'
  const at = uri.lastIndexOf(marker)
  if (at < 0) return uri
  return `${photosDir.replace(/\/+$/, '')}/${uri.slice(at + marker.length)}`
}

/** The multipart file for an upload: a JPEG photo, or a video with its own type. */
export function mediaFile(uri: string): UploadFile {
  if (!isVideo(uri)) return { uri, name: 'photo.jpg', type: 'image/jpeg' }
  const ext = videoExtension(uri)
  return { uri, name: `video.${ext}`, type: VIDEO_TYPES[ext] }
}
