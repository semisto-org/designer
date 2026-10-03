import { Head, useForm } from '@inertiajs/react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { t } from '@/lib/i18n'
import type { RegionData } from '@/types'

export default function MapsNew({ region }: { region: RegionData }) {
  const form = useForm({ map: { name: '', address: '', description: '' } })
  return (
    <div className="mx-auto max-w-xl">
      <Head title={t('maps.new.title')} />
      <h1 className="text-2xl">{t('maps.new.title')}</h1>
      <p className="mt-2 text-loam-500">{t('maps.new.intro', { region: region.name })}</p>
      <Card className="mt-6">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            form.post('/maps')
          }}
        >
          <Field label={t('maps.fields.name')} error={form.errors['map.name' as keyof typeof form.errors]}>
            <Input
              required
              value={form.data.map.name}
              onChange={(e) => form.setData('map', { ...form.data.map, name: e.target.value })}
              placeholder={t('maps.new.name_placeholder')}
            />
          </Field>
          <Field label={t('maps.fields.address')} hint={t('maps.new.address_hint')}>
            <Input
              value={form.data.map.address}
              onChange={(e) => form.setData('map', { ...form.data.map, address: e.target.value })}
            />
          </Field>
          <Field label={t('maps.fields.description')}>
            <Textarea
              rows={3}
              value={form.data.map.description}
              onChange={(e) => form.setData('map', { ...form.data.map, description: e.target.value })}
            />
          </Field>
          <Button type="submit" disabled={form.processing}>{t('maps.new.submit')}</Button>
        </form>
      </Card>
    </div>
  )
}
