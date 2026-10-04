import { exifDate, exifPosition } from '../exif'

describe('exif', () => {
  it('reads iOS nested GPS with its hemispheres', () => {
    expect(exifPosition({ '{GPS}': { Latitude: 50.32, LatitudeRef: 'N', Longitude: 4.95, LongitudeRef: 'E' } })).toEqual([4.95, 50.32])
    expect(exifPosition({ '{GPS}': { Latitude: 33.9, LatitudeRef: 'S', Longitude: 18.4, LongitudeRef: 'W' } })).toEqual([-18.4, -33.9])
  })

  it('reads Android flat GPS keys and ignores empty positions', () => {
    expect(exifPosition({ GPSLatitude: 50.32, GPSLongitude: 4.95 })).toEqual([4.95, 50.32])
    expect(exifPosition({ GPSLatitude: 0, GPSLongitude: 0 })).toBeNull()
    expect(exifPosition(null)).toBeNull()
  })

  it('reads the shooting date as local time', () => {
    const iso = exifDate({ '{Exif}': { DateTimeOriginal: '2026:05:12 14:03:09' } })
    expect(iso).toBe(new Date(2026, 4, 12, 14, 3, 9).toISOString())
    expect(exifDate({ DateTimeOriginal: 'garbage' })).toBeNull()
  })
})
