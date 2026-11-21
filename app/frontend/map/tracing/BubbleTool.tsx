import clsx from 'clsx'
import { Check, Circle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { t } from '@/lib/i18n'
import { useEditor, type Editor } from '@/map/editor/EditorContext'
import { featureColor } from '@/map/drawing/catalog'
import { revealForDrawing } from '@/map/drawing/store'
import { useElementFunctions } from '@/map/functions/store'
import { nextZoneColor } from '@/map/zones/zones'
import { BUBBLE_KIND } from './sheets'

const BUBBLE_LAYER = 'drawings'

/**
 * « Bulle »: the first gesture of a design, before any element. A name
 * (« Se retrouver », « Cueillir », « Garder l'eau »…), the project's
 * functions it answers, then a loose shape drawn by hand on the base plan.
 * The tool stays open for the next bubble until « Terminer ».
 */
export function BubbleTool({ onClose }: { onClose: () => void }) {
  const editor = useEditor()
  const latest = useRef<Editor>(editor)
  latest.current = editor
  const { data } = useElementFunctions()
  const functions = data?.project ?? []
  const used = () => latest.current.features.filter((f) => f.properties.kind === BUBBLE_KIND).map(featureColor)
  const [name, setName] = useState('')
  const [serves, setServes] = useState<string[]>([])
  const [drawing, setDrawing] = useState(false)
  const nameInput = useRef<HTMLInputElement>(null)

  // Once its card is laid out (a hidden card cannot take the focus).
  useEffect(() => {
    if (drawing) return
    const timer = window.setTimeout(() => nameInput.current?.focus(), 60)
    return () => window.clearTimeout(timer)
  }, [drawing])
  useEffect(() => () => latest.current.cancelDraw(), [])

  // A function picked first names the bubble, as a designer writes it in the blob.
  function toggle(id: string) {
    const next = serves.includes(id) ? serves.filter((s) => s !== id) : [...serves, id]
    setServes(next)
    const fn = functions.find((f) => f.id === id)
    if (fn && !serves.includes(id) && name.trim() === '') setName(fn.name)
  }

  async function draw() {
    revealForDrawing(BUBBLE_LAYER, BUBBLE_KIND)
    const color = nextZoneColor(used())
    setDrawing(true)
    const geometry = await latest.current.draw('freehand', { color })
    setDrawing(false)
    if (!geometry) return
    const label = name.trim()
    try {
      const feature = await latest.current.createFeature({
        layer: BUBBLE_LAYER, kind: BUBBLE_KIND, geometry,
        properties: { rounded: true, ...(serves.length ? { serves } : {}) },
        style: { color }, ...(label ? { name: label } : {}),
      })
      latest.current.select(feature.properties.id)
      latest.current.notify(t(label ? 'tracing.bubble.created' : 'tracing.bubble.created_unnamed', { name: label }))
      setName('')
      setServes([])
    } catch (error) {
      latest.current.notify((error as Error).message, 'error')
    }
  }

  if (drawing) {
    return (
      <div className="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-loam-900/90 px-3 py-2 text-sm text-white shadow-lg" role="status">
        <span className="min-w-0 flex-1">{t('tracing.bubble.hint')}</span>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="ghost" className="text-white hover:bg-white/10" onClick={() => editor.cancelDraw()}>{t('drawing.toolbar.cancel')}</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="pointer-events-auto rounded-xl bg-white p-3 shadow-xl ring-1 ring-loam-200" role="region" aria-label={t('tracing.bubble.title')}>
      <p className="text-sm text-loam-600">{t('tracing.bubble.intro')}</p>
      <label className="mt-3 block">
        <span className="text-sm font-medium text-loam-800">{t('tracing.bubble.name')}</span>
        <Input
          ref={nameInput}
          value={name}
          maxLength={120}
          placeholder={t('tracing.bubble.name_placeholder')}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void draw()}
          className="mt-1"
        />
      </label>
      {functions.length > 0 ? (
        <div className="mt-3">
          <p className="text-sm font-medium text-loam-800">{t('tracing.bubble.serves')}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {functions.map((fn) => {
              const on = serves.includes(fn.id)
              return (
                <Button
                  key={fn.id} size="sm" variant={on ? 'primary' : 'ghost'} aria-pressed={on} onClick={() => toggle(fn.id)}
                  className={clsx('gap-1 px-2.5 py-0.5', !on && 'font-normal ring-1 ring-inset ring-loam-200')}
                >
                  {on && <Check className="h-3.5 w-3.5" aria-hidden />}
                  {fn.name}
                </Button>
              )
            })}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-loam-500">
          {t('tracing.bubble.no_functions')}{' '}
          <Button variant="ghost" size="sm" className="-ml-2" onClick={() => editor.openPanel('functions')}>{t('tracing.bubble.open_functions')}</Button>
        </p>
      )}
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose}>{t('drawing.toolbar.close')}</Button>
        <Button size="sm" onClick={() => void draw()}>
          <Circle className="h-4 w-4" aria-hidden />
          {t('tracing.bubble.draw')}
        </Button>
      </div>
    </div>
  )
}
