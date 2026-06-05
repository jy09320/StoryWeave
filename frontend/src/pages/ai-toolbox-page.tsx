import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BookOpenText, Copy, StackSimple, Spinner, Play, Path, Sparkle } from '@phosphor-icons/react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { ModelPickerDialog } from '@/components/ai/model-picker-dialog'
import { EmptyState } from '@/components/empty-state'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { readToolboxInputDraft, writeToolboxInputDraft } from '@/lib/ai-toolbox-context'
import { readEditorRouteContext } from '@/lib/editor-route-context'
import { formatDate } from '@/lib/format'
import {
  getAIRuntimeSettings,
  isAbortError,
  listAIRuntimeModels,
  streamGenerate,
  type AIModelOption,
} from '@/services/ai'
import { getProject } from '@/services/projects'
import type { AIGeneratePayload, Chapter, ProjectDetail } from '@/types/api'

const TOOLBOX_RESULT_DRAFT_KEY = 'storyweave.toolbox-result-draft'

type TemplateTaskType = 'continue' | 'rewrite' | 'consistency'
type TemplateKind = 'template' | 'workflow'
type TemplateCategory = 'fanfiction' | 'novel' | 'character' | 'plot' | 'world'
type SendBackMode = 'append' | 'replace'

interface TemplateDefinition {
  id: string
  title: string
  summary: string
  category: TemplateCategory
  kind: TemplateKind
  task: TemplateTaskType
  scene: string
  output: string
  tags: string[]
  promptLabel: string
  placeholder: string
  instruction: string
  steps: string[]
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

interface ToolboxResultDraft {
  projectId: string
  chapterId: string
  task: TemplateTaskType
  result: string
  sourceInput: string
  createdAt: string
  mode: SendBackMode
}

const categoryMeta: Array<{ value: 'all' | TemplateCategory; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'fanfiction', label: '同人文' },
  { value: 'novel', label: '原创小说' },
  { value: 'character', label: '角色塑造' },
  { value: 'plot', label: '剧情推进' },
  { value: 'world', label: '世界观设定' },
]

