import { useRef, useEffect, useCallback, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { Globe2, Users2, CheckCircle2, Send, Paperclip, Sparkles, Wrench, BrainCircuit } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { streamAssetChat } from '@/services/project-asset-ai'
import type {
  AssetChatSSEDraftReadyEvent,
  CharacterActionItem,
  ProjectAssetAIMessage,
  ProjectAssetAIType,
  WorldSettingPatch,
} from '@/types/api'

export interface ProjectAssetAIPanelProps {
  projectId: string
  assetType: ProjectAssetAIType
  sessionId: string
  latestWorldPatch?: WorldSettingPatch | null
  latestCharacterActions?: CharacterActionItem[] | null
  onApplyWorldPatch?: () => void
  onApplyCharacterActions?: () => void
  isApplying?: boolean
  onFileUpload?: (file: File) => Promise<void>
  isUploadingFile?: boolean
  uploadedFiles?: Array<{ file_id: string; filename: string }>
  fileIds?: string[]
  onDraftReady?: (event: AssetChatSSEDraftReadyEvent) => void
}

const assetMeta: Record<
  ProjectAssetAIType,
  {
    title: string
    icon: typeof Globe2
    accentClassName: string
    placeholder: string
    guidancePlaceholder: string
    quickPrompts: string[]
    welcomeContent: string
  }
> = {
  world_setting: {
    title: '世界观 AI 助手',
    icon: Globe2,
    accentClassName: 'text-sky-500',
    placeholder: '输入消息或指令，AI 会与你对话并引导完善世界观。\n\nShift+Enter 换行，Enter 发送。',
    guidancePlaceholder: '例如：保留已有世界规则，风格偏东方玄幻，不要覆盖已经确定的人名地名。',
    quickPrompts: ['补全时间线', '梳理阵营势力', '提炼世界规则'],
    welcomeContent: '你好！我是世界观 AI 助手，可以帮你完善世界背景、规则、势力和地图等设定。\n\n可以直接和我对话，上传 .txt / .md 文档，或者说出具体指令（如"补全该世界的时间线"），我会引导你一步步完善。',
  },
  project_character: {
    title: '角色 AI 助手',
    icon: Users2,
    accentClassName: 'text-amber-500',
    placeholder: '输入消息或角色信息，AI 会与你对话并引导完善角色设定。\n\nShift+Enter 换行，Enter 发送。',
    guidancePlaceholder: '例如：优先提炼已出现角色，不要擅自新增核心角色，保持角色关系克制真实。',
    quickPrompts: ['识别主要角色', '提炼角色关系', '补全项目内定位'],
    welcomeContent: '你好！我是角色 AI 助手，可以帮你从资料中识别角色、整理角色设定和关系。\n\n可以直接和我对话，描述你的角色，上传人物资料文档，我会生成结构化的角色建议供你确认。',
  },
}

function buildWelcomeMessage(assetType: ProjectAssetAIType): ProjectAssetAIMessage {
  const meta = assetMeta[assetType]
  return {
    id: `${assetType}-welcome`,
    role: 'system',
    title: meta.title,
    content: meta.welcomeContent,
  }
}

const messageLeftStyle: Record<Exclude<ProjectAssetAIMessage['role'], 'user'>, string> = {
  system: 'border-sky-500/25 bg-sky-500/[0.08]',
  tool: 'border-amber-500/25 bg-amber-500/10',
  preview: 'border-emerald-500/25 bg-emerald-500/10',
  result: 'border-primary/25 bg-primary/10',
}

const messageIconClass: Record<Exclude<ProjectAssetAIMessage['role'], 'user'>, string> = {
  system: 'text-sky-500',
  tool: 'text-amber-500',
  preview: 'text-emerald-500',
  result: 'text-primary',
}

const MessageIcon = ({ role }: { role: Exclude<ProjectAssetAIMessage['role'], 'user'> }) => {
  if (role === 'tool') return <Wrench className="size-3" />
  if (role === 'result') return <CheckCircle2 className="size-3" />
  if (role === 'preview') return <Sparkles className="size-3" />
  return <BrainCircuit className="size-3" />
}

function MessageBubble({ message }: { message: ProjectAssetAIMessage }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm border border-primary/20 bg-primary/15 px-4 py-2.5">
          {message.title ? (
            <div className="mb-1 text-[10px] font-medium text-primary/70">{message.title}</div>
          ) : null}
          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{message.content}</p>
        </div>
      </div>
    )
  }

  const role = message.role as Exclude<ProjectAssetAIMessage['role'], 'user'>
  return (
    <div className="flex gap-2.5">
      <div className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted ${messageIconClass[role]}`}>
        <MessageIcon role={role} />
      </div>
      <div className="min-w-0 flex-1">
        {message.title ? (
          <div className="mb-1 text-xs font-medium text-foreground">{message.title}</div>
        ) : null}
        <div className={`rounded-2xl rounded-tl-sm border px-4 py-2.5 ${messageLeftStyle[role]}`}>
          <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{message.content}</p>
        </div>
      </div>
    </div>
  )
}

function StreamingBubble({ text, accentClassName }: { text: string; accentClassName: string }) {
  return (
    <div className="flex gap-2.5">
      <div className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted ${accentClassName}`}>
        <Sparkles className="size-3 animate-pulse" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 text-xs font-medium text-foreground">AI 助手</div>
        <div className="rounded-2xl rounded-tl-sm border border-border bg-muted/40 px-4 py-2.5">
          {text ? (
            <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{text}<span className="ml-0.5 inline-block h-3.5 w-px animate-pulse bg-foreground/50" /></p>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="size-1.5 animate-bounce rounded-full bg-foreground/30 [animation-delay:0ms]" />
              <span className="size-1.5 animate-bounce rounded-full bg-foreground/30 [animation-delay:150ms]" />
              <span className="size-1.5 animate-bounce rounded-full bg-foreground/30 [animation-delay:300ms]" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function ProjectAssetAIPanel({
  projectId,
  assetType,
  sessionId,
  latestWorldPatch = null,
  latestCharacterActions = null,
  onApplyWorldPatch,
  onApplyCharacterActions,
  isApplying = false,
  onFileUpload,
  isUploadingFile = false,
  uploadedFiles = [],
  fileIds = [],
  onDraftReady,
}: ProjectAssetAIPanelProps) {
  const meta = assetMeta[assetType]
  const Icon = meta.icon

  const [messages, setMessages] = useState<ProjectAssetAIMessage[]>(() => [buildWelcomeMessage(assetType)])
  const [streamingText, setStreamingText] = useState<string | null>(null)
  const [inputText, setInputText] = useState('')
  const [guidance, setGuidance] = useState('')

  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<(() => void) | null>(null as (() => void) | null)

  const isStreaming = streamingText !== null

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streamingText])

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file || !onFileUpload) return
      await onFileUpload(file)
      event.target.value = ''
    },
    [onFileUpload],
  )

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleSend()
    }
  }

  async function handleSend() {
    const text = inputText.trim()
    if (!text && fileIds.length === 0) {
      toast.error('请先输入消息或上传文件')
      return
    }
    if (isStreaming) return

    const userMessage: ProjectAssetAIMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text || `[已上传 ${fileIds.length} 个文件]`,
    }
    setMessages((prev) => [...prev, userMessage])
    setInputText('')
    setStreamingText('')

    let accumulatedText = ''
    let aborted = false
    const controller = new AbortController()

    abortRef.current = () => { aborted = true; controller.abort() }

    try {
      await streamAssetChat(
        projectId,
        {
          message: text,
          asset_type: assetType,
          session_id: sessionId,
          file_ids: fileIds,
        },
        (event) => {
          if (aborted) return

          if (event.type === 'text') {
            accumulatedText += event.content
            setStreamingText(accumulatedText)
          } else if (event.type === 'tool_call') {
            const toolNames: Record<string, string> = {
              query_world_setting: '读取世界观',
              query_characters: '读取角色列表',
              draft_world_setting_update: '生成世界观建议',
              draft_character_actions: '生成角色建议',
            }
            setMessages((prev) => [
              ...prev,
              {
                id: `tool-${Date.now()}`,
                role: 'tool',
                title: toolNames[event.name] ?? event.name,
                content: '正在处理...',
              },
            ])
          } else if (event.type === 'draft_ready') {
            onDraftReady?.(event)
          } else if (event.type === 'error') {
            toast.error(event.error)
          }
        },
        controller.signal,
      )
    } catch (err) {
      if (!aborted) {
        const message = err instanceof Error ? err.message : '对话请求失败'
        toast.error(message)
      }
    } finally {
      if (!aborted && accumulatedText) {
        setMessages((prev) => [
          ...prev,
          {
            id: `ai-${Date.now()}`,
            role: 'result',
            content: accumulatedText,
          },
        ])
      }
      setStreamingText(null)
      abortRef.current = null
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card/95">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon className={`size-4 ${meta.accentClassName}`} />
          <span className="text-sm font-semibold text-foreground">{meta.title}</span>
          <Badge variant="outline" className="text-[10px]">对话模式</Badge>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {meta.quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-[11px] text-muted-foreground transition hover:border-primary/30 hover:bg-muted hover:text-foreground"
              onClick={() => setInputText((prev) => prev.trim() ? prev : prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {isStreaming ? <StreamingBubble text={streamingText ?? ''} accentClassName={meta.accentClassName} /> : null}
        </div>
      </div>

      {/* Apply banner — world setting */}
      {assetType === 'world_setting' && latestWorldPatch && onApplyWorldPatch ? (
        <div className="border-t border-primary/20 bg-primary/5 px-4 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-foreground/80">
              <span className="font-medium text-foreground">AI 已生成世界观建议</span>
              <span className="ml-2 text-muted-foreground">
                {Object.values(latestWorldPatch).filter(Boolean).length} 个字段 · 确认后写入
              </span>
            </div>
            <Button size="sm" className="h-7 shrink-0 text-xs" onClick={onApplyWorldPatch} disabled={isApplying}>
              <CheckCircle2 className="size-3" />
              {isApplying ? '写入中...' : '应用写入'}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Apply banner — characters */}
      {assetType === 'project_character' && latestCharacterActions?.length && onApplyCharacterActions ? (
        <div className="border-t border-amber-500/20 bg-amber-500/5 px-4 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-foreground/80">
              <span className="font-medium text-foreground">AI 已生成角色建议</span>
              <span className="ml-2 text-muted-foreground">
                {latestCharacterActions.length} 条动作 · 确认后写入
              </span>
            </div>
            <Button
              size="sm"
              className="h-7 shrink-0 bg-amber-500 text-xs text-white hover:bg-amber-600"
              onClick={onApplyCharacterActions}
              disabled={isApplying}
            >
              <CheckCircle2 className="size-3" />
              {isApplying ? '写入中...' : '应用写入'}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Input area */}
      <div className="border-t border-border px-4 pb-4 pt-3">
        {/* Uploaded file pills */}
        {uploadedFiles.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {uploadedFiles.map((f) => (
              <span
                key={f.file_id}
                className="flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] text-primary"
              >
                <Paperclip className="size-2.5" />
                {f.filename}
              </span>
            ))}
          </div>
        ) : null}

        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md"
            className="sr-only"
            onChange={handleFileChange}
            disabled={isUploadingFile || !onFileUpload}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingFile || !onFileUpload}
            title="上传文档（.txt / .md）"
            className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/50 text-muted-foreground transition hover:border-primary/30 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isUploadingFile ? (
              <span className="size-4 animate-spin rounded-full border-2 border-border border-t-foreground" />
            ) : (
              <Paperclip className="size-4" />
            )}
          </button>

          <Textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={meta.placeholder}
            rows={3}
            className="flex-1 resize-none text-sm"
            disabled={isStreaming}
          />

          <Button
            type="button"
            size="icon"
            className="size-9 shrink-0 rounded-xl"
            disabled={isStreaming}
            onClick={() => void handleSend()}
          >
            <Send className="size-4" />
          </Button>
        </div>

        {/* Guidance — collapsible */}
        <details className="mt-2">
          <summary className="cursor-pointer select-none list-none text-[11px] text-muted-foreground transition hover:text-foreground">
            ▸ 补充约束（可选）
          </summary>
          <div className="mt-2">
            <Textarea
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
              rows={2}
              placeholder={meta.guidancePlaceholder}
              className="resize-none text-xs"
            />
          </div>
        </details>
      </div>
    </div>
  )
}
