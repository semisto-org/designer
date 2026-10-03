import { Head } from '@inertiajs/react'
import { MapPinOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { ButtonLink } from '@/components/ui/Button'
import PublicLayout from '@/layouts/PublicLayout'
import { t } from '@/lib/i18n'

/** 410: the owner took this map down. */
export default function Gone({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <Head title={t('public_maps.gone.title')} />
      <MapPinOff className="mx-auto h-10 w-10 text-loam-400" aria-hidden="true" />
      <h1 className="mt-4 text-2xl">{t('public_maps.gone.title')}</h1>
      <p className="mt-3 text-loam-600">{t('public_maps.gone.body', { title })}</p>
      <p className="mt-2 text-sm text-loam-500">{t('public_maps.gone.hint')}</p>
      <div className="mt-8">
        <ButtonLink href="/" variant="secondary">{t('public_maps.gone.home')}</ButtonLink>
      </div>
    </div>
  )
}

Gone.layout = (page: ReactNode) => <PublicLayout>{page}</PublicLayout>
