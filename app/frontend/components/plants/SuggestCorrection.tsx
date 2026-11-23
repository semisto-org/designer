import { router } from '@inertiajs/react'
import { MessageSquareWarning } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { metres, strataLabel, vocab } from '@/components/plants/format'
import { t } from '@/lib/i18n'
import type { SpeciesSheet } from '@/types/plants'

export type CorrectionOptions = { fields: string[]; choices: Record<string, string[]>; pending: number }

/** A value as the sheet shows it, or null when the sheet has none. */
export function correctionValueLabel(field: string, value: unknown): string | null {
  if (value == null || value === '') return null
  if (field === 'strata') return strataLabel(String(value))
  if (field === 'height_max_m' || field === 'spread_max_m') return metres(Number(value))
  if (field === 'hardiness_zone') return t('plants.units.zone', { zone: String(value) })
  if (field === 'common_name') return String(value)
  return vocab(field, String(value))
}

function currentValue(s: SpeciesSheet, field: string): unknown {
  switch (field) {
    case 'common_name': return s.commonName
    case 'strata': return s.strata
    case 'plant_type': return s.plantType
    case 'life_cycle': return s.lifeCycle
    case 'foliage_type': return s.foliageType
    case 'height_max_m': return s.heightMaxM
    case 'spread_max_m': return s.spreadMaxM
    case 'hardiness_zone': return s.hardinessZone
    default: return null
  }
}

/**
 * « Suggérer une correction »: one field, the right value and where it comes
 * from. A catalogue reviewer reads it before the sheet changes.
 */
export function SuggestCorrection({ species, options }: { species: SpeciesSheet; options: CorrectionOptions }) {
  const [open, setOpen] = useState(false)
  const [field, setField] = useState(options.fields[0])
  const [value, setValue] = useState('')
  const [note, setNote] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [sending, setSending] = useState(false)

  const choices = options.choices[field]
  const current = correctionValueLabel(field, currentValue(species, field))
  const ready = field === 'other' ? note.trim() !== '' : value.trim() !== ''

  const pick = (next: string) => { setField(next); setValue('') }
  const close = () => { setOpen(false); setValue(''); setNote(''); setSourceUrl('') }
  const send = () => {
    setSending(true)
    router.post(`/plants/${species.id}/corrections`, {
      correction: { field, proposed_value: field === 'other' ? null : value, note, source_url: sourceUrl },
    }, { preserveScroll: true, onSuccess: close, onFinish: () => setSending(false) })
  }

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          <MessageSquareWarning className="h-4 w-4" />{t('plants.corrections.button')}
        </Button>
        {options.pending > 0 && <span className="text-sm text-loam-500">{t('plants.corrections.pending', { count: options.pending })}</span>}
      </div>
      <Dialog
        open={open}
        onClose={close}
        title={t('plants.corrections.title')}
        footer={
          <>
            <Button variant="ghost" onClick={close}>{t('plants.corrections.cancel')}</Button>
            <Button onClick={send} disabled={!ready || sending}>{t('plants.corrections.send')}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-loam-600">{t('plants.corrections.intro')}</p>
          <Field label={t('plants.corrections.field')} hint={field === 'other' ? undefined : current ? t('plants.corrections.current', { value: current }) : t('plants.corrections.current_empty')}>
            <Select value={field} onChange={(e) => pick(e.target.value)}>
              {options.fields.map((f) => <option key={f} value={f}>{t(`plants.corrections.fields.${f}`)}</option>)}
            </Select>
          </Field>
          {field !== 'other' && (
            <Field label={t(field.endsWith('_m') ? 'plants.corrections.value_metres' : field === 'hardiness_zone' ? 'plants.corrections.value_zone' : 'plants.corrections.value')}>
              {choices ? (
                <Select value={value} onChange={(e) => setValue(e.target.value)}>
                  <option value="" />
                  {choices.map((key) => <option key={key} value={key}>{correctionValueLabel(field, key)}</option>)}
                </Select>
              ) : field === 'common_name' ? (
                <Input value={value} maxLength={120} onChange={(e) => setValue(e.target.value)} />
              ) : (
                <Input type="number" inputMode="decimal" min={field === 'hardiness_zone' ? 1 : 0.01} max={field === 'hardiness_zone' ? 13 : 199} step={field === 'hardiness_zone' ? 1 : 0.05} value={value} onChange={(e) => setValue(e.target.value)} />
              )}
            </Field>
          )}
          <Field label={field === 'other' ? t('plants.corrections.note_required') : t('plants.corrections.note')}>
            <Textarea rows={3} maxLength={2000} value={note} placeholder={t('plants.corrections.note_placeholder')} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Field label={t('plants.corrections.source_url')} hint={t('plants.corrections.source_hint')}>
            <Input type="url" inputMode="url" maxLength={500} placeholder="https://" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
          </Field>
        </div>
      </Dialog>
    </>
  )
}
