import { Mountain, Shovel, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { HelpButton } from '@/components/help/HelpButton'
import { formatNumber, t, translations } from '@/lib/i18n'
import { elementFor } from '@/map/drawing/catalog'
import { useDrawingState } from '@/map/drawing/store'
import { useEditor } from '@/map/editor/EditorContext'
import { isDiggable, isDone, receiverGap, SOIL_PARTS, TRUCK_M3, WHEELBARROW_M3, type Destination } from '@/map/earthworks/earthworks'
import { featureName, loadsText, m3, setArrowsShown, useArrowsShown, useEarthworks } from '@/map/earthworks/model'

export const EARTHWORKS_HELP_SLUG = 'gerer-la-terre-excavee'

/** Colours of the four fates of the soil, in the notebook's earth tones. */
const FATES = [
  { key: 'placed', color: '#8b5e3c' },
  { key: 'on_site', color: '#c9a36b' },
  { key: 'removed', color: '#9b9488' },
  { key: 'undecided', color: '#d9a527' },
] as const

/**
 * « Terres »: the earthworks balance of the design. What the holes give
 * (ponds, swales, ditches, sunken paths), what the mounds and beds take,
 * what still has nowhere to go, and Semisto's advice before the first dig.
 */
export default function EarthworksPanel() {
  const editor = useEditor()
  const version = useDrawingState((s) => s.version)
  const { balance, byId, counted } = useEarthworks()
  const arrows = useArrowsShown()
  const { totals, digs, receivers } = balance
  const doneCount = counted.filter((f) => isDiggable(f.properties.kind) && isDone(f.properties)).length
  const advice = Object.values(translations('earthworks.panel.advice')) as string[]

  async function drawMound() {
    const geometry = await editor.draw('polygon')
    if (!geometry) return
    try {
      const spec = elementFor('mound')!
      const mound = await editor.createFeature({
        layer: spec.layer, kind: 'mound', geometry, properties: { ...spec.defaults }, ...(version ? { tags: [version] } : {}),
      })
      editor.select(mound.properties.id)
    } catch (error) {
      editor.notify((error as Error).message, 'error')
    }
  }

  const destination = (to: Destination | null) =>
    to == null ? t('earthworks.destinations.undecided') : typeof to === 'number' ? featureName(byId.get(to)) : t(`earthworks.destinations.${to}`)

  const fates: Record<(typeof FATES)[number]['key'], number> = {
    placed: totals.placed, on_site: totals.onSite, removed: totals.removed, undecided: totals.undecided,
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-loam-600">{t('earthworks.panel.intro')}</p>

      {digs.length === 0 ? (
        <p className="rounded-xl bg-loam-50 p-3 text-sm text-loam-600">{t('earthworks.panel.empty')}</p>
      ) : (
        <>
          <section className="space-y-2 rounded-2xl bg-loam-50 p-4">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-loam-800">
              <Shovel className="h-4 w-4 text-clay-700" />
              {t('earthworks.panel.dug_out')}
            </h3>
            <p className="text-loam-900">
              <span className="font-serif text-3xl tabular-nums">{formatNumber(Math.round(totals.volume))}</span>
              <span className="ml-1 text-lg">m³</span>
            </p>
            <p className="text-sm text-loam-700">{t('earthworks.panel.dug_out_value', { loose: m3(totals.loose) })}</p>
            <p className="text-sm text-loam-700">{t('earthworks.panel.split', { topsoil: m3(totals.topsoil), subsoil: m3(totals.subsoil) })}</p>
            <p className="text-sm text-loam-600">
              {t('earthworks.panel.loads', { loads: loadsText(Math.ceil(totals.loose / WHEELBARROW_M3), Math.ceil(totals.loose / TRUCK_M3)) })}
            </p>

            <div className="flex h-3 overflow-hidden rounded-full bg-white" role="img" aria-label={FATES.map((f) => `${t(`earthworks.panel.${f.key}`)} ${m3(fates[f.key])}`).join(', ')}>
              {FATES.map((f) => fates[f.key] > 0 && (
                <span key={f.key} style={{ width: `${(fates[f.key] / totals.volume) * 100}%`, background: f.color }} />
              ))}
            </div>
            <ul className="space-y-1 text-sm text-loam-700">
              {FATES.map((f) => (
                <li key={f.key} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: f.color }} />
                  <span>{t(`earthworks.panel.${f.key}`)}</span>
                  <span className="ml-auto tabular-nums">{m3(fates[f.key])}</span>
                </li>
              ))}
            </ul>
            {totals.undecided > 0.05 ? (
              <p className="flex items-start gap-1.5 text-sm font-medium text-humus-800">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                {t('earthworks.panel.undecided_warning', { volume: m3(totals.undecided) })}
              </p>
            ) : (
              <p className="text-sm font-medium text-leaf-700">{t('earthworks.panel.all_placed')}</p>
            )}
          </section>

          <section className="space-y-1.5">
            <h3 className="text-sm font-semibold text-loam-800">{t('earthworks.panel.digs')}</h3>
            <ul className="divide-y divide-loam-100">
              {digs.map((dig) => (
                <li key={dig.id}>
                  <button type="button" onClick={() => editor.select(dig.id)} className="w-full py-2 text-left text-sm hover:bg-loam-50">
                    <span className="flex justify-between gap-2">
                      <span className="font-medium text-loam-900">{featureName(byId.get(dig.id))}</span>
                      <span className="tabular-nums text-loam-700">{m3(dig.excavation.volume)}</span>
                    </span>
                    {SOIL_PARTS.filter((part) => dig.excavation[part] > 0.005).map((part) => (
                      <span key={part} className={dig.to[part] == null ? 'block text-humus-800' : 'block text-loam-600'}>
                        {t(`earthworks.parts.${part}`)} {m3(dig.excavation[part])} → {destination(dig.to[part])}
                      </span>
                    ))}
                  </button>
                </li>
              ))}
            </ul>
            {doneCount > 0 && <p className="text-sm text-loam-500">{t('earthworks.panel.dug_count', { count: doneCount })}</p>}
          </section>
        </>
      )}

      <section className="space-y-1.5">
        <h3 className="text-sm font-semibold text-loam-800">{t('earthworks.panel.receivers')}</h3>
        {receivers.filter((r) => r.capacity != null || r.received.topsoil + r.received.subsoil > 0).length === 0 ? (
          <p className="text-sm text-loam-600">{t('earthworks.panel.no_receivers')}</p>
        ) : (
          <ul className="divide-y divide-loam-100">
            {receivers.filter((r) => r.capacity != null || r.received.topsoil + r.received.subsoil > 0).map((r) => {
              const gap = receiverGap(r)
              const received = r.received.topsoil + r.received.subsoil
              return (
                <li key={r.id}>
                  <button type="button" onClick={() => editor.select(r.id)} className="w-full py-2 text-left text-sm hover:bg-loam-50">
                    <span className="flex justify-between gap-2">
                      <span className="font-medium text-loam-900">{featureName(byId.get(r.id))}</span>
                      <span className="tabular-nums text-loam-700">{r.capacity != null ? `${m3(received)} / ${m3(r.capacity)}` : m3(received)}</span>
                    </span>
                    {gap != null && (
                      <span className={gap < -0.05 ? 'block text-humus-800' : 'block text-loam-600'}>
                        {gap > 0.05 ? t('earthworks.receiver.room_left', { volume: m3(gap) })
                          : gap < -0.05 ? t('earthworks.receiver.too_much', { volume: m3(-gap) }) : t('earthworks.receiver.exact')}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {editor.canEdit && (
          <Button variant="secondary" size="sm" onClick={() => void drawMound()} disabled={editor.drawing}>
            <Mountain className="h-4 w-4" />
            {t('earthworks.panel.draw_mound')}
          </Button>
        )}
      </section>

      <label className="flex items-start gap-2.5 text-sm text-loam-700">
        <input
          type="checkbox"
          checked={arrows}
          onChange={(e) => setArrowsShown(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-loam-300 text-prune-600 focus:ring-prune-500"
        />
        <span>{t('earthworks.panel.arrows')}</span>
      </label>

      <section className="space-y-2 rounded-2xl border border-loam-200 p-4">
        <h3 className="font-serif text-lg text-loam-900">{t('earthworks.panel.advice_title')}</h3>
        <ul className="list-disc space-y-1.5 pl-4 text-sm text-loam-700">
          {advice.map((line) => <li key={line}>{line}</li>)}
        </ul>
        <HelpButton slug={EARTHWORKS_HELP_SLUG} label={t('earthworks.panel.help')} className="-ml-2" />
      </section>
    </div>
  )
}
