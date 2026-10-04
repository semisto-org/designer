// The lite build of exifr (JPEG, HEIC, TIFF: EXIF and GPS) has no typings of its own.
declare module 'exifr/dist/lite.esm.mjs' {
  export { parse, gps } from 'exifr'
}
