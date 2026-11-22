// The notebook's inks for the section drawing (kept out of the .tsx, like
// every colour: the SVG is also saved as an image, where Tailwind classes
// do not reach).

export const SECTION_COLORS = {
  paper: '#fbf7ee',
  ink: '#1b1712',
  soft: '#4d4a45',
  faint: '#8a847a',
  grid: '#e7dfcf',
  ground: '#6b5a48',
  soil: '#d9c7a6',
  topsoil: '#a8875c',
  water: '#3f6f8a',
  waterWash: '#9cc1d4',
  access: '#a06a2c',
  structures: '#6b5a48',
  sunJune: '#d9a527',
  sunDecember: '#8a847a',
  line: '#5b5781',
  corridor: '#5b5781',
} as const

/** A hedge's mass in the section, and the noon shadows on the ground. */
export const SECTION_WASHES = {
  hedge: '#6f8a3c',
  hedgeEdge: '#4d5f29',
  shadowDecember: '#4d4a45',
  shadowJune: '#d9a527',
} as const
