import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Bot, ChevronLeft, LoaderCircle, Save, Sparkles } from 'lucide-react'
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
import { formatDate } from '@/lib/format'
import { queryClient } from '@/lib/query-client'
import { streamGenerate } from '@/services/ai'
import { getProject, updateChapter } from '@/services/projects'
import type { AIGeneratePayload, Chapter, ProjectDetail } from '@/types/api'

const MODEL_PROVIDER_OPTIONS = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'Anthropic', value: 'anthropic' },
] as const

const MODEL_OPTIONS: Record<string, Array<{ label: string; value: string }>> = {
  openai: [
    { label: 'GPT-4o', value: 'gpt-4o' },
    { label: 'GPT-4o-mini', value: 'gpt-4o-mini' },
  ],
  anthropic: [
    { label: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet-latest' },
    { label: 'Claude 3 Haiku', value: 'claude-3-haiku-20240307' },
  ],
}

interface EditorFormState {
  title: string
  plainText: string
  notes: string
}

interface GenerationState {
  instruction: string
  provider: string
  modelId: string
  result: string
  isGenerating: boolean
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
      plainText: '',
      notes: '',
    }
  }

  return {
    title: chapter.title,
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

  const [drafts, setDrafts] = useState<Record<string, EditorFormState>>({})
  const [dirtyChapterIds, setDirtyChapterIds] = useState<Record<string, boolean>>({})
  const [generation, setGeneration] = useState<GenerationState>({
    instruction: defaultGenerationInstruction,
    provider: 'openai',
    modelId: 'gpt-4o',
    result: '',
    isGenerating: false,
  })

  const projectQuery = useQuery<ProjectDetail, Error>({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId ?? ''),
    enabled: Boolean(projectId),
  })

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

  function scheduleAutosave(targetChapterId: string, nextForm: EditorFormState) {
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current)
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      if (!nextForm.title.trim()) {
        return
      }

      saveChapterMutation.mutate({
        targetChapterId,
        payload: nextForm,
      })
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

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }

    setGeneration((prev) => ({ ...prev, result: '', isGenerating: true }))

    try {
      const payload: AIGeneratePayload = {
        project_id: projectId,
        chapter_id: chapterId,
        text: activeForm.plainText,
        instruction: generation.instruction,
        model_provider: generationProvider,
        model_id: selectedModelId,
      }

      await streamGenerate(payload, (chunk) => {
        setGeneration((prev) => ({
          ...prev,
          result: `${prev.result}${chunk}`,
        }))
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AI 续写失败')
    } finally {
      setGeneration((prev) => ({ ...prev, isGenerating: false }))
    }
  }

  function handleAcceptGeneratedText() {
    if (!generation.result.trim()) {
      return
    }

    const mergedText = activeForm.plainText.trim()
      ? `${activeForm.plainText.trimEnd()}\n\n${generation.result.trim()}`
      : generation.result.trim()

    setGeneration((prev) => ({ ...prev, result: '' }))
    updateFormField('plainText', mergedText)
    toast.success('已追加到正文')
  }

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

  const activeForm = chapter ? drafts[chapter.id] ?? buildEditorForm(chapter) : buildEditorForm(null)
  const isDirty = chapter ? (dirtyChapterIds[chapter.id] ?? false) : false
  const wordCount = countWords(activeForm.plainText)
  const generationProvider = generation.provider || defaultGenerationProvider
  const generationModelId = generation.modelId || defaultGenerationModelId
  const modelOptions = MODEL_OPTIONS[generationProvider] ?? MODEL_OPTIONS.openai
  const currentModelIsAvailable = modelOptions.some((option) => option.value === generationModelId)
  const selectedModelId = currentModelIsAvailable ? generationModelId : modelOptions[0]?.value ?? defaultGenerationModelId

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
                <CardDescription>当前使用基础文本编辑方案，为后续富文本编辑器接入保留边界。</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <StatusBadge status={chapter.status} />
                <span className="rounded-full border border-white/10 px-3 py-1">{wordCount} 字</span>
                <span>最近更新 {formatDate(chapter.updated_at)}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="chapter-title">
                章节标题
              </label>
              <Input id="chapter-title" value={activeForm.title} onChange={handleTitleChange} maxLength={200} />
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
              {saveChapterMutation.isPending ? '正在保存...' : isDirty ? '已修改，等待自动保存' : '内容已同步'}
            </div>
            <Button onClick={handleManualSave} disabled={saveChapterMutation.isPending}>
              {saveChapterMutation.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
              手动保存
            </Button>
          </CardFooter>
        </Card>
      </section>

      <aside className="space-y-4">
        <Card className="border border-white/10 bg-white/6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-white">
              <Sparkles className="size-5 text-primary" />
              AI 续写面板
            </CardTitle>
            <CardDescription>发送当前正文与附加指令，接收流式续写结果。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-200">模型提供商</label>
                <Select
                  value={generationProvider}
                  onValueChange={(value) => {
                    const nextModel = (MODEL_OPTIONS[value] ?? MODEL_OPTIONS.openai)[0]?.value ?? 'gpt-4o'
                    setGeneration((prev) => ({
                      ...prev,
                      result: '',
                      provider: value,
                      modelId: nextModel,
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
                <label className="text-sm font-medium text-slate-200">模型</label>
                <Select
                  value={selectedModelId}
                  onValueChange={(value) => setGeneration((prev) => ({ ...prev, result: '', modelId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择模型" />
                  </SelectTrigger>
                  <SelectContent>
                    {modelOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

            <Button className="w-full" onClick={handleGenerate} disabled={generation.isGenerating}>
              {generation.isGenerating ? <LoaderCircle className="size-4 animate-spin" /> : <Bot className="size-4" />}
              {generation.isGenerating ? '生成中...' : '开始 AI 续写'}
            </Button>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-white/6">
          <CardHeader>
            <CardTitle className="text-lg text-white">生成结果</CardTitle>
            <CardDescription>可先预览，再决定是否追加到正文。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="min-h-[260px] rounded-2xl border border-white/10 bg-black/10 p-4 text-sm leading-7 text-slate-200 whitespace-pre-wrap">
              {generation.result || 'AI 续写结果会显示在这里。'}
            </div>

            <Separator className="bg-white/10" />

            <div className="flex flex-wrap gap-3">
              <Button onClick={handleAcceptGeneratedText} disabled={!generation.result.trim() || generation.isGenerating}>
                追加到正文
              </Button>
              <Button
                variant="outline"
                onClick={() => setGeneration((prev) => ({ ...prev, result: '' }))}
                disabled={!generation.result.trim()}
              >
                清空结果
              </Button>
            </div>
          </CardContent>
        </Card>
      </aside>
    </div>
  )
}
