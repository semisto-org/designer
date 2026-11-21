// How a species looks in the 3D view (PlantLook on the server): the tone of
// its foliage, how fine its leaves are, how dense its crown is, and the
// colours of its flowers, fruits, bark and autumn leaves. Each value is the
// species' own or the usual one of its genus; a trait nobody knows is absent
// and the plant keeps its strata's colours.
//
// The palettes are low-poly paints, not botanical swatches: a little muted,
// so that a garden reads as a watercolour rather than a toy box. The plant
// sheet shows the same swatches (pages/plants/show.tsx): what you read there
// is what the 3D paints.

export type FoliageTone = 'dark_green' | 'green' | 'light_green' | 'grey_green' | 'blue_green' | 'yellow_green' | 'purple'
export type LeafTexture = 'fine' | 'medium' | 'coarse'
export type CrownDensity = 'light' | 'medium' | 'dense'

/** The traits as the server sends them (camelCase), each optional. */
export type PlantLookTraits = {
  foliageTone?: FoliageTone
  leafTexture?: LeafTexture
  crownDensity?: CrownDensity
  flowerColor?: string
  fruitColor?: string
  barkColor?: string
  autumnColor?: string
}

export const FOLIAGE_TONES: Record<FoliageTone, string> = {
  dark_green: '#3d5a2a',
  green: '#587a34',
  light_green: '#83a048',
  grey_green: '#7d8c6a',
  blue_green: '#5a7a70',
  yellow_green: '#a3a443',
  purple: '#6a3a42',
}

export const FLOWER_COLORS: Record<string, string> = {
  white: '#f6f3ea',
  cream: '#eee3c2',
  yellow: '#e6c43e',
  orange: '#df8a32',
  pink: '#eec2d0',
  red: '#c2423a',
  purple: '#8c62a4',
  blue: '#7088c4',
  green: '#bcc58c',
}

export const FRUIT_COLORS: Record<string, string> = {
  red: '#c4452e',
  orange: '#de7a2a',
  yellow: '#e0bf40',
  green: '#9db04c',
  blue: '#4d5e94',
  purple: '#6a3060',
  black: '#2f2531',
  brown: '#7a5233',
  white: '#ebe5da',
}

export const BARK_COLORS: Record<string, string> = {
  grey: '#7b7870',
  silver: '#a7a39a',
  brown: '#6e5a44',
  red_brown: '#7c4a36',
  white: '#e4dfd3',
  dark: '#4a4039',
}

/** Autumn colours; `none`: the leaves fall still green, only a little duller. */
export const AUTUMN_COLORS: Record<string, string> = {
  yellow: '#d4a636',
  orange: '#c8802a',
  red: '#b4482a',
  purple: '#7a3148',
  brown: '#8a6438',
  none: '#6e7340',
}

const TONES = Object.keys(FOLIAGE_TONES) as FoliageTone[]
const TEXTURES: readonly LeafTexture[] = ['fine', 'medium', 'coarse']
const DENSITIES: readonly CrownDensity[] = ['light', 'medium', 'dense']

const known = (palette: Record<string, string>, value: unknown) =>
  typeof value === 'string' && value in palette ? value : undefined

/** The traits the server sent, unknown values dropped. */
export function lookOf(value: unknown): PlantLookTraits {
  if (!value || typeof value !== 'object') return {}
  const v = value as Record<string, unknown>
  const look: PlantLookTraits = {}
  if (TONES.includes(v.foliageTone as FoliageTone)) look.foliageTone = v.foliageTone as FoliageTone
  if (TEXTURES.includes(v.leafTexture as LeafTexture)) look.leafTexture = v.leafTexture as LeafTexture
  if (DENSITIES.includes(v.crownDensity as CrownDensity)) look.crownDensity = v.crownDensity as CrownDensity
  const flower = known(FLOWER_COLORS, v.flowerColor)
  const fruit = known(FRUIT_COLORS, v.fruitColor)
  const bark = known(BARK_COLORS, v.barkColor)
  const autumn = known(AUTUMN_COLORS, v.autumnColor)
  if (flower) look.flowerColor = flower
  if (fruit) look.fruitColor = fruit
  if (bark) look.barkColor = bark
  if (autumn) look.autumnColor = autumn
  return look
}

/**
 * How a crown's density shows in low-poly: a light crown (a birch, a
 * honey locust) is a little narrower and paler, the sky through it; a dense
 * one (a beech, a horse chestnut) full and a shade darker.
 */
export function densityOf(look: PlantLookTraits | undefined): { scale: number; lightness: number } {
  switch (look?.crownDensity) {
    case 'light': return { scale: 0.9, lightness: 0.05 }
    case 'dense': return { scale: 1.03, lightness: -0.03 }
    default: return { scale: 1, lightness: 0 }
  }
}

/** One colour of a list, the same for a plant from one season to the next. */
const pick = (list: readonly string[], seed: number) => list[Math.abs(seed) % list.length]

/** Generic paints for a plant whose sheet says nothing. */
export const DEFAULT_BARK = BARK_COLORS.brown
const DEFAULT_AUTUMN = [AUTUMN_COLORS.orange, AUTUMN_COLORS.red, AUTUMN_COLORS.yellow]
const DEFAULT_BLOSSOM = [FLOWER_COLORS.white, '#f3dbe3', FLOWER_COLORS.pink]
const DEFAULT_FRUIT_TREE = FRUIT_COLORS.red
const DEFAULT_FRUIT_BUSH = '#7a2f52'

export const barkColor = (look: PlantLookTraits | undefined) => (look?.barkColor && BARK_COLORS[look.barkColor]) || DEFAULT_BARK
export const autumnColor = (look: PlantLookTraits | undefined, seed: number) =>
  (look?.autumnColor && AUTUMN_COLORS[look.autumnColor]) || pick(DEFAULT_AUTUMN, seed)
export const flowerColor = (look: PlantLookTraits | undefined, seed: number) =>
  (look?.flowerColor && FLOWER_COLORS[look.flowerColor]) || pick(DEFAULT_BLOSSOM, seed)
export const fruitColor = (look: PlantLookTraits | undefined, tree: boolean) =>
  (look?.fruitColor && FRUIT_COLORS[look.fruitColor]) || (tree ? DEFAULT_FRUIT_TREE : DEFAULT_FRUIT_BUSH)
/** The summer green of its foliage, or null to keep the strata's. */
export const foliageColor = (look: PlantLookTraits | undefined) => (look?.foliageTone ? FOLIAGE_TONES[look.foliageTone] : null)

/** How much the autumn colour takes over (a species that stays green only dulls). */
export const autumnStrength = (look: PlantLookTraits | undefined) => (look?.autumnColor === 'none' ? 0.35 : 0.85)
