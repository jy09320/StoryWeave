import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import {
  Bot,
  BookCopy,
  ChevronRight,
  Home,
  LoaderCircle,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  SendHorizontal,
  Settings2,
  Sparkles,
  Users2,
} from 'lucide-react'
import { NavLink, Outlet, useLocation, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { ModelPickerDialog } from '@/components/ai/model-picker-dialog'
import {
  EDITOR_AI_DRAFT_EVENT,
  dispatchEditorAICommand,
  readEditorAIDraftContext,
  type EditorAIDraftContext,
} from '@/lib/editor-ai-bridge'
import {
  EDITOR_UTILITY_CONTEXT_EVENT,
  readEditorUtilityContext,
  type EditorUtilityContext,
} from '@/lib/editor-utility-context'
import { formatDate } from '@/lib/format'
import { getAIRuntimeSettings, listAIRuntimeModels, streamGenerate, type AIModelOption } from '@/services/ai'
import { getProject } from '@/services/projects'
import type { AIGeneratePayload, ProjectDetail } from '@/types/api'

const primaryNavItems = [
  { to: '/workspace', label: '首页', icon: Home, end: true },
  { to: '/characters', label: '角色库', icon: Users2, end: false },
  { to: '/ai-toolbox', label: 'AI 工具箱', icon: Sparkles, end: false },
  { to: '/settings', label: '设置', icon: Settings2, end: false },
]

type UtilityTabKey = 'characters' | 'world' | 'ai'
type AIChatMessageRole = 'assistant' | 'user'

interface AIChatMessage {
  id: string
  role: AIChatMessageRole
  content: string
}

const utilityTabs: Array<{ key: UtilityTabKey; label: string }> = [
  { key: 'characters', label: '角色' },
  { key: 'world', label: '设定' },
  { key: 'ai', label: 'AI' },
]

const actionLabelMap = {
  polish: 'AI 润色',
  expand: '扩写',
  rewrite: '改写',
  consistency: '一致性检查',
} as const

const DEFAULT_CONTINUE_INSTRUCTION = '请基于当前正文继续写下去，保持风格一致，并自然衔接上一段。'

const FALLBACK_MODEL_BY_PROVIDER: Record<string, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-3-5-sonnet-latest',
}

function getAIInstruction(context: EditorUtilityContext | null) {
  if (!context || context.action !== 'expand') {
    return DEFAULT_CONTINUE_INSTRUCTION
  }

  return `请围绕这段文字继续扩写，补足细节、情绪和动作，但保持与当前章节一致：“${context.selectedText}”`
}

const worldSectionMeta = [
  { key: 'overview', label: '概览', emptyLabel: '暂无概览' },
  { key: 'rules', label: '规则', emptyLabel: '暂无规则' },
  { key: 'factions', label: '势力', emptyLabel: '暂无势力摘要' },
  { key: 'locations', label: '地点', emptyLabel: '暂无地点摘要' },
  { key: 'timeline', label: '时间线', emptyLabel: '暂无时间线摘要' },
  { key: 'extra_notes', label: '补充', emptyLabel: '暂无补充说明' },
] as const

type WorldSectionKey = (typeof worldSectionMeta)[number]['key']

function normalizeForSearch(value: string) {
  return value.toLowerCase()
}

function extractContextTokens(value: string) {
  const matches = value.match(/[\u4e00-\u9fa5]{2,}|[a-z0-9]{2,}/gi) ?? []
  return Array.from(new Set(matches.map((item) => normalizeForSearch(item.trim())).filter(Boolean))).slice(0, 24)
}

function getKeywordMatches(source: string, keywords: string[]) {
  const normalizedSource = normalizeForSearch(source)
  return keywords.filter((keyword) => keyword.length >= 2 && normalizedSource.includes(keyword))
}

function getToolboxPath(task: string, projectId?: string, chapterId?: string) {
  const searchParams = new URLSearchParams({ task })

  if (projectId) {
    searchParams.set('projectId', projectId)
  }

  if (chapterId) {
    searchParams.set('chapterId', chapterId)
  }

  return `/ai-toolbox?${searchParams.toString()}`
}

