import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, BrainCircuit, FileText, LoaderCircle, Sparkles, WandSparkles } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { EmptyState } from '@/components/empty-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { readToolboxInputDraft, writeToolboxInputDraft } from '@/lib/ai-toolbox-context'
import { readEditorRouteContext } from '@/lib/editor-route-context'
import { formatDate } from '@/lib/format'
import { getAIRuntimeSettings, listAIRuntimeModels, streamGenerate, type AIModelOption } from '@/services/ai'
import { getProject } from '@/services/projects'
import type { AIGeneratePayload, Chapter, ProjectDetail } from '@/types/api'

const TASK_OPTIONS = [
  {
    value: 'continue',
    label: '章节续写',
    title: '续写当前文本',
    description: '把章节正文或片段放进来，补全后续内容、过渡段或场景扩写。',
    icon: Sparkles,
    placeholder: '例如：让这一段自然推进到人物正面冲突爆发，但保留克制的语气。',
    defaultInstruction: '请基于当前正文继续写下去，保持风格一致，并自然衔接上一段。',
    submitLabel: '开始 AI 续写',
    resultTitle: '续写结果',
    status: '适合补段、扩场景、推进章节',
    items: ['章节续写', '场景扩写', '段落补全'],
    presets: ['延续当前段落的节奏继续写下去', '补一段承上启下的过渡场景', '扩写冲突爆发前的情绪铺垫'],
  },
  {
    value: 'rewrite',
    label: '文本改写',
    title: '改写或润色文本',
    description: '聚焦表达重写、对话润色、语气统一，不直接污染正文。',
    icon: WandSparkles,
    placeholder: '例如：把这段对话改得更克制、更有潜台词，避免直接说破情绪。',
    defaultInstruction: '请在不改变核心情节的前提下，改写输入文本，让语言更顺、节奏更稳，并保留人物口吻。',
    submitLabel: '开始文本改写',
    resultTitle: '改写结果',
    status: '适合重写段落、收紧表达、统一风格',
    items: ['对话增强', '语气调整', '风格统一'],
    presets: ['把这段对话改得更克制、更有潜台词', '压缩重复表达，让节奏更利落', '统一成更冷静的叙述语气'],
  },
  {
    value: 'consistency',
    label: '设定检查',
    title: '检查设定一致性',
    description: '检查角色设定、世界规则、时间线和因果逻辑是否冲突。',
    icon: BrainCircuit,
    placeholder: '例如：检查这段内容是否与当前章节摘要、角色设定和世界规则冲突，并列出风险点。',
    defaultInstruction: '请从角色设定、世界规则、叙事逻辑和时间线四个角度检查输入内容，列出冲突点、依据和修改建议。',
    submitLabel: '开始设定检查',
    resultTitle: '检查结果',
    status: '适合在发散写作后做回收与校对',
    items: ['角色口吻检查', '世界规则检查', '时间线提醒'],
    presets: ['检查角色口吻和既有设定是否冲突', '检查世界规则与当前情节是否冲突', '检查时间线、动机和因果是否闭合'],
  },
] as const

const TOOLBOX_RESULT_DRAFT_KEY = 'storyweave.toolbox-result-draft'
const TOOLBOX_HISTORY_KEY = 'storyweave.toolbox-history'

type ToolboxTaskType = (typeof TASK_OPTIONS)[number]['value']
type ToolboxDraftApplyMode = 'append' | 'replace'
type SendBackMode = ToolboxDraftApplyMode | null

interface ToolboxResultDraft {
  projectId: string
  chapterId: string
  task: ToolboxTaskType
  result: string
  sourceInput: string
  createdAt: string
}

interface GenerationState {
  instruction: string
  provider: string
  modelId: string
  input: string
  result: string
  isGenerating: boolean
  requestId: number
}

interface GenerationHistoryItem {
  id: string
  task: ToolboxTaskType
  projectId: string
  projectTitle: string | null
  chapterId: string | null
  chapterTitle: string | null
  input: string
  result: string
  createdAt: string
}

const FALLBACK_MODEL_BY_PROVIDER: Record<string, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-3-5-sonnet-latest',
}

