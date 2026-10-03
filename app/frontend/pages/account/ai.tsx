import { Head, router } from '@inertiajs/react'
import { Bot, Check, KeyRound, ShieldCheck, Terminal } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { CopyField } from '@/components/CopyField'
import { Button } from '@/components/ui/Button'
import { Card, EmptyState } from '@/components/ui/Card'
import { Field, Input, Select } from '@/components/ui/Field'
import { api, ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import type { AiAccessLevel, ApiTokenData, AuthorizedAppData } from '@/types/mcp'

type Props = {
  endpoints: { mcp: string; docs: string }
  tokens: ApiTokenData[]
  apps: AuthorizedAppData[]
  planAllowsDrafts: boolean
  expiryChoices: string[]
}

const dateFormat = new Intl.DateTimeFormat('fr-BE', { dateStyle: 'medium' })
const formatDate = (iso: string | null) => (iso ? dateFormat.format(new Date(iso)) : '—')

/** « Connecter Claude »: plug one's own Claude (or any MCP agent) on one's maps. */
export default function AccountAi({ endpoints, tokens, apps, planAllowsDrafts, expiryChoices }: Props) {
  const claudeCode = `claude mcp add --transport http semisto-designer ${endpoints.mcp}`
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Head title={t('account_ai.title')} />
      <header className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-prune-50 text-prune-600">
          <Bot className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl">{t('account_ai.title')}</h1>
          <p className="mt-1 text-loam-600">{t('account_ai.intro')}</p>
        </div>
      </header>

      <Card>
        <h2 className="text-base">{t('account_ai.url.title')}</h2>
        <p className="mt-1 text-sm text-loam-600">{t('account_ai.url.hint')}</p>
        <CopyField value={endpoints.mcp} className="mt-3" />
        {!planAllowsDrafts && <p className="mt-3 rounded-lg bg-humus-50 p-3 text-sm text-humus-700">{t('account_ai.plan_hint')}</p>}
      </Card>

      <section className="grid gap-4 md:grid-cols-2">
        <Card className="min-w-0">
          <h2 className="text-base">{t('account_ai.claude_ai.title')}</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-loam-700">
            <li>{t('account_ai.claude_ai.step1')}</li>
            <li>{t('account_ai.claude_ai.step2')}</li>
            <li>{t('account_ai.claude_ai.step3')}</li>
            <li>{t('account_ai.claude_ai.step4')}</li>
            <li>{t('account_ai.claude_ai.step5')}</li>
          </ol>
          <p className="mt-3 rounded-lg bg-loam-50 p-3 text-sm italic text-loam-600">{t('account_ai.claude_ai.example')}</p>
        </Card>
        <Card className="min-w-0">
          <h2 className="flex items-center gap-2 text-base"><Terminal className="h-4 w-4 text-loam-500" />{t('account_ai.claude_code.title')}</h2>
          <p className="mt-2 text-sm text-loam-700">{t('account_ai.claude_code.step1')}</p>
          <CopyField value={claudeCode} className="mt-2" mono />
          <p className="mt-3 text-sm text-loam-700">{t('account_ai.claude_code.step2')}</p>
          <h3 className="mt-5 text-sm font-semibold">{t('account_ai.other.title')}</h3>
          <p className="mt-1 text-sm text-loam-700">{t('account_ai.other.body')}</p>
        </Card>
      </section>

      <section>
        <h2 className="text-lg">{t('account_ai.apps.title')}</h2>
        <p className="mt-1 text-sm text-loam-600">{t('account_ai.apps.intro')}</p>
        <div className="mt-3">
          {apps.length === 0 ? (
            <EmptyState title={t('account_ai.apps.empty_title')}>{t('account_ai.apps.empty_body')}</EmptyState>
          ) : (
            <ul className="divide-y divide-loam-100 rounded-xl bg-white ring-1 ring-loam-200/70">
              {apps.map((app) => (
                <Row
                  key={app.id}
                  title={app.name}
                  badge={<AccessBadge access={app.access} />}
                  meta={t('account_ai.apps.meta', { authorized: formatDate(app.authorizedAt), used: formatDate(app.lastUsedAt) })}
                  action={
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-clay-500"
                      onClick={() => {
                        if (!window.confirm(t('account_ai.apps.confirm_revoke', { name: app.name }))) return
                        router.delete(`/account/ai/apps/${app.id}`, { preserveScroll: true })
                      }}
                    >
                      {t('account_ai.revoke')}
                    </Button>
                  }
                />
              ))}
            </ul>
          )}
        </div>
      </section>

      <TokensSection tokens={tokens} expiryChoices={expiryChoices} />

      <Card className="bg-leaf-50/60 ring-leaf-200">
        <h2 className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-leaf-600" />{t('account_ai.guardrails.title')}</h2>
        <ul className="mt-3 space-y-1.5 text-sm text-loam-700">
          {(['never', 'networks', 'journal', 'revoke'] as const).map((key) => (
            <li key={key} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" />{t(`account_ai.guardrails.${key}`)}</li>
          ))}
        </ul>
        <a href={endpoints.docs} className="mt-4 inline-block text-sm font-medium text-prune-600 hover:text-prune-800">
          {t('account_ai.docs_link')}
        </a>
      </Card>
    </div>
  )
}

