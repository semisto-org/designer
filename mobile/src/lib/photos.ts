// Photos taken on the terrain: always JPEG (the server refuses HEIC), at
// most 2560 px wide, with the phone's position at the moment of the shot.
// Videos (filmed, or chosen in the gallery) are kept as the phone recorded
// them; the server reads a gallery video's place and date from its own tags.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import { exifDate, exifPosition } from './exif'
import { currentPosition } from './location'
import { keepPhoto, keepVideo } from './storage'
import type { Position } from './types'

const MAX_WIDTH = 2560
/** Same limit as the server (MapPhoto::VIDEO_MAX_BYTES). */
export const VIDEO_MAX_BYTES = 1024 ** 3
/** A long walk around the terrain, not a film. */
const VIDEO_MAX_SECONDS = 10 * 60

export type TakenPhoto = { file: string; position: Position | null; takenAt: string }

/** A photo or a video for the map; takenAt is null when the file itself says when (a gallery video). */
export type TakenMedia = { file: string; position: Position | null; takenAt: string | null; video?: boolean }

/** Picked media, and the names of the videos left out for being too large. */
export type PickedMedia = { items: TakenMedia[]; tooLarge: string[] }

async function normalize(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  const context = ImageManipulator.manipulate(asset.uri)
  if (asset.width > MAX_WIDTH) context.resize({ width: MAX_WIDTH })
  const image = await context.renderAsync()
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.82 })
  return keepPhoto(saved.uri)
}

/** Opens the camera; null when the person cancels or refuses the camera. */
export async function takePhoto(): Promise<TakenPhoto | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync()
  if (!permission.granted) return null
  const positionPromise = currentPosition()
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9, exif: false })
  if (result.canceled || !result.assets[0]) return null
  return { file: await normalize(result.assets[0]), position: await positionPromise, takenAt: new Date().toISOString() }
}

/** Films the terrain; null when the person cancels or refuses the camera. */
export async function takeVideo(): Promise<PickedMedia | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync()
  if (!permission.granted) return null
  const positionPromise = currentPosition()
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['videos'], videoMaxDuration: VIDEO_MAX_SECONDS })
  const asset = result.canceled ? null : result.assets[0]
  if (!asset) return null
  if (tooLarge(asset)) return { items: [], tooLarge: [assetName(asset)] }
  return { items: [{ file: keepVideo(asset.uri), position: await positionPromise, takenAt: new Date().toISOString(), video: true }], tooLarge: [] }
}

/** Photos and videos from the gallery, for the map's photos. */
export async function pickMedia(limit = 20): Promise<PickedMedia> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, selectionLimit: limit, exif: true, quality: 0.9,
    // The file as recorded (iPhone: MOV), not re-encoded on the phone.
    videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
  })
  if (result.canceled) return { items: [], tooLarge: [] }
  const videos = result.assets.filter((asset) => asset.type === 'video')
  const big = videos.filter(tooLarge)
  const items = await Promise.all(result.assets.filter((asset) => !big.includes(asset)).map(async (asset): Promise<TakenMedia> => (
    asset.type === 'video'
      ? { file: keepVideo(asset.uri), position: null, takenAt: null, video: true }
      : { file: await normalize(asset), position: exifPosition(asset.exif), takenAt: exifDate(asset.exif) ?? new Date().toISOString() }
  )))
  return { items, tooLarge: big.map(assetName) }
}

function tooLarge(asset: ImagePicker.ImagePickerAsset): boolean {
  return (asset.fileSize ?? 0) > VIDEO_MAX_BYTES
}

function assetName(asset: ImagePicker.ImagePickerAsset): string {
  return asset.fileName ?? asset.uri.split('/').pop() ?? ''
}

/** Photos already taken, located from their EXIF when they have it. */
export async function pickPhotos(limit = 5): Promise<TakenPhoto[]> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: limit, exif: true, quality: 0.9 })
  if (result.canceled) return []
  return Promise.all(result.assets.map(async (asset) => ({
    file: await normalize(asset),
    position: exifPosition(asset.exif),
    takenAt: exifDate(asset.exif) ?? new Date().toISOString(),
  })))
}