const templateLibrary: TemplateDefinition[] = [
  {
    id: 'fanfic-quick-start',
    title: '一键生成同人文开篇',
    summary: '基于角色关系、原作氛围和冲突切口，直接生成可落笔的开篇段落。',
    category: 'fanfiction',
    kind: 'template',
    task: 'continue',
    scene: '适合新坑开篇、CP 向短篇、原作衍生支线',
    output: '开篇场景 + 人物出场 + 第一波情绪张力',
    tags: ['同人文', '开篇', '角色关系'],
    promptLabel: '原作、角色与想写的关系线',
    placeholder: '例如：原作《哈利波特》，主角为德拉科和哈利，想写战后重逢向，氛围克制、带旧伤与拉扯。',
    instruction:
      '你是一名擅长同人文创作的小说作者。请根据用户提供的原作背景、角色关系和情绪方向，直接生成一个可用的同人文开篇。要求迅速建立角色状态、关系张力和场景气氛，语言自然，有明确的叙事推进，不要写成大纲。',
    steps: ['读取原作与角色关系', '确定冲突切口', '生成可直接接入正文的开篇'],
  },
  {
    id: 'fanfic-scene-loop',
    title: '同人文高糖 / 高张力场景生成',
    summary: '围绕一组角色和一个触发事件，快速生成互动感强的完整场景。',
    category: 'fanfiction',
    kind: 'template',
    task: 'continue',
    scene: '适合名场面改写、暧昧拉扯、和解或冲突爆发',
    output: '完整场景正文，含动作、对话和情绪推进',
    tags: ['名场面', '对话', '情绪'],
    promptLabel: '角色、场景触发点与情绪方向',
    placeholder: '例如：两人在雨夜避雨，表面冷静，实际都在试探对方是否还在意；要求对话多一点，节奏慢一点。',
    instruction:
      '请围绕用户给出的角色、场景和情绪方向，生成一个完整的同人文场景。重点写角色互动、潜台词、动作细节与情绪递进，让关系变化体现在场景内，而不是直接解释。',
    steps: ['确认场景地点与触发事件', '设计互动节奏', '输出高可用场景正文'],
  },
  {
    id: 'novel-outline-workflow',
    title: '长篇小说大纲工作流',
    summary: '把一个模糊灵感拆成主线、人物目标、阶段冲突和章节骨架。',
    category: 'novel',
    kind: 'workflow',
    task: 'rewrite',
    scene: '适合原创长篇立项、重整旧坑、扩写中篇为长篇',
    output: '故事核心设定 + 三段式推进 + 章节骨架',
    tags: ['大纲', '长篇', '工作流'],
    promptLabel: '你的故事灵感、题材和想要的篇幅',
    placeholder: '例如：东方奇幻成长长篇，主角是被流放的王族遗孤，希望篇幅在 30 章左右，节奏偏稳。',
    instruction:
      '请将用户给出的小说想法整理为可执行的长篇创作工作流，至少输出：故事钩子、主角目标、核心矛盾、三段式推进、主要转折点、适合的章节拆分建议。表达要结构化、清晰，可直接用于后续写作。',
    steps: ['提炼故事钩子', '建立主线与阶段目标', '输出章节级大纲骨架'],
  },
  {
    id: 'chapter-continue-template',
    title: '章节续写模板',
    summary: '承接你当前写到一半的正文，补齐过渡、冲突或收束。',
    category: 'novel',
    kind: 'template',
    task: 'continue',
    scene: '适合卡文、场景过渡、冲突前后补段',
    output: '可直接拼回当前章节的续写内容',
    tags: ['续写', '章节', '过渡'],
    promptLabel: '当前章节文本或你想接下去的方向',
    placeholder: '例如：这一段刚写到女主发现密信，还没决定是立刻对质还是先隐藏；希望先压住情绪，埋一层悬念。',
    instruction:
      '请基于用户提供的章节内容继续写下去，保持原有叙事视角、语气与节奏。重点处理过渡的自然性和情绪连贯性，让续写可以直接接回正文。',
    steps: ['识别当前段落状态', '延续叙事节奏', '输出可直接拼接的正文'],
  },
  {
    id: 'character-voice-pack',
    title: '角色口吻与人设强化包',
    summary: '把角色设定整理成说话习惯、行为偏好和冲突反应模型。',
    category: 'character',
    kind: 'workflow',
    task: 'rewrite',
    scene: '适合角色说话越来越同质化时校正',
    output: '角色口吻规则 + 行为倾向 + 写作注意点',
    tags: ['角色', '口吻', '人设'],
    promptLabel: '角色设定、背景与目前写出来的问题',
    placeholder: '例如：角色设定是理智、毒舌、嘴硬，但我写出来总像温柔导师。请帮我强化口吻和边界。',
    instruction:
      '请根据用户给出的角色信息，输出一份角色强化包，包括：核心气质、常用说话方式、情绪失控时的表达、关系亲疏对口吻的影响、写作时应避免的失真点。内容要具体，方便直接参照。',
    steps: ['提炼核心人设', '沉淀口吻规则', '列出写作时的失真风险'],
  },
  {
    id: 'plot-push-engine',
    title: '剧情推进工作流',
    summary: '当你只知道“这一章得往前走”，它帮你把推动方式拆出来。',
    category: 'plot',
    kind: 'workflow',
    task: 'rewrite',
    scene: '适合中段疲软、章节空转、重复日常',
    output: '本章目标 + 推进策略 + 冲突增量建议',
    tags: ['剧情', '推进', '节奏'],
    promptLabel: '当前剧情停滞点与希望推进到的位置',
    placeholder: '例如：男女主已经确认合作，但剧情最近两章都在聊天，想推进到第一次公开对立。',
    instruction:
      '请把用户当前的剧情停滞点拆解为可执行的推进工作流，至少给出：本章目标、需要新增的信息或事件、冲突升级方式、角色选择分叉、收尾钩子。内容要偏实操，而不是泛泛建议。',
    steps: ['判断剧情卡点', '拆分推进动作', '给出本章可执行方案'],
  },
  {
    id: 'world-seed-template',
    title: '世界观设定包生成',
    summary: '从一句话概念扩展为时代背景、规则、阵营与地点。',
    category: 'world',
    kind: 'workflow',
    task: 'rewrite',
    scene: '适合原创设定搭骨架、补全设定空白',
    output: '世界概览 + 核心规则 + 阵营与地点草案',
    tags: ['设定', '世界观', '原创'],
    promptLabel: '一句话概念或你已有的世界观片段',
    placeholder: '例如：蒸汽与神术并存的海上帝国，中央教会控制航线，主角来自被诅咒的边境群岛。',
    instruction:
      '请把用户提供的概念扩展为一个可用于小说创作的世界观设定包，至少包含：时代背景、核心规则、主要势力、关键地点、禁忌与代价、与主角相关的设定入口。',
    steps: ['扩展概念', '建立规则与代价', '输出可写作的设定包'],
  },
  {
    id: 'consistency-guard',
    title: '设定一致性巡检',
    summary: '拿当前章节去对照角色、世界观和既有摘要，找冲突和隐患。',
    category: 'world',
    kind: 'template',
    task: 'consistency',
    scene: '适合发散写作后回收、交稿前自检',
    output: '冲突点列表 + 依据 + 修正建议',
    tags: ['一致性', '巡检', '设定'],
    promptLabel: '需要检查的正文、摘要或设定片段',
    placeholder: '例如：检查这段内容是否和当前角色设定、时间线、能力规则冲突，并指出风险最高的 3 个点。',
    instruction:
      '请从角色设定、世界规则、因果逻辑和时间线四个维度检查用户给出的内容。输出时使用清晰列表，说明冲突点、冲突依据、影响范围和修改建议。',
    steps: ['读取上下文', '逐维度检查冲突', '输出可执行修正建议'],
  },
]

