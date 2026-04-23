import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Bot, ChevronLeft, FileText, History, LoaderCircle, Save, Sparkles, WandSparkles } from 'lucide-react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/empty-state'
import { LoadingState } from '@/components/loading-state'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatDate } from '@/lib/format'
import { queryClient } from '@/lib/query-client'
import {
  getAIRuntimeSettings,
  listAIRuntimeModels,
  streamGenerate,
  updateAIRuntimeSettings,
  type AIModelOption,
  type AIRuntimeSettings,
} from '@/services/ai'
import { getProject, listChapterVersions, updateChapter } from '@/services/projects'
import type { AIGeneratePayload, Chapter, ChapterStatus, ChapterVersion, ProjectDetail } from '@/types/api'

const MODEL_PROVIDER_OPTIONS = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'Anthropic', value: 'anthropic' },
] as const

const FALLBACK_MODEL_BY_PROVIDER: Record<string, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-3-5-sonnet-latest',
}

const CHAPTER_STATUS_OPTIONS: Array<{ label: string; value: ChapterStatus }> = [
  { label: '草稿', value: 'draft' },
  { label: '写作中', value: 'writing' },
  { label: '待审阅', value: 'review' },
  { label: '已定稿', value: 'done' },
]

interface EditorFormState {
  title: string
  status: ChapterStatus
  plainText: string
  notes: string
}

interface GenerationState {
  instruction: string
  provider: string
  modelId: string
  result: string
  isGenerating: boolean
  requestId: number
}

interface ProviderConfigFormState {
  provider: string
  modelId: string
  baseUrl: string
  apiKey: string
}

const defaultGenerationInstruction = '请基于当前正文继续写下去，保持风格一致，并自然衔接上一段。'

function getChapterById(project: ProjectDetail | undefined, chapterId: string | undefined) {
  if (!project || !chapterId) {
    return null
  }

  return project.chapters.find((chapter) => chapter.id === chapterId) ?? null
}

function buildEditorForm(chapter: Chapter | null): EditorFormState {
  if (!chapter) {
    return {
      title: '',
      status: 'draft',
      plainText: '',
      notes: '',
    }
  }

  return {
    title: chapter.title,
    status: (chapter.status as ChapterStatus) ?? 'draft',
    plainText: chapter.plain_text ?? '',
    notes: chapter.notes ?? '',
  }
}

function countWords(text: string) {
  return text.replace(/\s+/g, '').length
}

