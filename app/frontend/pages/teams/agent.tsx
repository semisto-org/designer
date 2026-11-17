import { Head, Link, router, useForm, usePage } from '@inertiajs/react'
import { ArrowLeft, Check, KeyRound, ListChecks, MapPinned, MessageSquareText, PencilRuler, TreeDeciduous } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { Avatar } from '@/collab/Avatar'
import { HelpButton } from '@/components/help/HelpButton'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { confirmAction } from '@/components/ui/confirm'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { HandNote } from '@/components/ui/HandNote'
import { Pill, type PillTone } from '@/components/ui/Pill'
import { UsageMeter } from '@/components/ui/UsageMeter'
import { t, translations } from '@/lib/i18n'
import { formatMoney } from '@/lib/money'
import { timeAgo } from '@/collab/time'
import type { AgentPageProps, AgentRunRow, TeamAgent } from '@/types/agents'

const dollars = (cents: number) => formatMoney(Math.round(cents), 'USD')

const RUN_TONES: Record<AgentRunRow['status'], PillTone> = {
  queued: 'neutral', running: 'lichen', done: 'leaf', limit: 'humus', budget: 'humus', failed: 'clay',
}

/**
 * « Collègue IA »: the page of a team's AI colleague. Who she is and how to
 * work with her, for every member; her sheet, the team's key, the monthly
 * ceiling and the maps where she works, for the admins.
 */
export default function TeamAgentPage({ team, agent, ready, hasKey, maps, usage, runs, settings, limits }: AgentPageProps) {
  const base = `/teams/${team.id}`
  const name = agent?.name
  const status = !agent ? 'no_agent' : !agent.active ? 'paused' : !hasKey ? 'no_key' : 'ready'

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Head title={name ? t('agents.page.heading_named', { name }) : t('agents.page.title')} />
      <Link href={base} className="inline-flex items-center gap-1.5 text-sm text-loam-500 hover:text-loam-900">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t('agents.page.back')}
      </Link>

      <header className="flex flex-wrap items-start gap-4">
        <Avatar name={name ?? ''} url={agent?.avatarUrl} agent className="h-14 w-14" />
        <div className="min-w-0 flex-1 basis-64">
          <p className="text-sm text-loam-500">{t('agents.page.eyebrow', { team: team.name })}</p>
          <h1 className="break-words text-2xl">{name ? t('agents.page.heading_named', { name }) : t('agents.page.heading_new')}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-2">
            <Pill tone={ready ? 'leaf' : 'humus'}>{t(`agents.page.status.${status}`)}</Pill>
            <Pill tone="leaf">{t('agents.badge')}</Pill>
          </p>
        </div>
        <HelpButton slug="collegue-ia" />
      </header>
      <p className="max-w-2xl text-loam-700">{t('agents.page.intro')}</p>

      {agent && <HowTo name={agent.name} />}

      {team.admin
        ? <IdentityForm agent={agent} base={base} limits={limits} />
        : agent && <IdentityRead agent={agent} />}

      {team.admin && settings && (
        <KeyForm base={base} keyHint={settings.keyHint} model={settings.model} budgetCents={usage.budgetCents} maxCents={limits.budgetMaxCents} />
      )}

      <Card>
        <h2 className="text-base">{t('agents.page.usage.title')}</h2>
        <UsageMeter className="mt-3" label={t('agents.page.usage.label')} used={usage.spentCents} limit={usage.budgetCents} format={dollars} />
        <p className="mt-2 text-sm text-loam-500">{t('agents.page.usage.requests', { count: usage.requests })}</p>
      </Card>

      <MapsCard maps={maps} admin={team.admin} base={base} agent={agent} />
      <Journal runs={runs} />
    </div>
  )
}

