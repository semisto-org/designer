import { api, ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import { featureName } from '@/map/earthworks/model'
import type { FeaturePatch, SavedFeature } from '@/map/editor/EditorContext'
import type { UndoEntry, UndoHistory } from '@/map/editor/history'
import { ownProperties } from '@/map/plants/properties'
import type { MapFeature } from '@/types'

/** An undo that cannot be done as is; its message is for the person. */
export class UndoRefused extends Error {}

type Deps = {
  base: string
  history: UndoHistory
  /** The editor's copy of a feature now (real-time changes included). */
  current: (id: number) => MapFeature | undefined
  upsert: (features: MapFeature[]) => void
  remove: (ids: number[]) => void
}

// Keys as_geojson merges into properties that a patch sends at the top level.
const TOP_KEYS = ['layer', 'kind', 'name', 'notes', 'status', 'style', 'tags'] as const

/** The patch that puts back what `patch` changed on `before`. */
export function inversePatch(before: MapFeature, patch: FeaturePatch): FeaturePatch {
  const inverse: Record<string, unknown> = {}
  for (const key of Object.keys(patch)) {
    if (key === 'geometry') inverse.geometry = before.geometry
    else if (key === 'properties') inverse.properties = ownProperties(before)
    // A renumbering that swapped numbers swaps them back.
    else if (key === 'swap_number') inverse.swap_number = patch.swap_number
    else if ((TOP_KEYS as readonly string[]).includes(key)) inverse[key] = before.properties[key] ?? null
  }
  return inverse as FeaturePatch
}

/**
 * The editor's changes to features, each recorded with its undo. An undo
 * only applies when the element is still as this person left it: when
 * someone else changed or removed it meanwhile, it says so and leaves
 * their work alone.
 */
export function featureHistory({ base, history, current, upsert, remove }: Deps) {
  const patchFeature = async (id: number, patch: FeaturePatch, lockVersion?: number) => {
    const saved = await api<SavedFeature>(`${base}/${id}`, { method: 'PATCH', body: { feature: { ...patch, lock_version: lockVersion } } })
    const { swapped, ...feature } = saved
    upsert(swapped ? [feature, swapped] : [feature])
    return saved
  }
  const trash = async (id: number) => {
    await api(`${base}/${id}`, { method: 'DELETE' })
    remove([id])
  }
  const restore = async (id: number) => {
    const feature = await api<MapFeature>(`${base}/${id}/restore`, { method: 'POST' })
    upsert([feature])
    return feature
  }
  // Still the version this person's last step left?
  const unchanged = (id: number, lockVersion: number, name: string) => {
    const feature = current(id)
    if (!feature) throw new UndoRefused(t('undo.gone', { name }))
    if (feature.properties.lockVersion !== lockVersion) throw new UndoRefused(t('undo.changed_meanwhile', { name }))
    return feature
  }
  const guarded = async <T>(run: () => Promise<T>, name: string) => {
    try {
      return await run()
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        if (error.data.feature) upsert([error.data.feature as MapFeature])
        throw new UndoRefused(t('undo.changed_meanwhile', { name }))
      }
      if (error instanceof ApiError && error.status === 404) throw new UndoRefused(t('undo.gone', { name }))
      throw error
    }
  }

  const record = (entry: UndoEntry) => history.record(entry)

  return {
    create(feature: MapFeature) {
      const id = feature.properties.id
      const name = featureName(feature)
      let version = feature.properties.lockVersion
      record({
        label: t('undo.labels.create', { name }),
        undo: () => guarded(async () => {
          unchanged(id, version, name)
          await trash(id)
        }, name),
        redo: () => guarded(async () => {
          version = (await restore(id)).properties.lockVersion
        }, name),
      })
    },

    update(before: MapFeature, patch: FeaturePatch, after: MapFeature) {
      const id = before.properties.id
      const name = featureName(after)
      const inverse = inversePatch(before, patch)
      const reshaped = Object.keys(patch).every((key) => key === 'geometry')
      let version = after.properties.lockVersion
      record({
        label: t(reshaped ? 'undo.labels.reshape' : 'undo.labels.update', { name }),
        undo: () => guarded(async () => {
          unchanged(id, version, name)
          version = (await patchFeature(id, inverse, version)).properties.lockVersion
        }, name),
        redo: () => guarded(async () => {
          unchanged(id, version, name)
          version = (await patchFeature(id, patch, version)).properties.lockVersion
        }, name),
      })
    },

    remove(feature: MapFeature) {
      const id = feature.properties.id
      const name = featureName(feature)
      let version = feature.properties.lockVersion
      record({
        label: t('undo.labels.delete', { name }),
        undo: () => guarded(async () => {
          version = (await restore(id)).properties.lockVersion
        }, name),
        redo: () => guarded(async () => {
          unchanged(id, version, name)
          await trash(id)
        }, name),
      })
    },

    /** An AI draft accepted (now active) or rejected: undo makes it a draft to review again. */
    reviewed(draft: MapFeature, verdict: 'accept' | 'reject', after?: MapFeature) {
      const id = draft.properties.id
      const name = featureName(draft)
      const review = `${base.replace(/\/features$/, '/drafts')}/${id}/${verdict}`
      let version = after?.properties.lockVersion
      record({
        label: t(verdict === 'accept' ? 'undo.labels.accept' : 'undo.labels.reject', { name }),
        undo: () => guarded(async () => {
          // A rejected draft is no longer on the map: nothing to compare.
          if (version != null) unchanged(id, version, name)
          await patchFeature(id, { status: 'draft' }, version)
          version = undefined
        }, name),
        redo: () => guarded(async () => {
          if (verdict === 'accept') {
            const feature = await api<MapFeature>(review, { method: 'POST' })
            upsert([feature])
            version = feature.properties.lockVersion
          } else {
            await api(review, { method: 'POST' })
            remove([id])
          }
        }, name),
      })
    },
  }
}
