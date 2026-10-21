import { Head, Link } from '@inertiajs/react'
import { useState } from 'react'
import { Button, ButtonLink } from '@/components/ui/Button'
import { CompanionEmpty } from '@/components/ui/Companion'
import { Pill } from '@/components/ui/Pill'
import { STATUS_TONES } from '@/drone_pilots/catalog'
import { t } from '@/lib/i18n'
import { formatDate, formatPrice } from '@/lib/money'
import type { MissionRow } from '@/types/drone_pilots'

type Props = { asClient: MissionRow[]; asPilot: MissionRow[]; pilot: { status: string; listed: boolean } | null }

/** « Missions drone »: the flights I booked, and the ones asked of me as a pilot. */
export default function DroneMissions({ asClient, asPilot, pilot }: Props) {
  const [tab, setTab] = useState<'client' | 'pilot'>(asPilot.some((m) => m.status === 'requested') || (asClient.length === 0 && asPilot.length > 0) ? 'pilot' : 'client')
  const rows = tab === 'client' ? asClient : asPilot
  const waiting = asPilot.filter((m) => m.status === 'requested').length

  return (
    <div className="mx-auto max-w-3xl">
      <Head title={t('drone_missions.title')} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">{t('drone_missions.title')}</h1>
          <p className="mt-1 text-loam-600">{t('drone_missions.intro')}</p>
        </div>
        <ButtonLink href="/pilotes-drone" variant="secondary" size="sm">{t('drone_missions.find_pilot')}</ButtonLink>
      </div>

      {pilot && (
        <nav className="mt-6 flex gap-1.5" aria-label={t('drone_missions.title')}>
          {(['client', 'pilot'] as const).map((key) => (
            <Button key={key} size="sm" variant={tab === key ? 'primary' : 'ghost'} aria-pressed={tab === key} onClick={() => setTab(key)}>
              {t(`drone_missions.tabs.${key}`)}{key === 'pilot' && waiting > 0 && <span className="tabular-nums">· {waiting}</span>}
            </Button>
          ))}
        </nav>
      )}

      <div className="mt-4 space-y-3">
        {rows.length === 0 ? (
          <CompanionEmpty
            title={t(tab === 'client' ? 'drone_missions.empty_client_title' : 'drone_missions.empty_pilot_title')}
            why={t(tab === 'client' ? 'drone_missions.empty_client_why' : 'drone_missions.empty_pilot_why')}
            action={tab === 'client' && <ButtonLink href="/pilotes-drone">{t('drone_missions.find_pilot')}</ButtonLink>}
          />
        ) : rows.map((mission) => (
          <Link key={mission.id} href={`/missions-drone/${mission.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-loam-900/10 hover:ring-prune-300">
            <div className="min-w-0">
              <p className="font-serif text-lg font-semibold text-prune-800">{mission.mapName}</p>
              <p className="text-sm text-loam-600">
                {tab === 'client' ? t('drone_missions.with_pilot', { name: mission.pilotName }) : t('drone_missions.for_client', { name: mission.clientName })}
                {' · '}
                {mission.flightOn ? t('drone_missions.flight_on', { date: formatDate(mission.flightOn) }) : t('drone_missions.asked_on', { date: formatDate(mission.createdAt) })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-loam-800">{formatPrice(mission.totalCents)}</span>
              <Pill tone={mission.disputed ? 'clay' : STATUS_TONES[mission.status]}>{mission.disputed ? t('drone_missions.disputed') : t(`drone_missions.statuses.${mission.status}`)}</Pill>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
