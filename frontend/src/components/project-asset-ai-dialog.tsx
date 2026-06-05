import { FileArrowUp, GlobeSimple, Sparkle, Users } from '@phosphor-icons/react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import type {
  ProjectAssetAICharacterResult,
  ProjectAssetAIMessage,
  ProjectAssetAIType,
  ProjectWorldAutoCompleteMode,
  ProjectWorldAutoCompleteResult,
} from '@/types/api'

export interface ProjectAssetAIDraftState {
  mode: ProjectWorldAutoCompleteMode
  sourceText: string
  command: string
  guidance: string
}

interface ProjectAssetAIDialogProps {
  assetType: ProjectAssetAIType
  open: boolean
  onOpenChange: (open: boolean) => void
  draft: ProjectAssetAIDraftState
  onDraftChange: (updater: (prev: ProjectAssetAIDraftState) => ProjectAssetAIDraftState) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  isSubmitting: boolean
  messages?: ProjectAssetAIMessage[]
  latestWorldResult?: ProjectWorldAutoCompleteResult | null
  latestCharacterResult?: ProjectAssetAICharacterResult | null
}

const assetMeta: Record<
  ProjectAssetAIType,
  {
    title: string
    description: string
    icon: typeof GlobeSimple
    accentClassName: string
    sourceLabel: string
    sourcePlaceholder: string
    commandLabel: string
    commandPlaceholder: string
    guidancePlaceholder: string
    submitLabel: string
    pendingLabel: string
    uploadHint: string
    quickPrompts: string[]
  }
> = {
  world_setting: {
    title: '世界观 AI 助手',
    description: '通过统一 AI 对话框整理资料、补全指令，并在确认后将结构化结果写入世界观设定。',
    icon: GlobeSimple,
    accentClassName: 'text-sky-500',
    sourceLabel: '设定资料（可选）',
    sourcePlaceholder: '粘贴背景资料、门派设定、历史梗概、地理与势力说明，AI 会据此分析并补全世界观。',
    commandLabel: '补全指令（可选）',
    commandPlaceholder: '例如：补全该世界的时间线、主要阵营、修炼体系代价与政治结构。',
    guidancePlaceholder: '例如：保留已有世界规则，风格偏东方玄幻，不要覆盖已经确定的人名地名。',
    submitLabel: '分析并补全世界观',
    pendingLabel: '补全中...',
    uploadHint: '当前版本先支持粘贴文本资料，后续会在这里接入上传文件、文本抽取、结构化预览与确认写回。',
    quickPrompts: ['补全时间线', '梳理阵营势力', '提炼世界规则'],
  },
  project_character: {
    title: '角色 AI 助手',
    description: '通过统一 AI 对话框分析人物资料、生成角色建议，并为后续角色工具链保留接入口。',
    icon: Users,
    accentClassName: 'text-amber-500',
    sourceLabel: '人物资料（可选）',
    sourcePlaceholder: '粘贴人物小传、角色关系说明、对话片段或剧情简介，AI 会据此整理角色信息。',
    commandLabel: '角色指令（可选）',
    commandPlaceholder: '例如：补全主角成长弧、主要角色冲突、角色关系网和项目内定位。',
    guidancePlaceholder: '例如：优先提炼已出现角色，不要擅自新增核心角色，保持角色关系克制真实。',
    submitLabel: '分析角色资料',
    pendingLabel: '分析中...',
    uploadHint: '当前版本先保留文件入口与消息流外壳，后续会对接角色资料分析、角色绑定、角色更新与关系整理工具链。',
    quickPrompts: ['识别主要角色', '提炼角色关系', '补全项目内定位'],
  },
  story_qa: {
    title: '故事问答',
    description: '向 AI 提问关于你故事的任何问题。',
    icon: GlobeSimple,
    accentClassName: 'text-primary',
    sourceLabel: '问题',
    sourcePlaceholder: '',
    commandLabel: '',
    commandPlaceholder: '',
    guidancePlaceholder: '',
    submitLabel: '提问',
    pendingLabel: '查询中...',
    uploadHint: '',
    quickPrompts: [],
  },
}

const modeOptions: Array<{ value: ProjectWorldAutoCompleteMode; label: string }> = [
  { value: 'import', label: '基于资料分析' },
  { value: 'command', label: '基于指令补全' },
  { value: 'hybrid', label: '资料 + 指令混合' },
]

