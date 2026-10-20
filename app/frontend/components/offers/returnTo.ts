/**
 * The offer to come back to from the pricing templates (« ?return_to= »),
 * only when it is the path of a map's offer: never a link out of the app.
 */
export function returnToOffer(url: string): string | null {
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : ''
  const target = new URLSearchParams(query).get('return_to')
  return target && /^\/maps\/\d+\/offer$/.test(target) ? target : null
}
