// The time-lapse's painted sprites: watercolour crowns seen from above, a pond,
// a meadow, the roof and a vegetable bed, cut from sheets painted with Magnific
// by script/timelapse_sprites.py. draw.ts stamps them, scaled to each tree's
// age and cross-faded with the seasons; until they load it paints its own washes.

import type { SpeciesKey } from './model.ts'

/** Side of one sprite in the atlas, in px. */
export const SPRITE = 288
const COLS = 5

/** Atlas order, as written by script/timelapse_sprites.py. */
export const SPRITES = [
  'noyer', 'noyer_autumn', 'tree_bare', 'chataignier', 'chataignier_autumn', 'aulne',
  'fruit', 'fruit_blossom', 'pommier_fruit', 'poirier_fruit', 'cerisier_fruit', 'fruit_autumn',
  'noisetier', 'noisetier_autumn', 'small_bare', 'cassis', 'cassis_fruit', 'shrub_bare',
  'pond',
] as const

export type SpriteKey = (typeof SPRITES)[number]

/** Where a sprite sits in the atlas. */
export function spriteRect(key: SpriteKey): [number, number] {
  const i = SPRITES.indexOf(key)
  return [(i % COLS) * SPRITE, Math.floor(i / COLS) * SPRITE]
}

/** Which sprites dress a species through the year. */
export type Look = { leaf: SpriteKey; autumn: SpriteKey; bare: SpriteKey; blossom?: SpriteKey; fruit?: SpriteKey }

const FRUIT_TREE = { leaf: 'fruit', autumn: 'fruit_autumn', bare: 'small_bare', blossom: 'fruit_blossom' } as const

export const LOOKS: Record<SpeciesKey, Look> = {
  noyer: { leaf: 'noyer', autumn: 'noyer_autumn', bare: 'tree_bare' },
  chataignier: { leaf: 'chataignier', autumn: 'chataignier_autumn', bare: 'tree_bare' },
  // alders stay green until their leaves drop
  aulne: { leaf: 'aulne', autumn: 'aulne', bare: 'tree_bare' },
  pommier: { ...FRUIT_TREE, fruit: 'pommier_fruit' },
  poirier: { ...FRUIT_TREE, fruit: 'poirier_fruit' },
  cerisier: { ...FRUIT_TREE, fruit: 'cerisier_fruit' },
  noisetier: { leaf: 'noisetier', autumn: 'noisetier_autumn', bare: 'small_bare' },
  cassis: { leaf: 'cassis', autumn: 'noisetier_autumn', bare: 'shrub_bare', fruit: 'cassis_fruit' },
}

export type Paint = { atlas: HTMLImageElement; meadow: HTMLImageElement; house: HTMLImageElement; bed: HTMLImageElement }
export type PaintUrls = Record<keyof Paint, string>

function image(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => img.decode().then(() => resolve(img), () => resolve(img))
    img.onerror = reject
    img.src = src
  })
}

export async function loadPaint(urls: PaintUrls): Promise<Paint> {
  const [atlas, meadow, house, bed] = await Promise.all([urls.atlas, urls.meadow, urls.house, urls.bed].map(image))
  return { atlas, meadow, house, bed }
}