function HowTo({ name }: { name: string }) {
  const lines: [ReactNode, string][] = [
    [<MessageSquareText key="m" />, t('agents.page.how.mention', { name })],
    [<ListChecks key="t" />, t('agents.page.how.task')],
    [<PencilRuler key="d" />, t('agents.page.how.drafts')],
    [<TreeDeciduous key="o" />, t('agents.page.how.outdoors')],
  ]
  const never = Object.values(translations('agents.page.limits.items')) as string[]
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <h2 className="text-base">{t('agents.page.how.title')}</h2>
        <ul className="mt-3 space-y-3">
          {lines.map(([icon, text]) => (
            <li key={text} className="flex gap-3 text-sm text-loam-800">
              <span className="mt-0.5 shrink-0 text-leaf-700 [&_svg]:h-4 [&_svg]:w-4" aria-hidden="true">{icon}</span>
              {text}
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="text-base">{t('agents.page.limits.title')}</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-loam-800 marker:text-loam-400">
          {never.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </Card>
    </div>
  )
}

function IdentityRead({ agent }: { agent: TeamAgent }) {
  return (
    <Card>
      <h2 className="text-base">{t('agents.page.identity.title')}</h2>
      <p className="mt-2 text-sm text-loam-500">{t('agents.page.identity.base')}</p>
      <p className="mt-3 text-sm font-medium text-loam-700">{t('agents.page.identity.instructions_read')}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-loam-800">{agent.instructions ?? t('agents.page.identity.no_instructions')}</p>
    </Card>
  )
}

// Her picture, chosen by a team admin once she has a name. HEIC from an
// iPhone is converted on the server; the sparkle stays in the corner.
function AvatarPicker({ agent, base }: { agent: TeamAgent | null; base: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const error = (usePage().props.errors as unknown as Record<string, string> | undefined)?.avatar
  const upload = (file: File) => {
    setBusy(true)
    router.post(`${base}/collegue/avatar`, { _method: 'patch', agent: { avatar: file } }, {
      forceFormData: true, preserveScroll: true, onFinish: () => setBusy(false),
    })
  }

  return (
    <div className="mt-3 flex items-start gap-4">
      <Avatar name={agent?.name ?? ''} url={agent?.avatarUrl} agent className="h-16 w-16" />
      <div className="min-w-0 flex-1 text-sm text-loam-500">
        <p className="font-medium text-loam-900">{t('agents.avatar.label')}</p>
        {agent && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? t('agents.avatar.uploading') : agent.avatarUrl ? t('agents.avatar.change') : t('agents.avatar.choose')}
            </Button>
            {agent.avatarUrl && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => router.delete(`${base}/collegue/avatar`, { preserveScroll: true })}>
                {t('agents.avatar.remove')}
              </Button>
            )}
          </div>
        )}
        <p className={error ? 'mt-1.5 text-clay-700' : 'mt-1.5'}>{error ?? t(agent ? 'agents.avatar.hint' : 'agents.avatar.hint_no_agent')}</p>
      </div>
      <input
        ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" className="sr-only" tabIndex={-1} aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) upload(file)
          event.target.value = ''
        }}
      />
    </div>
  )
}

function IdentityForm({ agent, base, limits }: { agent: TeamAgent | null; base: string; limits: AgentPageProps['limits'] }) {
  const form = useForm({ name: agent?.name ?? '', instructions: agent?.instructions ?? '', active: agent?.active ?? true })
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base">{t('agents.page.identity.title')}</h2>
        <HandNote tone="leaf">{t('agents.page.identity.base')}</HandNote>
      </div>
      <AvatarPicker agent={agent} base={base} />
      <form
        className="mt-4 space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          form.transform((data) => ({ agent: data }))
          form.patch(`${base}/collegue`, { preserveScroll: true })
        }}
      >
        <Field label={t('agents.page.identity.name')} hint={t('agents.page.identity.name_hint')} error={form.errors.name} className="max-w-xs">
          <Input value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} maxLength={limits.name} required />
        </Field>
        <Field label={t('agents.page.identity.instructions')} hint={t('agents.page.identity.instructions_hint')} error={form.errors.instructions}>
          <Textarea
            rows={5} value={form.data.instructions} maxLength={limits.instructions}
            placeholder={t('agents.page.identity.instructions_placeholder')}
            onChange={(e) => form.setData('instructions', e.target.value)}
          />
        </Field>
        {agent && (
          <label className="flex cursor-pointer items-start gap-3">
            <span className="relative mt-0.5 inline-flex shrink-0 items-center">
              <input type="checkbox" role="switch" className="peer sr-only" checked={form.data.active} onChange={(e) => form.setData('active', e.target.checked)} />
              <span className="h-6 w-11 rounded-full bg-loam-200 transition peer-checked:bg-leaf-500 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-prune-600" />
              <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
            </span>
            <span>
              <span className="block text-sm font-medium text-loam-900">{t('agents.page.identity.active')}</span>
              <span className="block text-sm text-loam-600">{t('agents.page.identity.active_hint')}</span>
            </span>
          </label>
        )}
        <Button type="submit" disabled={form.processing || form.data.name.trim() === ''}>
          {agent ? t('agents.page.identity.save') : t('agents.page.identity.create')}
        </Button>
      </form>
    </Card>
  )
}

