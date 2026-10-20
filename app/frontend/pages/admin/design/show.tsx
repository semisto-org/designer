import { Head } from '@inertiajs/react'
import { Eye, Pencil, Sprout, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { AdminNav } from '@/components/admin/AdminNav'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { CompanionEmpty } from '@/components/ui/Companion'
import { confirmAction } from '@/components/ui/confirm'
import { Field, Input } from '@/components/ui/Field'
import { HandNote } from '@/components/ui/HandNote'
import { IconButton } from '@/components/ui/IconButton'
import { Pill, type PillTone } from '@/components/ui/Pill'
import { PlaceSketch } from '@/components/ui/PlaceSketch'
import { Sheet } from '@/components/ui/Sheet'
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/toast'
import { Tooltip } from '@/components/ui/Tooltip'
import { UsageMeter } from '@/components/ui/UsageMeter'
import { formatNumber, t } from '@/lib/i18n'
import type { SketchGeometry } from '@/types/myMaps'

type Rule = 'small-text' | 'native-confirm' | 'hex-color' | 'bare-button'
type Guard = {
  totals: Record<Rule, number>
  files: { path: string; counts: Partial<Record<Rule, number>>; total: number }[]
  fileCount: number
}

const RULES: Rule[] = ['small-text', 'native-confirm', 'hex-color', 'bare-button']
const PILLS: PillTone[] = ['neutral', 'prune', 'leaf', 'humus', 'clay', 'lichen']
const k = (key: string, vars?: Record<string, string | number>) => t(`admin.design.${key}`, vars)

// A small orchard on a slope near Yvoir, for the place sketch.
const SAMPLE: SketchGeometry = {
  type: 'Polygon',
  coordinates: [[[4.8791, 50.3282], [4.8812, 50.3286], [4.8818, 50.3274], [4.8806, 50.3266], [4.8789, 50.3270], [4.8791, 50.3282]]],
}

const gigabytes = (n: number) => `${formatNumber(n)} Go`

/** Super admin « Design »: the « carnet » primitives, live, and what remains to migrate. */
export default function AdminDesignPage({ guard }: { guard: Guard }) {
  const [sheet, setSheet] = useState(false)
  const askDanger = async () => {
    const yes = await confirmAction({
      title: k('sections.confirm.danger_title'), body: k('sections.confirm.danger_body'),
      note: k('sections.confirm.danger_note'), confirmLabel: t('common.delete'), tone: 'danger',
    })
    toast(k(yes ? 'sections.confirm.yes' : 'sections.confirm.no'), { tone: yes ? 'success' : 'info' })
  }
  const askDefault = async () => {
    const yes = await confirmAction({
      title: k('sections.confirm.default_title'), body: k('sections.confirm.default_body'), confirmLabel: k('sections.confirm.archive'),
    })
    toast(k(yes ? 'sections.confirm.yes' : 'sections.confirm.no'), { tone: yes ? 'success' : 'info' })
  }

  return (
    <div>
      <Head title={k('title')} />
      <AdminNav />
      <header className="mb-8 max-w-3xl">
        <h1 className="text-3xl">{k('title')}</h1>
        <p className="mt-2 text-loam-600">{k('intro')}</p>
      </header>

      <GuardSection guard={guard} />

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <Specimen id="buttons" code="Button, ButtonLink, IconButton">
          <div className="flex flex-wrap gap-2">
            <Button>{k('sections.buttons.primary')}</Button>
            <Button variant="leaf">{k('sections.buttons.leaf')}</Button>
            <Button variant="secondary">{k('sections.buttons.secondary')}</Button>
            <Button variant="ghost">{k('sections.buttons.ghost')}</Button>
            <Button variant="danger">{k('sections.buttons.danger')}</Button>
            <Button disabled>{k('sections.buttons.disabled')}</Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm">{k('sections.buttons.primary')}</Button>
            <Button size="lg">{k('sections.buttons.primary')}</Button>
          </div>
          <p className="mt-4 text-sm text-loam-500">{k('sections.buttons.icons')}</p>
          <div className="mt-2 flex items-center gap-1">
            <IconButton label={k('sections.buttons.edit')}><Pencil /></IconButton>
            <IconButton label={k('sections.buttons.layer')} pressed><Eye /></IconButton>
            <IconButton label={k('sections.buttons.layer')} tone="prune"><Sprout /></IconButton>
            <IconButton label={k('sections.buttons.remove')} tone="danger"><Trash2 /></IconButton>
            <IconButton label={k('sections.buttons.edit')} size="sm"><Pencil /></IconButton>
          </div>
        </Specimen>

        <Specimen id="confirm" code="confirmAction(), useConfirm(), ConfirmDialog">
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" onClick={askDanger}>{k('sections.confirm.danger_button')}</Button>
            <Button variant="secondary" onClick={askDefault}>{k('sections.confirm.default_button')}</Button>
          </div>
        </Specimen>

        <Specimen id="sheet" code="Sheet">
          <Button variant="secondary" onClick={() => setSheet(true)}>{k('sections.sheet.open')}</Button>
          <Sheet
            open={sheet}
            onClose={() => setSheet(false)}
            title={k('sections.sheet.sheet_title')}
            footer={<Button onClick={() => setSheet(false)}>{k('sections.sheet.done')}</Button>}
          >
            <PlaceSketch id={7} name={k('sections.place.sample')} boundary={SAMPLE} areaM2={8400} />
            <p className="mt-4 text-sm leading-relaxed text-loam-700">{k('sections.sheet.body')}</p>
            <HandNote className="mt-3" tone="leaf">{k('sections.hand.leaf')}</HandNote>
          </Sheet>
        </Specimen>

        <Specimen id="toast" code="toast(message, { tone, action })">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => toast(k('sections.toast.info_message'))}>{k('sections.toast.info')}</Button>
            <Button variant="secondary" size="sm" onClick={() => toast(k('sections.toast.success_message'), { tone: 'success' })}>{k('sections.toast.success')}</Button>
            <Button variant="secondary" size="sm" onClick={() => toast(k('sections.toast.error_message'), { tone: 'error' })}>{k('sections.toast.error')}</Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => toast(k('sections.toast.action_message'), {
                action: { label: k('sections.toast.undo'), run: () => toast(k('sections.toast.undone'), { tone: 'success' }) },
              })}
            >
              {k('sections.toast.action')}
            </Button>
          </div>
        </Specimen>

        <Specimen id="tooltip" code="Tooltip">
          <p className="text-sm text-loam-700">
            {k('sections.tooltip.before')}
            <Tooltip content={k('sections.tooltip.explanation')}>
              <span tabIndex={0} className="cursor-help font-medium text-prune-700 underline decoration-dotted underline-offset-4">
                {k('sections.tooltip.term')}
              </span>
            </Tooltip>
            {k('sections.tooltip.after')}
          </p>
        </Specimen>

        <Specimen id="pill" code="Pill">
          <div className="flex flex-wrap gap-2">
            {PILLS.map((tone) => <Pill key={tone} tone={tone}>{k(`sections.pill.${tone}`)}</Pill>)}
            <Pill tone="leaf" icon={<Sprout />}>{k('sections.pill.leaf')}</Pill>
          </div>
        </Specimen>

        <Specimen id="empty" code="CompanionEmpty">
          <CompanionEmpty
            title={k('sections.empty.heading')}
            why={k('sections.empty.why')}
            action={<Button>{k('sections.empty.action')}</Button>}
            note={k('sections.empty.note')}
          />
        </Specimen>

        <Specimen id="hand" code="HandNote">
          <div className="flex flex-col items-start gap-3">
            <HandNote arrow="left">{k('sections.hand.left')}</HandNote>
            <HandNote arrow="down" tone="loam">{k('sections.hand.down')}</HandNote>
            <HandNote arrow="right" tone="leaf">{k('sections.hand.leaf')}</HandNote>
          </div>
        </Specimen>

        <Specimen id="skeleton" code="Skeleton, SkeletonText">
          <div className="flex gap-4">
            <Skeleton shape="circle" />
            <SkeletonText className="flex-1" />
          </div>
          <Skeleton shape="block" className="mt-4" />
        </Specimen>

        <Specimen id="usage" code="UsageMeter">
          <div className="space-y-4">
            <UsageMeter label={k('sections.usage.maps')} used={1} limit={3} />
            <UsageMeter label={k('sections.usage.storage')} used={4.2} limit={5} format={gigabytes} hint={k('sections.usage.storage_hint')} />
            <UsageMeter label={k('sections.usage.images')} used={10} limit={10} />
            <UsageMeter label={k('sections.usage.archived')} used={4} limit={null} />
          </div>
        </Specimen>

        <Specimen id="place" code="PlaceSketch">
          <div className="grid grid-cols-2 gap-3">
            <PlaceSketch id={7} name={k('sections.place.sample')} boundary={SAMPLE} areaM2={8400} />
            <PlaceSketch id={8} name={k('sections.place.empty')} boundary={null} />
          </div>
        </Specimen>

        <Specimen id="fields" code="Field, Input, Select, Textarea, Card, Dialog">
          <Card>
            <Field label={k('sections.fields.label')} hint={k('sections.fields.hint')}>
              <Input placeholder={k('sections.fields.placeholder')} />
            </Field>
          </Card>
        </Specimen>
      </div>
    </div>
  )
}

