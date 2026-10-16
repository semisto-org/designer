import type { Extensions } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import { Placeholder } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'

/**
 * What a Markdown page can hold, the same when it is read and when it is
 * written: headings, lists and checklists, quotes, tables, links, images.
 * The editor reads and writes plain Markdown (@tiptap/markdown), so the
 * file stays what it was: downloadable, and readable by the team's AI.
 */
export function markdownExtensions({ placeholder, editable }: { placeholder?: string; editable: boolean }): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      // Markdown has no underline: what can't be written back is left out.
      underline: false,
      // The empty line kept after a last table or list is for writing only.
      ...(editable ? {} : { trailingNode: false as const }),
      link: { openOnClick: !editable, autolink: true, HTMLAttributes: { rel: 'noopener', target: '_blank' } },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    Image.configure({ inline: false }),
    ...(placeholder ? [Placeholder.configure({ placeholder })] : []),
    Markdown,
  ]
}