export function AppShell() {
  const location = useLocation()
  const { projectId, chapterId } = useParams<{ projectId?: string; chapterId?: string }>()
  const [isProjectTreeOpen, setIsProjectTreeOpen] = useState(true)
  const [isUtilityOpen, setIsUtilityOpen] = useState(false)
  const [activeUtilityTab, setActiveUtilityTab] = useState<UtilityTabKey>('characters')
  const [isZenMode, setIsZenMode] = useState(false)
  const [dismissedUtilityContextAt, setDismissedUtilityContextAt] = useState<string | null>(null)
  const [editorUtilityContext, setEditorUtilityContext] = useState<EditorUtilityContext | null>(() =>
    typeof window === 'undefined' ? null : readEditorUtilityContext(),
  )
  const [editorAIDraftContext, setEditorAIDraftContext] = useState<EditorAIDraftContext | null>(() =>
    typeof window === 'undefined' ? null : readEditorAIDraftContext(),
  )
  const [availableModels, setAvailableModels] = useState<AIModelOption[]>([])
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [isModelDialogOpen, setIsModelDialogOpen] = useState(false)
  const [aiState, setAIState] = useState({
    instruction: DEFAULT_CONTINUE_INSTRUCTION,
    modelId: '',
    result: '',
    isGenerating: false,
    requestId: 0,
  })
  const [aiMessages, setAIMessages] = useState<AIChatMessage[]>([])

  const isProjectScoped = Boolean(projectId) && location.pathname.startsWith(`/projects/${projectId}`)
  const isEditorRoute = isProjectScoped && location.pathname.includes('/editor/')

  const projectQuery = useQuery<ProjectDetail, Error>({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId ?? ''),
    enabled: isProjectScoped,
    staleTime: 60_000,
  })

  const runtimeSettingsQuery = useQuery({
    queryKey: ['ai-runtime-settings'],
    queryFn: getAIRuntimeSettings,
    enabled: isEditorRoute,
    staleTime: 60_000,
  })

  useEffect(() => {
    if (!isProjectScoped) {
      setIsProjectTreeOpen(false)
      setIsUtilityOpen(false)
      setIsZenMode(false)
    } else {
      setIsProjectTreeOpen(true)
    }
  }, [isProjectScoped])

  useEffect(() => {
    if (!isEditorRoute && isZenMode) {
      setIsZenMode(false)
    }
  }, [isEditorRoute, isZenMode])

  useEffect(() => {
    if (!isZenMode) {
      return
    }

    setIsProjectTreeOpen(false)
    setIsUtilityOpen(false)
  }, [isZenMode])

  useEffect(() => {
    function syncUtilityContext() {
      const nextContext = readEditorUtilityContext()
      setEditorUtilityContext(nextContext)
    }

    function handleCustomEvent(event: Event) {
      const customEvent = event as CustomEvent<EditorUtilityContext | null>
      const nextContext = customEvent.detail ?? null
      setEditorUtilityContext(nextContext)

      if (!nextContext) {
        setDismissedUtilityContextAt(null)
        return
      }

      if (
        nextContext.projectId !== projectId ||
        nextContext.chapterId !== chapterId ||
        isZenMode ||
        nextContext.updatedAt === dismissedUtilityContextAt
      ) {
        return
      }

      setActiveUtilityTab('ai')
      setIsUtilityOpen(true)
    }

    syncUtilityContext()
    window.addEventListener('storage', syncUtilityContext)
    window.addEventListener(EDITOR_UTILITY_CONTEXT_EVENT, handleCustomEvent as EventListener)
    return () => {
      window.removeEventListener('storage', syncUtilityContext)
      window.removeEventListener(EDITOR_UTILITY_CONTEXT_EVENT, handleCustomEvent as EventListener)
    }
  }, [chapterId, dismissedUtilityContextAt, isZenMode, projectId])

  useEffect(() => {
    if (!editorUtilityContext) {
      setDismissedUtilityContextAt(null)
      return
    }

    if (dismissedUtilityContextAt && dismissedUtilityContextAt !== editorUtilityContext.updatedAt) {
      setDismissedUtilityContextAt(null)
    }
  }, [dismissedUtilityContextAt, editorUtilityContext])

  useEffect(() => {
    function syncAIDraftContext() {
      const nextContext = readEditorAIDraftContext()
      setEditorAIDraftContext(nextContext)
    }

    function handleCustomEvent(event: Event) {
      const customEvent = event as CustomEvent<EditorAIDraftContext | null>
      setEditorAIDraftContext(customEvent.detail ?? null)
    }

    syncAIDraftContext()
    window.addEventListener('storage', syncAIDraftContext)
    window.addEventListener(EDITOR_AI_DRAFT_EVENT, handleCustomEvent as EventListener)
    return () => {
      window.removeEventListener('storage', syncAIDraftContext)
      window.removeEventListener(EDITOR_AI_DRAFT_EVENT, handleCustomEvent as EventListener)
    }
  }, [])

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey)) {
        return
      }

      const key = event.key.toLowerCase()
      if (key === 'b' && isProjectScoped && !isZenMode) {
        event.preventDefault()
        setIsProjectTreeOpen((prev) => !prev)
      }

      if (key === 'j' && isProjectScoped && !isZenMode) {
        event.preventDefault()
        setIsUtilityOpen((prev) => !prev)
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [isProjectScoped, isZenMode])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    if (window.innerWidth < 768) {
      setIsProjectTreeOpen(false)
    }

    if (window.innerWidth < 1280) {
      setIsUtilityOpen(false)
      return
    }

    if (isEditorRoute) {
      setIsUtilityOpen(true)
    }
  }, [isEditorRoute, location.pathname])

  const pageMeta = useMemo(() => {
    const project = projectQuery.data
    const activeChapter = project?.chapters.find((item) => item.id === chapterId) ?? null

    if (location.pathname === '/workspace') {
      return {
        eyebrow: 'Dashboard',
        title: '最近进度',
        description: '',
      }
    }

    if (location.pathname === '/characters') {
      return {
        eyebrow: 'Characters',
        title: '角色资产库',
        description: '',
      }
    }

    if (location.pathname === '/ai-toolbox') {
      return {
        eyebrow: 'AI Toolbox',
        title: 'AI 任务工作台',
        description: '',
      }
    }

    if (location.pathname === '/settings') {
      return {
        eyebrow: 'Settings',
        title: '工作台设置',
        description: '',
      }
    }

    if (isProjectScoped && location.pathname.includes('/editor/')) {
      return {
        eyebrow: project?.title ?? '章节编辑器',
        title: activeChapter?.title ?? '章节编辑器',
        description: activeChapter
          ? `第 ${activeChapter.order_index} 章 · ${activeChapter.word_count} 字`
          : '',
      }
    }

    if (isProjectScoped && location.pathname.endsWith('/world')) {
      return {
        eyebrow: project?.title ?? '项目设定',
        title: '世界观编辑',
        description: '',
      }
    }

    if (isProjectScoped) {
      return {
        eyebrow: 'Workspace',
        title: project?.title ?? '项目工作台',
        description: project?.description?.trim() || '',
      }
    }

    return {
      eyebrow: 'StoryWeave',
      title: '创作工作台',
      description: '',
    }
  }, [chapterId, isProjectScoped, location.pathname, projectQuery.data])

  const project = projectQuery.data ?? null
  const projectChapters = project?.chapters ?? []
  const projectCharacters = project?.project_characters ?? []
  const worldSetting = project?.world_setting ?? null
  const activeChapter = projectChapters.find((item) => item.id === chapterId) ?? null
  const contextText = useMemo(
    () =>
      [
        activeChapter?.title ?? '',
        activeChapter?.summary ?? '',
        activeChapter?.plain_text ?? '',
      ]
        .filter(Boolean)
        .join('\n'),
    [activeChapter],
  )
  const contextKeywords = useMemo(() => extractContextTokens(contextText), [contextText])
  const contextualCharacters = useMemo(
    () =>
      [...projectCharacters]
        .map((item) => {
          const matches = getKeywordMatches(
            [item.character.name, item.role_label, item.summary, item.character.personality, item.character.description]
              .filter(Boolean)
              .join('\n'),
            contextKeywords,
          )
          const nameMatched =
            activeChapter?.plain_text?.includes(item.character.name) || activeChapter?.title?.includes(item.character.name)

          return {
            item,
            matches: matches.slice(0, 3),
            score: (nameMatched ? 4 : 0) + matches.length,
          }
        })
        .sort((left, right) => right.score - left.score || left.item.sort_order - right.item.sort_order),
    [activeChapter?.plain_text, activeChapter?.title, contextKeywords, projectCharacters],
  )
  const contextualWorldSections = useMemo(
    () =>
      worldSectionMeta
        .map((section, index) => {
          const value = worldSetting?.[section.key as WorldSectionKey] ?? ''
          const matches = getKeywordMatches(value, contextKeywords)

          return {
            ...section,
            value,
            matches: matches.slice(0, 4),
            score: matches.length,
            order: index,
          }
        })
        .sort((left, right) => right.score - left.score || left.order - right.order),
    [contextKeywords, worldSetting],
  )
  const chapterContextHint = activeChapter
    ? `当前章节：${activeChapter.title}${contextKeywords.length > 0 ? ` · 命中 ${contextKeywords.length} 个上下文词` : ''}`
    : '当前未锁定章节，右侧抽屉以项目级信息为主'
  const scopedEditorUtilityContext =
    editorUtilityContext?.projectId === projectId && editorUtilityContext?.chapterId === chapterId
      ? editorUtilityContext
      : null
  const shouldRenderProjectTree = isProjectScoped && isProjectTreeOpen && !isZenMode
  const shouldRenderUtility = isProjectScoped && isUtilityOpen && !isZenMode
  const scopedEditorAIDraft =
    editorAIDraftContext?.projectId === projectId && editorAIDraftContext?.chapterId === chapterId
      ? editorAIDraftContext
      : null
  const selectedModelId =
    aiState.modelId.trim() ||
    runtimeSettingsQuery.data?.model_id ||
    FALLBACK_MODEL_BY_PROVIDER[runtimeSettingsQuery.data?.provider ?? 'openai'] ||
    'gpt-4o'
  const hasSavedRuntimeKey = Boolean(runtimeSettingsQuery.data?.api_key_masked)

  useEffect(() => {
    setAIState((prev) => ({
      ...prev,
      result: '',
      instruction: getAIInstruction(scopedEditorUtilityContext),
    }))
    setAIMessages([])
  }, [scopedEditorUtilityContext?.updatedAt, chapterId])

  async function handleLoadModels() {
    setIsLoadingModels(true)
    try {
      const response = await listAIRuntimeModels()
      setAvailableModels(response.models)
      toast.success(`已获取 ${response.models.length} 个可用模型`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '获取模型列表失败')
    } finally {
      setIsLoadingModels(false)
    }
  }

  function handleOpenModelDialog() {
    setIsModelDialogOpen(true)
    if (availableModels.length === 0 && !isLoadingModels && hasSavedRuntimeKey) {
      void handleLoadModels()
    }
  }

  function handleStopGeneration() {
    setAIState((prev) => ({ ...prev, isGenerating: false, requestId: prev.requestId + 1 }))
    toast.info('已停止本次 AI 续写')
  }

  async function handleGenerate() {
    if (!projectId || !chapterId) {
      return
    }

    const sourceText = (scopedEditorUtilityContext?.action === 'expand' ? scopedEditorUtilityContext.selectedText : scopedEditorAIDraft?.plainText)?.trim() ?? ''
    if (!sourceText) {
      toast.error('请先准备可续写的正文内容')
      return
    }

    const submittedInstruction = aiState.instruction.trim() || DEFAULT_CONTINUE_INSTRUCTION
    const requestId = aiState.requestId + 1
    const assistantMessageId = `assistant-${requestId}`

    setAIMessages((prev) => [
      ...prev,
      {
        id: `user-${requestId}`,
        role: 'user',
        content: submittedInstruction,
      },
      {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
      },
    ])
    setAIState((prev) => ({ ...prev, result: '', isGenerating: true, requestId }))

    const payload: AIGeneratePayload = {
      project_id: projectId,
      chapter_id: chapterId,
      text: sourceText,
      instruction: submittedInstruction,
      model_provider: runtimeSettingsQuery.data?.provider ?? 'openai',
      model_id: selectedModelId,
    }

    try {
      await streamGenerate(payload, (chunk) => {
        setAIState((prev) => {
          if (prev.requestId !== requestId || !prev.isGenerating) {
            return prev
          }

          return {
            ...prev,
            result: `${prev.result}${chunk}`,
          }
        })
        setAIMessages((prev) =>
          prev.map((message) =>
            message.id === assistantMessageId
              ? { ...message, content: `${message.content}${chunk}` }
              : message,
          ),
        )
      })

      setAIState((prev) => (prev.requestId === requestId ? { ...prev, isGenerating: false } : prev))
    } catch (error) {
      setAIState((prev) => (prev.requestId === requestId ? { ...prev, isGenerating: false } : prev))
      setAIMessages((prev) =>
        prev.map((message) =>
          message.id === assistantMessageId && !message.content.trim()
            ? { ...message, content: error instanceof Error ? error.message : 'AI 续写失败' }
            : message,
        ),
      )
      toast.error(error instanceof Error ? error.message : 'AI 续写失败')
    }
  }

  function handleApplyGeneratedText() {
    if (!projectId || !chapterId || !aiState.result.trim()) {
      return
    }

    dispatchEditorAICommand({
      projectId,
      chapterId,
      type: 'apply-generated-text',
      text: aiState.result.trim(),
      mode: scopedEditorUtilityContext?.action === 'expand' ? 'append-after-selection' : 'append-chapter',
      selectionAction: scopedEditorUtilityContext?.action ?? null,
    })
    setAIState((prev) => ({ ...prev, result: '', isGenerating: false }))
  }

  function handleDiscardGeneratedText() {
    if (projectId && chapterId) {
      dispatchEditorAICommand({
        projectId,
        chapterId,
        type: 'discard-generated-text',
      })
    }
    setAIState((prev) => ({ ...prev, result: '', isGenerating: false }))
  }

  function closeUtilityDrawer() {
    if (scopedEditorUtilityContext?.updatedAt) {
      setDismissedUtilityContextAt(scopedEditorUtilityContext.updatedAt)
    }

    setIsUtilityOpen(false)
  }


  function renderAIUtilityPanel(onClose?: () => void) {
    if (true) {
      const primaryLabel = scopedEditorUtilityContext?.action === 'expand' ? '选区扩写' : '章节续写'
      const resultApplyLabel = scopedEditorUtilityContext?.action === 'expand' ? '插入到选区后' : '追加到正文'
      const hasDraftSource =
        scopedEditorUtilityContext?.action === 'expand' || Boolean(scopedEditorAIDraft?.plainText.trim())

      return (
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
          <div className="mb-4 flex items-center justify-between">
            <SectionLabel>AI 对话</SectionLabel>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleOpenModelDialog}
                disabled={isLoadingModels || !hasSavedRuntimeKey || runtimeSettingsQuery.isLoading}
                className="inline-flex h-8 items-center justify-center rounded-full border border-[#d1d5db] bg-white px-3 text-[11px] text-[#4b5563] transition hover:border-[#9ca3af] hover:text-[#111827] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoadingModels ? '加载中' : '模型'}
              </button>
              <button
                type="button"
                onClick={() => onClose?.()}
                className="inline-flex h-8 items-center justify-center rounded-full border border-[#d1d5db] bg-white px-3 text-[11px] text-[#4b5563] transition hover:border-[#9ca3af] hover:text-[#111827]"
              >
                收起
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] border border-[#e5e7eb] bg-[#fcfcfd] shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
            <div className="border-b border-[#eef0f3] px-4 py-4">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <Bot className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[#111827]">{primaryLabel}</div>
                  <div className="mt-1 text-xs leading-5 text-[#6b7280]">
                    当前模型：{selectedModelId}
                    {!hasSavedRuntimeKey ? '，请先在设置中心保存 API Key。' : ''}
                  </div>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
              <div className="space-y-4">
                {scopedEditorUtilityContext ? (
                  <div className="mr-8 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-amber-700">当前选区</div>
                    <div className="text-sm leading-6 text-[#4b5563]">{scopedEditorUtilityContext.selectedText}</div>
                  </div>
                ) : null}

                {aiMessages.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#d1d5db] bg-white px-4 py-4 text-sm leading-6 text-[#6b7280]">
                    输入续写指令后发送。这里会按聊天消息流展示你的要求和 AI 返回内容，底部输入区固定保留。
                  </div>
                ) : null}

                {aiMessages.map((message) => (
                  <div
                    key={message.id}
                    className={clsx('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}
                  >
                    <div
                      className={clsx(
                        'max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6',
                        message.role === 'user'
                          ? 'bg-[#111827] text-white'
                          : 'border border-[#e5e7eb] bg-white text-[#374151]',
                      )}
                    >
                      {message.content.trim() || (message.role === 'assistant' && aiState.isGenerating ? '正在生成...' : '')}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-[#eef0f3] bg-white px-4 py-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[#d1d5db] bg-[#f9fafb] px-3 py-1 text-[11px] text-[#6b7280]">
                  {primaryLabel}
                </span>
                <span className="rounded-full border border-[#d1d5db] bg-[#f9fafb] px-3 py-1 text-[11px] text-[#6b7280]">
                  模型 {selectedModelId}
                </span>
                {availableModels.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {availableModels.slice(0, 4).map((model) => (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => setAIState((prev) => ({ ...prev, result: '', modelId: model.id }))}
                        className={clsx(
                          'rounded-full border px-3 py-1 text-[11px] transition',
                          model.id === selectedModelId
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-[#d1d5db] bg-white text-[#6b7280] hover:border-[#9ca3af] hover:text-[#111827]',
                        )}
                      >
                        {model.id}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="rounded-[20px] border border-[#d1d5db] bg-[#fcfcfd] p-3">
                <textarea
                  value={aiState.instruction}
                  onChange={(event) => setAIState((prev) => ({ ...prev, result: '', instruction: event.target.value }))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      if (!aiState.isGenerating && hasDraftSource) {
                        void handleGenerate()
                      }
                    }
                  }}
                  rows={4}
                  className="min-h-[96px] w-full resize-none border-none bg-transparent text-sm leading-6 text-[#111827] outline-none placeholder:text-[#9ca3af]"
                  placeholder="描述续写目标、情绪、节奏或限制条件。按 Enter 发送，Shift+Enter 换行。"
                />

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleStopGeneration}
                    disabled={!aiState.isGenerating}
                    className="inline-flex h-9 items-center justify-center rounded-xl border border-[#d1d5db] bg-white px-3 text-xs text-[#4b5563] transition hover:border-[#9ca3af] hover:text-[#111827] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    停止
                  </button>
                  <button
                    type="button"
                    onClick={handleDiscardGeneratedText}
                    disabled={!aiState.result.trim() && !aiState.isGenerating}
                    className="inline-flex h-9 items-center justify-center rounded-xl border border-[#d1d5db] bg-white px-3 text-xs text-[#4b5563] transition hover:border-[#9ca3af] hover:text-[#111827] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    丢弃
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyGeneratedText}
                    disabled={!aiState.result.trim() || aiState.isGenerating}
                    className="inline-flex h-9 items-center justify-center rounded-xl bg-[#111827] px-3 text-xs font-medium text-white transition hover:bg-[#1f2937] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {resultApplyLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleGenerate()}
                    disabled={aiState.isGenerating || !hasDraftSource}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 text-xs font-medium text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {aiState.isGenerating ? <LoaderCircle className="size-3.5 animate-spin" /> : <SendHorizontal className="size-3.5" />}
                    发送
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    }
    const primaryLabel = scopedEditorUtilityContext?.action === 'expand' ? '选区扩写' : '章节续写'
    const resultApplyLabel = scopedEditorUtilityContext?.action === 'expand' ? '插入到选区后' : '追加到正文'

    return (
      <div className="space-y-4">
        <SectionLabel>AI</SectionLabel>
        <div className="space-y-4 rounded-[24px] border border-border bg-card/95 p-4 shadow-[0_16px_36px_rgba(148,163,184,0.16)]">
          <SidebarHint>
            {scopedEditorUtilityContext?.action === 'expand'
              ? '当前选区已进入扩写模式。模型选择、生成和写回都在这里完成。'
              : '统一在这里处理章节续写。右侧编辑区不再单独放一块 AI。'}
          </SidebarHint>

          {scopedEditorUtilityContext ? (
            <div className="rounded-2xl border border-primary/20 bg-primary/8 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-medium text-foreground">当前选区</div>
                <span className="rounded-full border border-primary/15 bg-background px-2 py-0.5 text-[11px] text-primary">
                  {actionLabelMap[scopedEditorUtilityContext!.action]}
                </span>
              </div>
              <div className="mt-2 line-clamp-4 text-sm leading-6 text-muted-foreground">{scopedEditorUtilityContext!.selectedText}</div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-border bg-background/90 p-4">
            <div className="text-sm font-medium text-foreground">{primaryLabel}</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">提供商、API Key、Base URL 统一在设置中心维护，这里只切换当前续写模型。</div>
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleLoadModels}
                  disabled={isLoadingModels || !hasSavedRuntimeKey || runtimeSettingsQuery.isLoading}
                  className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-background px-3 text-xs text-foreground transition hover:border-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoadingModels ? '获取中...' : '获取可用模型'}
                </button>
                <NavLink
                  to="/settings"
                  onClick={onClose}
                  className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-muted/55 px-3 text-xs text-muted-foreground transition hover:border-primary/25 hover:text-foreground"
                >
                  设置中心
                </NavLink>
              </div>
              {!hasSavedRuntimeKey ? <div className="text-xs leading-5 text-primary">请先在设置中心保存 API Key。</div> : null}
              <div className="rounded-xl border border-border bg-muted/55 px-3 py-2 text-sm text-foreground">当前模型：{selectedModelId}</div>
              {availableModels.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {availableModels.slice(0, 16).map((model) => {
                    const isSelected = model.id === selectedModelId
                    return (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => setAIState((prev) => ({ ...prev, result: '', modelId: model.id }))}
                        className={clsx(
                          'rounded-full border px-3 py-1 text-xs transition',
                          isSelected
                            ? 'border-primary/20 bg-primary/10 text-primary'
                            : 'border-border bg-background text-muted-foreground hover:border-primary/25 hover:text-foreground',
                        )}
                      >
                        {model.id}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-muted/45 px-3 py-2 text-xs leading-5 text-muted-foreground">还没有加载模型列表。</div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">续写指令</label>
            <textarea
              value={aiState.instruction}
              onChange={(event) => setAIState((prev) => ({ ...prev, result: '', instruction: event.target.value }))}
              rows={5}
              className="min-h-[112px] w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm leading-6 text-foreground outline-none transition focus:border-primary/40"
              placeholder="描述续写目标、情绪、节奏或限制条件。"
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={aiState.isGenerating || !scopedEditorAIDraft?.plainText.trim() && scopedEditorUtilityContext?.action !== 'expand'}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {aiState.isGenerating ? '生成中...' : '开始 AI 续写'}
            </button>
            <button
              type="button"
              onClick={handleStopGeneration}
              disabled={!aiState.isGenerating}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-3 text-sm text-muted-foreground transition hover:border-primary/25 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              停止生成
            </button>
          </div>

          <div className="rounded-2xl border border-border bg-background/90 p-4">
            <div className="text-sm font-medium text-foreground">生成结果</div>
            <div className="mt-2 max-h-[240px] overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-foreground/85">{aiState.result || '暂无结果'}</div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleApplyGeneratedText}
              disabled={!aiState.result.trim() || aiState.isGenerating}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {resultApplyLabel}
            </button>
            <button
              type="button"
              onClick={handleDiscardGeneratedText}
              disabled={!aiState.result.trim() && !aiState.isGenerating}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-3 text-sm text-muted-foreground transition hover:border-primary/25 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              丢弃结果
            </button>
          </div>

          <div className="grid gap-2">
            <NavLink
              to={getToolboxPath('continue', projectId, chapterId)}
              onClick={onClose}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-background px-3 text-xs text-muted-foreground transition hover:border-primary/25 hover:text-foreground"
            >
              打开 AI 工具箱
            </NavLink>
            <button
              type="button"
              onClick={() => onClose?.()}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-muted/55 px-3 text-xs text-muted-foreground transition hover:border-primary/25 hover:text-foreground"
            >
              收起抽屉
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background text-foreground selection:bg-primary/15 selection:text-foreground">
      <aside className="flex w-[88px] shrink-0 flex-col items-center border-r border-border bg-[#f6f1e8] px-3 py-5">
        <div className="flex size-12 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary shadow-[0_12px_30px_rgba(16,185,129,0.08)]">
          <Sparkles className="size-4" />
        </div>

        <nav className="mt-8 flex flex-1 flex-col items-stretch gap-2">
          {primaryNavItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                title={item.label}
                className={({ isActive }) =>
                  clsx(
                    'flex min-h-15 flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-2 text-center transition',
                    isActive
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-background/70 hover:text-foreground',
                  )
                }
              >
                <Icon className="size-4" />
                <span className="text-[11px] leading-none">{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="mt-4 rounded-full border border-primary/15 bg-primary/10 px-2.5 py-1 text-[10px] text-primary">
          就绪
        </div>
      </aside>

      {shouldRenderProjectTree ? (
        <aside className="hidden w-[280px] shrink-0 border-r border-border bg-sidebar md:flex md:flex-col">
          <div className="border-b border-border px-6 py-6">
            <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Project</div>
            <div className="mt-2 text-lg font-semibold text-foreground">{project?.title ?? '正在加载项目...'}</div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-5">
            <div className="space-y-1">
              <SectionLabel>导航</SectionLabel>
              <ProjectTreeLink to={`/projects/${projectId}`} label="项目大盘" active={location.pathname === `/projects/${projectId}`} />
              <ProjectTreeLink
                to={`/projects/${projectId}/world`}
                label="世界观设定"
                active={location.pathname === `/projects/${projectId}/world`}
              />
            </div>

            <div className="mt-6 space-y-1">
              <SectionLabel>章节树</SectionLabel>
              {projectQuery.isLoading ? (
                <SidebarHint>正在加载章节结构...</SidebarHint>
              ) : projectChapters.length > 0 ? (
                projectChapters.map((chapter) => (
                  <ProjectTreeLink
                    key={chapter.id}
                    to={`/projects/${projectId}/editor/${chapter.id}`}
                    label={chapter.title}
                    meta={`第 ${chapter.order_index} 章`}
                    active={chapter.id === chapterId}
                  />
                ))
              ) : (
                <SidebarHint>当前项目还没有章节。</SidebarHint>
              )}
            </div>

            <div className="mt-6 space-y-1">
              <SectionLabel>辅助入口</SectionLabel>
              <ProjectTreeLink to="/characters" label="全局角色库" active={location.pathname === '/characters'} />
              <ProjectTreeStatic label="回收站" meta="" />
            </div>
          </div>
        </aside>
      ) : null}

      <div className="flex min-w-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col bg-transparent">
          <header className="sticky top-0 z-20 border-b border-border bg-background/88 backdrop-blur">
            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                {isProjectScoped && !isZenMode ? (
                  <button
                    type="button"
                    className="inline-flex size-10 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition hover:border-primary/25 hover:text-foreground"
                    onClick={() => setIsProjectTreeOpen((prev) => !prev)}
                  >
                    {isProjectTreeOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
                  </button>
                ) : null}

                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{pageMeta.eyebrow}</div>
                  <div className="truncate text-lg font-semibold text-foreground">{pageMeta.title}</div>
                  {pageMeta.description ? <div className="truncate text-sm text-muted-foreground">{pageMeta.description}</div> : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                {isProjectScoped ? (
                  <>
                    {isEditorRoute ? (
                      <>
                        <button
                          type="button"
                          className="inline-flex size-10 items-center justify-center rounded-xl border border-[#e5e7eb] bg-white text-[#6b7280] transition hover:border-[#d1d5db] hover:text-[#111827] md:hidden"
                          onClick={() => setIsZenMode((prev) => !prev)}
                        >
                          {isZenMode ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                        </button>
                        <button
                          type="button"
                          className="hidden h-10 items-center gap-2 rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm text-[#4b5563] transition hover:border-[#d1d5db] hover:text-[#111827] md:inline-flex"
                          onClick={() => setIsZenMode((prev) => !prev)}
                        >
                          {isZenMode ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                          {isZenMode ? '退出专注' : '进入专注'}
                        </button>
                      </>
                    ) : null}
                    <>
                      <button
                        type="button"
                        className="inline-flex size-10 items-center justify-center rounded-xl border border-[#e5e7eb] bg-white text-[#6b7280] transition hover:border-[#d1d5db] hover:text-[#111827] md:hidden"
                        onClick={() => {
                          if (isUtilityOpen) {
                            closeUtilityDrawer()
                            return
                          }

                          setIsUtilityOpen(true)
                        }}
                        disabled={isZenMode}
                      >
                        {isUtilityOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
                      </button>
                      <button
                        type="button"
                        className="hidden h-10 items-center gap-2 rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm text-[#4b5563] transition hover:border-[#d1d5db] hover:text-[#111827] md:inline-flex"
                        onClick={() => {
                          if (isUtilityOpen) {
                            closeUtilityDrawer()
                            return
                          }

                          setIsUtilityOpen(true)
                        }}
                        disabled={isZenMode}
                      >
                        {isUtilityOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
                        参考抽屉
                      </button>
                    </>
                    {!isZenMode ? (
                      <div className="hidden rounded-xl border border-primary/15 bg-primary/10 px-3 py-2 text-xs text-primary xl:block">
                        Ctrl+B 侧栏 · Ctrl+J 抽屉
                      </div>
                    ) : (
                      <div className="hidden rounded-xl border border-secondary bg-secondary px-3 py-2 text-xs text-secondary-foreground xl:block">
                        专注模式已启用
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-5">
            <Outlet />
          </main>
        </div>

        {shouldRenderUtility ? (
          <aside className="hidden w-[360px] shrink-0 border-l border-border bg-card/96 xl:flex xl:flex-col">
            <div className="border-b border-border px-5 py-4">
              <div className="grid grid-cols-3 rounded-2xl bg-muted/75 p-1">
                {utilityTabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveUtilityTab(tab.key)}
                    className={clsx(
                      'rounded-xl px-3 py-2 text-sm font-medium transition',
                      activeUtilityTab === tab.key
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={clsx('flex-1 px-5 py-5', activeUtilityTab === 'ai' ? 'flex min-h-0 flex-col overflow-hidden' : 'overflow-y-auto')}>
              {activeUtilityTab === 'characters' ? (
                <div className="space-y-3">
                  <SectionLabel>角色速查</SectionLabel>
                  <SidebarHint>{chapterContextHint}</SidebarHint>
                  {contextualCharacters.length > 0 ? (
                    contextualCharacters.slice(0, 6).map(({ item, matches, score }) => (
                      <div key={item.id} className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-medium text-[#111827]">{item.character.name}</div>
                          {score > 0 ? (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
                              当前章命中
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs text-[#6b7280]">
                          {item.role_label || item.summary || item.character.personality || '暂无项目摘要'}
                        </div>
                        {matches.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {matches.map((keyword) => (
                              <span
                                key={`${item.id}-${keyword}`}
                                className="rounded-full border border-[#d1d5db] bg-[#f9fafb] px-2 py-0.5 text-[11px] text-[#6b7280]"
                              >
                                {keyword}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <SidebarHint>当前项目还没有已绑定角色。</SidebarHint>
                  )}
                  <ProjectTreeLink
                    to="/characters"
                    label="打开角色库"
                    meta="专页支持返回当前章节"
                    active={location.pathname === '/characters'}
                  />
                </div>
              ) : null}

              {activeUtilityTab === 'world' ? (
                <div className="space-y-3">
                  <SectionLabel>世界观词条</SectionLabel>
                  <SidebarHint>{chapterContextHint}</SidebarHint>
                  <UtilityInfoCard title="标题" value={worldSetting?.title || '尚未填写'} />
                  {contextualWorldSections.map((section) => (
                    <UtilityInfoCard
                      key={section.key}
                      title={section.label}
                      value={section.value || section.emptyLabel}
                      emphasis={section.score > 0}
                      keywords={section.matches}
                    />
                  ))}
                  <ProjectTreeLink
                    to={`/projects/${projectId}/world`}
                    label="打开完整设定页"
                    meta="专页支持返回当前章节"
                    active={location.pathname === `/projects/${projectId}/world`}
                  />
                </div>
              ) : null}

              {activeUtilityTab === 'ai' ? renderAIUtilityPanel(closeUtilityDrawer) : null}
            </div>

            <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
              {project ? `最近更新 ${formatDate(project.updated_at)}` : '等待项目上下文'}
            </div>
          </aside>
        ) : null}
      </div>

      {shouldRenderProjectTree ? (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setIsProjectTreeOpen(false)}
          aria-hidden="true"
        >
          <aside
            className="flex h-full w-[min(84vw,320px)] flex-col border-r border-[#e5e7eb] bg-[#fafaf9] shadow-2xl shadow-black/10"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#ececec] px-5 py-5">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-[#9ca3af]">Project</div>
                <div className="mt-2 text-sm font-semibold text-[#111827]">{project?.title ?? '加载中...'}</div>
              </div>
              <button
                type="button"
                className="inline-flex size-10 items-center justify-center rounded-xl border border-[#e5e7eb] bg-white text-[#6b7280] transition hover:text-[#111827]"
                onClick={() => setIsProjectTreeOpen(false)}
              >
                <PanelLeftClose className="size-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-5">
              <div className="space-y-1">
                <SectionLabel>导航</SectionLabel>
                <ProjectTreeLink
                  to={`/projects/${projectId}`}
                  label="项目大盘"
                  active={location.pathname === `/projects/${projectId}`}
                  onNavigate={() => setIsProjectTreeOpen(false)}
                />
                <ProjectTreeLink
                  to={`/projects/${projectId}/world`}
                  label="世界观设定"
                  active={location.pathname === `/projects/${projectId}/world`}
                  onNavigate={() => setIsProjectTreeOpen(false)}
                />
              </div>

              <div className="mt-5 space-y-1">
                <SectionLabel>章节树</SectionLabel>
                {projectQuery.isLoading ? (
                  <SidebarHint>正在加载章节结构...</SidebarHint>
                ) : projectChapters.length > 0 ? (
                  projectChapters.map((chapter) => (
                    <ProjectTreeLink
                      key={chapter.id}
                      to={`/projects/${projectId}/editor/${chapter.id}`}
                      label={chapter.title}
                      meta={`第 ${chapter.order_index} 章`}
                      active={chapter.id === chapterId}
                      onNavigate={() => setIsProjectTreeOpen(false)}
                    />
                  ))
                ) : (
                  <SidebarHint>当前项目还没有章节。</SidebarHint>
                )}
              </div>

              <div className="mt-5 space-y-1">
                <SectionLabel>辅助入口</SectionLabel>
                <ProjectTreeLink
                  to="/characters"
                  label="全局角色库"
                  active={location.pathname === '/characters'}
                  onNavigate={() => setIsProjectTreeOpen(false)}
                />
                <ProjectTreeStatic label="回收站" meta="" />
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {shouldRenderUtility ? (
        <div
          className="fixed inset-0 z-30 bg-black/30 xl:hidden"
          onClick={closeUtilityDrawer}
          aria-hidden="true"
        >
          <aside
            className="ml-auto flex h-full w-[min(88vw,380px)] flex-col border-l border-[#e5e7eb] bg-white shadow-2xl shadow-black/10"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#ececec] px-5 py-4">
              <div className="grid flex-1 grid-cols-3 rounded-2xl bg-[#f3f4f6] p-1">
                {utilityTabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveUtilityTab(tab.key)}
                    className={clsx(
                      'rounded-xl px-3 py-2 text-sm font-medium transition',
                      activeUtilityTab === tab.key
                        ? 'bg-white text-[#111827] shadow-sm'
                        : 'text-[#6b7280] hover:text-[#111827]',
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="ml-3 inline-flex size-10 items-center justify-center rounded-xl border border-[#e5e7eb] bg-white text-[#6b7280] transition hover:text-[#111827]"
                onClick={closeUtilityDrawer}
              >
                <PanelRightClose className="size-4" />
              </button>
            </div>

            <div className={clsx('flex-1 px-5 py-5', activeUtilityTab === 'ai' ? 'flex min-h-0 flex-col overflow-hidden' : 'overflow-y-auto')}>
              {activeUtilityTab === 'characters' ? (
                <div className="space-y-3">
                  <SectionLabel>角色速查</SectionLabel>
                  <SidebarHint>{chapterContextHint}</SidebarHint>
                  {contextualCharacters.length > 0 ? (
                    contextualCharacters.slice(0, 6).map(({ item, matches, score }) => (
                      <div key={item.id} className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-medium text-[#111827]">{item.character.name}</div>
                          {score > 0 ? (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
                              当前章命中
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs text-[#6b7280]">
                          {item.role_label || item.summary || item.character.personality || '暂无项目摘要'}
                        </div>
                        {matches.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {matches.map((keyword) => (
                              <span
                                key={`${item.id}-${keyword}`}
                                className="rounded-full border border-[#d1d5db] bg-[#f9fafb] px-2 py-0.5 text-[11px] text-[#6b7280]"
                              >
                                {keyword}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <SidebarHint>当前项目还没有已绑定角色。</SidebarHint>
                  )}
                  <ProjectTreeLink
                    to="/characters"
                    label="打开角色库"
                    meta="专页支持返回当前章节"
                    active={location.pathname === '/characters'}
                    onNavigate={closeUtilityDrawer}
                  />
                </div>
              ) : null}

              {activeUtilityTab === 'world' ? (
                <div className="space-y-3">
                  <SectionLabel>世界观词条</SectionLabel>
                  <SidebarHint>{chapterContextHint}</SidebarHint>
                  <UtilityInfoCard title="标题" value={worldSetting?.title || '尚未填写'} />
                  {contextualWorldSections.map((section) => (
                    <UtilityInfoCard
                      key={section.key}
                      title={section.label}
                      value={section.value || section.emptyLabel}
                      emphasis={section.score > 0}
                      keywords={section.matches}
                    />
                  ))}
                  <ProjectTreeLink
                    to={`/projects/${projectId}/world`}
                    label="打开完整设定页"
                    meta="专页支持返回当前章节"
                    active={location.pathname === `/projects/${projectId}/world`}
                    onNavigate={closeUtilityDrawer}
                  />
                </div>
              ) : null}

              {activeUtilityTab === 'ai' ? renderAIUtilityPanel(closeUtilityDrawer) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{children}</div>
}

function SidebarHint({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-border bg-muted/45 px-4 py-3 text-xs leading-6 text-muted-foreground">{children}</div>
}

function ProjectTreeLink({
  to,
  label,
  meta,
  active,
  onNavigate,
}: {
  to: string
  label: string
  meta?: string
  active: boolean
  onNavigate?: () => void
}) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={clsx(
        'flex items-center justify-between rounded-2xl px-4 py-3 transition',
        active ? 'bg-background text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:bg-background hover:text-foreground',
      )}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{label}</div>
        {meta ? <div className="truncate text-xs text-muted-foreground">{meta}</div> : null}
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </NavLink>
  )
}

function ProjectTreeStatic({ label, meta }: { label: string; meta?: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl px-4 py-3 text-muted-foreground">
      <div>
        <div className="text-sm">{label}</div>
        {meta ? <div className="text-xs">{meta}</div> : null}
      </div>
      <BookCopy className="size-4" />
    </div>
  )
}

function UtilityInfoCard({
  title,
  value,
  emphasis = false,
  keywords = [],
}: {
  title: string
  value: string
  emphasis?: boolean
  keywords?: string[]
}) {
  return (
    <div
      className={clsx(
        'rounded-2xl border p-4',
        emphasis ? 'border-primary/18 bg-primary/8' : 'border-border bg-muted/45',
      )}
    >
      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{title}</div>
      <div className="mt-2 text-sm leading-6 text-foreground/85">{value}</div>
      {keywords.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {keywords.map((keyword) => (
            <span key={`${title}-${keyword}`} className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
              {keyword}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
