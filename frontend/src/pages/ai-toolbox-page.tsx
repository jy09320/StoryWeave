import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  BrainCircuit,
  ChevronRight,
  FileText,
  LoaderCircle,
  Sparkles,
  WandSparkles,
} from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { EmptyState } from '@/components/empty-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { readToolboxInputDraft, writeToolboxInputDraft } from '@/lib/ai-toolbox-context'
import { formatDate } from '@/lib/format'
import { getAIRuntimeSettings, listAIRuntimeModels, streamGenerate, type AIModelOption } from '@/services/ai'
import { getProject } from '@/services/projects'
import type { AIGeneratePayload, Chapter, ProjectDetail } from '@/types/api'

const TASK_OPTIONS = [
  {
    value: 'continue',
    label: '章节续写',
    title: '章节生成与续写',
    description: '围绕当前章节继续写、补桥段、扩写场景，是最直接承接编辑器工作流的一组工具。',
    icon: Sparkles,
    placeholder: '例如：让这一段自然推进到人物正面冲突爆发，但保留克制的语气。',
    defaultInstruction: '请基于当前正文继续写下去，保持风格一致，并自然衔接上一段。',
    submitLabel: '开始 AI 续写',
    resultTitle: '续写结果',
    status: '已接入基础续写能力',
    items: ['章节续写', '场景扩写', '段落补全'],
    presets: [
      '延续当前段落的节奏继续写下去',
      '补一段承上启下的过渡场景',
      '扩写冲突爆发前的情绪铺垫',
    ],
    helper: '优先适合已经有章节正文草稿的场景。生成结果可先在这里预览，再回到编辑器继续处理。',
  },
  {
    value: 'rewrite',
    label: '文本改写',
    title: '文本改写与润色',
    description: '面向已有文本做节奏调整、对白增强和叙述风格统一，适合作为编辑器侧高频工具。',
    icon: WandSparkles,
    placeholder: '例如：把这段对白改得更克制、更有潜台词，避免直接说破情绪。',
    defaultInstruction: '请在不改变核心情节的前提下，改写输入文本，使语言更顺畅、节奏更稳定，并保留人物语气。',
    submitLabel: '开始文本改写',
    resultTitle: '改写结果',
    status: '先复用通用生成链路落地',
    items: ['对白增强', '语气调整', '文风统一'],
    presets: [
      '把这段对白改得更克制、更有潜台词',
      '压缩重复表达，让节奏更利落',
      '统一成更冷静的叙述语气',
    ],
    helper: '适合对已有正文、片段或对白做二次加工，不会自动回写到章节正文。',
  },
  {
    value: 'consistency',
    label: '设定检查',
    title: '设定一致性辅助',
    description: '服务于角色、世界观与章节上下文检查，帮助长篇项目维持设定稳定。',
    icon: BrainCircuit,
    placeholder: '例如：检查这段内容是否与当前章节摘要、备注和既有正文存在设定冲突，并列出风险点。',
    defaultInstruction: '请从角色设定、世界观规则、叙事逻辑和时间线四个角度检查输入内容，列出潜在冲突、证据和修改建议。',
    submitLabel: '开始一致性检查',
    resultTitle: '检查结果',
    status: '先基于项目/章节上下文给出分析结果',
    items: ['角色设定检查', '世界观冲突检查', '时间线提醒'],
    presets: [
      '检查角色口吻和既有设定是否冲突',
      '检查世界观规则与当前情节是否冲突',
      '检查时间线、动机和因果是否闭合',
    ],
    helper: '适合在章节推进前后快速做风险检查，当前阶段以分析报告形式呈现。',
  },
] as const

const TOOLBOX_RESULT_DRAFT_KEY = 'storyweave.toolbox-result-draft'
const TOOLBOX_HISTORY_KEY = 'storyweave.toolbox-history'

type ToolboxTaskType = (typeof TASK_OPTIONS)[number]['value']

type ToolboxDraftApplyMode = 'append' | 'replace'

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

type SendBackMode = ToolboxDraftApplyMode | null

const FALLBACK_MODEL_BY_PROVIDER: Record<string, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-3-5-sonnet-latest',
}

const MODEL_PROVIDER_OPTIONS = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'Anthropic', value: 'anthropic' },
] as const

function getTaskMeta(task: ToolboxTaskType) {
  return TASK_OPTIONS.find((item) => item.value === task) ?? TASK_OPTIONS[0]
}

