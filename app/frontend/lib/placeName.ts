/**
 * The name a place gives a new map, as the server does when it is left empty
 * (Map.name_for_address): the town of the address, then the i18n keys
 * trials.map_name_in / map_name_elided.
 */

/** The town of an address: its last part, without the postcode (« 5530 Purnode » → « Purnode »). */
export function townOf(address: string): string {
  const last = address.split(',').pop() ?? ''
  return last.replace(/^\s*(?:[A-Z]{1,2}-?)?\d{4,5}\s*/, '').trim()
}

/** Whether French elides « de » before the town: « d'Yvoir », « de Purnode ». */
export function elides(town: string): boolean {
  return /^[aeiouyàâéèêëîïôûüAEIOUYÀÂÉÈÊËÎÏÔÛÜ]/.test(town)
}