const taskTemplateMap: Record<TemplateTaskType, string> = {
  continue: 'chapter-continue-template',
  rewrite: 'plot-push-engine',
  consistency: 'consistency-guard',
}

function getTemplateById(templateId: string) {
  return templateLibrary.find((item) => item.id === templateId) ?? templateLibrary[0]
}

function buildProjectContext(project: ProjectDetail | undefined, chapter: Chapter | null) {
  if (!project) {
    return ''
  }

  const parts = [
    project.title ? `项目标题：${project.title}` : '',
    project.description?.trim() ? `项目简介：${project.description.trim()}` : '',
    project.world_setting?.overview?.trim() ? `世界观概览：${project.world_setting.overview.trim()}` : '',
    project.world_setting?.rules?.trim() ? `核心规则：${project.world_setting.rules.trim()}` : '',
    project.world_setting?.factions?.trim() ? `主要势力：${project.world_setting.factions.trim()}` : '',
    chapter?.title ? `当前章节：${chapter.title}` : '',
    chapter?.summary?.trim() ? `章节摘要：${chapter.summary.trim()}` : '',
    chapter?.notes?.trim() ? `章节备注：${chapter.notes.trim()}` : '',
  ].filter(Boolean)

  return parts.join('\n')
}

function buildPromptText(contextText: string, inputText: string) {
  const sections = []

  if (contextText.trim()) {
    sections.push(`【项目上下文】\n${contextText.trim()}`)
  }

  if (inputText.trim()) {
    sections.push(`【用户输入】\n${inputText.trim()}`)
  }

  return sections.join('\n\n')
}

