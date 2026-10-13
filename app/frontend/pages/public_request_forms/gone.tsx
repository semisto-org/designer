import { Head } from '@inertiajs/react'
import { LinkIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { t } from '@/lib/i18n'
import { FormLayout } from '@/pages/project_forms/show'

/** 404: the form was closed, or its account no longer has a pro plan. */
export default function Gone() {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <Head title={t('request_forms.public.gone.title')} />
      <LinkIcon className="mx-auto h-10 w-10 text-loam-400" aria-hidden="true" />
      <h1 className="mt-4 font-serif text-2xl">{t('request_forms.public.gone.title')}</h1>
      <p className="mt-3 text-loam-600">{t('request_forms.public.gone.body')}</p>
    </div>
  )
}

Gone.layout = (page: ReactNode) => <FormLayout>{page}</FormLayout>
