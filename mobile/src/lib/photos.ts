// Photos taken on the terrain: always JPEG (the server refuses HEIC), at
// most 2560 px wide, with the phone's position at the moment of the shot.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import { exifDate, exifPosition } from './exif'
import { currentPosition } from './location'
import { keepPhoto } from './storage'
import type { Position } from './types'

const MAX_WIDTH = 2560

export type TakenPhoto = { file: string; position: Position | null; takenAt: string }

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
