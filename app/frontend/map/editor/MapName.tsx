import { Pencil } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import type { MapData } from '@/types'

/** The map's name in the editor header; its owner renames it in place. */
export function MapName({ map, setMap }: { map: MapData; setMap: (map: MapData) => void }) {
  const canRename = map.role === 'owner' && !map.readOnlyByPlan
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(map.name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) input.current?.select()
  }, [editing])

  if (!canRename) return <h1 className="truncate text-xl leading-none text-loam-900">{map.name}</h1>

  const start = () => {
    setValue(map.name)
    setError(null)
    setEditing(true)
  }

  const cancel = () => {
    setEditing(false)
    setError(null)
  }

  const save = async () => {
    const name = value.trim()
    if (name === map.name) return cancel()
    if (!name) return setError(t('maps.show.rename_blank'))
    setSaving(true)
    try {
      const { map: saved } = await api<{ map: MapData }>(`/maps/${map.id}`, { method: 'PATCH', body: { map: { name } } })
      setMap({ ...map, name: saved.name, lockVersion: saved.lockVersion, updatedAt: saved.updatedAt })
      setEditing(false)
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('maps.show.rename_failed'))
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <h1 className="relative min-w-0 text-xl leading-none">
        <input
          ref={input}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => { if (!saving) void save() }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); void save() }
            if (e.key === 'Escape') { e.preventDefault(); cancel() }
          }}
          disabled={saving}
          maxLength={120}
          size={Math.max(8, Math.min(value.length + 1, 40))}
          aria-label={t('maps.show.rename_label')}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'map-name-error' : undefined}
          className="-my-1 -ml-1.5 max-w-full rounded-md border border-prune-300 bg-white px-1.5 py-1 text-xl leading-none text-loam-900 outline-none focus:ring-2 focus:ring-prune-200 aria-invalid:border-clay-500"
        />
        {error && (
          <span id="map-name-error" role="alert" className="absolute top-full left-0 z-50 mt-2 rounded-lg bg-clay-600 px-2.5 py-1.5 font-sans text-sm whitespace-nowrap text-white shadow">
            {error}
          </span>
        )}
      </h1>
    )
  }

  return (
    <h1 className="min-w-0 text-xl leading-none">
      <button
        type="button"
        onClick={start}
        title={t('maps.show.rename')}
        className="group -my-1 -ml-1.5 flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-loam-900 hover:bg-loam-100 focus-visible:outline-2 focus-visible:outline-prune-600"
      >
        <span className="truncate">{map.name}</span>
        <Pencil aria-hidden className="h-3.5 w-3.5 shrink-0 text-loam-300 transition group-hover:text-loam-600 group-focus-visible:text-loam-600" />
        <span className="sr-only">{t('maps.show.rename')}</span>
      </button>
    </h1>
  )
}
