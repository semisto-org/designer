import { api } from '@/lib/api'
import { track } from '@/lib/analytics'

/**
 * The plan went to paper: the PDF at scale, the book of sheets, or the
 * dossier's « Imprimer ». Counted in Plausible, and its first time noted
 * on the map for « Premières heures » (Maps::PrintsController).
 */
export function notePrint(mapId: number, kind: 'pdf' | 'book' | 'dossier') {
  track('plan_print', { kind })
  void api(`/maps/${mapId}/print`, { method: 'POST' }).catch(() => undefined)
}
