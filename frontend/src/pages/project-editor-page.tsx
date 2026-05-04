import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronLeft, History, LoaderCircle, Save, SendHorizontal, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

import { RichTextEditor, type RichTextEditorHandle } from '@/components/editor/rich-text-editor'
import { EmptyState } from '@/components/empty-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  EDITOR_AI_COMMAND_EVENT,
  writeEditorAIDraftContext,
  type EditorAICommand,
} from '@/lib/editor-ai-bridge'
import { writeEditorRouteContext } from '@/lib/editor-route-context'
import { writeEditorUtilityContext, type EditorUtilityAction } from '@/lib/editor-utility-context'
import { formatDate } from '@/lib/format'
import { queryClient } from '@/lib/query-client'
import { cn } from '@/lib/utils'
import { getAIRuntimeSettings, streamGenerate } from '@/services/ai'
import { writeToolboxInputDraft } from '@/lib/ai-toolbox-context'
import { getProject, listChapterVersions, updateChapter } from '@/services/projects'
import type { AIGeneratePayload, Chapter, ChapterStatus, ChapterVersion, ProjectDetail } from '@/types/api'

const CHAPTER_STATUS_OPTIONS: Array<{ label: string; value: ChapterStatus }> = [
  { label: '草稿', value: 'draft' },
  { label: '写作中', value: 'writing' },
  { label: '待审阅', value: 'review' },
  { label: '已定稿', value: 'done' },
]

interface EditorFormState {
  title: string
  status: ChapterStatus
  contentHtml: string
  plainText: string
  notes: string
}

type SelectionAction = EditorUtilityAction
const TOOLBOX_RESULT_DRAFT_KEY = 'storyweave.toolbox-result-draft'

type ToolboxTaskType = 'continue' | 'rewrite' | 'consistency'
type ToolboxDraftApplyMode = 'append' | 'replace'

interface ToolboxResultDraft {
  projectId: string
  chapterId: string
  task: ToolboxTaskType
  result: string
  sourceInput: string
  createdAt: string
  mode: ToolboxDraftApplyMode
}

const BUBBLE_ACTION_META: Record<EditorUtilityAction, { label: string; defaultInstruction: string }> = {
  polish: {
    label: 'AI 润色',
    defaultInstruction: '请对这段文字进行润色，让语言更流畅自然，保持原有风格和意思不变。',
  },
  expand: {
    label: '扩写',
    defaultInstruction: '请围绕这段文字扩写，补足细节、情绪和动作，保持与当前章节风格一致。',
  },
  rewrite: {
    label: '改写',
    defaultInstruction: '请在不改变核心情节的前提下改写这段文字，让语言更顺、节奏更稳，并保留人物口吻。',
  },
  consistency: {
    label: '一致性检查',
    defaultInstruction: '请从角色设定、世界规则、叙事逻辑和时间线四个角度检查这段内容，列出冲突点和修改建议。',
  },
}

interface BubbleDialogState {
  action: EditorUtilityAction
  selectedText: string
}

interface BubbleGenState {
  instruction: string
  result: string
  isGenerating: boolean
  requestId: number
}

function getChapterStatusLabel(status: ChapterStatus) {
  return CHAPTER_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? '草稿'
}

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
      contentHtml: plainTextToHtml(''),
      plainText: '',
      notes: '',
    }
  }

  return {
    title: chapter.title,
    status: (chapter.status as ChapterStatus) ?? 'draft',
    contentHtml: normalizeChapterContent(chapter.content, chapter.plain_text),
    plainText: chapter.plain_text ?? '',
    notes: chapter.notes ?? '',
  }
}

function countWords(text: string) {
  return text.replace(/\s+/g, '').length
}

function escapeHtml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function plainTextToHtml(text: string) {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) {
    return '<p></p>'
  }

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
    .join('')
}

function isLikelyHtml(value: string | null | undefined) {
  return Boolean(value && /<\/?[a-z][\s\S]*>/i.test(value))
}

