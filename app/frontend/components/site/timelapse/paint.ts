// The time-lapse's painted sprites: watercolour crowns seen from above, a pond,
// a meadow, the roof and a vegetable bed, the understorey, the hedge, fish and
// birds, cut from sheets painted with Magnific by script/timelapse_sprites.py.
// draw.ts stamps them, scaled to each plant's age and cross-faded with the
// seasons; until they load it paints its own washes.

import type { SpeciesKey } from './model.ts'

/** Side of one sprite in the atlas, in px. */
export const SPRITE = 288
const COLS = 5
/** The understorey, hedge and animals live in a second atlas of smaller cells. */
export const SMALL_SPRITE = 160
const SMALL_COLS = 8

/** Atlas order, as written by script/timelapse_sprites.py. */
export const SPRITES = [
  'noyer', 'noyer_autumn', 'tree_bare', 'chataignier', 'chataignier_autumn', 'aulne',
  'fruit', 'fruit_blossom', 'pommier_fruit', 'poirier_fruit', 'cerisier_fruit', 'fruit_autumn',
  'noisetier', 'noisetier_autumn', 'small_bare', 'cassis', 'cassis_fruit', 'shrub_bare',
  'pond',
] as const

/** Second atlas order, as written by script/timelapse_sprites.py (SMALL_GRID). */
export const SMALL_SPRITES = [
  'groseillier', 'framboisier', 'sureau', 'groseillier_maq', 'rosier', 'argousier',
  'groseillier_fruit', 'framboisier_fruit', 'sureau_fruit', 'groseillier_maq_fruit', 'rosier_fruit', 'argousier_fruit',
  'consoude', 'rhubarbe', 'fraisier', 'melisse', 'ciboulette', 'bugle', 'fraisier_2', 'melisse_2', 'bugle_2',
  'litter_1', 'litter_2', 'litter_3', 'litter_4', 'litter_5', 'litter_6',
  'aubepine', 'prunellier', 'erable', 'cornouiller', 'houx', 'eglantier', 'aubepine_2', 'cornouiller_2', 'houx_2',
  'gardon', 'poisson_rouge',
  'hirondelle', 'merle', 'pigeon', 'buse', 'geai', 'chardonneret',
] as const

export type SpriteKey = (typeof SPRITES)[number] | (typeof SMALL_SPRITES)[number]

/** Where a sprite sits: which atlas, its corner and its side. */
export function spriteRect(key: SpriteKey): { small: boolean; x: number; y: number; side: number } {
  const big = (SPRITES as readonly string[]).indexOf(key)
  if (big >= 0) return { small: false, x: (big % COLS) * SPRITE, y: Math.floor(big / COLS) * SPRITE, side: SPRITE }
  const i = (SMALL_SPRITES as readonly string[]).indexOf(key)
  return { small: true, x: (i % SMALL_COLS) * SMALL_SPRITE, y: Math.floor(i / SMALL_COLS) * SMALL_SPRITE, side: SMALL_SPRITE }
}

/** Fallen leaves and mulch, under the ground covers in winter and before they spread. */
export const LITTER: SpriteKey[] = ['litter_1', 'litter_2', 'litter_3', 'litter_4', 'litter_5', 'litter_6']

/**
 * Which sprites dress a species through the year. `variants` are other
 * paintings of the same leafy look, picked per plant; an evergreen keeps its
 * leaves in winter.
 */
export type Look = {
  leaf: SpriteKey; autumn: SpriteKey; bare: SpriteKey; blossom?: SpriteKey; fruit?: SpriteKey
  variants?: SpriteKey[]; evergreen?: boolean
}

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
  sureau: { leaf: 'sureau', autumn: 'noisetier_autumn', bare: 'small_bare', fruit: 'sureau_fruit' },
  argousier: { leaf: 'argousier', autumn: 'argousier', bare: 'shrub_bare', fruit: 'argousier_fruit' },
  groseillier: { leaf: 'groseillier', autumn: 'noisetier_autumn', bare: 'shrub_bare', fruit: 'groseillier_fruit' },
  groseillier_maq: { leaf: 'groseillier_maq', autumn: 'noisetier_autumn', bare: 'shrub_bare', fruit: 'groseillier_maq_fruit' },
  framboisier: { leaf: 'framboisier', autumn: 'noisetier_autumn', bare: 'shrub_bare', fruit: 'framboisier_fruit' },
  rosier: { leaf: 'rosier', autumn: 'noisetier_autumn', bare: 'shrub_bare', fruit: 'rosier_fruit' },
  // the hedge: hawthorn and blackthorn flower white in spring, the holly stays green
  aubepine: { leaf: 'aubepine', autumn: 'noisetier_autumn', bare: 'shrub_bare', blossom: 'fruit_blossom', variants: ['aubepine_2'] },
  prunellier: { leaf: 'prunellier', autumn: 'prunellier', bare: 'shrub_bare', blossom: 'fruit_blossom' },
  erable: { leaf: 'erable', autumn: 'noisetier_autumn', bare: 'small_bare' },
  cornouiller: { leaf: 'cornouiller', autumn: 'chataignier_autumn', bare: 'shrub_bare', variants: ['cornouiller_2'] },
  houx: { leaf: 'houx', autumn: 'houx', bare: 'houx', evergreen: true, variants: ['houx_2'] },
  eglantier: { leaf: 'eglantier', autumn: 'noisetier_autumn', bare: 'shrub_bare' },
  // ground covers die back to their litter in winter
  consoude: { leaf: 'consoude', autumn: 'consoude', bare: 'litter_1' },
  rhubarbe: { leaf: 'rhubarbe', autumn: 'rhubarbe', bare: 'litter_2' },
  fraisier: { leaf: 'fraisier', autumn: 'fraisier', bare: 'litter_3', variants: ['fraisier_2'] },
  melisse: { leaf: 'melisse', autumn: 'melisse', bare: 'litter_4', variants: ['melisse_2'] },
  ciboulette: { leaf: 'ciboulette', autumn: 'ciboulette', bare: 'litter_5' },
  bugle: { leaf: 'bugle', autumn: 'bugle', bare: 'litter_6', variants: ['bugle_2'] },
}

export type Paint = { atlas: HTMLImageElement; small: HTMLImageElement; meadow: HTMLImageElement; house: HTMLImageElement; bed: HTMLImageElement }
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
  const [atlas, small, meadow, house, bed] = await Promise.all([urls.atlas, urls.small, urls.meadow, urls.house, urls.bed].map(image))
  return { atlas, small, meadow, house, bed }
}
