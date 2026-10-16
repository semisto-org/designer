import { useEditorState, type Editor } from '@tiptap/react'
import clsx from 'clsx'
import {
  Bold, Code, Heading1, Heading2, Heading3, Italic, Link2, List, ListChecks, ListOrdered, Minus, Pilcrow,
  Quote, Redo2, Strikethrough, Table2, Undo2, type LucideIcon,
} from 'lucide-react'
import { t } from '@/lib/i18n'

type Tool = { key: string; icon: LucideIcon; run: (e: Editor) => void; active?: (e: Editor) => boolean; enabled?: (e: Editor) => boolean }

const TOOLS: Tool[][] = [
  [
    { key: 'paragraph', icon: Pilcrow, run: (e) => e.chain().focus().setParagraph().run(), active: (e) => e.isActive('paragraph') },
    { key: 'heading1', icon: Heading1, run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(), active: (e) => e.isActive('heading', { level: 1 }) },
    { key: 'heading2', icon: Heading2, run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(), active: (e) => e.isActive('heading', { level: 2 }) },
    { key: 'heading3', icon: Heading3, run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(), active: (e) => e.isActive('heading', { level: 3 }) },
  ],
  [
    { key: 'bold', icon: Bold, run: (e) => e.chain().focus().toggleBold().run(), active: (e) => e.isActive('bold') },
    { key: 'italic', icon: Italic, run: (e) => e.chain().focus().toggleItalic().run(), active: (e) => e.isActive('italic') },
    { key: 'strike', icon: Strikethrough, run: (e) => e.chain().focus().toggleStrike().run(), active: (e) => e.isActive('strike') },
    { key: 'code', icon: Code, run: (e) => e.chain().focus().toggleCode().run(), active: (e) => e.isActive('code') },
    { key: 'link', icon: Link2, run: editLink, active: (e) => e.isActive('link') },
  ],
  [
    { key: 'bullet_list', icon: List, run: (e) => e.chain().focus().toggleBulletList().run(), active: (e) => e.isActive('bulletList') },
    { key: 'ordered_list', icon: ListOrdered, run: (e) => e.chain().focus().toggleOrderedList().run(), active: (e) => e.isActive('orderedList') },
    { key: 'task_list', icon: ListChecks, run: (e) => e.chain().focus().toggleTaskList().run(), active: (e) => e.isActive('taskList') },
    { key: 'quote', icon: Quote, run: (e) => e.chain().focus().toggleBlockquote().run(), active: (e) => e.isActive('blockquote') },
    { key: 'divider', icon: Minus, run: (e) => e.chain().focus().setHorizontalRule().run() },
    { key: 'table', icon: Table2, run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), enabled: (e) => !e.isActive('table') },
  ],
  [
    { key: 'undo', icon: Undo2, run: (e) => e.chain().focus().undo().run(), enabled: (e) => e.can().undo() },
    { key: 'redo', icon: Redo2, run: (e) => e.chain().focus().redo().run(), enabled: (e) => e.can().redo() },
  ],
]

// Inside a table: the rows and columns, written out (no icons to guess).
const TABLE_TOOLS: { key: string; run: (e: Editor) => void }[] = [
  { key: 'add_row', run: (e) => e.chain().focus().addRowAfter().run() },
  { key: 'add_column', run: (e) => e.chain().focus().addColumnAfter().run() },
  { key: 'delete_row', run: (e) => e.chain().focus().deleteRow().run() },
  { key: 'delete_column', run: (e) => e.chain().focus().deleteColumn().run() },
  { key: 'delete_table', run: (e) => e.chain().focus().deleteTable().run() },
]

function editLink(editor: Editor) {
  const current = editor.getAttributes('link').href as string | undefined
  const href = window.prompt(t('documents.markdown.toolbar.link_prompt'), current ?? 'https://')
  if (href === null) return
  const chain = editor.chain().focus().extendMarkRange('link')
  if (href.trim() === '' || href.trim() === 'https://') chain.unsetLink().run()
  else chain.setLink({ href: href.trim() }).run()
}

/** The writing tools, above the page, always in reach (also on a phone, where it scrolls sideways). */
export function MarkdownToolbar({ editor }: { editor: Editor }) {
  // Re-render on selection changes only for what the buttons show.
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      active: TOOLS.flat().map((tool) => tool.active?.(e) ?? false),
      enabled: TOOLS.flat().map((tool) => tool.enabled?.(e) ?? true),
      inTable: e.isActive('table'),
    }),
  })
  let index = -1
  return (
    <div className="sticky top-0 z-20 -mx-5 mb-6 sm:top-[4.25rem] border-b border-loam-900/10 bg-[#fbf8f1]/95 px-2 py-1.5 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:px-2 print:hidden">
      <div role="toolbar" aria-label={t('documents.markdown.toolbar.label')} className="flex items-center gap-0.5 overflow-x-auto">
        {TOOLS.map((group, g) => (
          <div key={g} className={clsx('flex shrink-0 items-center gap-0.5', g > 0 && 'ml-1 border-l border-loam-900/10 pl-1')}>
            {group.map((tool) => {
              index += 1
              const label = t(`documents.markdown.toolbar.${tool.key}`)
              const Icon = tool.icon
              const active = state.active[index]
              return (
                <button
                  key={tool.key} type="button" title={label} aria-label={label} aria-pressed={tool.active ? active : undefined}
                  disabled={!state.enabled[index]}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => tool.run(editor)}
                  className={clsx(
                    'grid h-9 w-9 place-items-center rounded-lg sm:h-8 sm:w-8 transition-colors disabled:opacity-35',
                    active ? 'bg-prune-600 text-white' : 'text-loam-700 hover:bg-prune-50 hover:text-prune-700',
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" aria-hidden />
                </button>
              )
            })}
          </div>
        ))}
      </div>
      {state.inTable && (
        <div className="mt-1.5 flex flex-wrap gap-1 border-t border-loam-900/10 pt-1.5">
          {TABLE_TOOLS.map((tool) => (
            <button key={tool.key} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => tool.run(editor)}
              className="rounded-full px-3 py-1 text-sm text-loam-700 ring-1 ring-inset ring-loam-200 hover:bg-prune-50 hover:text-prune-700">
              {t(`documents.markdown.toolbar.${tool.key}`)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