function buildResultDraft(params: {
  projectId: string
  chapterId: string
  task: TemplateTaskType
  input: string
  result: string
  mode: SendBackMode
}): ToolboxResultDraft {
  return {
    projectId: params.projectId,
    chapterId: params.chapterId,
    task: params.task,
    result: params.result,
    sourceInput: params.input,
    createdAt: new Date().toISOString(),
    mode: params.mode,
  }
}

export function AIToolboxPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const editorRouteContext = useMemo(() => readEditorRouteContext(), [])

  const taskFromQuery = (searchParams.get('task') as TemplateTaskType | null) ?? null
  const projectId = searchParams.get('projectId') ?? ''
  const chapterId = searchParams.get('chapterId') ?? ''
  const initialTemplateId = taskFromQuery ? taskTemplateMap[taskFromQuery] : templateLibrary[0].id

  const [selectedCategory, setSelectedCategory] = useState<'all' | TemplateCategory>('all')
  const [selectedTemplateId, setSelectedTemplateId] = useState(initialTemplateId)
  const [availableModels, setAvailableModels] = useState<AIModelOption[]>([])
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [isModelDialogOpen, setIsModelDialogOpen] = useState(false)
  const generationAbortRef = useRef<AbortController | null>(null)

  const selectedTemplate = useMemo(() => getTemplateById(selectedTemplateId), [selectedTemplateId])

  const [generation, setGeneration] = useState<GenerationState>({
    instruction: selectedTemplate.instruction,
    provider: '',
    modelId: '',
    input: '',
    result: '',
    isGenerating: false,
    requestId: 0,
  })

  useEffect(() => {
    setGeneration((prev) => ({
      ...prev,
      instruction: selectedTemplate.instruction,
      result: '',
    }))

    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('template', selectedTemplate.id)
      return next
    }, { replace: true })
  }, [selectedTemplate.id, selectedTemplate.instruction, setSearchParams])

  useEffect(() => {
    const templateFromQuery = searchParams.get('template')
    if (templateFromQuery && templateFromQuery !== selectedTemplateId) {
      setSelectedTemplateId(templateFromQuery)
    }
  }, [searchParams, selectedTemplateId])

  useEffect(() => {
    const draft = readToolboxInputDraft()
    if (!draft || !draft.input.trim()) {
      return
    }

    const sameProject = (draft.projectId ?? '') === projectId
    const sameChapter = (draft.chapterId ?? '') === chapterId
    const sameTask = draft.task === selectedTemplate.task

    if (!sameProject || !sameChapter || !sameTask) {
      return
    }

    setGeneration((prev) => ({
      ...prev,
      input: draft.input,
      result: '',
    }))
    writeToolboxInputDraft(null)
    toast.success('已带入编辑器中的选中文本')
  }, [chapterId, projectId, selectedTemplate.task])

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

  const selectedModelId = generation.modelId.trim() || runtimeSettingsQuery.data?.model_id || ''
  const selectedProvider = generation.provider || runtimeSettingsQuery.data?.provider || ''
  const hasSavedRuntimeKey = Boolean(runtimeSettingsQuery.data?.api_key_masked)
  const contextText = buildProjectContext(projectQuery.data, selectedChapter)
  const filteredTemplates = useMemo(() => {
    if (selectedCategory === 'all') {
      return templateLibrary
    }

    return templateLibrary.filter((item) => item.category === selectedCategory)
  }, [selectedCategory])

  async function handleLoadModels() {
    if (isLoadingModels) {
      return
    }

    try {
      setIsLoadingModels(true)
      const response = await listAIRuntimeModels()
      setAvailableModels(response.models ?? [])
      toast.success(`已加载 ${response.models?.length ?? 0} 个模型`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '模型列表加载失败')
    } finally {
      setIsLoadingModels(false)
    }
  }

  async function handleGenerate() {
    const input = generation.input.trim()
    if (!input) {
      toast.error('请先填写模板输入内容')
      return
    }

    if (!selectedProvider || !selectedModelId) {
      toast.error('请先在设置中心完成模型配置')
      return
    }

    generationAbortRef.current?.abort()
    const abortController = new AbortController()
    generationAbortRef.current = abortController
    const requestId = Date.now()

    setGeneration((prev) => ({
      ...prev,
      result: '',
      isGenerating: true,
      requestId,
    }))

    const payload: AIGeneratePayload = {
      project_id: projectId || 'template-plaza',
      chapter_id: chapterId || null,
      text: buildPromptText(contextText, input),
      instruction: generation.instruction.trim() || selectedTemplate.instruction,
      model_provider: selectedProvider,
      model_id: selectedModelId,
      temperature: selectedTemplate.task === 'consistency' ? 0.4 : 0.8,
    }

    try {
      await streamGenerate(
        payload,
        (chunk) => {
          setGeneration((prev) => {
            if (prev.requestId !== requestId) {
              return prev
            }

            return {
              ...prev,
              result: `${prev.result}${chunk}`,
            }
          })
        },
        { signal: abortController.signal, timeoutMs: 90_000, retryCount: 1 },
      )

      toast.success('模板已生成完成')
    } catch (error) {
      if (isAbortError(error)) {
        toast.message('已停止本次生成')
      } else {
        toast.error(error instanceof Error ? error.message : '生成失败，请稍后重试')
      }
    } finally {
      setGeneration((prev) => ({
        ...prev,
        isGenerating: false,
      }))
      if (generationAbortRef.current === abortController) {
        generationAbortRef.current = null
      }
    }
  }

  function handleStopGenerate() {
    generationAbortRef.current?.abort()
  }

  async function handleCopyResult() {
    if (!generation.result.trim()) {
      toast.error('当前没有可复制的生成结果')
      return
    }

    await navigator.clipboard.writeText(generation.result.trim())
    toast.success('已复制生成结果')
  }

  function handleSendBack(mode: SendBackMode) {
    if (!projectId || !chapterId || !generation.result.trim()) {
      return
    }

    const draft = buildResultDraft({
      projectId,
      chapterId,
      task: selectedTemplate.task,
      input: generation.input,
      result: generation.result.trim(),
      mode,
    })

    window.sessionStorage.setItem(TOOLBOX_RESULT_DRAFT_KEY, JSON.stringify(draft))
    navigate(`/projects/${projectId}/editor/${chapterId}?fromToolbox=1`)
  }

  if (projectQuery.isLoading) {
    return <LoadingState label="正在加载模板广场..." />
  }

  if (projectQuery.isError) {
    return (
      <EmptyState
        title="模板广场加载失败"
        description={projectQuery.error.message}
      />
    )
  }

  return (
    <div className="space-y-6 pb-10">
      <section className="rounded-xl border border-border bg-card/95 p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-primary/80">
              <Sparkle className="size-4" />
              Template Plaza
            </div>
            <div>
              <h1 className="text-3xl font-semibold text-foreground">模板广场</h1>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                把常见写作任务整理成可一键使用的模板和工作流。先选结果形态，再填你的素材，不用先研究工具。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">模板 {templateLibrary.filter((item) => item.kind === 'template').length}</Badge>
              <Badge variant="secondary">工作流 {templateLibrary.filter((item) => item.kind === 'workflow').length}</Badge>
              {projectQuery.data && <Badge variant="secondary">已接入项目上下文</Badge>}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {editorRouteContext && (
              <Link
                to={`/projects/${editorRouteContext.projectId}/editor/${editorRouteContext.chapterId}`}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                返回编辑器
              </Link>
            )}
            <Link
              to="/settings"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
            >
              模型设置
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <Card className="border border-border bg-card/95">
            <CardHeader>
              <CardTitle className="text-lg">分类浏览</CardTitle>
              <CardDescription>按用途筛选模板，优先展示能直接出结果的内容。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {categoryMeta.map((category) => (
                <button
                  key={category.value}
                  type="button"
                  onClick={() => setSelectedCategory(category.value)}
                  className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition ${
                    selectedCategory === category.value
                      ? 'border-primary/30 bg-primary/10 text-foreground'
                      : 'border-border bg-background/70 text-muted-foreground hover:bg-muted/40'
                  }`}
                >
                  <span>{category.label}</span>
                  <span className="text-xs">
                    {category.value === 'all'
                      ? templateLibrary.length
                      : templateLibrary.filter((item) => item.category === category.value).length}
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>

          {projectQuery.data && (
            <Card className="border border-border bg-card/95">
              <CardHeader>
                <CardTitle className="text-lg">当前上下文</CardTitle>
                <CardDescription>模板运行时会自动带入这些内容。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div>
                  <div className="font-medium text-foreground">{projectQuery.data.title}</div>
                  {projectQuery.data.description && <div className="mt-1 leading-6">{projectQuery.data.description}</div>}
                </div>
                {selectedChapter && (
                  <div className="rounded-xl border border-border bg-background/70 p-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-primary/80">章节</div>
                    <div className="mt-2 font-medium text-foreground">{selectedChapter.title}</div>
                    <div className="mt-1 text-xs">更新于 {formatDate(selectedChapter.updated_at)}</div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="border border-border bg-card/95">
            <CardHeader>
              <CardTitle className="text-lg">模板列表</CardTitle>
              <CardDescription>选一个模板，右侧会切到对应的输入和运行面板。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {filteredTemplates.map((template) => {
                const isActive = template.id === selectedTemplate.id
                const isWorkflow = template.kind === 'workflow'

                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setSelectedTemplateId(template.id)}
                    className={`rounded-xl border p-4 text-left transition-all duration-200 hover:-translate-y-px hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] ${
                      isActive
                        ? 'border-primary/30 bg-primary/10 shadow-sm'
                        : 'border-border bg-background/75 hover:bg-muted/35'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={isWorkflow ? 'default' : 'secondary'}>
                            {isWorkflow ? '工作流' : '模板'}
                          </Badge>
                          <Badge variant="outline">{categoryMeta.find((item) => item.value === template.category)?.label}</Badge>
                        </div>
                        <div className="text-base font-medium text-foreground">{template.title}</div>
                      </div>
                      {isWorkflow ? <Path className="size-4 text-primary" /> : <Sparkle className="size-4 text-primary" />}
                    </div>

                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{template.summary}</p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {template.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </button>
                )
              })}
            </CardContent>
          </Card>

          <Card className="border border-border bg-card/95">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{selectedTemplate.kind === 'workflow' ? '工作流' : '模板'}</Badge>
                    <Badge variant="outline">{selectedTemplate.scene}</Badge>
                  </div>
                  <CardTitle className="text-xl">{selectedTemplate.title}</CardTitle>
                  <CardDescription>{selectedTemplate.summary}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-border bg-background/70 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <BookOpenText className="size-4 text-primary" />
                    适用场景
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{selectedTemplate.scene}</p>
                </div>
                <div className="rounded-xl border border-border bg-background/70 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <StackSimple className="size-4 text-primary" />
                    预计输出
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{selectedTemplate.output}</p>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-background/70 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                  <Path className="size-4 text-primary" />
                  使用步骤
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  {selectedTemplate.steps.map((step, index) => (
                    <div key={step} className="rounded-xl border border-border bg-background px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.16em] text-primary/80">Step {index + 1}</div>
                      <div className="mt-2 text-sm text-foreground">{step}</div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border border-border bg-card/95">
            <CardHeader>
              <CardTitle className="text-lg">一键运行</CardTitle>
              <CardDescription>这里是模板的输入面板，右下角直接拿结果。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-border bg-background/70 p-3">
                <div className="text-xs uppercase tracking-[0.16em] text-primary/80">当前模板</div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-foreground">{selectedTemplate.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{selectedTemplate.output}</div>
                  </div>
                  <Button variant="outline" className="rounded-xl" onClick={() => setIsModelDialogOpen(true)}>
                    选择模型
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">{selectedTemplate.promptLabel}</label>
                <Textarea
                  value={generation.input}
                  onChange={(event) =>
                    setGeneration((prev) => ({
                      ...prev,
                      input: event.target.value,
                    }))
                  }
                  rows={9}
                  className="min-h-[220px] rounded-xl border-border bg-background text-foreground placeholder:text-muted-foreground"
                  placeholder={selectedTemplate.placeholder}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">模板指令</label>
                <Textarea
                  value={generation.instruction}
                  onChange={(event) =>
                    setGeneration((prev) => ({
                      ...prev,
                      instruction: event.target.value,
                    }))
                  }
                  rows={7}
                  className="rounded-xl border-border bg-background text-foreground placeholder:text-muted-foreground"
                />
              </div>

              <div className="rounded-xl border border-border bg-background/70 p-3 text-xs text-muted-foreground">
                当前模型：
                <span className="ml-1 font-medium text-foreground">
                  {selectedModelId ? `${selectedProvider} / ${selectedModelId}` : '未配置'}
                </span>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  className="rounded-xl"
                  onClick={() => void handleGenerate()}
                  disabled={generation.isGenerating}
                >
                  {generation.isGenerating ? <Spinner className="size-4 animate-spin" /> : <Play className="size-4" />}
                  立即使用
                </Button>

                {generation.isGenerating && (
                  <Button variant="outline" className="rounded-xl" onClick={handleStopGenerate}>
                    停止生成
                  </Button>
                )}

                <Button variant="outline" className="rounded-xl" onClick={() => void handleLoadModels()} disabled={isLoadingModels}>
                  {isLoadingModels ? <Spinner className="size-4 animate-spin" /> : null}
                  刷新模型
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border bg-card/95">
            <CardHeader>
              <CardTitle className="text-lg">生成结果</CardTitle>
              <CardDescription>支持直接复制，或者带回当前章节继续编辑。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                readOnly
                value={generation.result}
                rows={16}
                className="min-h-[320px] rounded-xl border-border bg-background text-foreground"
                placeholder="运行模板后，生成结果会出现在这里。"
              />

              <div className="flex flex-wrap gap-3">
                <Button variant="outline" className="rounded-xl" onClick={() => void handleCopyResult()}>
                  <Copy className="size-4" />
                  复制结果
                </Button>

                {projectId && chapterId && (
                  <>
                    <Button variant="outline" className="rounded-xl" onClick={() => handleSendBack('append')} disabled={!generation.result.trim()}>
                      追加到章节
                    </Button>
                    <Button variant="outline" className="rounded-xl" onClick={() => handleSendBack('replace')} disabled={!generation.result.trim()}>
                      覆盖当前草稿
                    </Button>
                  </>
                )}
              </div>

              {projectId && chapterId && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs leading-6 text-muted-foreground">
                  当前结果可直接送回章节编辑器。
                  {selectedChapter ? (
                    <>
                      {' '}
                      正在连接到 <span className="font-medium text-foreground">{selectedChapter.title}</span>。
                    </>
                  ) : (
                    <>
                      {' '}
                      当前章节 ID：<span className="font-medium text-foreground">{chapterId}</span>。
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <ModelPickerDialog
        open={isModelDialogOpen}
        onOpenChange={setIsModelDialogOpen}
        selectedModelId={selectedModelId}
        availableModels={availableModels}
        isLoadingModels={isLoadingModels}
        hasSavedRuntimeKey={hasSavedRuntimeKey}
        onRefresh={() => void handleLoadModels()}
        onSelect={(modelId) => {
          setGeneration((prev) => ({
            ...prev,
            modelId,
          }))
          toast.success('已切换当前模板使用模型')
        }}
      />
    </div>
  )
}
