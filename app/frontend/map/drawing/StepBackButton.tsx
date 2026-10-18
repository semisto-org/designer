import { Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { t } from '@/lib/i18n'
import type { Editor } from '@/map/editor/EditorContext'

/** The last point or drag taken back, like ⌘Z / Ctrl+Z (there is no keyboard on a phone). */
export function StepBackButton({ editor }: { editor: Editor }) {
  const label = t('undo.step_back')
  return (
    <Button size="sm" variant="ghost" className="text-white hover:bg-white/10" onClick={() => editor.undoDrawStep()} title={label} aria-label={label}>
      <Undo2 className="h-4 w-4" aria-hidden />
    </Button>
  )
}
