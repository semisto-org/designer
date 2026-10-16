import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import clsx from 'clsx'
import { useEffect, useRef } from 'react'
import { t } from '@/lib/i18n'
import { markdownExtensions } from '@/documents/markdown/extensions'
import { MarkdownToolbar } from '@/documents/markdown/MarkdownToolbar'

/** Typography of a Markdown page, read or written (Tailwind typography, Semisto tokens). */
export const PAGE_PROSE = clsx(
  'prose max-w-none text-[1.0625rem] leading-relaxed text-loam-800',
  'prose-headings:font-serif prose-headings:font-normal prose-headings:not-italic prose-headings:text-loam-900',
  'prose-h1:text-4xl prose-h2:mt-10 prose-h2:text-2xl prose-h3:text-xl',
  'prose-a:text-prune-700 prose-a:underline-offset-2 prose-strong:text-loam-900',
  'prose-blockquote:border-l-leaf-400 prose-blockquote:font-normal prose-blockquote:not-italic prose-blockquote:text-loam-700',
  'prose-hr:border-dashed prose-hr:border-loam-300 prose-img:rounded-xl',
  'prose-th:bg-loam-50 prose-table:text-base',
  'markdown-page',
)

// The cursor goes where the writing starts: the first line left to fill in
// (« Présents : », « 16 octobre 2026 : », an empty checkbox), else the end
// of the text, never the blank line kept after it.
function focusFirstBlank(editor: Editor) {
  const { doc } = editor.state
  let blank: number | null = null
  let last: number | null = null
  doc.descendants((node, pos) => {
    if (blank !== null) return false
    if (!node.isTextblock) return true
    const end = pos + 1 + node.content.size
    const trailing = pos + node.nodeSize === doc.content.size && node.content.size === 0 && doc.childCount > 1
    if (!trailing) last = end
    if (!trailing && node.type.name !== 'heading' && (node.textContent.trim() === '' || /:\s*$/.test(node.textContent))) blank = end
    return false
  })
  editor.chain().focus(blank ?? last ?? 'end').run()
  if (/:$/.test(editor.state.selection.$from.parent.textContent)) editor.commands.insertContent(' ')
}

/**
 * A Markdown page. Read-only, it renders the text as a page of the notebook;
 * editable, the same page takes a toolbar and Markdown shortcuts (« # »,
 * « - », « [] », « > »…) and hands its text back as Markdown on each change.
 */
export function MarkdownEditor({ content, editable, onChange, onReady, className, autofocus = false }: {
  content: string
  editable: boolean
  /** Puts the cursor at the end of the text (a document just created). */
  autofocus?: boolean
  onChange?: (markdown: string) => void
  onReady?: (editor: Editor) => void
  className?: string
}) {
  const change = useRef(onChange)
  change.current = onChange
  const editor = useEditor({
    extensions: markdownExtensions({ editable, placeholder: editable ? t('documents.markdown.placeholder') : undefined }),
    content,
    contentType: 'markdown',
    editable,
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    editorProps: { attributes: { lang: 'fr', class: clsx(PAGE_PROSE, 'outline-none', editable && 'min-h-[50vh]') } },
    onCreate: ({ editor: e }) => { if (editable && autofocus) focusFirstBlank(e) },
    onUpdate: ({ editor: e }) => change.current?.(e.getMarkdown()),
  }, [editable])

  useEffect(() => { if (editor) onReady?.(editor) }, [editor, onReady])

  // A text that comes from elsewhere (another save) replaces the page.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    if (editor.getMarkdown() === content) return
    editor.commands.setContent(content, { contentType: 'markdown', emitUpdate: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content])

  if (!editor) return null
  return (
    <div className={className}>
      {editable && <MarkdownToolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  )
}
