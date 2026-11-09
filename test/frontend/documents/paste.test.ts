import { test } from 'node:test'
import assert from 'node:assert/strict'
import { looksLikeMarkdown, textToHtml } from '../../../app/frontend/documents/markdown/paste.ts'
import { slideDensity, slideMarkdown, splitByHeadings } from '../../../app/frontend/map/presentation/slideMarkdown.ts'

// Text as a PDF reader copies it: each bullet alone on its line, the items
// below it, long lines wrapped where the page ended.
const PDF = `Raison d’être du projet :
Une belle œuvre, soutenant un jardin habité et vivant, participant au maillage global

Sol :
PH Sol et apport de nutriments :
-

Apport fumier bien décomposé, cendre (ferme en face ou local)
Production biomasse pour augmentation humus sol (au niveau du terrain en lui-même)
Plantation en inter rang et inter fruitiers :
1) arbustes pionniers sacrificiels pour biomasse
2) strates basses pour apport de potassium remontant ces éléments (consoude..)

Stocker
-

création de plusieurs mares de stockage d’eau de pluie sur parcelle verger et sur la prairie
voisine (pour enrichissement du micro climat, de la biodiversité, du stockage d’eau)
mare en point bas dans le verger (naturelle éventuellement)
`

test('a PDF pasted as plain text gets its titles, lists and numbered points back', () => {
  const html = textToHtml(PDF)!
  assert.match(html, /^<h3>Raison d’être du projet<\/h3><p>Une belle œuvre/)
  assert.match(html, /<h3>Sol<\/h3><h3>PH Sol et apport de nutriments<\/h3><ul><li><p>Apport fumier/)
  assert.match(html, /<li><p>Plantation en inter rang et inter fruitiers :<\/p><ol><li><p>arbustes pionniers sacrificiels pour biomasse<\/p><\/li><li><p>strates basses/)
  // The wrapped line joins its item; the next short one starts a new item.
  assert.match(html, /<li><p>création de plusieurs mares de stockage d’eau de pluie sur parcelle verger et sur la prairie voisine \(pour enrichissement du micro climat, de la biodiversité, du stockage d’eau\)<\/p><\/li><li><p>mare en point bas/)
})

test('typed bullets and numbers become lists, « o » a sub-item', () => {
  const html = textToHtml('Phasage :\n- soin des arbres existants\n- plantations\no strates hautes\n\n1. Cogestion avec Semisto\n2. Les voisins proches')!
  assert.equal(html, '<h3>Phasage</h3><ul><li><p>soin des arbres existants</p></li><li><p>plantations</p><ul><li><p>strates hautes</p></li></ul></li></ul>'
    + '<ol><li><p>Cogestion avec Semisto</p></li><li><p>Les voisins proches</p></li></ol>')
})

test('Symbol-font bullets read out of a PDF are bullets too', () => {
  assert.equal(textToHtml(' Partenariat avec l’école horticole\nAutre à identifier'),
    '<ul><li><p>Partenariat avec l’école horticole</p></li><li><p>Autre à identifier</p></li></ul>')
})

test('tab-separated rows from a spreadsheet make a table, the first row its header', () => {
  assert.equal(textToHtml('Besoins\tFonctions\nBiodiversité\tSe ressourcer\nPartage\tSe connecter'),
    '<table><tbody><tr><th><p>Besoins</p></th><th><p>Fonctions</p></th></tr><tr><td><p>Biodiversité</p></td><td><p>Se ressourcer</p></td></tr>'
    + '<tr><td><p>Partage</p></td><td><p>Se connecter</p></td></tr></tbody></table>')
})

test('one line is left to the editor, and text is escaped', () => {
  assert.equal(textToHtml('Une seule ligne'), null)
  assert.equal(textToHtml('a < b\net c > d'), '<p>a &lt; b</p><p>et c &gt; d</p>')
})

test('Markdown is recognised by its titles, tables and bold', () => {
  assert.equal(looksLikeMarkdown('## Défis\n\n| Défis | Atouts |\n| --- | --- |\n| Sol | Accès |'), true)
  assert.equal(looksLikeMarkdown('Sol :\n- Stop aux engins lourds'), false)
})

test('an old slide keeps one paragraph per line, Markdown stays as it is', () => {
  assert.equal(slideMarkdown('Un jardin habité.\nParticipant au maillage.\n• Biodiversité\n• Partage'),
    'Un jardin habité.\n\nParticipant au maillage.\n- Biodiversité\n- Partage')
  const markdown = '### Pour vous\n\n| Besoins | Fonctions |\n| --- | --- |\n| Partage | Se connecter |\n\n- **Sol** : stop aux engins\n  suite'
  assert.equal(slideMarkdown(markdown), markdown)
})

test('a slide is sized by how much it says', () => {
  assert.equal(slideDensity('Un jardin habité et vivant.'), 'short')
  assert.equal(slideDensity(PDF), 'medium')
  assert.equal(slideDensity(PDF.repeat(3)), 'long')
})

test('a long text is cut at its titles of the highest level', () => {
  const split = splitByHeadings('Intro du lieu.\n\n## Sol :\n- Stop aux engins\n### Détail\n\n## Gestion de l’eau\nDrainer')
  assert.deepEqual(split, {
    lead: 'Intro du lieu.',
    sections: [{ title: 'Sol', body: '- Stop aux engins\n### Détail' }, { title: 'Gestion de l’eau', body: 'Drainer' }],
  })
  assert.deepEqual(splitByHeadings('Rien à couper').sections, [])
})
