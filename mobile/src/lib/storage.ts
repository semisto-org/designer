// Everything the app keeps on the phone, as JSON files under the app's
// documents folder: the map list, one bundle per downloaded map, the
// outbox of changes not yet sent, and photos waiting to be uploaded.
import { Directory, File, Paths } from 'expo-file-system'
import { relocated, videoExtension } from './media'

const root = () => {
  const dir = new Directory(Paths.document, 'designer')
  if (!dir.exists) dir.create({ intermediates: true })
  return dir
}

export function readJson<T>(name: string): T | null {
  // The file itself, else what a crash mid-write left behind (see writeJson).
  for (const candidate of [name, `${name}.tmp`, `${name}.bak`]) {
    const value = parse<T>(new File(root(), candidate))
    if (value !== null) return value
  }
  return null
}

function parse<T>(file: File): T | null {
  if (!file.exists) return null
  try {
    return JSON.parse(file.textSync()) as T
  } catch {
    return null
  }
}

/**
 * Writes the new version next to the old one, then swaps them, keeping the
 * old one aside until the swap is done: whenever the app is killed, one
 * complete version stays readable (readJson tries name, .tmp, then .bak).
 */
export function writeJson(name: string, value: unknown): void {
  const file = new File(root(), name)
  const tmp = new File(root(), `${name}.tmp`)
  const bak = new File(root(), `${name}.bak`)
  if (tmp.exists) tmp.delete()
  tmp.create()
  tmp.write(JSON.stringify(value))
  if (bak.exists) bak.delete()
  if (file.exists) file.moveSync(bak)
  tmp.moveSync(new File(root(), name))
  if (bak.exists) bak.delete()
}

export function removeFile(name: string): void {
  const file = new File(root(), name)
  if (file.exists) file.delete()
}

/** Copies a photo out of the camera cache, so it survives until uploaded. */
export function keepPhoto(uri: string): string {
  const dir = new Directory(root(), 'photos')
  if (!dir.exists) dir.create({ intermediates: true })
  const source = new File(uri)
  const target = new File(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`)
  source.copySync(target)
  return target.uri
}

/** Copies a video as it was recorded (MOV, MP4), so it survives until uploaded. */
export function keepVideo(uri: string): string {
  const dir = new Directory(root(), 'photos')
  if (!dir.exists) dir.create({ intermediates: true })
  const target = new File(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${videoExtension(uri)}`)
  new File(uri).copySync(target)
  return target.uri
}

/** The kept photo's address today (see `relocated`); null when it is gone. */
export function keptFile(uri: string): string | null {
  if (new File(uri).exists) return uri
  const moved = new File(relocated(uri, new Directory(root(), 'photos').uri))
  return moved.exists ? moved.uri : null
}

export function deletePhoto(uri: string): void {
  const kept = keptFile(uri)
  if (kept) new File(kept).delete()
}
