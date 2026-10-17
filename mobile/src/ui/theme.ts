// Semisto design system, the same scales as the website
// (app/frontend/entrypoints/application.css): prune = brand plum, loam =
// neutrals, leaf = artichaut, humus = mangue (attention), lichen, clay =
// grenade (errors). Steps carry the website's numbers, so a colour named
// here is the colour of the same name there.
export const colors = {
  prune50: '#f4f3f8', prune100: '#e8e6f0', prune200: '#d1cce2', prune300: '#b4acce', prune400: '#8d89ad',
  prune500: '#726b9f', prune600: '#5b5781', prune700: '#4a4668', prune800: '#3c3956', prune900: '#2b2940',
  loam50: '#f7f3ea', loam100: '#efe9dc', loam200: '#e2dacb', loam300: '#cbc1af', loam400: '#6b665c',
  loam500: '#595650', loam600: '#4d4a45', loam700: '#36342f', loam800: '#262522', loam900: '#1a1a1a',
  leaf50: '#eef0dc', leaf100: '#e2e7c2', leaf200: '#d3dc8f', leaf400: '#afbd00', leaf500: '#7d8900',
  leaf600: '#6d7a00', leaf700: '#4d5500',
  humus50: '#fef7ea', humus100: '#fbe8c8', humus300: '#f4b44c', humus400: '#ef9b0d', humus500: '#c97f05',
  humus600: '#a05f00', humus700: '#7a4800',
  lichen50: '#f3f4ef', lichen100: '#e4e6dc', lichen500: '#6f7661', lichen700: '#454a3c',
  clay50: '#fbefee', clay100: '#f8dedc', clay500: '#b01a19', clay700: '#8a1413',
  blueberry: '#234766',
  white: '#ffffff',
  // Cards are a lighter paper than the page, never pure white.
  paper: '#fffdf8',
}

// The colours of the map layers, as the website draws them (map/layers/features.ts).
export const layerColors: Record<string, string> = {
  existing: '#6e6355', water: '#2b7bb9', access: '#b8851a', structures: '#5b5781',
  plants: '#3d7d42', animals: '#946614', networks: '#c03c28', notes: '#726b9f',
}

export const fonts = {
  body: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  bold: 'Inter_600SemiBold',
  // Titles only, never italic.
  title: 'EBGaramond_500Medium',
  display: 'EBGaramond_600SemiBold',
  // Handwritten notes, as on the website (--font-hand).
  hand: 'Caveat_500Medium',
}

/** Never below 14 (the project's rule): meta and labels are 14, body 16. */
export const type = {
  display: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36 },
  title: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30 },
  mapName: { fontFamily: fonts.display, fontSize: 20, lineHeight: 26 },
  heading: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 24 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23 },
  meta: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  label: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20 },
  eyebrow: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20, letterSpacing: 1.2, textTransform: 'uppercase' as const },
  hand: { fontFamily: fonts.hand, fontSize: 20, lineHeight: 24 },
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 }
export const radius = { sm: 4, md: 8, control: 12, lg: 16, sheet: 24, pill: 999 }

/** The smallest tap target; 56 for the main actions and the map controls (gloves). */
export const touch = { min: 48, field: 56 }

const elevation = (y: number, blur: number, opacity: number, android: number) => ({
  shadowColor: '#1a1a1a', shadowOpacity: opacity, shadowRadius: blur / 2, shadowOffset: { width: 0, height: y }, elevation: android,
})
export const shadows = { xs: elevation(1, 2, 0.06, 1), sm: elevation(2, 6, 0.08, 2), md: elevation(6, 16, 0.1, 6), lg: elevation(14, 40, 0.14, 12) }
export const shadow = shadows.sm

export const motion = { fast: 180, base: 220, grow: 600 }
