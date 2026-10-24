import { useEffect, useRef, useState } from 'react'
import { Field, Input } from '@/components/ui/Field'
import { api, ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import { useEditor } from '@/map/editor/EditorContext'
import { setPlanting } from '@/map/plants/store'
import type { PaletteItem, PlantingState, SpeciesSheet, VarietySummary } from '@/types/plants'

/**
 * The cultivar of one plant on the map, right under its species: pick one
 * the catalogue knows, or write the name of the one growing in the orchard
 * (it joins the catalogue and the palette, as in the Palette panel). An
 * empty name brings the plant back to the species alone.
 */
export function VarietyField({ species, variety, onSave }: {
  species: { id: number; slug: string; commonName: string | null; latinName: string }
  variety: VarietySummary | undefined
  onSave: (patch: Record<string, unknown>) => Promise<void>
}) {
  const editor = useEditor()
  const mapId = editor.map.id
  const [known, setKnown] = useState<VarietySummary[] | null>(null)
  // A ref, not state: disabling the input would blur it a second time.
  const busy = useRef(false)
  const listId = `plant-varieties-${species.id}`

  useEffect(() => {
    const controller = new AbortController()
    api<{ species: SpeciesSheet }>(`/plants/${species.slug}`, { signal: controller.signal })
      .then((r) => setKnown(r.species.varieties))
      .catch(() => setKnown([]))
    return () => controller.abort()
  }, [species.slug])

  async function commit(input: HTMLInputElement) {
    const name = input.value.replace(/^['‘’]|['‘’]$/g, '').trim()
    if (busy.current || name === (variety?.name ?? '')) return
    if (!name) { await onSave({ variety_id: null }); return }
    busy.current = true
    try {
      // The cultivar joins the palette (found or added to the catalogue by
      // name), so the plant list and the palette count it too.
      const r = await api<{ item: PaletteItem; planting: PlantingState }>(`/maps/${mapId}/palette_items`, {
        method: 'POST', body: { palette_item: { species_id: species.id, variety_name: name } },
      })
      setPlanting(mapId, r.planting)
      await onSave({ species_id: species.id, variety_id: r.item.varietyId })
    } catch (e) {
      editor.notify(e instanceof ApiError ? e.message : String(e), 'error')
      input.value = variety?.name ?? ''
    } finally {
      busy.current = false
    }
  }

  const hint = known == null
    ? t('plant_feature.variety_hint')
    : known.length > 0 ? t('palette.variety.known', { count: known.length }) : t('palette.variety.none')

  return (
    <Field label={t('plant_feature.variety')} hint={hint}>
      <Input
        key={`${species.id}:${variety?.id ?? ''}`}
        list={listId}
        maxLength={120}
        enterKeyHint="done"
        defaultValue={variety?.name ?? ''}
        placeholder={t('plant_feature.variety_placeholder', { name: species.commonName ?? species.latinName })}
        onBlur={(e) => void commit(e.currentTarget)}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
      />
      <datalist id={listId}>
        {known?.map((v) => <option key={v.id} value={v.name} />)}
      </datalist>
    </Field>
  )
}
