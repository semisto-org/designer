import { Head } from '@inertiajs/react'
import { FolderLock } from 'lucide-react'
import type { ReactNode } from 'react'
import PublicLayout from '@/layouts/PublicLayout'
import { t } from '@/lib/i18n'

/** 410: the team took this deliverable down, or gave it a new link. */
export default function DeliverableGone({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <Head title={t('deliverables.gone.title')}>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <FolderLock className="mx-auto h-10 w-10 text-loam-400" aria-hidden="true" />
      <h1 className="mt-4 text-2xl">{t('deliverables.gone.title')}</h1>
      <p className="mt-2 font-serif text-lg text-loam-700">{title}</p>
      <p className="mt-3 text-loam-600">{t('deliverables.gone.body')}</p>
    </div>
  )
}

DeliverableGone.layout = (page: ReactNode) => <PublicLayout>{page}</PublicLayout>
