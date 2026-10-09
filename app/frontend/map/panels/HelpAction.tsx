import { HelpButton } from '@/components/help/HelpButton'
import { useEditor } from '@/map/editor/EditorContext'
import { isPatch, isPlant } from '@/map/plants/properties'
import type { MapFeature } from '@/types'

// The guide of each editor panel (slug = file name in app/help/, without .md).
// test/models/help_article_test.rb checks that every panel of PANELS has one
// and that every slug named in this file is an existing article.
const ARTICLE_BY_PANEL: Record<string, string> = {
  journey: 'le-parcours-en-quatre-etapes',
  project: 'remplir-la-fiche-projet',
  terrain: 'choisir-ses-parcelles',
  layers: 'lire-les-couches-du-geoportail',
  'plan-images': 'caler-un-fond-de-plan',
  relief: 'lire-le-relief-et-l-eau',
  sun: 'le-soleil-et-l-horizon',
  climate: 'le-climat-d-aujourd-hui-et-de-demain',
  'site-rules': 'regles-et-risques-du-terrain',
  soil: 'analyser-son-sol',
  canopy: 'les-arbres-deja-en-place',
  photos: 'photos-et-suivi-dans-le-temps',
  palette: 'construire-sa-palette-et-ses-patches',
  'plant-list': 'la-liste-de-plants-et-la-commande',
  elements: 'dessiner-l-existant',
  'drawing-layers': 'calques-mesures-et-croquis',
  'water-sources': 'dessiner-l-existant',
  'drawing-alerts': 'les-alertes-reglementaires',
  finances: 'le-tableau-financier',
  discussions: 'partager-et-commenter',
  publish: 'publier-sa-carte',
  actions: 'la-liste-de-plants-et-la-commande',
  'ai-journal': 'relire-les-brouillons-de-l-ia',
}

// With no panel open, the selected element says which guide fits.
const ARTICLE_FOR_DRAFT = 'relire-les-brouillons-de-l-ia'
const ARTICLE_FOR_PLANT = 'planter-puis-observer'
const ARTICLE_FOR_PATCH = 'construire-sa-palette-et-ses-patches'
const ARTICLE_FOR_NOTE = 'calques-mesures-et-croquis'
const ARTICLE_FOR_ELEMENT = 'dessiner-l-existant'
const NOTE_KINDS = ['measure', 'sketch']

function articleForSelection(feature: MapFeature | null): string | undefined {
  if (!feature) return undefined
  if (feature.properties.status === 'draft') return ARTICLE_FOR_DRAFT
  if (isPlant(feature)) return ARTICLE_FOR_PLANT
  if (isPatch(feature)) return ARTICLE_FOR_PATCH
  if (NOTE_KINDS.includes(feature.properties.kind)) return ARTICLE_FOR_NOTE
  return ARTICLE_FOR_ELEMENT
}

/**
 * "Aide" in the editor header: opens the help drawer on the guide of the
 * open panel, else of the selected element, else on the list of guides.
 */
export default function HelpAction() {
  const { activePanel, selected } = useEditor()
  const slug = (activePanel && ARTICLE_BY_PANEL[activePanel]) || articleForSelection(selected)
  return <HelpButton compact slug={slug || undefined} />
}