function TokensSection({ tokens, expiryChoices }: { tokens: ApiTokenData[]; expiryChoices: string[] }) {
  const [name, setName] = useState('')
  const [access, setAccess] = useState<AiAccessLevel>('read')
  const [expiresIn, setExpiresIn] = useState('90')
  const [created, setCreated] = useState<{ name: string; plaintext: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function create(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const data = await api<{ token: ApiTokenData; plaintext: string }>('/account/ai/tokens', {
        method: 'POST',
        body: { api_token: { name, access, expires_in: expiresIn } },
      })
      setCreated({ name: data.token.name, plaintext: data.plaintext })
      setName('')
      router.reload({ only: ['tokens'] })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('account_ai.tokens.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h2 className="flex items-center gap-2 text-lg"><KeyRound className="h-4 w-4 text-loam-500" />{t('account_ai.tokens.title')}</h2>
      <p className="mt-1 text-sm text-loam-600">{t('account_ai.tokens.intro')}</p>

      {created && (
        <div className="mt-3 rounded-xl bg-humus-50 p-4 ring-1 ring-humus-200" role="status">
          <p className="text-sm font-semibold text-loam-900">{t('account_ai.tokens.created', { name: created.name })}</p>
          <p className="mt-1 text-sm text-humus-700">{t('account_ai.tokens.copy_now')}</p>
          <CopyField value={created.plaintext} className="mt-2" mono />
        </div>
      )}

      <form onSubmit={create} className="mt-3 grid gap-3 rounded-xl bg-white p-4 ring-1 ring-loam-200/70 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
        <Field label={t('account_ai.tokens.name')} error={error ?? undefined}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('account_ai.tokens.name_placeholder')} required maxLength={80} />
        </Field>
        <Field label={t('account_ai.tokens.access')}>
          <Select value={access} onChange={(e) => setAccess(e.target.value as AiAccessLevel)}>
            <option value="read">{t('account_ai.access.read')}</option>
            <option value="drafts">{t('account_ai.access.drafts')}</option>
          </Select>
        </Field>
        <Field label={t('account_ai.tokens.expiry')}>
          <Select value={expiresIn} onChange={(e) => setExpiresIn(e.target.value)}>
            {expiryChoices.map((days) => <option key={days} value={days}>{t('account_ai.tokens.days', { count: Number(days) })}</option>)}
            <option value="">{t('account_ai.tokens.never')}</option>
          </Select>
        </Field>
        <Button type="submit" disabled={busy || name.trim() === ''}>{t('account_ai.tokens.create')}</Button>
      </form>

      {tokens.length > 0 && (
        <ul className="mt-3 divide-y divide-loam-100 rounded-xl bg-white ring-1 ring-loam-200/70">
          {tokens.map((token) => (
            <Row
              key={token.id}
              title={token.name}
              badge={<AccessBadge access={token.access} />}
              meta={
                <>
                  <code className="font-mono text-xs">{token.hint}</code> ·{' '}
                  {t('account_ai.tokens.meta', {
                    created: formatDate(token.createdAt),
                    used: formatDate(token.lastUsedAt),
                    expires: token.expiresAt ? formatDate(token.expiresAt) : t('account_ai.tokens.never'),
                  })}
                </>
              }
              action={
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-clay-500"
                  onClick={() => {
                    if (!window.confirm(t('account_ai.tokens.confirm_revoke', { name: token.name }))) return
                    router.delete(`/account/ai/tokens/${token.id}`, { preserveScroll: true })
                  }}
                >
                  {t('account_ai.revoke')}
                </Button>
              }
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function Row({ title, badge, meta, action }: { title: string; badge: ReactNode; meta: ReactNode; action: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium text-loam-900">
          <span className="truncate">{title}</span>
          {badge}
        </p>
        <p className="mt-0.5 text-xs text-loam-500">{meta}</p>
      </div>
      {action}
    </li>
  )
}

function AccessBadge({ access }: { access: AiAccessLevel }) {
  return (
    <span className={'shrink-0 rounded-full px-2 py-0.5 text-xs font-normal ' + (access === 'drafts' ? 'bg-humus-100 text-humus-700' : 'bg-loam-100 text-loam-600')}>
      {t(`account_ai.access.${access}`)}
    </span>
  )
}
