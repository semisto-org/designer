import { Link } from '@inertiajs/react'
import { Receipt } from 'lucide-react'
import { buttonClass } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'

/** « Offre » in the editor's header, for whoever prices the project. */
export default function OfferLink() {
  const { map, offerBuilder } = useEditor()
  if (!offerBuilder) return null
  return (
    <Link href={`/maps/${map.id}/offer`} className={buttonClass('ghost', 'sm')}>
      <Receipt className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline">{t('offers.panel.title')}</span>
      <span className="sr-only sm:hidden">{t('offers.panel.title')}</span>
    </Link>
  )
}