function getTaskMeta(task: ToolboxTaskType) {
  return TASK_OPTIONS.find((item) => item.value === task) ?? TASK_OPTIONS[0]
}

function buildContextText(project: ProjectDetail | undefined, chapter: Chapter | null) {
  const world = project?.world_setting
  const worldParts = world
    ? [
        world.overview?.trim() ? `世界概述：${world.overview.trim()}` : '',
        world.rules?.trim() ? `世界规则：${world.rules.trim()}` : '',
        world.factions?.trim() ? `势力：${world.factions.trim()}` : '',
        world.timeline?.trim() ? `时间线：${world.timeline.trim()}` : '',
      ].filter(Boolean)
    : []

  const parts = [
    project?.title ? `项目标题：${project.title}` : '',
    project?.description?.trim() ? `项目简介：${project.description.trim()}` : '',
    worldParts.length > 0 ? `【世界观设定】\n${worldParts.join('\n')}` : '',
    chapter?.title ? `章节标题：${chapter.title}` : '',
    chapter?.summary?.trim() ? `章节摘要：${chapter.summary.trim()}` : '',
    chapter?.notes?.trim() ? `章节备注：${chapter.notes.trim()}` : '',
  ].filter(Boolean)

  return parts.join('\n')
}

function buildDiffLines(originalText: string, nextText: string) {
  const originalLines = originalText.split('\n')
  const nextLines = nextText.split('\n')
  const maxLength = Math.max(originalLines.length, nextLines.length)

  return Array.from({ length: maxLength }, (_, index) => {
    const original = originalLines[index] ?? ''
    const next = nextLines[index] ?? ''

    if (original === next) {
      return { type: 'same' as const, original, next }
    }

    if (!original) {
      return { type: 'added' as const, original, next }
    }

    if (!next) {
      return { type: 'removed' as const, original, next }
    }

    return { type: 'changed' as const, original, next }
  })
}

