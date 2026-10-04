// Everything the app keeps on the phone, as JSON files under the app's
// documents folder: the map list, one bundle per downloaded map, the
// outbox of changes not yet sent, and photos waiting to be uploaded.
import { Directory, File, Paths } from 'expo-file-system'

const root = () => {
  const dir = new Directory(Paths.document, 'designer')
  if (!dir.exists) dir.create({ intermediates: true })
  return dir
}

export function readJson<T>(name: string): T | null {
  const file = new File(root(), name)
  if (!file.exists) return null
  try {
    return JSON.parse(file.textSync()) as T
  } catch {
    return null
  }
}

export function writeJson(name: string, value: unknown): void {
  const file = new File(root(), name)
  // Write then swap, so a crash mid-write never leaves half a file.
  const tmp = new File(root(), `${name}.tmp`)
  if (tmp.exists) tmp.delete()
  tmp.create()
  tmp.write(JSON.stringify(value))
  if (file.exists) file.delete()
  tmp.moveSync(file)
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

export function deletePhoto(uri: string): void {
  const file = new File(uri)
  if (file.exists) file.delete()
}
