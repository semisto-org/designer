import { Head, Link, useForm, usePage } from '@inertiajs/react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, Input } from '@/components/ui/Field'
import { t } from '@/lib/i18n'
import type { SharedProps } from '@/types'

export default function SignIn({ reviewAccess = false }: { reviewAccess?: boolean }) {
  const { env } = usePage().props as unknown as SharedProps
  const query = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
  const sent = query.get('sent')
  const [withPassword, setWithPassword] = useState(query.has('password'))
  const form = useForm({ email_address: sent ?? '', password: '' })
  const csrf = typeof document !== 'undefined'
    ? document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content
    : ''

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <Head title={t('sessions.new.title')} />
      <h1 className="text-2xl">{t('sessions.new.title')}</h1>
      <p className="mt-2 text-loam-500">{t('sessions.new.intro')}</p>
      <Card className="mt-8 space-y-6">
        {env.googleSignIn && !sent && (
          <form method="post" action="/auth/google_oauth2">
            <input type="hidden" name="authenticity_token" value={csrf} />
            <Button type="submit" variant="secondary" className="w-full" size="lg">
              <GoogleIcon />
              {t('sessions.new.google')}
            </Button>
          </form>
        )}
        {env.googleSignIn && !sent && (
          <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-loam-400">
            <span className="h-px flex-1 bg-loam-200" />
            {t('sessions.new.or')}
            <span className="h-px flex-1 bg-loam-200" />
          </div>
        )}
        {sent ? (
          <CodeForm email={sent} />
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (withPassword) {
                form.transform((data) => data)
                form.post('/session/password', { onFinish: () => form.reset('password') })
              } else {
                form.transform(({ email_address }) => ({ email_address }))
                form.post('/session')
              }
            }}
            className="space-y-4"
          >
            <Field label={t('sessions.new.email')}>
              <Input
                type="email"
                required
                autoComplete={withPassword ? 'username' : 'email'}
                value={form.data.email_address}
                onChange={(e) => form.setData('email_address', e.target.value)}
                placeholder="prenom@exemple.be"
              />
            </Field>
            {withPassword && (
              <Field label={t('sessions.new.password')}>
                <Input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={form.data.password}
                  onChange={(e) => form.setData('password', e.target.value)}
                />
              </Field>
            )}
            <Button type="submit" className="w-full" size="lg" disabled={form.processing}>
              {withPassword ? t('sessions.new.password_submit') : t('sessions.new.send_link')}
            </Button>
            <p className="text-xs text-loam-400">
              {withPassword ? t('sessions.new.password_forgotten') : t('sessions.new.no_password')}
            </p>
            <button
              type="button"
              className="text-sm font-medium text-prune-700 underline-offset-2 hover:underline"
              onClick={() => setWithPassword(!withPassword)}
            >
              {withPassword ? t('sessions.new.use_link') : t('sessions.new.use_password')}
            </button>
          </form>
        )}
      </Card>
      {reviewAccess && <ReviewAccess csrf={csrf ?? ''} />}
    </div>
  )
}

// After the e-mail is sent: the link works on any device; the six-digit code
// signs in here, for when the mailbox is on another device.
function CodeForm({ email }: { email: string }) {
  const form = useForm({ email_address: email, code: '' })
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        form.post('/session/code', { onFinish: () => form.reset('code') })
      }}
      className="space-y-4"
    >
      <div className="rounded-lg bg-leaf-50 p-4 text-sm text-leaf-800">
        {t('sessions.new.check_inbox', { email })}
      </div>
      <Field label={t('sessions.new.code')}>
        <Input
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          value={form.data.code}
          onChange={(e) => form.setData('code', e.target.value)}
          placeholder="123456"
          className="text-center font-mono text-2xl tracking-[0.4em]"
        />
      </Field>
      <Button type="submit" className="w-full" size="lg" disabled={form.processing}>
        {t('sessions.new.code_submit')}
      </Button>
      <Link href="/session/new" className="block text-sm font-medium text-prune-700 underline-offset-2 hover:underline">
        {t('sessions.new.other_email')}
      </Link>
    </form>
  )
}

// For the app stores' reviewers only (AppReview on the server).
function ReviewAccess({ csrf }: { csrf: string }) {
  return (
    <details className="mt-8 text-sm text-loam-500">
      <summary className="cursor-pointer">{t('app_review.toggle')}</summary>
      <form method="post" action="/session/review" className="mt-4 space-y-4">
        <input type="hidden" name="authenticity_token" value={csrf} />
        <p>{t('app_review.intro')}</p>
        <Field label={t('app_review.email')}>
          <Input type="email" name="email_address" required autoComplete="username" />
        </Field>
        <Field label={t('app_review.code')}>
          <Input type="password" name="code" required autoComplete="current-password" />
        </Field>
        <Button type="submit" variant="secondary" className="w-full">{t('app_review.submit')}</Button>
      </form>
    </details>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6H1.4a12 12 0 0 0 0 10.9l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
    </svg>
  )
}