function KeyForm({ base, keyHint, model, budgetCents, maxCents }: { base: string; keyHint: string | null; model: string; budgetCents: number; maxCents: number }) {
  const form = useForm({ api_key: '', monthly_budget: String(budgetCents / 100) })
  const errors = form.errors as Record<string, string | undefined>

  async function removeKey() {
    const ok = await confirmAction({
      title: t('agents.page.key.remove_confirm.title'),
      body: t('agents.page.key.remove_confirm.body'),
      confirmLabel: t('agents.page.key.remove'),
    })
    if (ok) router.patch(`${base}/collegue`, { settings: { remove_api_key: true } }, { preserveScroll: true })
  }

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4 text-loam-500" aria-hidden="true" />{t('agents.page.key.title')}</h2>
      <p className="mt-2 text-sm text-loam-700">{t('agents.page.key.intro')}</p>
      <p className="mt-1 text-sm text-loam-500">{t('agents.page.key.team_plan_note')}</p>
      <form
        className="mt-4 space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          form.transform((data) => ({ settings: data }))
          form.patch(`${base}/collegue`, { preserveScroll: true, onSuccess: () => form.setData('api_key', '') })
        }}
      >
        <Field label={t('agents.page.key.field')} hint={keyHint ? t('agents.page.key.current', { hint: keyHint }) : undefined} error={errors.agent_api_key}>
          <Input
            type="password" autoComplete="off" value={form.data.api_key}
            placeholder={t(keyHint ? 'agents.page.key.placeholder_keep' : 'agents.page.key.placeholder_new')}
            onChange={(e) => form.setData('api_key', e.target.value)}
          />
        </Field>
        <Field label={t('agents.page.key.budget')} hint={t('agents.page.key.budget_hint')} error={errors.agent_monthly_budget_cents} className="max-w-xs">
          <Input
            type="number" inputMode="decimal" min={0} max={maxCents / 100} step="1" value={form.data.monthly_budget}
            onChange={(e) => form.setData('monthly_budget', e.target.value)}
          />
        </Field>
        <p className="text-sm text-loam-500">{t('agents.page.key.model', { model })}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={form.processing}>{t('agents.page.key.save')}</Button>
          {keyHint && <Button variant="danger-ghost" onClick={() => void removeKey()}>{t('agents.page.key.remove')}</Button>}
        </div>
      </form>
    </Card>
  )
}

function MapsCard({ maps, admin, base, agent }: { maps: AgentPageProps['maps']; admin: boolean; base: string; agent: TeamAgent | null }) {
  const toggle = (id: number, enabled: boolean) =>
    router.patch(`${base}/collegue/maps/${id}`, { enabled }, { preserveScroll: true })
  return (
    <Card>
      <h2 className="flex items-center gap-2 text-base"><MapPinned className="h-4 w-4 text-loam-500" aria-hidden="true" />{t('agents.page.maps.title')}</h2>
      <p className="mt-2 text-sm text-loam-600">{t(admin ? 'agents.page.maps.intro_admin' : 'agents.page.maps.intro_member')}</p>
      {maps.length === 0 ? (
        <p className="mt-3 text-sm text-loam-500">{t('agents.page.maps.empty')}</p>
      ) : (
        <ul className="mt-3 divide-y divide-loam-100">
          {maps.map((map) => (
            <li key={map.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <Link href={`/maps/${map.id}`} className="block truncate text-sm font-medium text-loam-900 hover:text-prune-700">{map.name}</Link>
                {map.address && <p className="truncate text-sm text-loam-500">{map.address}</p>}
              </div>
              {admin ? (
                <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                  <input
                    type="checkbox" role="switch" className="peer sr-only" checked={map.enabled}
                    aria-label={t('agents.page.maps.toggle', { agent: agent?.name ?? t('agents.page.title'), map: map.name })}
                    onChange={(e) => toggle(map.id, e.target.checked)}
                  />
                  <span className="h-6 w-11 rounded-full bg-loam-200 transition peer-checked:bg-leaf-500 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-prune-600" />
                  <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
                </label>
              ) : (
                <Pill tone={map.enabled ? 'leaf' : 'neutral'} icon={map.enabled ? <Check /> : undefined}>{t(map.enabled ? 'agents.page.maps.on' : 'agents.page.maps.off')}</Pill>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Journal({ runs }: { runs: AgentRunRow[] }) {
  return (
    <Card>
      <h2 className="text-base">{t('agents.page.runs.title')}</h2>
      <p className="mt-2 text-sm text-loam-600">{t('agents.page.runs.intro')}</p>
      {runs.length === 0 ? (
        <p className="mt-3 text-sm text-loam-500">{t('agents.page.runs.empty')}</p>
      ) : (
        <ul className="mt-3 divide-y divide-loam-100">
          {runs.map((run) => (
            <li key={run.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
              <div className="min-w-0 flex-1 basis-56">
                <p className="truncate font-medium text-loam-900">
                  {t(`agents.page.runs.kinds.${run.kind}`)} · {t('agents.page.runs.line', { who: run.requestedBy, map: run.mapName })}
                </p>
                <p className="text-loam-500">
                  <time dateTime={run.createdAt} title={new Date(run.createdAt).toLocaleString('fr-BE')}>{timeAgo(run.createdAt)}</time>
                  {' · '}{t('agents.page.runs.tools', { count: run.toolCalls })}
                </p>
              </div>
              <Pill tone={RUN_TONES[run.status]}>{t(`agents.page.runs.statuses.${run.status}`)}</Pill>
              <span className="w-16 text-right tabular-nums text-loam-700">{dollars(run.costCents)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
