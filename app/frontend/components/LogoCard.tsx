import { router, usePage } from '@inertiajs/react'
import { ImagePlus } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { t } from '@/lib/i18n'

/**
 * The logo printed at the top of a map's documents, chosen on a team's page
 * (admins) or in « Mon compte » (pro accounts). Shown as it will look on the
 * page: on paper, with the map's name beside it.
 */
export function LogoCard({ logoUrl, endpoint, param, intro, canEdit = true }: {
  logoUrl: string | null
  /** /account/logo or /teams/:id/logo */
  endpoint: string
  param: 'user' | 'team'
  intro: string
  canEdit?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const error = (usePage().props.errors as unknown as Record<string, string> | undefined)?.logo
  const upload = (file: File) => {
    setBusy(true)
    router.post(endpoint, { _method: 'patch', [param]: { logo: file } }, { forceFormData: true, preserveScroll: true, onFinish: () => setBusy(false) })
  }

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-base"><ImagePlus className="h-4 w-4 text-leaf-500" aria-hidden="true" />{t('logos.title')}</h2>
      <p className="mt-2 text-sm text-loam-600">{intro}</p>
      <div className="mt-4 flex min-h-20 items-center rounded-xl border border-dashed border-loam-300 bg-[#fffdf8] px-5 py-4">
        {logoUrl
          ? <img src={logoUrl} alt="" className="max-h-14 max-w-[14rem] object-contain" />
          : <p className="text-sm text-loam-500">{t('logos.none')}</p>}
      </div>
      {canEdit && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? t('logos.uploading') : logoUrl ? t('logos.change') : t('logos.choose')}
            </Button>
            {logoUrl && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => router.delete(endpoint, { preserveScroll: true })}>{t('logos.remove')}</Button>
            )}
          </div>
          <p className={error ? 'mt-1.5 text-sm text-clay-700' : 'mt-1.5 text-sm text-loam-500'}>{error ?? t('logos.hint')}</p>
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) upload(file)
            }} />
        </>
      )}
    </Card>
  )
}
