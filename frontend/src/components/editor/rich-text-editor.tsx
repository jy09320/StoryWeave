import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

import { CharacterMentionMark } from '@/components/editor/character-mention-mark'
import { cn } from '@/lib/utils'

export interface RichTextEditorHandle {
  applyGeneratedText: (payload: { text: string; mode: 'replace-selection' | 'append-after-selection' }) => boolean
}

type BubbleActionKey = 'polish' | 'expand' | 'rewrite' | 'consistency'
type SlashCommandKey = 'continue' | 'insert-character' | 'consistency' | 'rewrite'

interface RichTextEditorProps {
  title?: string
  titlePlaceholder?: string
  value: string
  placeholder?: string
  className?: string
  onTitleChange?: (value: string) => void
  mentionItems?: Array<{
    id: string
    label: string
    personality?: string | null
    projectSummary?: string | null
    description?: string | null
  }>
  onSelectionChange?: (payload: { text: string; from: number; to: number }) => void
  onBubbleAction?: (action: BubbleActionKey, selectedText: string) => void
  onSlashCommand?: (command: SlashCommandKey) => void
  onChange: (payload: { html: string; plainText: string }) => void
}

const bubbleActions: Array<{ key: BubbleActionKey; label: string }> = [
  { key: 'polish', label: 'AI 润色' },
  { key: 'expand', label: '扩写' },
  { key: 'rewrite', label: '改写' },
  { key: 'consistency', label: '一致性检查' },
]