function Specimen({ id, code, children }: { id: string; code: string; children: ReactNode }) {
  return (
    <section id={id} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-loam-900/10">
      <h2 className="text-xl">{k(`sections.${id}.title`)}</h2>
      <p className="mt-1 text-sm text-loam-600">
        <span className="font-semibold text-loam-700">{k('use')} : </span>{k(`sections.${id}.use`)}
      </p>
      <code className="mt-2 inline-block rounded-md bg-loam-100 px-2 py-0.5 font-mono text-sm text-prune-800">{code}</code>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function GuardSection({ guard }: { guard: Guard }) {
  const remaining = RULES.reduce((sum, rule) => sum + (guard.totals[rule] ?? 0), 0)
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-loam-900/10">
      <h2 className="text-xl">{k('guard.title')}</h2>
      <p className="mt-1 max-w-3xl text-sm text-loam-600">{k('guard.intro')}</p>
      {remaining === 0 ? (
        <HandNote className="mt-4" tone="leaf">{k('guard.clean')}</HandNote>
      ) : (
        <>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {RULES.map((rule) => (
              <div key={rule} className="rounded-xl bg-loam-50 px-4 py-3">
                <dt className="text-sm text-loam-600">{k(`guard.rules.${rule}`)}</dt>
                <dd className="mt-1 font-serif text-3xl font-semibold tabular-nums text-prune-800">{formatNumber(guard.totals[rule] ?? 0)}</dd>
                <dd className="text-sm text-loam-500">{k(`guard.hints.${rule}`)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 text-sm text-loam-600">{k('guard.files', { count: guard.fileCount })}</p>
          <ul className="mt-2 divide-y divide-loam-100 text-sm">
            {guard.files.map((file) => (
              <li key={file.path} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <code className="break-all font-mono text-loam-700">{file.path.replace('app/frontend/', '')}</code>
                <span className="flex flex-wrap gap-1">
                  {RULES.filter((rule) => file.counts[rule]).map((rule) => (
                    <Pill key={rule} tone={rule === 'native-confirm' ? 'clay' : 'neutral'}>{k(`guard.rules.${rule}`)} · {file.counts[rule]}</Pill>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 font-mono text-sm text-loam-500">{k('guard.command')}</p>
        </>
      )}
    </section>
  )
}
