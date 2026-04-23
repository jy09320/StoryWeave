import { useMemo, useState } from 'react'
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
import { Link, useSearchParams } from 'react-router-dom'
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
    helper: '适合在章节推进前后快速做风险检查，当前阶段以分析报告形式呈现。',
  },
] as const

type ToolboxTaskType = (typeof TASK_OPTIONS)[number]['value']

interface GenerationState {
  instruction: string
  provider: string
  modelId: string
  input: string
  result: string
  isGenerating: boolean
  requestId: number
}

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

export function AIToolboxPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTask = (searchParams.get('task') as ToolboxTaskType | null) ?? 'continue'
  const projectId = searchParams.get('projectId') ?? ''
  const chapterId = searchParams.get('chapterId') ?? ''

  const [activeTask, setActiveTask] = useState<ToolboxTaskType>(initialTask)
  const [availableModels, setAvailableModels] = useState<AIModelOption[]>([])
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [generation, setGeneration] = useState<GenerationState>({
    instruction: getTaskMeta(initialTask).defaultInstruction,
    provider: 'openai',
    modelId: 'gpt-4o',
    input: '',
    result: '',
    isGenerating: false,
    requestId: 0,
  })

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

        return {
          ...prev,
          isGenerating: false,
        }
      })
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

      <section className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
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
              <CardDescription>生成结果会保留在当前页面，便于复制、比对或回到编辑器继续处理。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="min-h-[260px] rounded-2xl border border-white/10 bg-black/10 p-4 text-sm leading-7 text-slate-200 whitespace-pre-wrap">
                {generation.result || '当前任务结果会显示在这里。'}
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
                  <Link
                    to={`/projects/${projectId}/editor/${selectedChapter.id}`}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
                  >
                    回到编辑器处理结果
                    <ArrowRight className="size-4" />
                  </Link>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </section>
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
