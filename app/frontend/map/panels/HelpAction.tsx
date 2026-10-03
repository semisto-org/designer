import { HelpButton } from '@/components/help/HelpButton'
import { useEditor } from '@/map/editor/EditorContext'

// Help articles for the panels that have one; the others open the list of guides.
const ARTICLE_BY_PANEL: Record<string, string> = {
  terrain: 'choisir-ses-parcelles',
  elements: 'dessiner-l-existant',
}

/** "Aide" in the editor header: opens the help drawer on the article of the open panel. */
export default function HelpAction() {
  const { activePanel } = useEditor()
  return <HelpButton slug={(activePanel && ARTICLE_BY_PANEL[activePanel]) || undefined} />
}
