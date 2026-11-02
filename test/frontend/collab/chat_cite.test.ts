import assert from 'node:assert/strict'
import test from 'node:test'
import { chatFeatureLabel, citedIds, citeQuery, matchCitables, tokenizeChat } from '../../../app/frontend/collab/chat/cite.ts'

test('an element is named by its name, else its kind, with a plant number', () => {
  assert.equal(chatFeatureLabel({ name: 'Mare du bas' }, 'Mare'), 'Mare du bas')
  assert.equal(chatFeatureLabel({ name: '  ' }, 'Arbre'), 'Arbre')
  assert.equal(chatFeatureLabel({ name: null, number: 12 }, 'Arbre'), 'Arbre n° 12')
  assert.equal(chatFeatureLabel({ name: 'Pommier', number: '7' }, 'Arbre'), 'Pommier n° 7')
})

test('« # » opens the element picker, up to three words', () => {
  assert.deepEqual(citeQuery('Regarde #mar', 12), { start: 8, query: 'mar' })
  assert.deepEqual(citeQuery('#', 1), { start: 0, query: '' })
  assert.deepEqual(citeQuery('vers #mare du', 13), { start: 5, query: 'mare du' })
  assert.equal(citeQuery('n#3', 3), null, 'inside a word')
  assert.equal(citeQuery('Regarde mar', 11), null)
})

test('elements are matched by any word, accents ignored, best first', () => {
  const items = [
    { id: 1, label: 'Mare du bas', layer: 'water' },
    { id: 2, label: 'Haie fruitière', layer: 'plants' },
    { id: 3, label: 'Grande mare', layer: 'water' },
  ]
  assert.deepEqual(matchCitables(items, 'mar').map((i) => i.id), [1, 3])
  assert.deepEqual(matchCitables(items, 'fruitiere').map((i) => i.id), [2])
  assert.equal(matchCitables(items, '').length, 3)
})

test('only the elements still written in the text are sent, in their order', () => {
  const cited = new Map([[1, 'Mare du bas'], [2, 'Haie']])
  assert.deepEqual(citedIds('La #Haie puis la #Mare du bas', cited), [2, 1])
  assert.deepEqual(citedIds('La Haie', cited), [])
})

test('a message splits into text, mentions, cited elements and links', () => {
  const tokens = tokenizeChat('@Alice vois #Mare du bas https://x.org.', ['Alice'], [{ id: 4, name: 'Mare du bas' }])
  assert.deepEqual(tokens, [
    { kind: 'mention', value: '@Alice' },
    { kind: 'text', value: ' vois ' },
    { kind: 'feature', value: '#Mare du bas', id: 4 },
    { kind: 'text', value: ' ' },
    { kind: 'link', value: 'https://x.org' },
    { kind: 'text', value: '.' },
  ])
  assert.deepEqual(tokenizeChat('<b>#rien</b>', [], []), [{ kind: 'text', value: '<b>#rien</b>' }])
})
