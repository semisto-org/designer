import { Head } from '@inertiajs/react'
import { LinkIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { t } from '@/lib/i18n'
import { FormLayout } from '@/pages/project_forms/show'

/** 410: the private link was switched off or replaced by a new one. */
export default function Gone() {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <Head title={t('journey.form.gone.page_title')} />
      <LinkIcon className="mx-auto h-10 w-10 text-loam-400" aria-hidden="true" />
      <h1 className="mt-4 font-serif text-2xl">{t('journey.form.gone.title')}</h1>
      <p className="mt-3 text-loam-600">{t('journey.form.gone.body')}</p>
    </div>
  )
}

Gone.layout = (page: ReactNode) => <FormLayout>{page}</FormLayout>
