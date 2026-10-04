import { Head, router } from '@inertiajs/react'
import { CircleCheck, Info, KeyRound, Lock, MapPinned, Pencil, ShieldCheck, Sparkles, UsersRound, Wallet } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { HelpButton } from '@/components/help/HelpButton'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { tf, typo } from '@/lib/content'
import { formatArea } from '@/lib/i18n'
import { formatDate } from '@/lib/money'
import type { PlanImpactData, TransferPageProps } from '@/types/transfer'

/**
 * The recipient's screen of a map transfer (« Devenir propriétaire »): what
 * changes, what it means for their plan (computed on the server), then
 * accept or decline. Once answered, canceled or expired, says what became
 * of the proposal.
 */
export default function TransferShow({ transfer, map, impact }: TransferPageProps) {
  const [processing, setProcessing] = useState<'accept' | 'decline' | null>(null)
  const base = `/maps/${map.id}/transfers/${transfer.id}`
  const pending = transfer.state === 'pending'
  const from = transfer.fromName

  function answer(action: 'accept' | 'decline') {
    if (action === 'decline' && !window.confirm(tf('transfer.page.decline_confirm', { from }))) return
    router.post(`${base}/${action}`, {}, {
      onStart: () => setProcessing(action),
      onFinish: () => setProcessing(null),
    })
  }

  const details = map.canOpen ? [map.address ?? map.regionName, map.areaM2 ? formatArea(map.areaM2) : null].filter(Boolean).join(' · ') : null

  return (
    <div className="mx-auto max-w-2xl">
      <Head title={tf('transfer.page.title', { map: map.name })} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-prune-600">
            <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
            {tf('transfer.page.eyebrow')}
          </p>
          <h1 className="mt-1 text-2xl">{tf('transfer.page.title', { map: map.name })}</h1>
        </div>
        <HelpButton slug="partager-et-commenter" className="shrink-0" compact />
      </div>
      <p className="mt-2 text-loam-600">{tf('transfer.page.intro', { from, map: map.name })}</p>
      {details && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-loam-500">
          <MapPinned className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{details}</span>
        </p>
      )}

      {!pending ? (
        <Outcome transfer={transfer} canOpen={map.canOpen} mapId={map.id} />
      ) : transfer.problem ? (
        <>
          <div role="alert" className="mt-6 flex gap-3 rounded-xl bg-humus-50 p-4 text-humus-700 ring-1 ring-humus-200">
            <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p className="text-sm">{typo(transfer.problem)}</p>
          </div>
          <Actions>
            {map.canOpen && <ButtonLink href={`/maps/${map.id}`} variant="secondary">{tf('transfer.page.open_map')}</ButtonLink>}
            <Button variant="ghost" disabled={processing != null} onClick={() => answer('decline')}>{tf('transfer.page.decline')}</Button>
          </Actions>
        </>
      ) : (
        <>
          <Card className="mt-6">
            <h2 className="text-base">{tf('transfer.page.what_title')}</h2>
            <ul className="mt-3 space-y-2.5 text-sm text-loam-700">
              <Change icon={KeyRound}>{tf('transfer.page.what.owner')}</Change>
              <Change icon={Wallet}>{tf('transfer.page.what.plan')}</Change>
              <Change icon={Pencil}>{tf('transfer.page.what.former', { from })}</Change>
              <Change icon={ShieldCheck}>{tf('transfer.page.what.kept')}</Change>
              {map.team && <Change icon={UsersRound}>{tf('transfer.page.what.team', { team: map.team })}</Change>}
            </ul>
          </Card>
          {impact && <PlanImpact impact={impact} />}
          <Actions>
            <Button size="lg" disabled={processing != null} onClick={() => answer('accept')}>
              <CircleCheck className="h-5 w-5" aria-hidden="true" />
              {tf('transfer.page.accept')}
            </Button>
            <Button size="lg" variant="secondary" disabled={processing != null} onClick={() => answer('decline')}>
              {tf('transfer.page.decline')}
            </Button>
          </Actions>
          <p className="mt-3 text-xs text-loam-500">{tf('transfer.page.expires', { date: formatDate(transfer.expiresAt), from })}</p>
        </>
      )}
    </div>
  )
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">{children}</div>
}

