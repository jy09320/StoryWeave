import { useEffect } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

import { cn } from '@/lib/utils'

interface RichTextEditorProps {
  value: string
  placeholder?: string
  className?: string
  onChange: (payload: { html: string; plainText: string }) => void
}

export function RichTextEditor({ value, placeholder, className, onChange }: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class:
          'storyweave-editor min-h-[560px] text-[16px] leading-[1.95] text-[#E4E4E7] focus:outline-none',
        'data-placeholder': placeholder ?? '',
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange({
        html: currentEditor.getHTML(),
        plainText: currentEditor.getText({ blockSeparator: '\n\n' }),
      })
    },
  })

  useEffect(() => {
    if (!editor) {
      return
    }

    if (editor.getHTML() === value) {
      return
    }

    editor.commands.setContent(value, { emitUpdate: false })
  }, [editor, value])

  if (!editor) {
    return (
      <div
        className={cn(
          'min-h-[520px] rounded-lg border border-white/10 bg-black/10 px-4 py-4 text-sm text-slate-500',
          className,
        )}
      >
        正在初始化编辑器...
      </div>
    )
  }

  return (
    <div className={cn('rounded-md border border-white/8 bg-[#111113] px-6 py-5', className)}>
      <EditorContent editor={editor} />
    </div>
  )
}
