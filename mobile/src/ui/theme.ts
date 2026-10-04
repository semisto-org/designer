// Semisto design system (docs/design-system/, app/frontend/entrypoints/application.css).
// Key names stay by role: prune = brand, loam = neutrals, leaf = artichaut,
// humus = mangue (warning), clay = grenade (errors).
export const colors = {
  prune50: '#efeef4', prune100: '#e2e0eb', prune200: '#c9c6db', prune500: '#8d89ad', prune600: '#5b5781', prune700: '#3c3956', prune900: '#2a2840',
  loam50: '#f7f3ea', loam100: 'rgba(26,26,26,0.06)', loam200: 'rgba(26,26,26,0.10)', loam500: '#6b665c', loam600: '#595650', loam700: '#3a3833', loam900: '#1a1a1a',
  leaf50: '#eef0dc', leaf100: '#e1e5bf', leaf500: '#afbd00', leaf600: '#8a9600', leaf700: '#6d7a00',
  humus50: '#fdf3e1', humus100: '#fbe3b6', humus500: '#ef9b0d', humus700: '#a05f00',
  blueberry: '#234766',
  clay50: '#fbeceb', clay500: '#b01a19', clay700: '#8a1413',
  white: '#ffffff',
}

export const fonts = {
  body: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  bold: 'Inter_600SemiBold',
  // Titles only, never italic.
  title: 'EBGaramond_500Medium',
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 }
export const radius = { sm: 4, md: 8, lg: 16, pill: 999 }

export const shadow = { shadowColor: '#1a1a1a', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }
