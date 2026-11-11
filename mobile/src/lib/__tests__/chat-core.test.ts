import {
  chatFeatureLabel, citedIds, continues, documentPath, fileSize, showsAsPicture, insertToken, matchCitables, matchMembers, pinnedHere, removeMessage, tokenizeChat, typedQuery,
  unreadSince, upsertMessage, type ChatMessage,
} from '../chat-core'

const message = (id: number, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id, body: `Message ${id}`, author: { id: 1, name: 'Lucie', avatarUrl: null }, createdAt: `2026-11-02T10:0${id}:00Z`, editedAt: null,
  mentions: [], applause: { count: 0, mine: false, names: [] }, features: [], location: null, photo: null, canEdit: false, canDelete: false, ...extra,
})

describe('the list of messages', () => {
  it('stays oldest first as messages arrive or change', () => {
    const list = upsertMessage(upsertMessage([message(2)], message(1)), message(3))
    expect(list.map((m) => m.id)).toEqual([1, 2, 3])
    expect(upsertMessage(list, message(2, { body: 'Corrigé' })).map((m) => m.body)).toEqual(['Message 1', 'Corrigé', 'Message 3'])
    expect(removeMessage(list, 2).map((m) => m.id)).toEqual([1, 3])
  })

  it('counts as unread what others said after the last read', () => {
    const list = [message(1), message(2, { canEdit: true }), message(3)]
    expect(unreadSince(list, null)).toBe(2)
    expect(unreadSince(list, '2026-11-02T10:02:00Z')).toBe(1)
  })

  it('groups a person\'s messages within five minutes', () => {
    expect(continues(message(1), message(2))).toBe(true)
    expect(continues(message(1), message(2, { author: { id: 2, name: 'Paul', avatarUrl: null } }))).toBe(false)
    expect(continues(message(1), message(2, { createdAt: '2026-11-02T11:00:00Z' }))).toBe(false)
  })
})

describe('typing « # » and « @ »', () => {
  it('finds what is being typed right before the cursor', () => {
    expect(typedQuery('Regarde #noy', 12)).toEqual({ sign: '#', start: 8, query: 'noy' })
    expect(typedQuery('Salut @Mi', 9)).toEqual({ sign: '@', start: 6, query: 'Mi' })
    expect(typedQuery('mail@exemple', 12)).toBeNull()
    expect(typedQuery('Rien', 4)).toBeNull()
  })

  it('puts the chosen token in place, followed by a space', () => {
    expect(insertToken('Regarde #noy là', { start: 8, query: 'noy' }, '#Noyer n° 3')).toEqual({ text: 'Regarde #Noyer n° 3 là', cursor: 20 })
  })

  it('offers the elements around oneself first', () => {
    const items = [{ id: 1, label: 'Noyer', layer: 'plants', meters: 40 }, { id: 2, label: 'Mare', layer: 'water', meters: 3 }, { id: 3, label: 'Noisetier', layer: 'plants', meters: 8 }]
    expect(matchCitables(items, '').map((i) => i.id)).toEqual([2, 3, 1])
    expect(matchCitables(items, 'no').map((i) => i.id)).toEqual([3, 1])
  })

  it('finds people by handle or first name', () => {
    const people = [{ id: 1, name: 'Lucie Martin', handle: 'Lucie', avatarUrl: null }, { id: 2, name: 'Paul', handle: 'Paul', avatarUrl: null }]
    expect(matchMembers(people, 'mar').map((p) => p.id)).toEqual([1])
    expect(matchMembers(people, '').map((p) => p.id)).toEqual([1, 2])
  })

  it('names an element like the server does, and keeps only the citations still in the text', () => {
    expect(chatFeatureLabel({ name: 'Noyer', number: 3 }, 'Arbre')).toBe('Noyer n° 3')
    expect(chatFeatureLabel({ name: null }, 'Mare')).toBe('Mare')
    const cited = new Map([[1, 'Noyer n° 3'], [2, 'Mare']])
    expect(citedIds('La #Mare déborde vers #Noyer n° 3', cited)).toEqual([2, 1])
    expect(citedIds('Plus rien', cited)).toEqual([])
  })
})

describe('reading a message back', () => {
  it('splits text, mentions, cited elements and links', () => {
    const tokens = tokenizeChat('@Paul regarde #Noyer n° 3 : https://semisto.org.', ['Paul'], [{ id: 5, name: 'Noyer n° 3' }])
    expect(tokens).toEqual([
      { kind: 'mention', value: '@Paul' }, { kind: 'text', value: ' regarde ' }, { kind: 'feature', value: '#Noyer n° 3', id: 5 },
      { kind: 'text', value: ' : ' }, { kind: 'link', value: 'https://semisto.org' }, { kind: 'text', value: '.' },
    ])
  })
})

describe('what was said where one stands', () => {
  it('keeps the pinned messages close by, nearest first', () => {
    const list = [message(1, { location: [4.9501, 50.32] }), message(2, { location: [4.95, 50.32] }), message(3, { location: [4.96, 50.32] }), message(4)]
    expect(pinnedHere(list, [4.95, 50.32]).map((m) => m.message.id)).toEqual([2, 1])
  })
})

describe('a file joined to a message', () => {
  test('a picture the server scales shows as itself, anything else as a card', () => {
    expect(showsAsPicture({ kind: 'image', previewUrl: '/maps/2/documents/502/file?size=large' })).toBe(true)
    expect(showsAsPicture({ kind: 'image', previewUrl: null })).toBe(false) // HEIC, TIFF: no preview
    expect(showsAsPicture({ kind: 'pdf', previewUrl: '/maps/2/documents/9/file?size=original' })).toBe(false)
  })

  test('its path at each size', () => {
    expect(documentPath(2, 502, 'thumb')).toBe('/maps/2/documents/502/file?size=thumb')
  })

  test('its weight, in French', () => {
    expect(fileSize(null)).toBeNull()
    expect(fileSize(340_200)).toBe('340 ko')
    expect(fileSize(1_234_567)).toBe('1,2 Mo')
  })
})