export function ProjectEditorPage() {
  const navigate = useNavigate()
  const { projectId, chapterId } = useParams<{ projectId: string; chapterId: string }>()
  const autosaveTimerRef = useRef<number | null>(null)
  const allowNextNavigationRef = useRef(false)

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current)
      }
    }
  }, [])

  const [drafts, setDrafts] = useState<Record<string, EditorFormState>>({})
  const [dirtyChapterIds, setDirtyChapterIds] = useState<Record<string, boolean>>({})
  const [generation, setGeneration] = useState<GenerationState>({
    instruction: defaultGenerationInstruction,
    provider: 'openai',
    modelId: 'gpt-4o',
    result: '',
    isGenerating: false,
    requestId: 0,
  })

  const [isVersionDialogOpen, setIsVersionDialogOpen] = useState(false)
  const [isProviderConfigOpen, setIsProviderConfigOpen] = useState(false)
  const [providerConfig, setProviderConfig] = useState<ProviderConfigFormState>({
    provider: 'openai',
    modelId: 'gpt-4o',
    baseUrl: '',
    apiKey: '',
  })
  const [runtimeSettings, setRuntimeSettings] = useState<AIRuntimeSettings | null>(null)
  const [availableModels, setAvailableModels] = useState<AIModelOption[]>([])
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [isSavingRuntimeSettings, setIsSavingRuntimeSettings] = useState(false)

  const projectQuery = useQuery<ProjectDetail, Error>({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId ?? ''),
    enabled: Boolean(projectId),
  })

  useEffect(() => {
    let cancelled = false

    getAIRuntimeSettings()
      .then((settings) => {
        if (cancelled) {
          return
        }

        setRuntimeSettings(settings)
        setProviderConfig({
          provider: settings.provider,
          modelId: settings.model_id,
          baseUrl: settings.base_url ?? '',
          apiKey: '',
        })
        setGeneration((prev) => ({
          ...prev,
          provider: settings.provider,
          modelId: settings.model_id,
        }))
      })
      .catch((error: Error) => {
        if (!cancelled) {
          toast.error(error.message)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])


  const chapter = useMemo(
    () => getChapterById(projectQuery.data, chapterId),
    [projectQuery.data, chapterId],
  )
  const defaultGenerationProvider = projectQuery.data?.default_model_provider ?? 'openai'
  const defaultGenerationModelId = projectQuery.data?.default_model_id ?? 'gpt-4o'

  const saveChapterMutation = useMutation({
    mutationFn: async ({
      targetChapterId,
      payload,
    }: {
      targetChapterId: string
      payload: EditorFormState
    }) => {
      return updateChapter(targetChapterId, {
        title: payload.title.trim(),
        status: payload.status,
        plain_text: payload.plainText,
        content: payload.plainText,
        notes: payload.notes.trim() || null,
      })
    },
    onSuccess: async (updatedChapter: Chapter) => {
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      setDrafts((prev) => ({
        ...prev,
        [updatedChapter.id]: buildEditorForm(updatedChapter),
      }))
      setDirtyChapterIds((prev) => ({
        ...prev,
        [updatedChapter.id]: false,
      }))
      toast.success('章节已保存')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const chapterVersionsQuery = useQuery<ChapterVersion[], Error>({
    queryKey: ['chapter-versions', chapterId],
    queryFn: () => listChapterVersions(chapterId ?? ''),
    enabled: Boolean(chapterId) && isVersionDialogOpen,
  })

  function clearAutosaveTimer() {
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
  }

  function scheduleAutosave(targetChapterId: string, nextForm: EditorFormState) {
    clearAutosaveTimer()

    autosaveTimerRef.current = window.setTimeout(() => {
      if (!nextForm.title.trim()) {
        return
      }

      saveChapterMutation.mutate({
        targetChapterId,
        payload: nextForm,
      })
      autosaveTimerRef.current = null
    }, 1200)
  }

  function updateFormField<K extends keyof EditorFormState>(key: K, value: EditorFormState[K]) {
    if (!chapter?.id) {
      return
    }

    const baseForm = drafts[chapter.id] ?? buildEditorForm(chapter)
    const next = { ...baseForm, [key]: value }

    setDrafts((prev) => ({
      ...prev,
      [chapter.id]: next,
    }))
    setDirtyChapterIds((prev) => ({
      ...prev,
      [chapter.id]: true,
    }))
    scheduleAutosave(chapter.id, next)
  }

  function handleTitleChange(event: ChangeEvent<HTMLInputElement>) {
    updateFormField('title', event.target.value)
  }

  function handlePlainTextChange(event: ChangeEvent<HTMLTextAreaElement>) {
    updateFormField('plainText', event.target.value)
  }

  function handleNotesChange(event: ChangeEvent<HTMLTextAreaElement>) {
    updateFormField('notes', event.target.value)
  }

  function handleStatusChange(value: string) {
    updateFormField('status', value as ChapterStatus)
  }

  function handleDiscardGeneratedText() {
    setGeneration((prev) => ({
      ...prev,
      result: '',
    }))
  }

  function handleStopGeneration() {
    setGeneration((prev) => ({
      ...prev,
      isGenerating: false,
      requestId: prev.requestId + 1,
    }))
    toast.info('已停止接收本次 AI 续写结果')
  }

  async function handleManualSave() {
    if (!chapter?.id) {
      toast.error('章节标识缺失，无法保存')
      return
    }

    const activeForm = drafts[chapter.id] ?? buildEditorForm(chapter)
    if (!activeForm.title.trim()) {
      toast.error('章节标题不能为空')
      return
    }

    clearAutosaveTimer()

    await saveChapterMutation.mutateAsync({
      targetChapterId: chapter.id,
      payload: activeForm,
    })
  }

  async function handleGenerate() {
    if (!projectId || !chapterId) {
      toast.error('项目或章节标识缺失')
      return
    }

    if (!activeForm.plainText.trim()) {
      toast.error('请先输入章节正文，再发起 AI 续写')
      return
    }

    clearAutosaveTimer()

    const requestId = generation.requestId + 1
    setGeneration((prev) => ({ ...prev, result: '', isGenerating: true, requestId }))

    const attemptModels = Array.from(new Set([selectedModelId, FALLBACK_MODEL_BY_PROVIDER[generationProvider]].filter(Boolean)))

    let lastError: unknown = null

    for (const modelId of attemptModels) {
      try {
        const payload: AIGeneratePayload = {
          project_id: projectId,
          chapter_id: chapterId,
          text: activeForm.plainText,
          instruction: generation.instruction,
          model_provider: generationProvider,
          model_id: modelId,
        }

        await streamGenerate(payload, (chunk) => {
          setGeneration((prev) => {
            if (prev.requestId !== requestId || !prev.isGenerating) {
              return prev
            }

            return {
              ...prev,
              result: `${prev.result}${chunk}`,
              modelId,
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
            modelId,
          }
        })

        if (modelId !== selectedModelId) {
          toast.success(`当前模型不可用，已自动切换到 ${modelId}`)
        }

        return
      } catch (error) {
        lastError = error
      }
    }

    setGeneration((prev) => {
      if (prev.requestId !== requestId) {
        return prev
      }

      return {
        ...prev,
        isGenerating: false,
      }
    })
    toast.error(lastError instanceof Error ? lastError.message : 'AI 续写失败')
  }

  function handleAcceptGeneratedText() {
    if (!generation.result.trim()) {
      return
    }

    const mergedText = activeForm.plainText.trim()
      ? `${activeForm.plainText.trimEnd()}\n\n${generation.result.trim()}`
      : generation.result.trim()

    setGeneration((prev) => ({ ...prev, result: '', isGenerating: false }))
    updateFormField('plainText', mergedText)
    toast.success('已追加到正文')
  }

  function handleRestoreVersion(version: ChapterVersion) {
    const restoredText = version.plain_text ?? version.content
    updateFormField('plainText', restoredText)
    setIsVersionDialogOpen(false)
    toast.success('历史版本内容已恢复到正文，可继续编辑或保存')
  }

  async function handleProviderConfigSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextModel = providerConfig.modelId.trim()
    const nextProvider = providerConfig.provider
    const nextBaseUrl = providerConfig.baseUrl.trim()
    const nextApiKey = providerConfig.apiKey.trim()

    if (!nextModel) {
      toast.error('请填写模型标识')
      return
    }

    if (!nextApiKey && !runtimeSettings?.api_key_masked) {
      toast.error('请至少填写一次 API Key')
      return
    }

    setIsSavingRuntimeSettings(true)

    try {
      const saved = await updateAIRuntimeSettings({
        provider: nextProvider,
        model_id: nextModel,
        base_url: nextBaseUrl || null,
        api_key: nextApiKey || null,
      })

      setRuntimeSettings(saved)
      setGeneration((prev) => ({
        ...prev,
        provider: saved.provider,
        modelId: saved.model_id,
        result: '',
      }))
      setProviderConfig({
        provider: saved.provider,
        modelId: saved.model_id,
        baseUrl: saved.base_url ?? '',
        apiKey: '',
      })
      setIsProviderConfigOpen(false)
      toast.success(nextApiKey ? 'AI 运行时配置已更新，后端已立即切换到新配置' : 'AI 运行时配置已更新，沿用已保存的 API Key')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '更新 AI 运行时配置失败')
    } finally {
      setIsSavingRuntimeSettings(false)
    }
  }

  const activeForm = chapter ? drafts[chapter.id] ?? buildEditorForm(chapter) : buildEditorForm(null)
  const isDirty = chapter ? (dirtyChapterIds[chapter.id] ?? false) : false
  const shouldBlockNavigation = Boolean(chapter) && (isDirty || saveChapterMutation.isPending)
  const wordCount = countWords(activeForm.plainText)
  const generationProvider = generation.provider || defaultGenerationProvider
  const generationModelId = generation.modelId || defaultGenerationModelId
  const selectedModelId = generationModelId || defaultGenerationModelId

  useEffect(() => {
    if (!shouldBlockNavigation) {
      allowNextNavigationRef.current = false
      return
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [shouldBlockNavigation])

  useEffect(() => {
    if (!shouldBlockNavigation) {
      allowNextNavigationRef.current = false
      return
    }

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) {
        return
      }

      const anchor = target.closest('a[href]') as HTMLAnchorElement | null
      if (!anchor) {
        return
      }

      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) {
        return
      }

      const isExternal = anchor.target === '_blank' || /^https?:\/\//.test(href)
      if (isExternal) {
        return
      }

      if (allowNextNavigationRef.current) {
        allowNextNavigationRef.current = false
        return
      }

      const shouldLeave = window.confirm('当前章节还有未保存内容，确认离开当前页面吗？')
      if (!shouldLeave) {
        event.preventDefault()
        event.stopPropagation()
        return
      }

      allowNextNavigationRef.current = true
    }

    document.addEventListener('click', handleDocumentClick, true)
    return () => {
      document.removeEventListener('click', handleDocumentClick, true)
      allowNextNavigationRef.current = false
    }
  }, [shouldBlockNavigation])

  if (!projectId || !chapterId) {
    return (
      <EmptyState
        title="编辑器路由参数缺失"
        description="当前页面缺少项目或章节标识，无法打开编辑器。"
        action={
          <Link
            to="/"
            className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            返回首页
          </Link>
        }
      />
    )
  }

  if (projectQuery.isLoading) {
    return <LoadingState label="正在加载章节编辑器..." />
  }

  if (projectQuery.isError || !projectQuery.data) {
    return (
      <EmptyState
        title="编辑器加载失败"
        description={projectQuery.error?.message || '未能获取项目数据。'}
        action={
          <Button variant="outline" onClick={() => projectQuery.refetch()}>
            重新加载
          </Button>
        }
      />
    )
  }

  if (!chapter) {
    return (
      <EmptyState
        title="未找到对应章节"
        description="该章节可能已被删除，或路由参数不正确。"
        action={
          <Button variant="outline" onClick={() => navigate(`/projects/${projectId}`)}>
            返回项目工作台
          </Button>
        }
      />
    )
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="space-y-4">
        <Card className="border border-white/10 bg-white/6">
          <CardHeader className="gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <Link to={`/projects/${projectId}`} className="inline-flex items-center gap-1 hover:text-white">
                    <ChevronLeft className="size-4" />
                    返回工作台
                  </Link>
                  <span>·</span>
                  <span>{projectQuery.data.title}</span>
                </div>
                <CardTitle className="text-2xl text-white">章节编辑器</CardTitle>
                <CardDescription>当前使用基础文本编辑方案，为后续富文本编辑器接入保留边界。也可以从统一 AI 工具箱查看能力分组与后续路线。</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <StatusBadge status={chapter.status} />
                <span className="rounded-full border border-white/10 px-3 py-1">{wordCount} 字</span>
                <span>最近更新 {formatDate(chapter.updated_at)}</span>
                <Button variant="outline" size="sm" onClick={() => setIsVersionDialogOpen(true)}>
                  <History className="size-4" />
                  版本历史
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-200" htmlFor="chapter-title">
                  章节标题
                </label>
                <Input id="chapter-title" value={activeForm.title} onChange={handleTitleChange} maxLength={200} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-200">章节状态</label>
                <Select value={activeForm.status} onValueChange={handleStatusChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择章节状态" />
                  </SelectTrigger>
                  <SelectContent>
                    {CHAPTER_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="chapter-content">
                正文内容
              </label>
              <Textarea
                id="chapter-content"
                value={activeForm.plainText}
                onChange={handlePlainTextChange}
                rows={20}
                placeholder="在这里开始撰写章节正文，后续将升级为正式富文本编辑器。"
                className="min-h-[520px] leading-7"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="chapter-notes">
                章节备注
              </label>
              <Textarea
                id="chapter-notes"
                value={activeForm.notes}
                onChange={handleNotesChange}
                rows={5}
                placeholder="记录当前章节目标、伏笔提醒或 AI 指令草稿。"
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-white/10 bg-white/4">
            <div className="text-xs text-slate-400">
              {saveChapterMutation.isPending
                ? '正在保存...'
                : isDirty
                  ? '已修改，等待自动保存；离开页面时会提醒保存风险'
                  : '内容已同步'}
            </div>
            <Button onClick={handleManualSave} disabled={saveChapterMutation.isPending}>
              {saveChapterMutation.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
              手动保存
            </Button>
          </CardFooter>
        </Card>

        <Card className="border border-primary/20 bg-primary/5">
          <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="text-sm font-medium text-white">需要更多 AI 写作能力？</div>
              <p className="text-sm leading-6 text-slate-300">
                可前往统一的 AI 工具箱查看续写、改写、润色与设定辅助的整体规划，再返回当前章节继续工作。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to={`/ai-toolbox?task=continue&projectId=${projectId}&chapterId=${chapterId}`}
                className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
              >
                打开续写任务
              </Link>
              <Link
                to={`/ai-toolbox?task=rewrite&projectId=${projectId}&chapterId=${chapterId}`}
                className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-transparent px-4 text-sm font-medium text-white transition hover:bg-white/10"
              >
                打开改写任务
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>

      <aside className="space-y-4">
        <Card className="border border-white/10 bg-white/6">
          <CardHeader className="space-y-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg text-white">
                <Sparkles className="size-5 text-primary" />
                AI 写作工作台
              </CardTitle>
              <CardDescription>把运行时配置、任务配置、生成结果与后续动作分层组织，降低认知切换成本。</CardDescription>
            </div>

            <div className="grid gap-3">
              <AiPanelInfoCard
                title="后端当前运行配置"
                tone="success"
                description="这里显示系统当前默认生效的 AI 运行时配置，只有保存运行时默认值后才会更新。"
                items={[
                  `提供商：${runtimeSettings?.provider ?? '-'}`,
                  `默认模型：${runtimeSettings?.model_id ?? '-'}`,
                  `来源：${runtimeSettings?.source === 'database' ? '运行时配置接口' : '环境变量'}`,
                  runtimeSettings?.api_key_masked ? `Key：${runtimeSettings.api_key_masked}` : 'Key：未展示',
                ]}
              />
              <AiPanelInfoCard
                title="本次任务使用配置"
                description="点击开始生成时，请求会使用这里的提供商与模型；切换模型只影响下一次任务。"
                items={[`提供商：${generationProvider}`, `模型：${selectedModelId || '未填写'}`]}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsProviderConfigOpen(true)}>
                配置运行时默认值
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  setIsLoadingModels(true)
                  try {
                    const response = await listAIRuntimeModels()
                    setAvailableModels(response.models)
                    toast.success(`已获取 ${response.models.length} 个可用模型，可点击下方直接用于下一次续写`)
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : '获取模型列表失败')
                  } finally {
                    setIsLoadingModels(false)
                  }
                }}
                disabled={isLoadingModels}
              >
                {isLoadingModels ? '获取中...' : '获取可选模型'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-white">
                <WandSparkles className="size-4 text-primary" />
                AI 任务配置
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-200">模型提供商</label>
                  <Select
                    value={generationProvider}
                    onValueChange={(value) => {
                      setGeneration((prev) => ({
                        ...prev,
                        result: '',
                        provider: value,
                        modelId: prev.modelId || selectedModelId,
                      }))
                    }}
                  >
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
                  <label className="text-sm font-medium text-slate-200" htmlFor="generation-model-id">本次续写模型</label>
                  <Input
                    id="generation-model-id"
                    value={selectedModelId}
                    onChange={(event) => setGeneration((prev) => ({ ...prev, result: '', modelId: event.target.value }))}
                    placeholder="支持手动输入任意模型名，例如 openai/gpt-5.4"
                  />
                  <div className="text-xs leading-5 text-slate-400">
                    这里只影响下一次点击“开始 AI 续写”的请求，不会自动改动上方后端默认配置。
                  </div>
                  {availableModels.length > 0 ? (
                    <div className="rounded-xl border border-white/10 bg-black/10 p-3 text-xs text-slate-300">
                      <div className="mb-2">点击下方模型，直接设为“本次续写模型”：</div>
                      <div className="flex flex-wrap gap-2">
                        {availableModels.slice(0, 20).map((model) => {
                          const isSelected = model.id === selectedModelId

                          return (
                            <button
                              key={model.id}
                              type="button"
                              className={`rounded-full border px-3 py-1 transition ${
                                isSelected
                                  ? 'border-primary bg-primary/20 text-white'
                                  : 'border-white/10 hover:border-primary hover:text-white'
                              }`}
                              onClick={() => {
                                setGeneration((prev) => ({ ...prev, result: '', modelId: model.id }))
                                toast.success(`下一次续写将使用模型：${model.id}`)
                              }}
                            >
                              {model.id}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-white/10 bg-black/5 p-3 text-xs leading-5 text-slate-400">
                      还没有加载模型列表。点击上方“获取可选模型”后，可直接点选模型用于下一次续写。
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-200" htmlFor="ai-instruction">
                  续写指令
                </label>
                <Textarea
                  id="ai-instruction"
                  value={generation.instruction}
                  onChange={(event) => setGeneration((prev) => ({ ...prev, result: '', instruction: event.target.value }))}
                  rows={5}
                  placeholder="描述续写目标、情绪、节奏或限制条件。"
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <Button className="flex-1" onClick={handleGenerate} disabled={generation.isGenerating || saveChapterMutation.isPending}>
                  {generation.isGenerating ? <LoaderCircle className="size-4 animate-spin" /> : <Bot className="size-4" />}
                  {generation.isGenerating ? '生成中...' : '开始 AI 续写'}
                </Button>
                <Button variant="outline" onClick={handleStopGeneration} disabled={!generation.isGenerating}>
                  停止生成
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-white/6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-white">
              <FileText className="size-5 text-primary" />
              结果与处理
            </CardTitle>
            <CardDescription>先预览生成结果，再决定接受、丢弃或继续生成下一版。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="min-h-[260px] rounded-2xl border border-white/10 bg-black/10 p-4 text-sm leading-7 text-slate-200 whitespace-pre-wrap">
              {generation.result || 'AI 续写结果会显示在这里。'}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <AiPanelInfoCard
                title="当前状态"
                description={generation.isGenerating ? '模型正在持续输出中。' : '等待你发起下一次生成。'}
                items={[
                  generation.isGenerating ? '生成状态：进行中' : '生成状态：空闲',
                  generation.result.trim() ? '已有结果：可追加到正文' : '已有结果：暂无',
                ]}
              />
              <AiPanelInfoCard
                title="后续动作"
                description="接受结果会把内容追加到正文；丢弃只清空本次生成结果，不影响正文。"
                items={['动作 1：追加到正文', '动作 2：丢弃结果', '动作 3：调整指令后重新生成']}
              />
            </div>

            <Separator className="bg-white/10" />

            <div className="flex flex-wrap gap-3">
              <Button onClick={handleAcceptGeneratedText} disabled={!generation.result.trim() || generation.isGenerating}>
                追加到正文
              </Button>
              <Button variant="outline" onClick={handleDiscardGeneratedText} disabled={!generation.result.trim() && !generation.isGenerating}>
                丢弃结果
              </Button>
            </div>
          </CardContent>
        </Card>
      </aside>

      <Dialog
        open={isProviderConfigOpen}
        onOpenChange={(open) => {
          setIsProviderConfigOpen(open)
          if (open && runtimeSettings) {
            setProviderConfig({
              provider: runtimeSettings.provider,
              modelId: runtimeSettings.model_id,
              baseUrl: runtimeSettings.base_url ?? '',
              apiKey: '',
            })
          }
        }}
      >
        <DialogContent className="max-w-2xl border border-white/10 bg-slate-950 text-slate-100">
          <DialogHeader>
            <DialogTitle>AI 运行时配置</DialogTitle>
            <DialogDescription>
              这里会直接调用后端运行时配置接口。保存后立即生效，新的 AI 续写请求会使用这套配置。
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleProviderConfigSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-200">模型提供商</label>
                <Select
                  value={providerConfig.provider}
                  onValueChange={(value) =>
                    setProviderConfig((prev) => ({
                      ...prev,
                      provider: value,
                    }))
                  }
                >
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
                <label className="text-sm font-medium text-slate-200" htmlFor="provider-model-id">
                  模型标识
                </label>
                <Input
                  id="provider-model-id"
                  value={providerConfig.modelId}
                  onChange={(event) => setProviderConfig((prev) => ({ ...prev, modelId: event.target.value }))}
                  placeholder="支持手动填写任意模型名，例如 openai/gpt-5.4"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="provider-base-url">
                OpenAI 兼容 Base URL
              </label>
              <Input
                id="provider-base-url"
                value={providerConfig.baseUrl}
                onChange={(event) => setProviderConfig((prev) => ({ ...prev, baseUrl: event.target.value }))}
                placeholder="例如 https://onehub.235.transcengram.com/v1"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="provider-api-key">
                API Key
              </label>
              <Input
                id="provider-api-key"
                type="password"
                value={providerConfig.apiKey}
                onChange={(event) => setProviderConfig((prev) => ({ ...prev, apiKey: event.target.value }))}
                placeholder={runtimeSettings?.api_key_masked ? '留空则沿用当前已保存的 API Key' : '首次保存时必须填写 API Key'}
              />
              {runtimeSettings?.api_key_masked ? (
                <div className="text-xs text-slate-400">
                  当前后端已保存 Key：{runtimeSettings.api_key_masked}。出于安全原因，弹窗再次打开时不会回填明文。
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs leading-6 text-emerald-100 space-y-2">
              <div>当前保存的是单租户全局 AI 运行时配置。保存成功后，后端 [`/api/ai/runtime-settings`](backend/app/api/routes/runtime_settings.py) 会立即成为新的生效配置源。</div>
              <div>模型名不再限制死为内置选项。你可以手动填写任意第三方中转站支持的模型名，也可以在保存配置后点击“自动获取模型”从 [`/v1/models`](backend/app/api/routes/runtime_settings.py:58) 拉取可用模型。</div>
            </div>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setIsProviderConfigOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={isSavingRuntimeSettings}>
                {isSavingRuntimeSettings ? '保存中...' : '保存并立即生效'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isVersionDialogOpen} onOpenChange={setIsVersionDialogOpen}>
        <DialogContent className="max-w-3xl border border-white/10 bg-slate-950 text-slate-100">
          <DialogHeader>
            <DialogTitle>章节版本历史</DialogTitle>
            <DialogDescription>展示当前章节保存前自动生成的历史快照，可用于快速回看最近变更。</DialogDescription>
          </DialogHeader>

          <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-2">
            {chapterVersionsQuery.isLoading ? (
              <LoadingState label="正在加载历史版本..." />
            ) : chapterVersionsQuery.isError ? (
              <EmptyState
                title="历史版本加载失败"
                description={chapterVersionsQuery.error?.message || '未能获取章节历史版本。'}
                action={
                  <Button variant="outline" onClick={() => chapterVersionsQuery.refetch()}>
                    重新加载
                  </Button>
                }
              />
            ) : chapterVersionsQuery.data && chapterVersionsQuery.data.length > 0 ? (
              chapterVersionsQuery.data.map((version) => (
                <Card key={version.id} className="border border-white/10 bg-white/5">
                  <CardHeader className="space-y-2">
                    <CardTitle className="text-base text-white">{formatDate(version.created_at)}</CardTitle>
                    <CardDescription>
                      {version.change_note || '自动保存快照'} · {version.word_count ?? countWords(version.plain_text ?? version.content)} 字
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-7 text-slate-200">
                      {version.plain_text || version.content}
                    </div>
                    <div className="flex justify-end">
                      <Button variant="outline" onClick={() => handleRestoreVersion(version)}>
                        恢复到正文
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <EmptyState title="暂无历史版本" description="当前章节还没有生成可查看的版本快照。" />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AiPanelInfoCard({
  title,
  description,
  items,
  tone = 'default',
}: {
  title: string
  description: string
  items: string[]
  tone?: 'default' | 'success'
}) {
  const toneClassName =
    tone === 'success'
      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-50'
      : 'border-white/10 bg-black/10 text-slate-200'

  return (
    <div className={`rounded-2xl border p-4 text-sm ${toneClassName}`}>
      <div className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-300">{title}</div>
        <p className="text-xs leading-5 text-slate-400">{description}</p>
        <div className="space-y-1.5">
          {items.map((item) => (
            <div key={item} className="leading-6">
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