const messageTypeClassName: Record<ProjectAssetAIMessage['role'], string> = {
  user: 'border-border bg-background text-foreground',
  system: 'border-sky-500/20 bg-sky-500/8 text-foreground/90',
  tool: 'border-amber-500/25 bg-amber-500/10 text-foreground/90',
  preview: 'border-emerald-500/25 bg-emerald-500/10 text-foreground/90',
  result: 'border-primary/20 bg-primary/10 text-foreground/90',
}

const messageRoleLabel: Record<ProjectAssetAIMessage['role'], string> = {
  user: '用户输入',
  system: '系统分析',
  tool: '工具执行',
  preview: '结构化预览',
  result: '应用结果',
}

function buildFallbackMessages(assetType: ProjectAssetAIType): ProjectAssetAIMessage[] {
  if (assetType === 'world_setting') {
    return [
      {
        id: 'world-system-ready',
        role: 'system',
        title: 'AI 工作流已就绪',
        content: '可输入资料、补全指令与额外约束。当前世界观能力已接入分析与写回，后续会再补齐文件上传与确认式预览。',
      },
      {
        id: 'world-preview-step',
        role: 'preview',
        title: '当前流程',
        content: '输入资料 → AI 生成结构化建议 → 返回摘要与说明 → 自动写回当前项目世界观。',
      },
    ]
  }

  return [
    {
      id: 'character-system-ready',
      role: 'system',
      title: '角色入口已独立',
      content: '当前已具备独立入口、统一对话框外壳与输入校验，后续会接入角色识别、绑定、更新和关系分析工具。',
    },
    {
      id: 'character-tool-planning',
      role: 'tool',
      title: '计划中的角色工具链',
      content: 'get_project_character_context → analyze_character_sources → propose_project_character_patch → apply_project_character_patch。',
    },
  ]
}

function buildWorldPreviewLines(result: ProjectWorldAutoCompleteResult | null | undefined) {
  if (!result) {
    return []
  }

  return [
    ['标题', result.world_setting.title],
    ['概览', result.world_setting.overview],
    ['规则', result.world_setting.rules],
    ['阵营', result.world_setting.factions],
    ['地点', result.world_setting.locations],
    ['时间线', result.world_setting.timeline],
    ['补充备注', result.world_setting.extra_notes],
  ].filter(([, value]) => Boolean(value?.trim())) as Array<[string, string]>
}

function buildCharacterPreviewLines(result: ProjectAssetAICharacterResult | null | undefined) {
  if (!result) {
    return []
  }

  return [
    ['识别角色数', String(result.detected_characters.length)],
    ['建议动作数', String(result.suggested_actions.length)],
    ['待确认项', String(result.pending_confirmations.length)],
  ]
}

