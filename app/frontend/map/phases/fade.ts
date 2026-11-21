/** How strongly the phase's ink shows for a fade between today (0) and the phase alone (1). */
export const inkOpacity = (fade: number) => Math.round((0.45 + 0.55 * fade) * 100) / 100
/** The paper that hides today's map as the fade reaches the phase. */
export const paperOpacity = (fade: number) => Math.round(Math.max(0, fade - 0.2) / 0.8 * 0.92 * 100) / 100
