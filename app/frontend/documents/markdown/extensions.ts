import type { Extensions } from '@tiptap/core'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import Image from '@tiptap/extension-image'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import { Placeholder } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import type { CollabSession } from '@/documents/markdown/useCollab'

/**
 * What a Markdown page can hold, the same when it is read and when it is
 * written: headings, lists and checklists, quotes, tables, links, images.
 * The editor reads and writes plain Markdown (@tiptap/markdown), so the
 * file stays what it was: downloadable, and readable by the team's AI.
 */
export function markdownExtensions({ placeholder, editable, collab }: {
  placeholder?: string
  editable: boolean
  /** Written together: the shared text (Yjs) replaces the editor's own history. */
  collab?: CollabSession
}): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      // Markdown has no underline: what can't be written back is left out.
      underline: false,
      // The empty line kept after a last table or list is for writing only,
      // and alone: written together, each browser would add its own.
      ...(editable && !collab ? {} : { trailingNode: false as const }),
      ...(collab ? { undoRedo: false as const } : {}),
      link: { openOnClick: !editable, autolink: true, HTMLAttributes: { rel: 'noopener', target: '_blank' } },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    Image.configure({ inline: false }),
    ...(placeholder ? [Placeholder.configure({ placeholder })] : []),
    Markdown,
    ...(collab ? [
      Collaboration.configure({ document: collab.doc }),
      CollaborationCaret.configure({ provider: { awareness: collab.awareness }, user: collab.user, render: caret }),
    ] : []),
  ]
}

// Where someone else writes: a thin line in their colour, their first name above it.
function caret(user: Record<string, string>): HTMLElement {
  const cursor = document.createElement('span')
  cursor.className = 'collab-caret'
  cursor.style.borderColor = user.color
  const label = document.createElement('span')
  label.className = 'collab-caret-label'
  label.style.backgroundColor = user.color
  label.textContent = user.name
  cursor.append(label)
  return cursor
}
