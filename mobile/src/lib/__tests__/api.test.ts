const mockUpload = jest.fn()
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri: string) => ({ uri, upload: mockUpload })),
  UploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
}))
jest.mock('../auth', () => ({ accessToken: jest.fn().mockResolvedValue('token-1') }))
jest.mock('../config', () => ({ API_URL: 'https://terranova.test' }))

import { ApiError, UPLOAD_IDLE_MS, api, form } from '../api'

describe('uploads from the phone', () => {
  beforeEach(() => mockUpload.mockReset())

  it('builds a Rails form with one file and string fields', () => {
    expect(form('photo', { image: { uri: 'file:///a/photo.jpg', name: 'photo.jpg', type: 'image/jpeg' }, lat: 50.3, caption: null })).toEqual({
      fields: { 'photo[lat]': '50.3' },
      file: { key: 'photo[image]', uri: 'file:///a/photo.jpg', type: 'image/jpeg' },
    })
  })

  // Expo's fetch refuses React Native's { uri } form parts (« Unsupported
  // FormDataPart implementation »): the file goes from the disk instead.
  it('sends the file from the disk, with the token and the idempotency key', async () => {
    mockUpload.mockResolvedValue({ status: 201, body: '{"id":7}', headers: {} })
    const answer = await api('POST', '/maps/1/photos', form('photo', { image: { uri: 'file:///a/photo.jpg', name: 'photo.jpg', type: 'image/jpeg' }, source: 'phone' }), { idempotencyKey: 'k1' })
    expect(answer).toEqual({ id: 7 })
    expect(mockUpload).toHaveBeenCalledWith('https://terranova.test/maps/1/photos', expect.objectContaining({
      httpMethod: 'POST', uploadType: 1, fieldName: 'photo[image]', mimeType: 'image/jpeg',
      parameters: { 'photo[source]': 'phone' },
      headers: { Accept: 'application/json', Authorization: 'Bearer token-1', 'Idempotency-Key': 'k1' },
    }))
  })

  it('reads a refusal like any other answer', async () => {
    mockUpload.mockResolvedValue({ status: 422, body: '{"message":"Trop lourde"}', headers: {} })
    await expect(api('POST', '/maps/1/photos', form('photo', { image: { uri: 'file:///a/b.jpg', name: 'b.jpg', type: 'image/jpeg' } })))
      .rejects.toEqual(new ApiError(422, { message: 'Trop lourde' }))
  })

  it('treats a failed upload as no network, to try again later', async () => {
    mockUpload.mockRejectedValue(new Error('The Internet connection appears to be offline.'))
    const error = await api<ApiError>('POST', '/maps/1/photos', form('photo', { image: { uri: 'file:///a/b.jpg', name: 'b.jpg', type: 'image/jpeg' } })).catch((e: ApiError) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.offline).toBe(true)
  })

  // iOS stalls a foreground session once the phone is in the pocket.
  it('keeps sending in the background and reports the bytes as they leave', async () => {
    const seen: number[] = []
    mockUpload.mockImplementation(async (_url: string, options: { onProgress: (p: { bytesSent: number; totalBytes: number }) => void }) => {
      options.onProgress({ bytesSent: 500, totalBytes: 1000 })
      options.onProgress({ bytesSent: 1000, totalBytes: 1000 })
      return { status: 201, body: '{}', headers: {} }
    })
    await api('POST', '/maps/1/photos', form('photo', { image: { uri: 'file:///a/b.jpg', name: 'b.jpg', type: 'image/jpeg' } }), { onProgress: (sent) => seen.push(sent) })
    expect(mockUpload).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ sessionType: 'background' }))
    expect(seen).toEqual([500, 1000])
  })

  describe('a slow upload', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    // Waits for an upload that only settles when its signal aborts.
    const hanging = () => mockUpload.mockImplementation((_url: string, options: { signal: AbortSignal; onProgress: (p: { bytesSent: number; totalBytes: number }) => void }) => {
      (mockUpload as unknown as { progress: typeof options.onProgress }).progress = options.onProgress
      return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))))
    })
    const photo = () => form('photo', { image: { uri: 'file:///a/b.jpg', name: 'b.jpg', type: 'image/jpeg' } })

    it('is never cut off while its bytes keep moving, only once they stop', async () => {
      hanging()
      let error: ApiError | null = null
      const sending = api('POST', '/maps/1/photos', photo()).catch((e: ApiError) => { error = e })
      await Promise.resolve(); await Promise.resolve()
      const progress = (mockUpload as unknown as { progress: (p: { bytesSent: number; totalBytes: number }) => void }).progress
      for (let i = 1; i <= 5; i++) {
        jest.advanceTimersByTime(UPLOAD_IDLE_MS - 1_000)
        progress({ bytesSent: i * 100, totalBytes: 1000 })
      }
      await Promise.resolve()
      expect(error).toBeNull()
      jest.advanceTimersByTime(UPLOAD_IDLE_MS)
      await sending
      expect(error).toBeInstanceOf(ApiError)
      expect(error!.message).toBe('timeout')
    })

    it('stops when asked from outside', async () => {
      hanging()
      const controller = new AbortController()
      const sending = api('POST', '/maps/1/photos', photo(), { signal: controller.signal }).catch((e: ApiError) => e)
      await Promise.resolve(); await Promise.resolve()
      controller.abort()
      expect(((await sending) as ApiError).offline).toBe(true)
    })
  })
})
