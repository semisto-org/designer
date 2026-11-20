import { useState } from 'react'
import { Compass } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import type { WindView } from './model'
import { useWind } from './useWind'
import { WindCard } from './WindCard'

/** « Le vent de ta région » in the « Climat » panel, with the way to the sectors it shapes. */
export function WindSection({ mapId }: { mapId: number }) {
  const report = useWind(mapId)
  const [view, setView] = useState<WindView>('year')
  const editor = useEditor()
  if (!report?.available) return null
  return (
    <WindCard
      report={report}
      view={view}
      onView={setView}
      actions={(
        <Button size="sm" variant="ghost" onClick={() => editor.openPanel('sectors')}>
          <Compass className="h-4 w-4" aria-hidden />{t('wind.card.to_sectors')}
        </Button>
      )}
    />
  )
}
