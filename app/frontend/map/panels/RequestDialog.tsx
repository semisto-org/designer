import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { SchemaFields } from '@/components/journey/SchemaFields'
import { ApiError, api } from '@/lib/api'
import { t } from '@/lib/i18n'
import type { PlantLine, RequestKind, RequestPrefill, RequestsData, SchemaField } from '@/types/journey'

const prefix = (kind: RequestKind) => `journey.requests.kinds.${kind}.fields`

function initialValues(kind: RequestKind, prefill: RequestPrefill): Record<string, unknown> {
  if (kind === 'order_plants') return { plants: prefill.plants.map((p) => ({ ...p })), commune: prefill.commune }
  if (kind === 'implementation') {
    return {
      surface_m2: prefill.surfaceM2, address: prefill.address, commune: prefill.commune,
      include_plant_list: prefill.plants.length > 0,
    }
  }
  return {}
}

/** The form of one request to Semisto, built from the server's schema of that kind. */
export function RequestDialog({ mapId, kind, schema, prefill, onClose, onSent }: {
  mapId: number
  kind: RequestKind | null
  schema: Record<RequestKind, SchemaField[]>
  prefill: RequestPrefill
  onClose: () => void
  onSent: (data: RequestsData) => void
}) {
  if (!kind) return null
  return <RequestForm key={kind} mapId={mapId} kind={kind} fields={schema[kind]} prefill={prefill} onClose={onClose} onSent={onSent} />
}

function RequestForm({ mapId, kind, fields, prefill, onClose, onSent }: {
  mapId: number; kind: RequestKind; fields: SchemaField[]; prefill: RequestPrefill; onClose: () => void; onSent: (data: RequestsData) => void
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() => initialValues(kind, prefill))
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // For an implementation the plant list is attached as a whole, not edited here.
  const shown = useMemo(
    () => fields.filter((f) => !(kind === 'implementation' && f.key === 'plants') && !(f.key === 'include_plant_list' && prefill.plants.length === 0)),
    [fields, kind, prefill.plants.length],
  )

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!consent || busy) return
    setBusy(true)
    setError(null)
    const payload: Record<string, unknown> = { ...values }
    if (kind === 'implementation') {
      if (values.include_plant_list) payload.plants = prefill.plants as PlantLine[]
      else delete payload.plants
    }
    try {
      const data = await api<RequestsData>(`/maps/${mapId}/requests`, {
        method: 'POST',
        body: { service_request: { kind, contact_consent: true, payload } },
      })
      onSent(data)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('journey.requests.unavailable'))
      setBusy(false)
    }
  }

  const source = kind === 'order_plants'
    ? prefill.plantsSource === 'plant_list' ? t('journey.requests.prefill_plant_list')
      : prefill.plantsSource === 'features' ? t('journey.requests.prefill_features')
      : t('journey.requests.prefill_none')
    : null

  const formId = `request-form-${kind}`
  return (
    <Dialog
      open onClose={onClose} dismissOnBackdrop={false}
      title={t(`journey.requests.kinds.${kind}.title`)}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t('journey.requests.cancel')}</Button>
          <Button type="submit" form={formId} disabled={!consent || busy}>{busy ? t('journey.requests.sending') : t('journey.requests.submit')}</Button>
        </>
      )}
    >
      <form id={formId} onSubmit={submit} className="space-y-5">
        <p className="text-sm text-loam-600">{t(`journey.requests.kinds.${kind}.summary`)}</p>
        {source && <p className="rounded-lg bg-leaf-50 px-3 py-2 text-sm text-leaf-800">{source}</p>}
        <SchemaFields
          fields={shown} values={values} prefix={prefix(kind)}
          onChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
          disabled={busy}
        />
        {kind === 'implementation' && values.include_plant_list === true && prefill.plants.length > 0 && (
          <p className="-mt-3 text-xs text-loam-500">{t('journey.requests.attached', { count: prefill.plants.length })}</p>
        )}
        <div className="rounded-lg bg-loam-50 p-3">
          <label className="flex cursor-pointer items-start gap-2.5 text-sm font-medium text-loam-800">
            <input
              type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required
              className="mt-0.5 h-4 w-4 rounded border-loam-300 text-prune-600 focus:ring-prune-500"
            />
            <span>{t('journey.requests.consent')}</span>
          </label>
          <p className="mt-1.5 pl-6 text-xs text-loam-500">{t('journey.requests.consent_hint')}</p>
        </div>
        {error && <p role="alert" className="rounded-lg bg-clay-50 px-3 py-2 text-sm text-clay-700">{error}</p>}
      </form>
    </Dialog>
  )
}
