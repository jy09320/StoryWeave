import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft, History, LoaderCircle, Save } from 'lucide-react'
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
import { writeToolboxInputDraft } from '@/lib/ai-toolbox-context'
import { writeEditorRouteContext } from '@/lib/editor-route-context'
import { writeEditorUtilityContext, type EditorUtilityAction } from '@/lib/editor-utility-context'
import { formatDate } from '@/lib/format'
import { queryClient } from '@/lib/query-client'
import { cn } from '@/lib/utils'
import { getProject, listChapterVersions, updateChapter } from '@/services/projects'
import type { Chapter, ChapterStatus, ChapterVersion, ProjectDetail } from '@/types/api'

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

  const projectQuery = useQuery<ProjectDetail, Error>({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId ?? ''),
    enabled: Boolean(projectId),
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

    if (action !== 'expand') {
      writeToolboxInputDraft({
        task: action === 'consistency' ? 'consistency' : 'rewrite',
        projectId,
        chapterId: chapter.id,
        input: selectedText,
        createdAt: new Date().toISOString(),
      })
      navigate(`/ai-toolbox?task=${action === 'consistency' ? 'consistency' : 'rewrite'}&projectId=${projectId}&chapterId=${chapter.id}`)
      return
    }

    writeEditorUtilityContext({
      projectId,
      projectTitle: projectQuery.data?.title ?? null,
      chapterId: chapter.id,
      chapterTitle: chapter.title ?? null,
      action,
      selectedText,
      updatedAt: new Date().toISOString(),
    })
    toast.success('已切换到选区扩写模式')
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
  const wordCount = countWords(activeForm.plainText)

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
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Link to={`/projects/${projectId}`} className="inline-flex items-center gap-1 hover:text-foreground">
                    <ChevronLeft className="size-4" />
                    返回工作台
                  </Link>
                  <span>·</span>
                  <span>{projectQuery.data.title}</span>
                </div>
                <div className="flex justify-center">
                  <input
                    value={activeForm.title}
                    onChange={(event) => updateFormField('title', event.target.value)}
                    placeholder="????????"
                    maxLength={200}
                    className="w-full max-w-4xl border-none bg-transparent px-0 text-center text-4xl font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                <div className="flex flex-wrap items-center gap-3 rounded-[20px] border border-border bg-background/92 px-3 py-2">
                  <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">章节状态</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {CHAPTER_STATUS_OPTIONS.map((option) => {
                      const active = activeForm.status === option.value

                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleStatusChange(option.value)}
                          className={cn(
                            'rounded-full px-3 py-1.5 text-xs font-medium transition',
                            active
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                          )}
                        >
                          {option.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <span className="rounded-full border border-border bg-background px-3 py-1.5">{wordCount} 字</span>
                <span className="rounded-full border border-border bg-background px-3 py-1.5">最近更新 {formatDate(chapter.updated_at)}</span>
                <Button variant="outline" size="sm" className="h-10 rounded-xl border-border bg-background px-4 text-foreground/85" onClick={() => setIsVersionDialogOpen(true)}>
                  <History className="size-4" />
                  版本历史
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 bg-transparent p-5">
            <div className="rounded-[24px] border border-border bg-background/92 p-5 shadow-sm">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-border bg-muted/45 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-xl bg-primary/10 px-3 py-2 text-sm font-medium text-primary">续写正文</span>
                  <span className="rounded-xl bg-background px-3 py-2 text-sm text-muted-foreground ring-1 ring-border">AI检测</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground">跨章滚动</span>
                  <span className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground">智能补全</span>
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground/85" htmlFor="chapter-content">
                  写作区
                </label>
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
                  className="border-0 bg-transparent"
                  placeholder="从这一行开始写标题后的正文。右侧的 AI 面板和参考抽屉会作为辅助层存在，不再挤占主写作区。"
                />
              </div>


            </div>

            <div className="rounded-[24px] border border-border bg-background/92 p-5 shadow-sm">
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
            </div>
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
    </div>
  )
}