const slashCommands: Array<{ key: SlashCommandKey; label: string; description: string }> = [
  { key: 'continue', label: '续写', description: '基于当前正文继续生成下一段内容' },
  { key: 'insert-character', label: '插入角色', description: '立即触发角色 Mention 建议列表' },
  { key: 'consistency', label: '设定检查', description: '检查角色口吻和世界观是否一致' },
  { key: 'rewrite', label: '改写', description: '把当前章节作为整体改写任务送到 AI 面板' },
]

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(function RichTextEditor(
  {
    title,
    titlePlaceholder,
    value,
    placeholder,
    className,
    onTitleChange,
    mentionItems = [],
    onSelectionChange,
    onBubbleAction,
    onSlashCommand,
    onChange,
  },
  ref,
) {
  const lastSelectionRangeRef = useRef<{ from: number; to: number } | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [bubbleState, setBubbleState] = useState<{ visible: boolean; top: number; left: number }>({
    visible: false,
    top: 0,
    left: 0,
  })
  const [mentionState, setMentionState] = useState<{
    visible: boolean
    query: string
    top: number
    left: number
    from: number
    to: number
  }>({
    visible: false,
    query: '',
    top: 0,
    left: 0,
    from: 0,
    to: 0,
  })
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0)
  const [slashState, setSlashState] = useState<{
    visible: boolean
    query: string
    top: number
    left: number
    from: number
    to: number
  }>({
    visible: false,
    query: '',
    top: 0,
    left: 0,
    from: 0,
    to: 0,
  })
  const [slashActiveIndex, setSlashActiveIndex] = useState(0)
  const [hoveredMention, setHoveredMention] = useState<{
    visible: boolean
    top: number
    left: number
    label: string
    personality: string
    projectSummary: string
    description: string
  }>({
    visible: false,
    top: 0,
    left: 0,
    label: '',
    personality: '',
    projectSummary: '',
    description: '',
  })

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
      CharacterMentionMark,
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
    onSelectionUpdate: ({ editor: currentEditor }: { editor: any }) => {
      const { from, to } = currentEditor.state.selection
      const selectedText = currentEditor.state.doc.textBetween(from, to, '\n').trim()

      if (selectedText) {
        lastSelectionRangeRef.current = { from, to }
        onSelectionChange?.({ text: selectedText, from, to })

        const start = currentEditor.view.coordsAtPos(from)
        const end = currentEditor.view.coordsAtPos(to)
        const containerRect = containerRef.current?.getBoundingClientRect()

        if (containerRect) {
          setBubbleState({
            visible: true,
            top: start.top - containerRect.top - 44,
            left: ((start.left + end.right) / 2) - containerRect.left,
          })
        }
      } else {
        setBubbleState((prev) => ({ ...prev, visible: false }))
      }

      if (from !== to) {
        setMentionState((prev) => ({ ...prev, visible: false }))
        setSlashState((prev) => ({ ...prev, visible: false }))
        return
      }

      const textBefore = currentEditor.state.doc.textBetween(Math.max(0, from - 40), from, '\n')
      const match = textBefore.match(/(?:^|\s)@([\u4e00-\u9fa5_a-zA-Z0-9-]*)$/)
      const slashMatch = textBefore.match(/(?:^|\s)\/([\u4e00-\u9fa5_a-zA-Z0-9-]*)$/)

      if (!match) {
        setMentionState((prev) => ({ ...prev, visible: false }))
      }

      const coords = currentEditor.view.coordsAtPos(from)
      const containerRect = containerRef.current?.getBoundingClientRect()
      if (!containerRect) {
        return
      }

      if (match) {
        const query = match[1] ?? ''

        setMentionState({
          visible: true,
          query,
          top: coords.bottom - containerRect.top + 8,
          left: coords.left - containerRect.left,
          from: from - query.length - 1,
          to: from,
        })
        setMentionActiveIndex(0)
      }

      if (slashMatch) {
        const query = slashMatch[1] ?? ''
        setSlashState({
          visible: true,
          query,
          top: coords.bottom - containerRect.top + 8,
          left: coords.left - containerRect.left,
          from: from - query.length - 1,
          to: from,
        })
        setSlashActiveIndex(0)
      } else {
        setSlashState((prev) => ({ ...prev, visible: false }))
      }
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

  useImperativeHandle(
    ref,
    () => ({
      applyGeneratedText: ({ text, mode }) => {
        if (!editor || !text.trim()) {
          return false
        }

        const selectionRange = lastSelectionRangeRef.current ?? {
          from: editor.state.selection.from,
          to: editor.state.selection.to,
        }

        if (!selectionRange || selectionRange.from === selectionRange.to) {
          return false
        }

        const range =
          mode === 'append-after-selection'
            ? { from: selectionRange.to, to: selectionRange.to }
            : selectionRange

        const content = mode === 'append-after-selection' ? `\n\n${text.trim()}` : text.trim()
        editor.chain().focus().insertContentAt(range, content).run()
        return true
      },
    }),
    [editor],
  )

  useEffect(() => {
    if (!editor || mentionItems.length === 0) {
      return
    }

    const mentionMark = editor.state.schema.marks.characterMention
    if (!mentionMark) {
      return
    }

    const sortedMentionItems = [...mentionItems]
      .filter((item) => item.label.trim().length >= 2)
      .sort((left, right) => right.label.length - left.label.length)

    const transaction = editor.state.tr
    let changed = false

    editor.state.doc.descendants((node, pos) => {
      if (!node.isText || !node.text) {
        return true
      }

      const text = node.text
      const existingMentionRanges = node.marks
        .filter((mark) => mark.type.name === 'characterMention')
        .map(() => ({ from: pos, to: pos + text.length }))

      for (const item of sortedMentionItems) {
        const regex = new RegExp(`(^|[^\\u4e00-\\u9fa5A-Za-z0-9])(${escapeRegExp(item.label)})(?=$|[^\\u4e00-\\u9fa5A-Za-z0-9])`, 'g')
        let match: RegExpExecArray | null

        while ((match = regex.exec(text)) !== null) {
          const leading = match[1] ?? ''
          const label = match[2] ?? ''
          const start = pos + match.index + leading.length
          const end = start + label.length

          const alreadyMentioned =
            existingMentionRanges.some((range) => start >= range.from && end <= range.to) ||
            node.marks.some(
              (mark) =>
                mark.type.name === 'characterMention' &&
                mark.attrs.characterId === item.id &&
                mark.attrs.label === item.label,
            )

          if (alreadyMentioned) {
            continue
          }

          const tooltipParts = [item.personality, item.projectSummary].filter(Boolean)
          transaction.addMark(
            start,
            end,
            mentionMark.create({
              characterId: item.id,
              label: item.label,
              personality: item.personality ?? null,
              projectSummary: item.projectSummary ?? null,
              tooltip: tooltipParts.join(' · ') || item.label,
              description: item.description ?? null,
            }),
          )
          changed = true
        }
      }

      return true
    })

    if (changed) {
      editor.view.dispatch(transaction)
    }
  }, [editor, mentionItems, value])

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

  const filteredMentionItems = mentionItems
    .filter((item) => item.label.toLowerCase().includes(mentionState.query.toLowerCase()))
    .slice(0, 6)
  const filteredSlashCommands = slashCommands
    .filter((item) => item.label.toLowerCase().includes(slashState.query.toLowerCase()))
    .slice(0, 6)

  function insertMention(item: (typeof mentionItems)[number]) {
    if (!editor) {
      return
    }

    const tooltipParts = [item.personality, item.projectSummary].filter(Boolean)
    editor
      .chain()
      .focus()
      .insertContentAt(
        { from: mentionState.from, to: mentionState.to },
        {
          type: 'text',
          text: item.label,
          marks: [
            {
              type: 'characterMention',
              attrs: {
                characterId: item.id,
                label: item.label,
                personality: item.personality ?? null,
                projectSummary: item.projectSummary ?? null,
                tooltip: tooltipParts.join(' · ') || item.label,
                description: item.description ?? null,
              },
            },
          ],
        },
      )
      .insertContent(' ')
      .run()

    setMentionState((prev) => ({ ...prev, visible: false, query: '' }))
    setMentionActiveIndex(0)
  }

  function runSlashCommand(command: (typeof slashCommands)[number]) {
    if (!editor) {
      return
    }

    if (command.key === 'insert-character') {
      editor.chain().focus().insertContentAt({ from: slashState.from, to: slashState.to }, '@').run()
      setSlashState((prev) => ({ ...prev, visible: false, query: '' }))
      setSlashActiveIndex(0)
      return
    }

    editor.chain().focus().deleteRange({ from: slashState.from, to: slashState.to }).run()
    setSlashState((prev) => ({ ...prev, visible: false, query: '' }))
    setSlashActiveIndex(0)
    onSlashCommand?.(command.key)
  }

  useEffect(() => {
    function handleMenuHotkeys(event: KeyboardEvent) {
      if (!editor) {
        return
      }

      if (mentionState.visible && filteredMentionItems.length > 0) {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          setMentionActiveIndex((prev) => (prev + 1) % filteredMentionItems.length)
          return
        }

        if (event.key === 'ArrowUp') {
          event.preventDefault()
          setMentionActiveIndex((prev) => (prev - 1 + filteredMentionItems.length) % filteredMentionItems.length)
          return
        }

        if (event.key === 'Enter') {
          event.preventDefault()
          insertMention(filteredMentionItems[mentionActiveIndex] ?? filteredMentionItems[0])
          return
        }

        if (event.key === 'Escape') {
          event.preventDefault()
          setMentionState((prev) => ({ ...prev, visible: false }))
          return
        }
      }

      if (slashState.visible && filteredSlashCommands.length > 0) {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          setSlashActiveIndex((prev) => (prev + 1) % filteredSlashCommands.length)
          return
        }

        if (event.key === 'ArrowUp') {
          event.preventDefault()
          setSlashActiveIndex((prev) => (prev - 1 + filteredSlashCommands.length) % filteredSlashCommands.length)
          return
        }

        if (event.key === 'Enter') {
          event.preventDefault()
          runSlashCommand(filteredSlashCommands[slashActiveIndex] ?? filteredSlashCommands[0])
          return
        }

        if (event.key === 'Escape') {
          event.preventDefault()
          setSlashState((prev) => ({ ...prev, visible: false }))
        }
      }
    }

    window.addEventListener('keydown', handleMenuHotkeys)
    return () => window.removeEventListener('keydown', handleMenuHotkeys)
  }, [
    editor,
    filteredMentionItems,
    filteredSlashCommands,
    mentionActiveIndex,
    mentionState.visible,
    slashActiveIndex,
    slashState.visible,
  ])

  return (
    <div
      ref={containerRef}
      className={cn('relative rounded-md border border-white/8 bg-[#111113]', className)}
      onMouseMove={(event) => {
        const target = event.target
        if (!(target instanceof HTMLElement)) {
          return
        }

        const mention = target.closest('.storyweave-mention') as HTMLElement | null
        if (!mention) {
          if (hoveredMention.visible) {
            setHoveredMention((prev) => ({ ...prev, visible: false }))
          }
          return
        }

        const containerRect = containerRef.current?.getBoundingClientRect()
        const mentionRect = mention.getBoundingClientRect()
        if (!containerRect) {
          return
        }

        setHoveredMention({
          visible: true,
          top: mentionRect.bottom - containerRect.top + 10,
          left: mentionRect.left - containerRect.left,
          label: mention.dataset.label ?? mention.textContent ?? '',
          personality: mention.dataset.personality ?? '',
          projectSummary: mention.dataset.projectSummary ?? '',
          description: mention.dataset.description ?? '',
        })
      }}
      onMouseLeave={() => {
        setHoveredMention((prev) => ({ ...prev, visible: false }))
      }}
    >
      {bubbleState.visible ? (
        <div
          className="absolute z-20 -translate-x-1/2 rounded-md border border-white/10 bg-[#111113]/95 p-1 shadow-2xl shadow-black/30 backdrop-blur"
          style={{ top: bubbleState.top, left: bubbleState.left }}
        >
          <div className="flex items-center gap-1">
          {bubbleActions.map((action) => (
            <button
              key={action.key}
              type="button"
              className="rounded-md px-2.5 py-1.5 text-xs text-[#E4E4E7] transition hover:bg-white/8"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const { from, to } = editor.state.selection
                const selectedText = editor.state.doc.textBetween(from, to, '\n').trim()
                if (selectedText) {
                  onBubbleAction?.(action.key, selectedText)
                }
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
        </div>
      ) : null}

      {mentionState.visible && filteredMentionItems.length > 0 ? (
        <div
          className="absolute z-20 w-64 rounded-md border border-white/10 bg-[#111113]/98 p-1 shadow-2xl shadow-black/30 backdrop-blur"
          style={{ top: mentionState.top, left: mentionState.left }}
        >
          {filteredMentionItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                'block w-full rounded-md px-3 py-2 text-left transition hover:bg-white/8',
                filteredMentionItems[mentionActiveIndex]?.id === item.id && 'bg-white/8',
              )}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => {
                const index = filteredMentionItems.findIndex((candidate) => candidate.id === item.id)
                if (index >= 0) {
                  setMentionActiveIndex(index)
                }
              }}
              onClick={() => insertMention(item)}
            >
              <div className="text-sm text-white">@{item.label}</div>
              <div className="mt-1 line-clamp-2 text-xs leading-5 text-[#A1A1AA]">
                {item.projectSummary || item.personality || '插入后会作为角色实体文本高亮显示'}
              </div>
            </button>
          ))}
        </div>
      ) : null}

      {slashState.visible && filteredSlashCommands.length > 0 ? (
        <div
          className="absolute z-20 w-72 rounded-md border border-white/10 bg-[#111113]/98 p-1 shadow-2xl shadow-black/30 backdrop-blur"
          style={{ top: slashState.top, left: slashState.left }}
        >
          {filteredSlashCommands.map((command) => (
            <button
              key={command.key}
              type="button"
              className={cn(
                'block w-full rounded-md px-3 py-2 text-left transition hover:bg-white/8',
                filteredSlashCommands[slashActiveIndex]?.key === command.key && 'bg-white/8',
              )}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => {
                const index = filteredSlashCommands.findIndex((candidate) => candidate.key === command.key)
                if (index >= 0) {
                  setSlashActiveIndex(index)
                }
              }}
              onClick={() => runSlashCommand(command)}
            >
              <div className="text-sm text-white">/{command.label}</div>
              <div className="mt-1 text-xs leading-5 text-[#A1A1AA]">{command.description}</div>
            </button>
          ))}
        </div>
      ) : null}

      {hoveredMention.visible ? (
        <div
          className="absolute z-20 w-72 rounded-md border border-white/10 bg-[#111113]/98 p-3 shadow-2xl shadow-black/30 backdrop-blur"
          style={{ top: hoveredMention.top, left: hoveredMention.left }}
        >
          <div className="text-sm font-medium text-white">{hoveredMention.label}</div>
          {hoveredMention.personality ? (
            <div className="mt-2 text-xs leading-5 text-sky-200">性格：{hoveredMention.personality}</div>
          ) : null}
          {hoveredMention.projectSummary ? (
            <div className="mt-2 text-xs leading-5 text-[#A1A1AA]">项目备注：{hoveredMention.projectSummary}</div>
          ) : null}
          {hoveredMention.description ? (
            <div className="mt-2 text-xs leading-5 text-[#A1A1AA]">角色摘要：{hoveredMention.description}</div>
          ) : null}
        </div>
      ) : null}

      {typeof title === 'string' ? (
        <div className="border-b border-white/6 px-6 pb-4 pt-5">
          <input
            value={title}
            onChange={(event) => onTitleChange?.(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                editor.commands.focus('start')
              }
            }}
            placeholder={titlePlaceholder ?? '输入章节标题'}
            maxLength={200}
            className="w-full border-none bg-transparent p-0 text-[30px] font-semibold leading-[1.25] text-white outline-none placeholder:text-[#52525B]"
          />
        </div>
      ) : null}

      <div className="px-6 py-5">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
})
