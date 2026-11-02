/** Images the discussion accepts, by type, or by name when the browser gives none (HEIC on some systems). */
const IMAGE_NAME = /\.(jpe?g|png|webp|gif|heic|heif)$/i

/** Whether a file is a picture the message can carry. */
export function isImage(file: { type: string; name: string }): boolean {
  return file.type ? file.type.startsWith('image/') : IMAGE_NAME.test(file.name)
}

/**
 * The picture to join from what was dropped or pasted: the first image among
 * the files, or null when there is none (text, a PDF, a video…). A message
 * carries one photo, so the others are left out.
 */
export function firstImage<T extends { type: string; name: string }>(files: ArrayLike<T> | null | undefined): T | null {
  return Array.from(files ?? []).find(isImage) ?? null
}

/** What a drop or a paste joins: its first picture as the photo, else its first file as a document. */
export function splitDrop<T extends { type: string; name: string }>(files: ArrayLike<T> | null | undefined): { photo: T | null; document: T | null } {
  const list = Array.from(files ?? [])
  const photo = list.find(isImage) ?? null
  return { photo, document: photo ? null : list[0] ?? null }
}
