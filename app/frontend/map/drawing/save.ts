import { ApiError } from '@/lib/api'
import type { Editor, FeaturePatch } from '@/map/editor/EditorContext'
import type { MapFeature } from '@/types'

/**
 * updateFeature with the editor's conflict handling: when someone changed
 * the feature in the meantime (409, lock_version), take their version and
 * say so in French; other errors are shown as the server words them.
 */
export async function saveFeature(editor: Editor, id: number, patch: FeaturePatch): Promise<MapFeature | null> {
  try {
    return await editor.updateFeature(id, patch)
  } catch (error) {
    if (error instanceof ApiError && error.status === 409 && error.data.feature) {
      editor.upsertFeatures([error.data.feature as MapFeature])
    }
    editor.notify((error as Error).message, 'error')
    return null
  }
}