function Change({ icon: Icon, children }: { icon: typeof KeyRound; children: ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" aria-hidden="true" />
      <span>{children}</span>
    </li>
  )
}

/** "a, b et c" */
function listOf(items: string[]): string {
  if (items.length < 2) return items.join('')
  return `${items.slice(0, -1).join(', ')} ${tf('transfer.impact.and')} ${items[items.length - 1]}`
}

/** What the plan of the recipient makes of the map, in plain words. */
function PlanImpact({ impact }: { impact: PlanImpactData }) {
  if (!impact.billing) {
    return (
      <div className="mt-4 flex gap-3 rounded-xl bg-lichen-50 p-4 text-lichen-700 ring-1 ring-lichen-200">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <p className="text-sm">{tf('transfer.impact.beta')}</p>
      </div>
    )
  }
  const plan = { plan: impact.planName, count: impact.maxMaps }
  if (!impact.changesAnything) {
    return (
      <div className="mt-4 flex gap-3 rounded-xl bg-leaf-50 p-4 text-leaf-800 ring-1 ring-leaf-200">
        <CircleCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">{tf('transfer.page.plan_title')}</p>
          <p className="mt-0.5 text-sm">{tf('transfer.impact.fine', plan)}</p>
        </div>
      </div>
    )
  }
  const names = impact.mapsBecomingReadOnly.map((m) => tf('transfer.impact.quoted', { name: m.name }))
  const features = impact.lostFeatures.map((f) => tf(`transfer.impact.features.${f}`))
  return (
    <div className="mt-4 flex gap-3 rounded-xl bg-humus-50 p-4 text-humus-700 ring-1 ring-humus-200">
      <Lock className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="space-y-1.5 text-sm">
        <p className="font-semibold">{tf('transfer.page.plan_title')}</p>
        <p>{tf('transfer.impact.current', plan)}</p>
        {impact.mapReadOnly && <p>{tf('transfer.impact.map_read_only')}</p>}
        {names.length > 0 && <p>{tf('transfer.impact.maps_read_only', { count: names.length, names: listOf(names) })}</p>}
        {features.length > 0 && <p>{tf('transfer.impact.lost_features', { features: listOf(features) })}</p>}
        <p className="text-humus-700">{tf('transfer.impact.nothing_deleted')}</p>
        <a href="/billing" className="inline-block font-medium text-prune-700 underline underline-offset-2 hover:text-prune-800">{tf('transfer.impact.see_plans')}</a>
      </div>
    </div>
  )
}

/** Answered, canceled, expired or no longer valid. */
function Outcome({ transfer, canOpen, mapId }: { transfer: TransferPageProps['transfer']; canOpen: boolean; mapId: number }) {
  const date = formatDate(transfer.closedAt ?? transfer.expiresAt)
  const accepted = transfer.state === 'accepted'
  return (
    <>
      <div
        role="status"
        className={
          'mt-6 flex gap-3 rounded-xl p-4 ring-1 ' +
          (accepted ? 'bg-leaf-50 text-leaf-800 ring-leaf-200' : 'bg-white text-loam-700 ring-loam-200')
        }
      >
        {accepted ? <CircleCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /> : <Info className="mt-0.5 h-5 w-5 shrink-0 text-loam-400" aria-hidden="true" />}
        <p className="text-sm">{tf(`transfer.page.states.${transfer.state}`, { date, from: transfer.fromName })}</p>
      </div>
      <Actions>
        {canOpen && <ButtonLink href={`/maps/${mapId}`}>{tf('transfer.page.open_map')}</ButtonLink>}
        <ButtonLink href="/maps" variant="secondary">{tf('transfer.page.my_maps')}</ButtonLink>
      </Actions>
    </>
  )
}