function normalizeChapterContent(content: string | null | undefined, plainText: string | null | undefined) {
  if (isLikelyHtml(content)) {
    return content as string
  }

  return plainTextToHtml(plainText ?? content ?? '')
}

export function ProjectEditorPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { projectId, chapterId } = useParams<{ projectId: string; chapterId: string }>()
  const autosaveTimerRef = useRef<number | null>(null)
  const allowNextNavigationRef = useRef(false)
  const editorRef = useRef<RichTextEditorHandle | null>(null)
  const statusMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current)
      }
    }
  }, [])

  const [drafts, setDrafts] = useState<Record<string, EditorFormState>>({})
  const [dirtyChapterIds, setDirtyChapterIds] = useState<Record<string, boolean>>({})
  const [isVersionDialogOpen, setIsVersionDialogOpen] = useState(false)
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false)
  const [bubbleDialog, setBubbleDialog] = useState<BubbleDialogState | null>(null)
  const [bubbleGen, setBubbleGen] = useState<BubbleGenState>({
    instruction: '',
    result: '',
    isGenerating: false,
    requestId: 0,
  })

  const projectQuery = useQuery<ProjectDetail, Error>({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId ?? ''),
    enabled: Boolean(projectId),
  })

  const runtimeSettingsQuery = useQuery({
    queryKey: ['ai-runtime-settings'],
    queryFn: getAIRuntimeSettings,
    staleTime: 60_000,
  })

  const chapter = useMemo(
    () => getChapterById(projectQuery.data, chapterId),
    [projectQuery.data, chapterId],
  )
  const mentionItems = useMemo(
    () =>
      (projectQuery.data?.project_characters ?? []).map((item) => ({
        id: item.character.id,
        label: item.character.name,
        personality: item.character.personality,
        projectSummary: item.summary ?? item.role_label ?? item.character.description,
        description: item.character.description,
      })),
    [projectQuery.data?.project_characters],
  )

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
        content: payload.contentHtml,
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

  function consumeToolboxDraft() {
    if (!projectId || !chapterId) {
      return null
    }

    const rawDraft = window.sessionStorage.getItem(TOOLBOX_RESULT_DRAFT_KEY)
    if (!rawDraft) {
      return null
    }

    try {
      const parsed = JSON.parse(rawDraft) as ToolboxResultDraft
      if (parsed.projectId !== projectId || parsed.chapterId !== chapterId || !parsed.result?.trim()) {
        return null
      }

      return parsed
    } catch {
      return null
    }
  }

  function clearToolboxDraft() {
    window.sessionStorage.removeItem(TOOLBOX_RESULT_DRAFT_KEY)
  }

  function applyToolboxDraft(draft: ToolboxResultDraft) {
    const nextPlainText = draft.mode === 'replace'
      ? draft.result.trim()
      : (activeForm.plainText.trim()
          ? `${activeForm.plainText.trimEnd()}\n\n${draft.result.trim()}`
          : draft.result.trim())

    if (!chapter?.id) {
      return
    }

    const next = {
      ...(drafts[chapter.id] ?? buildEditorForm(chapter)),
      contentHtml: plainTextToHtml(nextPlainText),
      plainText: nextPlainText,
    }

    setDrafts((prev) => ({
      ...prev,
      [chapter.id]: next,
    }))
    setDirtyChapterIds((prev) => ({
      ...prev,
      [chapter.id]: true,
    }))
    scheduleAutosave(chapter.id, next)
    writeEditorUtilityContext(null)
    clearToolboxDraft()
    searchParams.delete('fromToolbox')
    setSearchParams(searchParams, { replace: true })
    toast.success(draft.mode === 'replace' ? '工具箱结果已覆盖到当前草稿' : '工具箱结果已追加到当前正文草稿')
  }

  function handleEditorChange(payload: { html: string; plainText: string }) {
    if (!chapter?.id) {
      return
    }

    const baseForm = drafts[chapter.id] ?? buildEditorForm(chapter)
    const next = {
      ...baseForm,
      contentHtml: payload.html,
      plainText: payload.plainText,
    }

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

  function handleNotesChange(event: ChangeEvent<HTMLTextAreaElement>) {
    updateFormField('notes', event.target.value)
  }

  function handleStatusChange(value: string) {
    updateFormField('status', value as ChapterStatus)
  }


  function handleBubbleAction(action: SelectionAction, selectedText: string) {
    if (!projectId || !chapter?.id) {
      return
    }

    const meta = BUBBLE_ACTION_META[action]
    setBubbleDialog({ action, selectedText })
    setBubbleGen({
      instruction: meta.defaultInstruction,
      result: '',
      isGenerating: false,
      requestId: 0,
    })
  }

  async function handleBubbleGenerate() {
    if (!projectId || !chapterId || !bubbleDialog) {
      return
    }

    const requestId = bubbleGen.requestId + 1
    setBubbleGen((prev) => ({ ...prev, result: '', isGenerating: true, requestId }))

    const payload: AIGeneratePayload = {
      project_id: projectId,
      chapter_id: chapterId,
      text: bubbleDialog.selectedText,
      instruction: bubbleGen.instruction.trim() || BUBBLE_ACTION_META[bubbleDialog.action].defaultInstruction,
      model_provider: runtimeSettingsQuery.data?.provider ?? 'openai',
      model_id: runtimeSettingsQuery.data?.model_id ?? 'gpt-4o',
    }

    try {
      await streamGenerate(payload, (chunk) => {
        setBubbleGen((prev) => {
          if (prev.requestId !== requestId || !prev.isGenerating) return prev
          return { ...prev, result: `${prev.result}${chunk}` }
        })
      })
      setBubbleGen((prev) => (prev.requestId === requestId ? { ...prev, isGenerating: false } : prev))
    } catch (error) {
      setBubbleGen((prev) => (prev.requestId === requestId ? { ...prev, isGenerating: false } : prev))
      toast.error(error instanceof Error ? error.message : 'AI 生成失败')
    }
  }

  function handleBubbleApply(mode: 'replace' | 'append') {
    if (!chapter?.id || !bubbleGen.result.trim()) {
      return
    }

    if (mode === 'replace') {
      const applied = editorRef.current?.applyGeneratedText({
        text: bubbleGen.result.trim(),
        mode: 'replace-selection',
      })
      if (!applied) {
        toast.error('选区已失效，请重新选择文字后再试')
        return
      }
      setBubbleDialog(null)
      toast.success('已替换选区内容')
      return
    }

    const current = drafts[chapter.id] ?? buildEditorForm(chapter)
    const nextText = current.plainText.trim()
      ? `${current.plainText.trimEnd()}\n\n${bubbleGen.result.trim()}`
      : bubbleGen.result.trim()

    const next = {
      ...current,
      contentHtml: plainTextToHtml(nextText),
      plainText: nextText,
    }

    setDrafts((prev) => ({ ...prev, [chapter.id]: next }))
    setDirtyChapterIds((prev) => ({ ...prev, [chapter.id]: true }))
    scheduleAutosave(chapter.id, next)
    setBubbleDialog(null)
    toast.success('已追加到正文末尾')
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

  function handleRestoreVersion(version: ChapterVersion) {

    const restoredText = version.plain_text ?? version.content
    if (!chapter?.id) {
      return
    }

    const next = {
      ...(drafts[chapter.id] ?? buildEditorForm(chapter)),
      contentHtml: normalizeChapterContent(version.content, version.plain_text),
      plainText: restoredText,
    }

    setDrafts((prev) => ({
      ...prev,
      [chapter.id]: next,
    }))
    setDirtyChapterIds((prev) => ({
      ...prev,
      [chapter.id]: true,
    }))
    scheduleAutosave(chapter.id, next)
    setIsVersionDialogOpen(false)
    toast.success('历史版本内容已恢复到正文，可继续编辑或保存')
  }

  const activeForm = chapter ? drafts[chapter.id] ?? buildEditorForm(chapter) : buildEditorForm(null)
  const isDirty = chapter ? (dirtyChapterIds[chapter.id] ?? false) : false
  const shouldBlockNavigation = Boolean(chapter) && (isDirty || saveChapterMutation.isPending)

  useEffect(() => {
    if (!projectId || !chapter?.id) {
      return
    }

    writeEditorRouteContext({
      projectId,
      projectTitle: projectQuery.data?.title ?? null,
      chapterId: chapter.id,
      chapterTitle: chapter.title ?? null,
      updatedAt: new Date().toISOString(),
    })
  }, [chapter?.id, chapter?.title, projectId, projectQuery.data?.title])


  useEffect(() => {
    if (!projectId || !chapter?.id) {
      return
    }

    writeEditorAIDraftContext({
      projectId,
      chapterId: chapter.id,
      chapterTitle: chapter.title ?? null,
      plainText: activeForm.plainText,
      updatedAt: new Date().toISOString(),
    })
  }, [activeForm.plainText, chapter?.id, chapter?.title, projectId])

  useEffect(() => {
    function handleAICommand(event: Event) {
      const customEvent = event as CustomEvent<EditorAICommand>
      const command = customEvent.detail
      if (!command || command.projectId !== projectId || command.chapterId != chapter?.id) {
        return
      }

      if (command.type === 'discard-generated-text') {
        writeEditorUtilityContext(null)
        return
      }

      const nextText = command.text?.trim()
      if (!nextText || !chapter?.id) {
        return
      }

      if (command.mode === 'append-after-selection') {
        const applied = editorRef.current?.applyGeneratedText({
          text: nextText,
          mode: 'append-after-selection',
        })

        if (applied) {
          writeEditorUtilityContext(null)
          toast.success('已在选区后插入扩写结果')
          return
        }

        toast.error('当前选区已失效，请重新选择后再试')
        return
      }

      const mergedText = activeForm.plainText.trim() ? `${activeForm.plainText.trimEnd()}

${nextText}` : nextText
      const next = {
        ...(drafts[chapter.id] ?? buildEditorForm(chapter)),
        contentHtml: plainTextToHtml(mergedText),
        plainText: mergedText,
      }

      setDrafts((prev) => ({
        ...prev,
        [chapter.id]: next,
      }))
      setDirtyChapterIds((prev) => ({
        ...prev,
        [chapter.id]: true,
      }))
      scheduleAutosave(chapter.id, next)
      writeEditorUtilityContext(null)
      toast.success('已追加到正文')
    }

    window.addEventListener(EDITOR_AI_COMMAND_EVENT, handleAICommand as EventListener)
    return () => {
      window.removeEventListener(EDITOR_AI_COMMAND_EVENT, handleAICommand as EventListener)
      writeEditorUtilityContext(null)
      writeEditorAIDraftContext(null)
    }
  }, [activeForm.plainText, chapter, drafts, projectId])

  useEffect(() => {
    if (!chapter?.id || searchParams.get('fromToolbox') !== '1') {
      return
    }

    const draft = consumeToolboxDraft()
    if (!draft) {
      return
    }

    const timer = window.setTimeout(() => {
      applyToolboxDraft(draft)
    }, 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [chapter?.id, searchParams])

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

  useEffect(() => {
    if (!isStatusMenuOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!statusMenuRef.current?.contains(event.target as Node)) {
        setIsStatusMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [isStatusMenuOpen])


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
    <div className="space-y-5">
      <section className="space-y-5">
        <Card className="overflow-hidden border border-border bg-card/95 shadow-[0_18px_44px_rgba(148,163,184,0.18)]">
          <CardHeader className="gap-5 border-b border-border bg-background/72 px-6 py-5">
            <div className="space-y-4">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Link to={`/projects/${projectId}`} className="inline-flex items-center gap-1 hover:text-foreground">
                    <ChevronLeft className="size-4" />
                    返回工作台
                  </Link>
                  <span>·</span>
                  <span>{projectQuery.data.title}</span>
                </div>
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
                  <div className="min-w-0 space-y-3 md:pr-4">
                    <input
                      value={activeForm.title}
                      onChange={(event) => updateFormField('title', event.target.value)}
                      placeholder="未命名章节"
                      maxLength={200}
                      className="w-full border-none bg-transparent px-0 text-3xl font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground md:text-center md:text-4xl"
                    />
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground md:justify-center">
                      <div className="relative" ref={statusMenuRef}>
                        <button
                          type="button"
                          onClick={() => setIsStatusMenuOpen((open) => !open)}
                          className="inline-flex h-8 items-center gap-2 rounded-full border border-border/80 bg-background px-3 text-sm font-medium text-foreground transition hover:border-primary/35 hover:bg-background"
                        >
                          <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
                            {getChapterStatusLabel(activeForm.status)}
                          </span>
                          <ChevronDown
                            className={cn('size-4 text-muted-foreground transition', isStatusMenuOpen && 'rotate-180')}
                          />
                        </button>
                        {isStatusMenuOpen ? (
                          <div className="absolute left-0 top-[calc(100%+10px)] z-20 min-w-[220px] rounded-2xl border border-border bg-popover/98 p-2 text-sm text-popover-foreground shadow-[0_22px_54px_rgba(15,23,42,0.18)] backdrop-blur">
                            <div className="px-2 pb-1 pt-1 text-[11px] tracking-[0.18em] text-muted-foreground">切换章节状态</div>
                            <div className="space-y-1">
                              {CHAPTER_STATUS_OPTIONS.map((option) => {
                                const active = activeForm.status === option.value

                                return (
                                  <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => handleStatusChange(option.value)}
                                    className={cn(
                                      'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition',
                                      active ? 'bg-primary/10 text-primary' : 'text-foreground/85 hover:bg-accent hover:text-accent-foreground',
                                    )}
                                  >
                                    <span>{option.label}</span>
                                    {active ? <span className="text-xs font-medium">当前</span> : null}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <span className="text-sm text-muted-foreground/90">最近更新 {formatDate(chapter.updated_at)}</span>
                    </div>
                  </div>
                  <div className="flex justify-start md:justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 rounded-xl border-border bg-background px-4 text-foreground/85"
                      onClick={() => setIsVersionDialogOpen(true)}
                    >
                      <History className="size-4" />
                      版本历史
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-0 bg-transparent px-0 py-0">
            <section className="px-6 py-8">
              <RichTextEditor
                ref={editorRef}
                value={activeForm.contentHtml}
                mentionItems={mentionItems}
                onSelectionChange={() => {}}
                onBubbleAction={handleBubbleAction}
                onSlashCommand={(command) => {
                  writeEditorUtilityContext(null)
                  if (command === 'continue') {
                    toast.success('已切换到章节续写模式')
                    return
                  }

                  const task = command === 'consistency' ? 'consistency' : 'rewrite'
                  writeToolboxInputDraft({
                    task,
                    projectId: projectId ?? null,
                    chapterId: chapterId ?? null,
                    input: activeForm.plainText,
                    createdAt: new Date().toISOString(),
                  })
                  navigate(`/ai-toolbox?task=${task}&projectId=${projectId}&chapterId=${chapterId}`)
                }}
                onChange={handleEditorChange}
                className="bg-[#fffdfa] shadow-[0_1px_2px_rgba(16,34,53,0.04)]"
                placeholder="从这里开始写正文。右侧 AI 面板和参考抽屉作为辅助层存在，不再挤占主写作空间。"
              />
            </section>

            <section className="border-t border-border px-6 py-6">
              <label className="mb-2 block text-sm font-medium text-foreground/85" htmlFor="chapter-notes">
                章节备注
              </label>
              <Textarea
                id="chapter-notes"
                value={activeForm.notes}
                onChange={handleNotesChange}
                rows={5}
                className="min-h-[132px] rounded-2xl border-border bg-background text-foreground placeholder:text-muted-foreground"
                placeholder="记录当前章节目标、伏笔提醒或 AI 指令草稿。"
              />
            </section>
          </CardContent>
          <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background/88 px-6 py-4">
            <div className="text-xs text-muted-foreground">
              {saveChapterMutation.isPending
                ? '正在保存...'
                : isDirty
                  ? '已修改，等待自动保存；离开页面时会提醒保存风险'
                  : '内容已同步'}
            </div>
            <Button className="h-10 rounded-xl bg-primary px-4 text-primary-foreground hover:opacity-90" onClick={handleManualSave} disabled={saveChapterMutation.isPending}>
              {saveChapterMutation.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
              手动保存
            </Button>
          </CardFooter>
        </Card>

      </section>

      <Dialog open={isVersionDialogOpen} onOpenChange={setIsVersionDialogOpen}>
        <DialogContent className="max-w-3xl border border-border bg-popover text-popover-foreground">
          <DialogHeader>
            <DialogTitle>章节版本历史</DialogTitle>
            <DialogDescription>查看历史快照。</DialogDescription>
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
                <Card key={version.id} className="border border-border bg-background/90">
                  <CardHeader className="space-y-2">
                    <CardTitle className="text-base text-foreground">{formatDate(version.created_at)}</CardTitle>
                    <CardDescription>
                      {version.change_note || '自动保存快照'} · {version.word_count ?? countWords(version.plain_text ?? version.content)} 字
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-border bg-muted/45 p-4 text-sm leading-7 text-foreground/85">
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
              <EmptyState title="暂无历史版本" />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(bubbleDialog)} onOpenChange={(open) => { if (!open) setBubbleDialog(null) }}>
        <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col border border-border bg-popover text-popover-foreground">
          <DialogHeader className="shrink-0">
            <DialogTitle>{bubbleDialog ? BUBBLE_ACTION_META[bubbleDialog.action].label : ''}</DialogTitle>
            <DialogDescription>AI 将针对你选中的文字生成结果，确认后可插入正文。</DialogDescription>
          </DialogHeader>

          {bubbleDialog ? (
            <>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              <div className="rounded-2xl border border-border bg-muted/45 px-4 py-3">
                <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">选中文字</div>
                <div className="whitespace-pre-wrap text-sm leading-6 text-foreground/85">{bubbleDialog.selectedText}</div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">任务说明</label>
                <Textarea
                  value={bubbleGen.instruction}
                  onChange={(e) => setBubbleGen((prev) => ({ ...prev, instruction: e.target.value }))}
                  rows={3}
                  placeholder="描述你希望 AI 做什么"
                  disabled={bubbleGen.isGenerating}
                />
              </div>

              {bubbleGen.result.trim() ? (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3">
                  <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-emerald-600">生成结果</div>
                  <div className="whitespace-pre-wrap text-sm leading-6 text-foreground/85">{bubbleGen.result}</div>
                </div>
              ) : null}
            </div>

            <div className="shrink-0 border-t border-border pt-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => void handleBubbleGenerate()}
                  disabled={bubbleGen.isGenerating}
                  className="flex-1"
                >
                  {bubbleGen.isGenerating
                    ? <><LoaderCircle className="size-4 animate-spin" />生成中...</>
                    : <><Sparkles className="size-4" />{bubbleGen.result.trim() ? '重新生成' : '开始生成'}</>}
                </Button>
                {bubbleGen.isGenerating ? (
                  <Button variant="outline" onClick={() => setBubbleGen((prev) => ({ ...prev, isGenerating: false }))}>
                    停止
                  </Button>
                ) : null}
                {bubbleGen.result.trim() && !bubbleGen.isGenerating ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => handleBubbleApply('replace')}
                    >
                      替换选区
                    </Button>
                    <Button
                      onClick={() => handleBubbleApply('append')}
                    >
                      <SendHorizontal className="size-4" />
                      追加到正文
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
