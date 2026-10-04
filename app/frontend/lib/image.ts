const MAX_SIDE = 1600
const QUALITY = 0.85

/**
 * Shrinks a photo before it is uploaded: a phone photo weighs 3 to 8 MB, and
 * an identification service only needs ~1600 px. The result is a JPEG (so
 * WebP or HEIC pictures the browser can decode are converted too) and carries
 * no EXIF data (no GPS position leaves the device). Any failure (format the
 * browser cannot decode, no canvas) hands back the original file untouched.
 */
export async function downscaleImage(file: File, maxSide = MAX_SIDE): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) {
      bitmap.close()
      return file
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY))
    if (!blob || (scale === 1 && file.type === 'image/jpeg' && blob.size >= file.size)) return file
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.jpg`, { type: 'image/jpeg' })
  } catch {
    return file
  }
}
