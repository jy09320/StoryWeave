import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useRef } from 'react'

interface RichTextFieldProps {
  value: string | null
  onChange: (value: string) => void
  placeholder?: string
}

export function RichTextField({ value, onChange, placeholder }: RichTextFieldProps) {
  const isInternalUpdate = useRef(false)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit],
    content: value || '',
    editorProps: {
      attributes: {
        class: 'text-sm leading-7 text-foreground focus:outline-none min-h-[200px] px-4 py-3',
        'data-placeholder': placeholder ?? '',
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      isInternalUpdate.current = true
      onChange(currentEditor.getHTML())
    },
  })

  useEffect(() => {
    if (editor && !isInternalUpdate.current) {
      const currentContent = editor.getHTML()
      if ((value || '') !== currentContent) {
        editor.commands.setContent(value || '', { emitUpdate: false })
      }
    }
    isInternalUpdate.current = false
  }, [value, editor])

  if (!editor) return null

  return (
    <div className="rounded-lg border border-border bg-card">
      <EditorContent editor={editor} />
    </div>
  )
}