export function AIToolboxPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTask = (searchParams.get('task') as ToolboxTaskType | null) ?? 'continue'
  const projectId = searchParams.get('projectId') ?? ''
  const chapterId = searchParams.get('chapterId') ?? ''

  const [activeTask, setActiveTask] = useState<ToolboxTaskType>(initialTask)
  const [availableModels, setAvailableModels] = useState<AIModelOption[]>([])
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [history, setHistory] = useState<GenerationHistoryItem[]>([])
  const [recommendedSendMode, setRecommendedSendMode] = useState<SendBackMode>(null)
  const [generation, setGeneration] = useState<GenerationState>({
    instruction: getTaskMeta(initialTask).defaultInstruction,
    provider: 'openai',
    modelId: 'gpt-4o',
    input: '',
    result: '',
    isGenerating: false,
    requestId: 0,
  })

  useEffect(() => {
    const raw = window.sessionStorage.getItem(TOOLBOX_HISTORY_KEY)
    if (!raw) {
      return
    }

    try {
      const parsed = JSON.parse(raw) as GenerationHistoryItem[]
      if (Array.isArray(parsed)) {
        setHistory(parsed)
      }
    } catch {
      window.sessionStorage.removeItem(TOOLBOX_HISTORY_KEY)
    }
  }, [])

  useEffect(() => {
    window.sessionStorage.setItem(TOOLBOX_HISTORY_KEY, JSON.stringify(history))
  }, [history])

  useEffect(() => {
    const draft = readToolboxInputDraft()
    if (!draft || !draft.input.trim()) {
      return
    }

    const sameProject = (draft.projectId ?? '') === projectId
    const sameChapter = (draft.chapterId ?? '') === chapterId
    const sameTask = draft.task === activeTask

    if (!sameProject || !sameChapter || !sameTask) {
      return
    }

    setGeneration((prev) => ({
      ...prev,
      input: draft.input,
      result: '',
    }))
    writeToolboxInputDraft(null)
    toast.success('已从编辑器带入当前选区原文')
  }, [activeTask, chapterId, projectId])

  const runtimeSettingsQuery = useQuery({
    queryKey: ['ai-runtime-settings'],
    queryFn: getAIRuntimeSettings,
  })

  const projectQuery = useQuery<ProjectDetail, Error>({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId),
    enabled: Boolean(projectId),
  })

  const selectedChapter = useMemo(() => {
    if (!projectQuery.data || !chapterId) {
      return null
    }

    return projectQuery.data.chapters.find((chapter) => chapter.id === chapterId) ?? null
  }, [projectQuery.data, chapterId])

  const taskMeta = getTaskMeta(activeTask)
  const editorRouteContext = useMemo(() => readEditorRouteContext(), [chapterId, projectId])
  const selectedModelId =
    generation.modelId.trim() || runtimeSettingsQuery.data?.model_id || FALLBACK_MODEL_BY_PROVIDER[generation.provider] || 'gpt-4o'
  const selectedProvider = generation.provider || runtimeSettingsQuery.data?.provider || 'openai'
  const contextText = buildContextText(projectQuery.data, selectedChapter)
  const returnTarget = useMemo(() => {
    if (
      editorRouteContext &&
      editorRouteContext.projectId === projectId &&
      (!chapterId || editorRouteContext.chapterId === chapterId)
    ) {
      return {
        to: `/projects/${editorRouteContext.projectId}/editor/${editorRouteContext.chapterId}`,
        label: '返回当前章节',
      }
    }

    if (selectedChapter && projectId) {
      return {
        to: `/projects/${projectId}/editor/${selectedChapter.id}`,
        label: '返回章节编辑器',
      }
    }

    if (projectId) {
      return {
        to: `/projects/${projectId}`,
        label: '返回项目工作台',
      }
    }

    return {
      to: '/',
      label: '返回首页',
    }
  }, [chapterId, editorRouteContext, projectId, selectedChapter])

  function syncSearchParams(nextTask: ToolboxTaskType) {
    const next = new URLSearchParams(searchParams)
    next.set('task', nextTask)
    setSearchParams(next, { replace: true })
  }

  function handleTaskChange(task: ToolboxTaskType) {
    const meta = getTaskMeta(task)
    setActiveTask(task)
    syncSearchParams(task)
    setRecommendedSendMode(task === 'continue' ? 'append' : 'replace')
    setGeneration((prev) => ({
      ...prev,
      instruction: meta.defaultInstruction,
      result: '',
      input: task === 'continue' ? selectedChapter?.plain_text ?? prev.input : prev.input,
    }))
  }

  async function handleLoadModels() {
    setIsLoadingModels(true)
    try {
      const response = await listAIRuntimeModels()
      setAvailableModels(response.models)
      toast.success(`已获取 ${response.models.length} 个可用模型，可直接用于当前任务`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '获取模型列表失败')
    } finally {
      setIsLoadingModels(false)
    }
  }

  function handleStopGeneration() {
    setGeneration((prev) => ({
      ...prev,
      isGenerating: false,
      requestId: prev.requestId + 1,
    }))
    toast.info('已停止接收当前 AI 结果')
  }

  function persistResultDraft(mode: ToolboxDraftApplyMode) {
    if (!selectedChapter || !projectId || !generation.result.trim()) {
      return false
    }

    const draft: ToolboxResultDraft = {
      projectId,
      chapterId: selectedChapter.id,
      task: activeTask,
      result: generation.result.trim(),
      sourceInput: generation.input.trim(),
      createdAt: new Date().toISOString(),
    }

    window.sessionStorage.setItem(TOOLBOX_RESULT_DRAFT_KEY, JSON.stringify({ ...draft, mode }))
    return true
  }

  function handleSendToEditor(mode: ToolboxDraftApplyMode) {
    if (!selectedChapter || !projectId) {
      toast.error('当前缺少章节上下文，无法把结果带回编辑器')
      return
    }

    if (!generation.result.trim()) {
      toast.error('当前没有可带回编辑器的结果')
      return
    }

    const saved = persistResultDraft(mode)
    if (!saved) {
      toast.error('结果暂存失败，请稍后重试')
      return
    }

    toast.success(mode === 'append' ? '结果已带回编辑器，可直接追加到正文' : '结果已带回编辑器，可直接覆盖当前草稿')
    navigate(`/projects/${projectId}/editor/${selectedChapter.id}?fromToolbox=1`)
  }

  function handleFillFromChapter() {
    if (!selectedChapter?.plain_text?.trim()) {
      toast.error('当前章节还没有可用正文')
      return
    }

    setGeneration((prev) => ({
      ...prev,
      input: selectedChapter.plain_text ?? '',
      result: '',
    }))
    toast.success('已载入当前章节正文')
  }

  async function handleGenerate() {
    const input = generation.input.trim() || (activeTask === 'continue' ? selectedChapter?.plain_text?.trim() ?? '' : '')
    if (!input) {
      toast.error(activeTask === 'continue' ? '请先选择一个带正文的章节，或手动输入待续写文本' : '请先输入要处理的文本')
      return
    }

    const requestId = generation.requestId + 1
    setGeneration((prev) => ({ ...prev, result: '', isGenerating: true, requestId }))

    const payload: AIGeneratePayload = {
      project_id: projectId || 'toolbox',
      chapter_id: chapterId || null,
      text: input,
      instruction: generation.instruction.trim() || taskMeta.defaultInstruction,
      model_provider: selectedProvider,
      model_id: selectedModelId,
    }

    try {
      await streamGenerate(payload, (chunk) => {
        setGeneration((prev) => {
          if (prev.requestId !== requestId || !prev.isGenerating) {
            return prev
          }

          return {
            ...prev,
            result: `${prev.result}${chunk}`,
          }
        })
      })

      setGeneration((prev) => {
        if (prev.requestId !== requestId) {
          return prev
        }

        if (prev.result.trim()) {
          setHistory((current) => [
            {
              id: `${Date.now()}`,
              task: activeTask,
              projectId,
              projectTitle: projectQuery.data?.title ?? null,
              chapterId: selectedChapter?.id ?? null,
              chapterTitle: selectedChapter?.title ?? null,
              input,
              result: prev.result,
              createdAt: new Date().toISOString(),
            },
            ...current,
          ].slice(0, 8))
        }

        return {
          ...prev,
          isGenerating: false,
        }
      })
      setRecommendedSendMode(activeTask === 'continue' ? 'append' : 'replace')
    } catch (error) {
      setGeneration((prev) => {
        if (prev.requestId !== requestId) {
          return prev
        }

        return {
          ...prev,
          isGenerating: false,
        }
      })
      toast.error(error instanceof Error ? error.message : 'AI 任务执行失败')
    }
  }

  async function handleCopyHistoryResult(result: string) {
    await navigator.clipboard.writeText(result)
    toast.success('历史结果已复制到剪贴板')
  }

  if (runtimeSettingsQuery.isLoading) {
    return <LoadingState label="正在加载 AI 工具箱..." />
  }

  if (runtimeSettingsQuery.isError) {
    return (
      <EmptyState
        title="AI 工具箱加载失败"
        description={runtimeSettingsQuery.error?.message || '请检查后端 AI 运行时配置是否可用。'}
        action={
          <Button variant="outline" onClick={() => runtimeSettingsQuery.refetch()}>
            重新加载
          </Button>
        }
      />
    )
  }

  return (
    <div className="space-y-6 pb-8">
      <Card className="border border-border bg-card/95 shadow-[0_18px_44px_rgba(148,163,184,0.18)]">
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <CardDescription className="text-primary/80">AI Toolbox</CardDescription>
              <CardTitle className="text-3xl font-semibold leading-tight text-foreground">把文本拿出来处理，再决定是否回写</CardTitle>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
                这里不是能力广场，也不是编辑器镜像。它只做一件事：针对一段文本执行续写、改写或设定检查，先产出候选结果，再由你决定是否带回编辑器。
              </p>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[240px]">
              <Link
                to={returnTarget.to}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                {returnTarget.label}
              </Link>
              <Link
                to="/settings"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-muted/45 px-4 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                打开 AI 设置
              </Link>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <QuickStep title="1. 选任务" description="续写、改写、设定检查三种模式。" />
            <QuickStep title="2. 放文本" description="粘贴文本，或直接载入当前章节正文。" />
            <QuickStep title="3. 拿结果" description="复制、继续加工，或带回编辑器。" />
          </div>
        </CardHeader>
      </Card>

      <section className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
        <aside className="space-y-4">
          <Card className="border border-border bg-card/95 shadow-[0_16px_36px_rgba(148,163,184,0.16)]">
            <CardHeader>
              <CardTitle className="text-xl text-foreground">任务类型</CardTitle>
              <CardDescription className="text-sm text-muted-foreground">先明确这次要做什么。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {TASK_OPTIONS.map((task) => {
                const Icon = task.icon
                const isActive = task.value === activeTask

                return (
                  <button
                    key={task.value}
                    type="button"
                    onClick={() => handleTaskChange(task.value)}
                    className={[
                      'w-full rounded-2xl border p-4 text-left transition',
                      isActive
                        ? 'border-primary/50 bg-primary/10 shadow-lg shadow-primary/10'
                        : 'border-border bg-background/92 hover:border-primary/25 hover:bg-muted/45',
                    ].join(' ')}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex size-10 items-center justify-center rounded-2xl border border-border bg-muted/45">
                        <Icon className="size-5 text-primary" />
                      </div>
                      <div className="space-y-2">
                        <div className="text-base font-medium text-foreground">{task.title}</div>
                        <div className="text-xs leading-6 text-muted-foreground">{task.description}</div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </CardContent>
          </Card>

          <Card className="border border-border bg-card/95 shadow-[0_16px_36px_rgba(148,163,184,0.16)]">
            <CardHeader>
              <CardTitle className="text-lg text-foreground">当前任务说明</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-foreground/85">
              <div className="rounded-2xl border border-primary/20 bg-primary/8 p-4">
                <div className="text-sm font-medium text-foreground">{taskMeta.label}</div>
                <div className="mt-2 text-xs leading-6 text-muted-foreground">{taskMeta.status}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {taskMeta.items.map((item) => (
                  <span key={item} className="rounded-full border border-border bg-background px-3 py-1 text-[11px] text-muted-foreground">
                    {item}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        </aside>

        <section className="space-y-4">
          <Card className="border border-border bg-card/95 shadow-[0_16px_36px_rgba(148,163,184,0.16)]">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-xl text-foreground">{taskMeta.title}</CardTitle>
                  <CardDescription className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
                    先准备文本，再给出任务意图与模型，最后统一生成候选结果。
                  </CardDescription>
                </div>
                <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-muted/45 px-3 py-1 text-xs text-muted-foreground">
                  <FileText className="size-4 text-primary" />
                  <span className="truncate">{taskMeta.status}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-200" htmlFor="toolbox-input">
                    第一步：准备要处理的文本
                  </label>
                  <Textarea
                    id="toolbox-input"
                    value={generation.input}
                    onChange={(event) => setGeneration((prev) => ({ ...prev, input: event.target.value, result: '' }))}
                    rows={16}
                    placeholder={taskMeta.placeholder}
                    className="min-h-[360px] leading-7"
                  />
                  <div className="text-xs leading-6 text-muted-foreground">
                    {activeTask === 'continue' ? '如果当前已绑定章节，可以直接从右侧载入正文。' : '把要改写或检查的文本粘进来即可，不必先回到编辑器。'}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-border bg-muted/35 p-4">
                    <div className="text-sm font-medium text-foreground">当前上下文</div>
                    <div className="mt-3 whitespace-pre-wrap text-xs leading-6 text-muted-foreground">
                      {contextText || '当前没有带入项目或章节上下文，本次任务只会依据你手动输入的文本执行。'}
                    </div>
                  </div>

                  {selectedChapter ? (
                    <Button variant="outline" className="w-full" onClick={handleFillFromChapter}>
                      载入当前章节正文
                    </Button>
                  ) : null}

                  {selectedChapter && projectId ? (
                    <Link
                      to={returnTarget.to}
                      className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-muted"
                    >
                      {returnTarget.label}
                    </Link>
                  ) : null}
                </div>
              </div>

              <div className="space-y-4 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <WandSparkles className="size-4 text-primary" />
                  第二步：定义本次任务
                </div>

                <div className="space-y-3 rounded-xl border border-border bg-background/90 p-3">
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-foreground">常用任务意图</div>
                    <div className="text-xs leading-5 text-muted-foreground">先选一个接近的意图，再按需要补充自己的要求。</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {taskMeta.presets.map((preset) => {
                      const isActive = generation.instruction.trim() === preset

                      return (
                        <button
                          key={preset}
                          type="button"
                          className={[
                            'rounded-full border px-3 py-1.5 text-xs transition',
                            isActive
                              ? 'border-primary bg-primary/15 text-primary'
                              : 'border-border bg-background text-muted-foreground hover:border-primary/25 hover:text-foreground',
                          ].join(' ')}
                          onClick={() => setGeneration((prev) => ({ ...prev, instruction: preset, result: '' }))}
                        >
                          {preset}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="space-y-4 rounded-xl border border-border bg-background/90 p-3">
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-foreground">本次任务模型</div>
                    <div className="text-xs leading-5 text-muted-foreground">提供商与 Key 统一在设置中心维护，这里只切换当前任务要用的模型。</div>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/45 px-3 py-2 text-sm text-foreground">当前选择：{selectedModelId}</div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button variant="outline" className="sm:w-auto" onClick={handleLoadModels} disabled={isLoadingModels}>
                      {isLoadingModels ? '获取中...' : '获取可用模型'}
                    </Button>
                    <Link
                      to="/settings"
                      className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm text-foreground transition hover:bg-muted"
                    >
                      前往设置中心
                    </Link>
                  </div>

                  {availableModels.length > 0 ? (
                    <div className="rounded-xl border border-border bg-muted/35 p-3 text-xs text-muted-foreground">
                      <div className="mb-2">点击下方模型即可直接用于本次生成：</div>
                      <div className="flex flex-wrap gap-2">
                        {availableModels.slice(0, 20).map((model) => {
                          const isSelected = model.id === selectedModelId

                          return (
                            <button
                              key={model.id}
                              type="button"
                              className={`rounded-full border px-3 py-1 transition ${
                                isSelected ? 'border-primary bg-primary/15 text-primary' : 'border-border hover:border-primary hover:text-foreground'
                              }`}
                              onClick={() => {
                                setGeneration((prev) => ({ ...prev, modelId: model.id, result: '' }))
                                toast.success(`下一次生成将使用模型：${model.id}`)
                              }}
                            >
                              {model.id}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border bg-muted/35 p-3 text-xs leading-5 text-muted-foreground">
                      还没有加载模型列表。点击上方“获取可用模型”后即可切换。
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-200" htmlFor="toolbox-instruction">
                    补充要求
                  </label>
                  <Textarea
                    id="toolbox-instruction"
                    value={generation.instruction}
                    onChange={(event) => setGeneration((prev) => ({ ...prev, instruction: event.target.value, result: '' }))}
                    rows={5}
                    placeholder={taskMeta.placeholder}
                  />
                  <div className="text-xs leading-6 text-muted-foreground">这里写的是“怎么处理”，不是“处理什么文本”。原文请放在上面的输入区。</div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button className="flex-1" onClick={handleGenerate} disabled={generation.isGenerating}>
                    {generation.isGenerating ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                    {generation.isGenerating ? '执行中...' : taskMeta.submitLabel}
                  </Button>
                  <Button variant="outline" onClick={handleStopGeneration} disabled={!generation.isGenerating}>
                    停止生成
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border bg-card/95 shadow-[0_16px_36px_rgba(148,163,184,0.16)]">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-xl text-foreground">{taskMeta.resultTitle}</CardTitle>
                  <CardDescription className="mt-2 text-sm leading-7 text-muted-foreground">
                    这里先给你候选结果和差异预览。满意后再决定复制、继续加工，还是带回编辑器。
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="min-h-[260px] rounded-2xl border border-border bg-background/92 p-4 text-sm leading-7 text-foreground/85">
                {generation.result.trim() ? (
                  <div className="space-y-4 whitespace-normal">
                    <div className="grid gap-3 lg:grid-cols-2">
                      <div className="rounded-xl border border-border bg-muted/35 p-3">
                        <div className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">原文</div>
                        <div className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{generation.input.trim() || '本次任务原文为空'}</div>
                      </div>
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 p-3">
                        <div className="mb-2 text-xs uppercase tracking-[0.18em] text-emerald-300">候选结果</div>
                        <div className="whitespace-pre-wrap text-sm leading-6 text-emerald-50">{generation.result}</div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border bg-muted/35">
                      <div className="border-b border-border px-3 py-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">差异预览</div>
                      <div className="space-y-1 p-3">
                        {buildDiffLines(generation.input.trim(), generation.result).map((line, index) => (
                          <div
                            key={`${line.type}-${index}`}
                            className={[
                              'grid gap-2 rounded-md px-2 py-1.5 text-xs leading-5 sm:grid-cols-2',
                              line.type === 'same'
                                ? 'text-muted-foreground'
                                : line.type === 'added'
                                  ? 'bg-emerald-500/10 text-emerald-100'
                                  : line.type === 'removed'
                                    ? 'bg-rose-500/10 text-rose-100'
                                    : 'bg-amber-500/10 text-amber-100',
                            ].join(' ')}
                          >
                            <div className="whitespace-pre-wrap">{line.original || ' '}</div>
                            <div className="whitespace-pre-wrap">{line.next || ' '}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-[220px] items-center justify-center text-sm text-muted-foreground">这里会显示本次任务的候选结果。</div>
                )}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={async () => {
                    if (!generation.result.trim()) {
                      toast.error('当前没有可复制的结果')
                      return
                    }

                    await navigator.clipboard.writeText(generation.result)
                    toast.success('结果已复制到剪贴板')
                  }}
                  disabled={!generation.result.trim()}
                >
                  复制结果
                </Button>

                {selectedChapter && projectId ? (
                  <>
                    <div className="grid w-full gap-3 xl:grid-cols-2">
                      <div
                        className={[
                          'rounded-2xl border p-4 text-sm',
                          recommendedSendMode === 'append' ? 'border-primary/30 bg-primary/10' : 'border-border bg-background/90',
                        ].join(' ')}
                      >
                        <div className="text-sm font-medium text-foreground">追加到正文</div>
                        <div className="mt-2 text-xs leading-6 text-muted-foreground">目标章节：{selectedChapter.title}</div>
                      </div>
                      <div
                        className={[
                          'rounded-2xl border p-4 text-sm',
                          recommendedSendMode === 'replace' ? 'border-primary/30 bg-primary/10' : 'border-border bg-background/90',
                        ].join(' ')}
                      >
                        <div className="text-sm font-medium text-foreground">覆盖当前草稿</div>
                        <div className="mt-2 text-xs leading-6 text-muted-foreground">目标章节：{selectedChapter.title}</div>
                      </div>
                    </div>
                    <Button variant="outline" className="w-full sm:w-auto" onClick={() => handleSendToEditor('append')} disabled={!generation.result.trim()}>
                      带回编辑器并追加
                    </Button>
                    <Button className="w-full sm:w-auto" onClick={() => handleSendToEditor('replace')} disabled={!generation.result.trim()}>
                      带回编辑器并覆盖草稿
                      <ArrowRight className="size-4" />
                    </Button>
                  </>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </section>

        <aside className="space-y-4">
          <Card className="border border-border bg-card/95 shadow-[0_16px_36px_rgba(148,163,184,0.16)]">
            <CardHeader>
              <CardTitle className="text-xl text-foreground">当前项目上下文</CardTitle>
              <CardDescription className="text-sm text-muted-foreground">这些信息会一起参与本次任务。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-foreground/85">
              <InfoPanel
                label="项目"
                title={projectQuery.data?.title || '未指定项目'}
                description={projectQuery.data ? `最近更新：${formatDate(projectQuery.data.updated_at)}` : '从首页或编辑器进入时会自动带入项目上下文。'}
              />
              <InfoPanel
                label="世界观"
                title={projectQuery.data?.world_setting ? projectQuery.data.world_setting.title : '未设定'}
                description={
                  projectQuery.data?.world_setting
                    ? [
                        projectQuery.data.world_setting.overview?.trim() ? `概述：${projectQuery.data.world_setting.overview.trim().slice(0, 60)}...` : '',
                        projectQuery.data.world_setting.rules?.trim() ? '已设定世界规则' : '',
                        projectQuery.data.world_setting.factions?.trim() ? '已设定势力' : '',
                      ]
                        .filter(Boolean)
                        .join('。') || '已维护，生成时会自动注入。'
                    : '暂无世界观，可在项目工作台中补充。'
                }
              />
              <InfoPanel
                label="章节"
                title={selectedChapter?.title || '未指定章节'}
                description={selectedChapter ? `${selectedChapter.word_count} 字，可直接带回该章节。` : '未带入章节时，这一页会作为通用文本任务台使用。'}
              />
            </CardContent>
          </Card>

          <Card className="border border-border bg-card/95 shadow-[0_16px_36px_rgba(148,163,184,0.16)]">
            <CardHeader>
              <CardTitle className="text-xl text-foreground">生成历史</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {history.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted/35 px-4 py-5 text-sm leading-6 text-muted-foreground">暂无历史记录。</div>
              ) : (
                <>
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() => {
                        setHistory([])
                        window.sessionStorage.removeItem(TOOLBOX_HISTORY_KEY)
                        toast.success('工具箱历史已清空')
                      }}
                    >
                      清空历史
                    </Button>
                  </div>

                  {history.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-border bg-background/90 p-4 transition hover:border-primary/25 hover:bg-muted/35">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTask(item.task)
                          syncSearchParams(item.task)
                          setRecommendedSendMode(item.task === 'continue' ? 'append' : 'replace')
                          setGeneration((prev) => ({
                            ...prev,
                            input: item.input,
                            result: item.result,
                            instruction: getTaskMeta(item.task).defaultInstruction,
                            isGenerating: false,
                          }))
                        }}
                        className="block w-full text-left"
                      >
                        <div className="text-xs text-slate-500">{formatDate(item.createdAt)}</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <div className="text-sm font-medium text-foreground">{getTaskMeta(item.task).label}</div>
                          {item.chapterTitle ? (
                            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{item.chapterTitle}</span>
                          ) : null}
                        </div>
                        <div className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.result}</div>
                      </button>

                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <Button variant="ghost" size="sm" className="w-full" onClick={async () => await handleCopyHistoryResult(item.result)}>
                          复制
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full"
                          onClick={() => {
                            setActiveTask(item.task)
                            syncSearchParams(item.task)
                            setRecommendedSendMode(item.task === 'continue' ? 'append' : 'replace')
                            setGeneration((prev) => ({
                              ...prev,
                              input: item.result,
                              result: '',
                              instruction: getTaskMeta(item.task).defaultInstruction,
                              isGenerating: false,
                            }))
                            toast.success('历史结果已载入当前输入区，可继续加工')
                          }}
                        >
                          继续加工
                        </Button>
                        {item.projectId && item.chapterId ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full sm:col-span-2"
                            onClick={() => {
                              window.sessionStorage.setItem(
                                TOOLBOX_RESULT_DRAFT_KEY,
                                JSON.stringify({
                                  projectId: item.projectId,
                                  chapterId: item.chapterId,
                                  task: item.task,
                                  result: item.result,
                                  sourceInput: item.input,
                                  createdAt: item.createdAt,
                                  mode: item.task === 'continue' ? 'append' : 'replace',
                                }),
                              )
                              toast.success('历史结果已带回对应编辑器')
                              navigate(`/projects/${item.projectId}/editor/${item.chapterId}?fromToolbox=1`)
                            }}
                          >
                            带回编辑器
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>
        </aside>
      </section>
    </div>
  )
}

function QuickStep({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/35 p-4">
      <div className="text-sm font-medium text-foreground">{title}</div>
      <div className="mt-2 text-xs leading-6 text-muted-foreground">{description}</div>
    </div>
  )
}

function InfoPanel({ label, title, description }: { label: string; title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-2 break-all text-base font-medium text-foreground">{title}</div>
      <div className="mt-2 text-xs leading-6 text-muted-foreground">{description}</div>
    </div>
  )
}
