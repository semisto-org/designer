import { Head } from '@inertiajs/react'
import { AiJournal } from '@/components/ai_journal/AiJournal'
import { HelpButton } from '@/components/help/HelpButton'
import { MapViewHeader } from '@/components/map_views/MapViews'
import { Card } from '@/components/ui/Card'
import { t } from '@/lib/i18n'
import type { MapRole } from '@/types'

type Props = {
  map: { id: number; name: string; role: MapRole | null; teamId: number | null; offerBuilder: boolean; timeEntries: boolean }
}

/** « Journal IA », a view of the project for its owner: what each AI did on this place. */
export default function MapAiJournal({ map }: Props) {
  return (
    <div>
      <Head title={`${t('ai_journal.title')} · ${map.name}`} />
      <MapViewHeader map={map} current="ai_journal" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-3xl">{t('ai_journal.title')}</h1>
        <HelpButton compact slug="relire-les-brouillons-de-l-ia" />
      </div>
      <Card className="mt-6 max-w-3xl">
        <AiJournal mapId={map.id} />
      </Card>
    </div>
  )
}
