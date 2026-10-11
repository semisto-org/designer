import { Head, Link, router } from '@inertiajs/react'
import { Copy, Inbox, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, EmptyState } from '@/components/ui/Card'
import { t } from '@/lib/i18n'
import type { TemplateAccount } from '@/types/offer_templates'

/**
 * « Barèmes d'offre »: how each account I price for (mine, my teams')
 * prices its offers. Each starts as a copy of Semisto's pricing.
 */
export default function OfferTemplatesIndex({ accounts }: { accounts: TemplateAccount[] }) {
  const create = (account: string, from?: number) => router.post('/offer_templates', { account, from: from ?? null })
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Head title={t('offer_templates.index.title')} />
      <h1 className="text-2xl">{t('offer_templates.index.title')}</h1>
      <p className="max-w-2xl text-sm text-loam-600">{t('offer_templates.index.intro')}</p>
      {accounts.length > 0 && (
        <Link href="/request_forms" className="flex items-start gap-3 rounded-2xl bg-leaf-50 p-4 ring-1 ring-leaf-200 hover:bg-leaf-100">
          <Inbox className="mt-0.5 h-5 w-5 shrink-0 text-leaf-700" aria-hidden />
          <span>
            <span className="block font-medium text-leaf-800">{t('offer_templates.index.requests_link')}</span>
            <span className="block text-sm text-loam-600">{t('offer_templates.index.requests_hint')}</span>
          </span>
        </Link>
      )}

      {accounts.length === 0 && <EmptyState title={t('offer_templates.index.empty_title')}>{t('offer_templates.index.empty_body')}</EmptyState>}

      {accounts.map((account) => (
        <Card key={account.key} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-serif text-xl font-semibold text-prune-800">
              {account.name ? t('offer_templates.index.team', { name: account.name }) : t('offer_templates.index.mine')}
            </h2>
            {account.canEdit && (
              <Button size="sm" variant="secondary" onClick={() => create(account.key)}>
                <Plus className="h-4 w-4" aria-hidden />{t('offer_templates.index.new_from_semisto')}
              </Button>
            )}
          </div>
          {account.templates.length === 0 ? (
            <p className="text-sm text-loam-500">{t('offer_templates.index.none')}</p>
          ) : (
            <ul className="divide-y divide-loam-100">
              {account.templates.map((template) => (
                <li key={template.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="font-medium text-loam-900">{template.name}</p>
                    <p className="text-sm text-loam-500">
                      {template.clientTypes.length > 0
                        ? t('offer_templates.index.for', { types: template.clientTypes.map((type) => t(`offers.client_types.${type}`)).join(', ') })
                        : t('offer_templates.index.for_any')}
                    </p>
                  </div>
                  {account.canEdit && (
                    <span className="flex gap-1">
                      <Link href={`/offer_templates/${template.id}/edit`} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-prune-700 hover:bg-prune-50">
                        <Pencil className="h-3.5 w-3.5" aria-hidden />{t('offer_templates.index.edit')}
                      </Link>
                      <button type="button" onClick={() => create(account.key, template.id)} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-loam-600 hover:bg-loam-100">
                        <Copy className="h-3.5 w-3.5" aria-hidden />{t('offer_templates.index.copy')}
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="text-sm text-loam-500">{t('offer_templates.index.default_note')}</p>
        </Card>
      ))}
    </div>
  )
}
