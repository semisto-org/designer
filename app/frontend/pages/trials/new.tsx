import { Head, Link, router } from '@inertiajs/react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { ApiError, api } from '@/lib/api'
import { track } from '@/lib/analytics'
import { t } from '@/lib/i18n'
import { AddressSearch } from '@/map/data/AddressSearch'
import type { TrialNewProps } from '@/types/trials'
import type { GeocodeResult } from '@/types/map_data'

/**
 * « Et chez toi ? »: one question, the visitor's address. The trial starts
 * on the place found, with no account.
 */
export default function TrialNew({ from }: TrialNewProps) {
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function start(place: GeocodeResult) {
    setStarting(true)
    setError(null)
    try {
      const { path } = await api<{ path: string }>('/essai', {
        method: 'POST',
        body: { lng: place.lng, lat: place.lat, address: [place.label, place.detail].filter(Boolean).join(', '), from: from?.token },
      })
      track('try_address', { from: from ? 'public_map' : 'direct' })
      router.visit(path)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('trials.errors.invalid_place'))
      setStarting(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 md:py-16">
      <Head title={t('trials.new.title')}>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      {from && (
        <Link href={from.path} className="mb-6 inline-flex items-center gap-1.5 text-sm text-prune-700 hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('trials.new.back')}
        </Link>
      )}
      <section className="relative overflow-hidden rounded-2xl bg-loam-50 p-6 shadow-sm ring-1 ring-loam-200 md:p-10">
        {from && <p className="font-hand text-2xl text-leaf-700">{t('trials.new.from', { title: from.title })}</p>}
        <h1 className="mt-1 font-serif text-4xl text-loam-900 md:text-5xl">{t('trials.new.title')}</h1>
        <p className="mt-3 max-w-xl text-loam-700">{t('trials.new.intro')}</p>

        <div className="mt-6 max-w-xl">
          <AddressSearch
            endpoint="/essai/geocode"
            label={t('trials.new.search')}
            placeholder={t('trials.new.placeholder')}
            onSelect={(place) => void start(place)}
          />
          {starting && (
            <p className="mt-3 inline-flex items-center gap-2 text-sm text-loam-600" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {t('trials.new.starting')}
            </p>
          )}
          {error && <p className="mt-3 text-sm text-clay-600" role="alert">{error}</p>}
          <p className="mt-4 text-sm text-loam-500">{t('trials.new.privacy')}</p>
        </div>

        <div className="mt-8 border-t border-dashed border-loam-300 pt-5">
          <p className="text-sm font-medium text-loam-600">{t('trials.new.notes.title')}</p>
          <ul className="mt-2 space-y-1 font-hand text-2xl leading-snug text-loam-800">
            {(['parcel', 'slope', 'sun'] as const).map((key) => (
              <li key={key} className="flex gap-2"><span className="text-leaf-600" aria-hidden="true">~</span>{t(`trials.new.notes.${key}`)}</li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  )
}
