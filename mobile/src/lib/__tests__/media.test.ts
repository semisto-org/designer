import { isVideo, mediaFile, videoExtension } from '../media'

describe('media files', () => {
  it('tells videos from photos by their name', () => {
    expect(isVideo('file:///designer/photos/1-a.mov')).toBe(true)
    expect(isVideo('file:///designer/photos/1-a.MP4')).toBe(true)
    expect(isVideo('file:///designer/photos/1-a.jpg')).toBe(false)
  })

  it('keeps the extension a video was recorded with, MP4 by default', () => {
    expect(videoExtension('file:///cache/IMG_0042.MOV')).toBe('mov')
    expect(videoExtension('file:///cache/clip.m4v')).toBe('mp4')
    expect(videoExtension('content://media/external/video/12')).toBe('mp4')
  })

  it('sends a video with its own type, a photo as JPEG', () => {
    expect(mediaFile('file:///p/1.mov')).toEqual({ uri: 'file:///p/1.mov', name: 'video.mov', type: 'video/quicktime' })
    expect(mediaFile('file:///p/1.webm').type).toBe('video/webm')
    expect(mediaFile('file:///p/1.jpg')).toEqual({ uri: 'file:///p/1.jpg', name: 'photo.jpg', type: 'image/jpeg' })
  })
})
