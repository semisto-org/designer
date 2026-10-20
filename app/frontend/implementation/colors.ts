// One colour per phase, in order, from the design system's tokens (plum,
// artichoke, mango, lichen, pomegranate), then round again.
const PHASE_COLORS = ['prune-600', 'leaf-600', 'humus-500', 'lichen-600', 'clay-500'].map((token) => `var(--color-${token})`)

export const phaseColor = (index: number) => PHASE_COLORS[index % PHASE_COLORS.length]
