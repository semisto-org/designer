import { Head } from '@inertiajs/react'
import { Check, ExternalLink, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import PublicLayout from '@/layouts/PublicLayout'
import type { AiAccessLevel } from '@/types/mcp'

type Props = {
  client: { name: string; redirectHost: string; clientUri: string | null }
  account: { name: string; email: string }
  requestedAccess: AiAccessLevel
  planAllowsDrafts: boolean
  fields: Record<string, string>
}

function csrfToken(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? ''
}

/**
 * OAuth consent: a regular HTML form (not an Inertia visit), because the
 * answer is a redirect to the client (claude.ai, a local port, an app).
 */
export default function OauthAuthorize({ client, account, requestedAccess, planAllowsDrafts, fields }: Props) {
  const [access, setAccess] = useState<AiAccessLevel>(requestedAccess)
  return (
    <div className="px-4 py-10 sm:py-16">
      <Head title={t('oauth.authorize.page_title')} />
      <div className="mx-auto max-w-lg rounded-2xl bg-white p-6 shadow-sm ring-1 ring-loam-200/70 sm:p-8">
        <div className="flex items-center gap-2 text-sm text-loam-500">
          <Logo />
          <span>Semisto Designer</span>
        </div>
        <h1 className="mt-5 text-xl leading-snug">{t('oauth.authorize.title', { client: client.name })}</h1>
        <p className="mt-2 text-sm text-loam-600">
          {t('oauth.authorize.signed_in_as', { name: account.name, email: account.email })}
        </p>
        <p className="mt-3 rounded-lg bg-loam-50 p-3 text-xs text-loam-600">
          {t('oauth.authorize.redirect_notice', { host: client.redirectHost })}
          {client.clientUri && (
            <a href={client.clientUri} rel="noopener noreferrer" target="_blank" className="ml-1 inline-flex items-center gap-0.5 text-prune-600 hover:underline">
              {t('oauth.authorize.client_site')}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </p>

        <form method="post" action="/oauth/authorize" className="mt-6">
          <input type="hidden" name="authenticity_token" value={csrfToken()} />
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <fieldset>
            <legend className="text-sm font-semibold text-loam-900">{t('oauth.authorize.access_legend')}</legend>
            <div className="mt-2 space-y-2">
              {(['read', 'drafts'] as const).map((level) => (
                <label
                  key={level}
                  className={clsx(
                    'flex cursor-pointer gap-3 rounded-xl p-3 ring-1 transition',
                    access === level ? 'bg-prune-50 ring-prune-400' : 'ring-loam-200 hover:bg-loam-50',
                  )}
                >
                  <input
                    type="radio"
                    name="access"
                    value={level}
                    checked={access === level}
                    onChange={() => setAccess(level)}
                    className="mt-0.5 text-prune-600 focus:ring-prune-500"
                  />
                  <span>
                    <span className="block text-sm font-medium text-loam-900">{t(`oauth.authorize.access.${level}.title`)}</span>
                    <span className="block text-sm text-loam-600">{t(`oauth.authorize.access.${level}.body`)}</span>
                    {level === 'drafts' && !planAllowsDrafts && (
                      <span className="mt-1 block text-xs text-humus-700">{t('oauth.authorize.access.drafts.plan')}</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-6 rounded-xl bg-leaf-50/70 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-loam-900">
              <ShieldCheck className="h-4 w-4 text-leaf-600" />
              {t('oauth.authorize.guardrails_title')}
            </p>
            <ul className="mt-2 space-y-1 text-sm text-loam-700">
              {(['never', 'networks', 'journal', 'revoke'] as const).map((key) => (
                <li key={key} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" />{t(`account_ai.guardrails.${key}`)}</li>
              ))}
            </ul>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="submit" name="decision" value="deny" variant="secondary">{t('oauth.authorize.deny')}</Button>
            <Button type="submit" name="decision" value="approve">{t('oauth.authorize.approve', { client: client.name })}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

OauthAuthorize.layout = PublicLayout
