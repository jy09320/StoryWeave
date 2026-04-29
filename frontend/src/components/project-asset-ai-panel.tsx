import { useRef, useEffect, useCallback, type FormEvent, type ChangeEvent, type KeyboardEvent } from 'react'
import { Globe2, Users2, CheckCircle2, Send, Paperclip, Sparkles, Wrench, BrainCircuit } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type {
  CharacterActionItem,
  ProjectAssetAICharacterResult,
  ProjectAssetAIMessage,
  ProjectAssetAIType,
  ProjectWorldAutoCompleteResult,
  WorldSettingPatch,
} from '@/types/api'
import type { ProjectAssetAIDraftState } from '@/components/project-asset-ai-dialog'

export interface ProjectAssetAIPanelProps {
  assetType: ProjectAssetAIType
  draft: ProjectAssetAIDraftState
  onDraftChange: (updater: (prev: ProjectAssetAIDraftState) => ProjectAssetAIDraftState) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  isSubmitting: boolean
  messages?: ProjectAssetAIMessage[]
  latestWorldResult?: ProjectWorldAutoCompleteResult | null
  latestCharacterResult?: ProjectAssetAICharacterResult | null
  latestWorldPatch?: WorldSettingPatch | null
  latestCharacterActions?: CharacterActionItem[] | null
  onApplyWorldPatch?: () => void
  onApplyCharacterActions?: () => void
  isApplying?: boolean
  onFileUpload?: (file: File) => Promise<void>
  isUploadingFile?: boolean
  uploadedFiles?: Array<{ file_id: string; filename: string }>
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
    placeholder: '输入指令或粘贴设定资料，AI 会分析并生成结构化建议。\n\nShift+Enter 换行，Enter 发送。',
    guidancePlaceholder: '例如：保留已有世界规则，风格偏东方玄幻，不要覆盖已经确定的人名地名。',
    quickPrompts: ['补全时间线', '梳理阵营势力', '提炼世界规则'],
    welcomeContent: '你好！我可以帮你分析资料、补全设定字段。\n\n可以直接输入指令（如"补全该世界的时间线"），也可以粘贴原始资料让我整理，或上传 .txt / .md 文档。',
  },
  project_character: {
    title: '角色 AI 助手',
    icon: Users2,
    accentClassName: 'text-amber-500',
    placeholder: '输入角色指令或粘贴人物资料，AI 会整理并生成角色建议。\n\nShift+Enter 换行，Enter 发送。',
    guidancePlaceholder: '例如：优先提炼已出现角色，不要擅自新增核心角色，保持角色关系克制真实。',
    quickPrompts: ['识别主要角色', '提炼角色关系', '补全项目内定位'],
    welcomeContent: '你好！我可以帮你从资料中识别角色、整理角色关系，并生成创建/更新建议。\n\n可以直接输入指令，或粘贴人物小传、对话片段，也支持上传 .txt / .md 文档。',
  },
}

function buildFallbackMessages(assetType: ProjectAssetAIType): ProjectAssetAIMessage[] {
  const meta = assetMeta[assetType]
  return [
    {
      id: `${assetType}-welcome`,
      role: 'system',
      title: meta.title,
      content: meta.welcomeContent,
    },
  ]
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

function ThinkingBubble({ accentClassName }: { accentClassName: string }) {
  return (
    <div className="flex gap-2.5">
      <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted">
        <Sparkles className={`size-3 animate-pulse ${accentClassName}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 text-xs font-medium text-foreground">正在分析</div>
        <div className="rounded-2xl rounded-tl-sm border border-border bg-muted/40 px-4 py-3">
          <div className="flex items-center gap-1.5">
            <span className="size-1.5 animate-bounce rounded-full bg-foreground/30 [animation-delay:0ms]" />
            <span className="size-1.5 animate-bounce rounded-full bg-foreground/30 [animation-delay:150ms]" />
            <span className="size-1.5 animate-bounce rounded-full bg-foreground/30 [animation-delay:300ms]" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function ProjectAssetAIPanel({
  assetType,
  draft,
  onDraftChange,
  onSubmit,
  isSubmitting,
  messages,
  latestWorldPatch = null,
  latestCharacterActions = null,
  onApplyWorldPatch,
  onApplyCharacterActions,
  isApplying = false,
  onFileUpload,
  isUploadingFile = false,
  uploadedFiles = [],
}: ProjectAssetAIPanelProps) {
  const meta = assetMeta[assetType]
  const Icon = meta.icon
  const resolvedMessages = messages?.length ? messages : buildFallbackMessages(assetType)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [resolvedMessages, isSubmitting])

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
      formRef.current?.requestSubmit()
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card/95">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon className={`size-4 ${meta.accentClassName}`} />
          <span className="text-sm font-semibold text-foreground">{meta.title}</span>
          <Badge variant="outline" className="text-[10px]">{assetType}</Badge>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {meta.quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-[11px] text-muted-foreground transition hover:border-primary/30 hover:bg-muted hover:text-foreground"
              onClick={() =>
                onDraftChange((prev) => ({
                  ...prev,
                  command: prev.command.trim() ? prev.command : prompt,
                }))
              }
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4">
          {resolvedMessages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {isSubmitting ? <ThinkingBubble accentClassName={meta.accentClassName} /> : null}
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
      <form ref={formRef} className="border-t border-border px-4 pb-4 pt-3" onSubmit={onSubmit}>
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
            value={draft.command}
            onChange={(e) => onDraftChange((prev) => ({ ...prev, command: e.target.value }))}
            onKeyDown={handleKeyDown}
            placeholder={meta.placeholder}
            rows={3}
            className="flex-1 resize-none text-sm"
            disabled={isSubmitting}
          />

          <Button
            type="submit"
            size="icon"
            className="size-9 shrink-0 rounded-xl"
            disabled={isSubmitting}
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
              value={draft.guidance}
              onChange={(e) => onDraftChange((prev) => ({ ...prev, guidance: e.target.value }))}
              rows={2}
              placeholder={meta.guidancePlaceholder}
              className="resize-none text-xs"
            />
          </div>
        </details>
      </form>
    </div>
  )
}