export function ProjectAssetAIDialog({
  assetType,
  open,
  onOpenChange,
  draft,
  onDraftChange,
  onSubmit,
  isSubmitting,
  messages,
  latestWorldResult = null,
  latestCharacterResult = null,
}: ProjectAssetAIDialogProps) {
  const meta = assetMeta[assetType]
  const Icon = meta.icon
  const resolvedMessages = messages?.length ? messages : buildFallbackMessages(assetType)
  const worldPreviewLines = buildWorldPreviewLines(latestWorldResult)
  const characterPreviewLines = buildCharacterPreviewLines(latestCharacterResult)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <DialogTitle className="flex items-center gap-2">
                <Icon className={`size-5 ${meta.accentClassName}`} />
                {meta.title}
                <Badge variant="outline">{assetType === 'world_setting' ? 'world_setting' : 'project_character'}</Badge>
              </DialogTitle>
              <DialogDescription>{meta.description}</DialogDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {meta.quickPrompts.map((prompt) => (
                <Button
                  key={prompt}
                  type="button"
                  variant="outline"
                  className="h-8 rounded-full px-3 text-xs"
                  onClick={() =>
                    onDraftChange((prev) => ({
                      ...prev,
                      command: prev.command.trim() ? prev.command : prompt,
                    }))
                  }
                >
                  {prompt}
                </Button>
              ))}
            </div>
          </div>
        </DialogHeader>

        <form className="grid max-h-[85vh] gap-0 lg:grid-cols-[minmax(0,1.15fr)_380px]" onSubmit={onSubmit}>
          <div className="border-b border-border lg:border-r lg:border-b-0">
            <div className="border-b border-border px-6 py-4">
              <div className="rounded-xl border border-dashed border-border/80 bg-muted/30 px-4 py-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2 font-medium text-foreground">
                  <FileArrowUp className={`size-4 ${meta.accentClassName}`} />
                  文件解析入口预留
                </div>
                <p className="mt-2 leading-6">{meta.uploadHint}</p>
              </div>
            </div>

            <div className="border-b border-border px-6 py-4">
              <div className="grid gap-2 md:grid-cols-3">
                {modeOptions.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant={draft.mode === option.value ? 'default' : 'outline'}
                    onClick={() => onDraftChange((prev) => ({ ...prev, mode: option.value }))}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            <ScrollArea className="h-[calc(85vh-265px)]">
              <div className="space-y-4 px-6 py-5">
                {resolvedMessages.map((message) => (
                  <div key={message.id} className={`rounded-xl border px-4 py-4 text-sm leading-6 ${messageTypeClassName[message.role]}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{messageRoleLabel[message.role]}</Badge>
                      {message.title ? <span className="font-medium text-foreground">{message.title}</span> : null}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{message.content}</p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          <div className="flex min-h-0 flex-col bg-background">
            <div className="space-y-4 border-b border-border px-6 py-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/85">{meta.sourceLabel}</label>
                <Textarea
                  value={draft.sourceText}
                  onChange={(event) => onDraftChange((prev) => ({ ...prev, sourceText: event.target.value }))}
                  rows={6}
                  placeholder={meta.sourcePlaceholder}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/85">{meta.commandLabel}</label>
                <Textarea
                  value={draft.command}
                  onChange={(event) => onDraftChange((prev) => ({ ...prev, command: event.target.value }))}
                  rows={4}
                  placeholder={meta.commandPlaceholder}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/85">补充约束（可选）</label>
                <Textarea
                  value={draft.guidance}
                  onChange={(event) => onDraftChange((prev) => ({ ...prev, guidance: event.target.value }))}
                  rows={3}
                  placeholder={meta.guidancePlaceholder}
                />
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-4 px-6 py-5">
                {assetType === 'world_setting' && latestWorldResult ? (
                  <div className="rounded-xl border border-sky-500/25 bg-sky-500/8 px-4 py-4 text-sm leading-6 text-foreground/85">
                    <div className="flex items-center gap-2 font-medium text-foreground">
                      <Sparkle className="size-4 text-sky-500" />
                      最近一次世界观分析结果
                    </div>
                    <div className="mt-2 text-muted-foreground">
                      {latestWorldResult.world_setting_updated ? '世界观已更新。' : 'AI 已完成分析，当前世界观未发生改动。'}
                      {latestWorldResult.applied_sources.length ? ` 参考来源：${latestWorldResult.applied_sources.join('、')}。` : ''}
                    </div>
                    {latestWorldResult.notes.length ? (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                        {latestWorldResult.notes.map((note, index) => (
                          <li key={`${note}-${index}`}>{note}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}

                {assetType === 'project_character' && latestCharacterResult ? (
                  <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-4 text-sm leading-6 text-foreground/85">
                    <div className="font-medium text-foreground">最近一次角色分析摘要</div>
                    <div className="mt-2 text-muted-foreground">
                      已识别 {latestCharacterResult.detected_characters.length} 个角色，生成 {latestCharacterResult.suggested_actions.length} 条建议动作。
                    </div>
                    {latestCharacterResult.pending_confirmations.length ? (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                        {latestCharacterResult.pending_confirmations.map((item, index) => (
                          <li key={`${item}-${index}`}>{item}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}

                <div className="rounded-xl border border-border bg-muted/20 px-4 py-4 text-sm leading-6 text-foreground/85">
                  <div className="font-medium text-foreground">结构化预览</div>
                  <div className="mt-2 space-y-2 text-muted-foreground">
                    {assetType === 'world_setting' && worldPreviewLines.length
                      ? worldPreviewLines.map(([label, value]) => (
                          <div key={label}>
                            <span className="text-foreground">{label}：</span>
                            <span>{value}</span>
                          </div>
                        ))
                      : null}
                    {assetType === 'project_character' && characterPreviewLines.length
                      ? characterPreviewLines.map(([label, value]) => (
                          <div key={label}>
                            <span className="text-foreground">{label}：</span>
                            <span>{value}</span>
                          </div>
                        ))
                      : null}
                    {((assetType === 'world_setting' && worldPreviewLines.length === 0) ||
                      (assetType === 'project_character' && characterPreviewLines.length === 0)) && (
                      <p>当前尚无可展示的结构化结果，提交后会在这里集中展示字段摘要、建议动作与待确认项。</p>
                    )}
                  </div>
                </div>
              </div>
            </ScrollArea>

            <DialogFooter className="border-t border-border px-6 py-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                关闭
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? meta.pendingLabel : meta.submitLabel}
              </Button>
            </DialogFooter>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