function buildContextText(project: ProjectDetail | undefined, chapter: Chapter | null) {
  const parts = [
    project?.title ? `项目标题：${project.title}` : '',
    project?.description?.trim() ? `项目简介：${project.description.trim()}` : '',
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
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
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
  const selectedModelId = generation.modelId.trim() || runtimeSettingsQuery.data?.model_id || FALLBACK_MODEL_BY_PROVIDER[generation.provider] || 'gpt-4o'
  const selectedProvider = generation.provider || runtimeSettingsQuery.data?.provider || 'openai'
  const contextText = buildContextText(projectQuery.data, selectedChapter)

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
      toast.success(`已获取 ${response.models.length} 个可用模型，可直接用于当前工具任务`)
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

    const promptHeader = [
      `当前任务：${taskMeta.label}`,
      contextText ? `上下文信息：\n${contextText}` : '',
      `用户输入：\n${input}`,
    ]
      .filter(Boolean)
      .join('\n\n')

    const payload: AIGeneratePayload = {
      project_id: projectId || 'toolbox',
      chapter_id: chapterId || null,
      text: promptHeader,
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
      <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="border border-white/10 bg-white/6 shadow-lg shadow-black/5">
          <CardHeader className="gap-4">
            <CardDescription className="text-primary/80">AI 工具箱</CardDescription>
            <CardTitle className="max-w-3xl text-3xl font-semibold leading-tight text-white">
              把续写、改写与设定检查收敛成可直接执行的统一任务入口
            </CardTitle>
            <CardDescription className="max-w-3xl text-sm leading-7 text-slate-300">
              当前阶段先复用已有 AI 流式生成链路，把工具箱从能力说明页升级为可操作任务页，并通过任务上下文连接首页、项目工作台与编辑器。
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <HighlightMetric label="当前任务" value={taskMeta.label} hint={taskMeta.status} />
            <HighlightMetric
              label="上下文来源"
              value={selectedChapter ? '项目 + 章节上下文' : projectId ? '项目上下文' : '纯手动输入'}
              hint={selectedChapter ? '已自动带入章节信息辅助生成' : '可从其他页面带着任务参数进入'}
            />
            <HighlightMetric label="当前模型" value={selectedModelId} hint={`提供商：${selectedProvider}`} />
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-white/6 shadow-lg shadow-black/5">
          <CardHeader>
            <CardTitle className="text-xl text-white">任务上下文</CardTitle>
            <CardDescription>当前工具任务会优先读取你带入的项目与章节信息。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-300">
            <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">当前项目</div>
              <div className="mt-2 text-base font-medium text-white">{projectQuery.data?.title || '未指定项目'}</div>
              <div className="mt-2 text-xs leading-6 text-slate-400">
                {projectQuery.data ? `最近更新 ${formatDate(projectQuery.data.updated_at)}` : '从首页或编辑器进入时会自动带入项目上下文。'}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">当前章节</div>
              <div className="mt-2 text-base font-medium text-white">{selectedChapter?.title || '未指定章节'}</div>
              <div className="mt-2 text-xs leading-6 text-slate-400">
                {selectedChapter ? `${selectedChapter.word_count} 字 · 可直接把正文带入当前任务` : '未带入章节时，可手动粘贴需要处理的文本。'}
              </div>
            </div>
            <Link
              to={projectId ? `/projects/${projectId}` : '/'}
              className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-white/10 bg-transparent px-3 text-sm font-medium text-white transition hover:bg-white/10"
            >
              返回上一工作区
            </Link>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_300px]">
        <aside className="space-y-4">
          <Card className="border border-white/10 bg-white/6 shadow-lg shadow-black/5">
            <CardHeader>
              <CardTitle className="text-xl text-white">工具分组</CardTitle>
              <CardDescription>先按创作任务分组，而不是按底层技术接口分组。</CardDescription>
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
                      'w-full rounded-3xl border p-4 text-left transition',
                      isActive
                        ? 'border-primary/50 bg-primary/10 shadow-lg shadow-primary/10'
                        : 'border-white/10 bg-black/10 hover:border-white/20 hover:bg-white/6',
                    ].join(' ')}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex size-10 items-center justify-center rounded-2xl border border-white/10 bg-black/10">
                        <Icon className="size-5 text-primary" />
                      </div>
                      <div className="space-y-2">
                        <div className="text-base font-medium text-white">{task.title}</div>
                        <div className="text-xs leading-6 text-slate-400">{task.description}</div>
                        <div className="flex flex-wrap gap-2">
                          {task.items.map((item) => (
                            <span key={item} className="rounded-full border border-white/10 bg-black/10 px-3 py-1 text-[11px] text-slate-300">
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </CardContent>
          </Card>
        </aside>

        <section className="space-y-4">
          <Card className="border border-white/10 bg-white/6 shadow-lg shadow-black/5">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-xl text-white">{taskMeta.title}</CardTitle>
                  <CardDescription className="mt-2 max-w-3xl text-sm leading-7 text-slate-300">{taskMeta.helper}</CardDescription>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/10 px-3 py-1 text-xs text-slate-400">
                  <FileText className="size-4 text-primary" />
                  {taskMeta.status}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-200" htmlFor="toolbox-input">
                    {activeTask === 'continue' ? '待续写正文' : '待处理文本'}
                  </label>
                  <Textarea
                    id="toolbox-input"
                    value={generation.input}
                    onChange={(event) => setGeneration((prev) => ({ ...prev, input: event.target.value, result: '' }))}
                    rows={16}
                    placeholder={taskMeta.placeholder}
                    className="min-h-[360px] leading-7"
                  />
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                    <div className="text-sm font-medium text-white">上下文摘要</div>
                    <div className="mt-3 text-xs leading-6 text-slate-400 whitespace-pre-wrap">
                      {contextText || '当前未带入项目或章节上下文，任务将仅基于手动输入内容执行。'}
                    </div>
                  </div>

                  {selectedChapter ? (
                    <Button variant="outline" className="w-full" onClick={handleFillFromChapter}>
                      从当前章节载入正文
                    </Button>
                  ) : null}

                  {selectedChapter && projectId ? (
                    <Link
                      to={`/projects/${projectId}/editor/${selectedChapter.id}`}
                      className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-white/10 bg-transparent px-3 text-sm font-medium text-white transition hover:bg-white/10"
                    >
                      返回章节编辑器
                    </Link>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <WandSparkles className="size-4 text-primary" />
                  AI 任务配置
                </div>
                <div className="space-y-3 rounded-xl border border-white/10 bg-black/10 p-3">
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-white">常用意图</div>
                    <div className="text-xs leading-5 text-slate-400">
                      面向直接开工的作者。先点一个最接近的任务意图，再按需细改下面的指令。
                    </div>
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
                              ? 'border-primary bg-primary/20 text-white'
                              : 'border-white/10 bg-black/10 text-slate-300 hover:border-white/20 hover:text-white',
                          ].join(' ')}
                          onClick={() => setGeneration((prev) => ({ ...prev, instruction: preset, result: '' }))}
                        >
                          {preset}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                  <button
                    type="button"
                    onClick={() => setIsAdvancedOpen((prev) => !prev)}
                    className="flex w-full items-center justify-between gap-3 text-left"
                  >
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-white">高级参数</div>
                      <div className="text-xs leading-5 text-slate-400">
                        默认沿用当前运行时配置。需要切换提供商、模型或拉取可选模型时再展开。
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span>{selectedProvider}</span>
                      <span className="max-w-[180px] truncate">{selectedModelId}</span>
                      <ChevronRight className={`size-4 transition ${isAdvancedOpen ? 'rotate-90 text-white' : ''}`} />
                    </div>
                  </button>

                  {isAdvancedOpen ? (
                    <div className="mt-4 space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-200">模型提供商</label>
                          <Select value={selectedProvider} onValueChange={(value) => setGeneration((prev) => ({ ...prev, provider: value, result: '' }))}>
                            <SelectTrigger>
                              <SelectValue placeholder="选择模型提供商" />
                            </SelectTrigger>
                            <SelectContent>
                              {MODEL_PROVIDER_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-200" htmlFor="toolbox-model-id">
                            当前任务模型
                          </label>
                          <Input
                            id="toolbox-model-id"
                            value={selectedModelId}
                            onChange={(event) => setGeneration((prev) => ({ ...prev, modelId: event.target.value, result: '' }))}
                            placeholder="例如 openai/gpt-5.4"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-200">模型列表</label>
                          <Button variant="outline" className="w-full" onClick={handleLoadModels} disabled={isLoadingModels}>
                            {isLoadingModels ? '获取中...' : '获取可选模型'}
                          </Button>
                        </div>
                      </div>

                      {availableModels.length > 0 ? (
                        <div className="rounded-xl border border-white/10 bg-black/10 p-3 text-xs text-slate-300">
                          <div className="mb-2">点击下方模型，直接设为当前任务模型：</div>
                          <div className="flex flex-wrap gap-2">
                            {availableModels.slice(0, 20).map((model) => {
                              const isSelected = model.id === selectedModelId

                              return (
                                <button
                                  key={model.id}
                                  type="button"
                                  className={`rounded-full border px-3 py-1 transition ${
                                    isSelected ? 'border-primary bg-primary/20 text-white' : 'border-white/10 hover:border-primary hover:text-white'
                                  }`}
                                  onClick={() => setGeneration((prev) => ({ ...prev, modelId: model.id, result: '' }))}
                                >
                                  {model.id}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-200" htmlFor="toolbox-instruction">
                    任务指令
                  </label>
                  <Textarea
                    id="toolbox-instruction"
                    value={generation.instruction}
                    onChange={(event) => setGeneration((prev) => ({ ...prev, instruction: event.target.value, result: '' }))}
                    rows={5}
                    placeholder={taskMeta.placeholder}
                  />
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

          <Card className="border border-white/10 bg-white/6 shadow-lg shadow-black/5">
            <CardHeader>
              <CardTitle className="text-xl text-white">{taskMeta.resultTitle}</CardTitle>
              <CardDescription>结果以原文、候选结果和差异预览组织，便于继续处理或带回编辑器。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="min-h-[260px] rounded-2xl border border-white/10 bg-black/10 p-4 text-sm leading-7 text-slate-200">
                {generation.result.trim() ? (
                  <div className="space-y-4 whitespace-normal">
                    <div className="grid gap-3 lg:grid-cols-2">
                      <div className="rounded-xl border border-white/8 bg-white/4 p-3">
                        <div className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-500">原文</div>
                        <div className="whitespace-pre-wrap text-sm leading-6 text-slate-300">
                          {generation.input.trim() || '本次任务原文为空'}
                        </div>
                      </div>
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 p-3">
                        <div className="mb-2 text-xs uppercase tracking-[0.18em] text-emerald-300">候选结果</div>
                        <div className="whitespace-pre-wrap text-sm leading-6 text-emerald-50">{generation.result}</div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/8 bg-[#0F0F11]">
                      <div className="border-b border-white/6 px-3 py-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                        差异预览
                      </div>
                      <div className="space-y-1 p-3">
                        {buildDiffLines(generation.input.trim(), generation.result).map((line, index) => (
                          <div
                            key={`${line.type}-${index}`}
                            className={[
                              'grid gap-2 rounded-md px-2 py-1.5 text-xs leading-5 sm:grid-cols-2',
                              line.type === 'same'
                                ? 'text-slate-500'
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
                  <div className="whitespace-pre-wrap">当前任务结果会显示在这里。</div>
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
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
                          recommendedSendMode === 'append'
                            ? 'border-primary/30 bg-primary/10'
                            : 'border-white/10 bg-black/10',
                        ].join(' ')}
                      >
                        <div className="text-sm font-medium text-white">追加到正文</div>
                        <div className="mt-2 text-xs leading-6 text-slate-400">
                          目标章节：{selectedChapter.title}
                          <br />
                          适合续写、补段落、扩写场景，不会直接覆盖当前草稿。
                        </div>
                      </div>
                      <div
                        className={[
                          'rounded-2xl border p-4 text-sm',
                          recommendedSendMode === 'replace'
                            ? 'border-primary/30 bg-primary/10'
                            : 'border-white/10 bg-black/10',
                        ].join(' ')}
                      >
                        <div className="text-sm font-medium text-white">覆盖当前草稿</div>
                        <div className="mt-2 text-xs leading-6 text-slate-400">
                          目标章节：{selectedChapter.title}
                          <br />
                          适合改写与重写任务，会把当前结果作为新的正文草稿带回编辑器。
                        </div>
                      </div>
                    </div>
                    <Button variant="outline" onClick={() => handleSendToEditor('append')} disabled={!generation.result.trim()}>
                      带回编辑器并追加
                    </Button>
                    <Button onClick={() => handleSendToEditor('replace')} disabled={!generation.result.trim()}>
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
          <Card className="border border-white/10 bg-white/6 shadow-lg shadow-black/5">
            <CardHeader>
              <CardTitle className="text-xl text-white">生成历史</CardTitle>
              <CardDescription>保留最近几次任务结果，方便回看、复用和再次带回编辑器。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {history.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 py-5 text-sm leading-6 text-slate-400">
                  还没有历史记录。执行一次任务后，这里会保留最近结果。
                </div>
              ) : (
                <>
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
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
                    <div
                      key={item.id}
                      className="rounded-2xl border border-white/10 bg-black/10 p-4 transition hover:border-white/20 hover:bg-white/6"
                    >
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
                          <div className="text-sm font-medium text-white">{getTaskMeta(item.task).label}</div>
                          {item.chapterTitle ? (
                            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-slate-400">
                              {item.chapterTitle}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{item.result}</div>
                      </button>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            await handleCopyHistoryResult(item.result)
                          }}
                        >
                          复制
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
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

      <EmptyState
        title="AI 工具箱已升级为可执行任务页"
        description="当前已支持围绕续写、改写、一致性检查三类任务直接发起 AI 请求，并通过任务参数连接首页、工作台与编辑器。下一步将继续补强更细的回写动作与多任务协同体验。"
        action={
          <Link
            to={projectId ? `/projects/${projectId}` : '/'}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            返回创作工作区
            <ChevronRight className="size-4" />
          </Link>
        }
      />
    </div>
  )
}

function HighlightMetric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-400">{hint}</p>
    </div>
  )
}
