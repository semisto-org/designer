const mockUpload = jest.fn()
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri: string) => ({ uri, upload: mockUpload })),
  UploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
}))
jest.mock('../auth', () => ({ accessToken: jest.fn().mockResolvedValue('token-1') }))
jest.mock('../config', () => ({ API_URL: 'https://terranova.test' }))

import { ApiError, api, form } from '../api'

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
})
