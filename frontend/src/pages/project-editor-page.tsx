import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { BookBookmark, CaretDown, CaretLeft, CaretRight, ClockClockwise, Spinner, ArrowClockwise, FloppyDisk, PaperPlaneRight, Sparkle } from '@phosphor-icons/react'
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
  EDITOR_AI_PREVIEW_EVENT,
  readEditorAIPreviewContext,
  writeEditorAIDraftContext,
  type EditorAICommand,
  type EditorAIPreviewContext,
} from '@/lib/editor-ai-bridge'
import { writeEditorRouteContext } from '@/lib/editor-route-context'
import { writeEditorUtilityContext, type EditorUtilityAction } from '@/lib/editor-utility-context'
import { formatDate } from '@/lib/format'
import { queryClient } from '@/lib/query-client'
import { cn } from '@/lib/utils'
import { getAIRuntimeSettings, streamGenerate } from '@/services/ai'
import { writeToolboxInputDraft } from '@/lib/ai-toolbox-context'
import { getChapterMemory, getProject, listChapterVersions, refreshChapterMemory, updateChapter, updateChapterMemory } from '@/services/projects'
import type { AIGeneratePayload, Chapter, ChapterMemory, ChapterStatus, ChapterVersion, ProjectDetail } from '@/types/api'

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
    defaultInstruction: '请从角色设定、世界规则、叙事逻辑和时间线四个角度检查这段内容，列出冲突点和修改建议。最后请单独使用“建议替换文本：”这个小节给出可以直接替换原文的终稿版本，不要把分析过程写进这个小节。',
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

function stripLeadingMarkdownDecorators(text: string) {
  return text
    .replace(/^\s*```[\w-]*\s*/u, '')
    .replace(/\s*```\s*$/u, '')
    .split('\n')
    .map((line) => line.replace(/^\s*>\s?/u, ''))
    .join('\n')
    .trim()
}

function splitTextBlocks(text: string) {
  return text
    .split(/\n\s*\n/u)
    .map((block) => block.trim())
    .filter(Boolean)
}

function isExplanationLikeBlock(block: string) {
  const normalized = block.replace(/\s+/g, '')
  const cues = [
    '你提供的文本似乎不完整',
    '您提供的文本似乎不完整',
    '根据上下文',
    '我推测',
    '以下是',
    '补全并润色的版本',
    '改写版本',
    '润色版本',
    '扩写版本',
    '如果这不是您想要',
    '如果这不是你想要',
    '请提供完整',
    '我会为您进行更全面',
  ]

  return cues.some((cue) => normalized.includes(cue.replace(/\s+/g, '')))
}

function extractBetweenDividers(text: string) {
  const lines = text.split('\n')
  const dividerIndexes = lines
    .map((line, index) => (/^\s*[-*_]{3,}\s*$/u.test(line) ? index : -1))
    .filter((index) => index >= 0)

  for (let index = 0; index < dividerIndexes.length - 1; index += 1) {
    const start = dividerIndexes[index] + 1
    const end = dividerIndexes[index + 1]
    const candidate = lines.slice(start, end).join('\n').trim()
    if (candidate) {
      return candidate
    }
  }

  return ''
}

function extractConsistencyReplacementText(result: string) {
  const normalized = result.replace(/\r\n/g, '\n').trim()
  if (!normalized) {
    return ''
  }

  const markers = [
    '建议替换文本',
    '建议将该段修改为',
    '建议改为',
    '可直接替换为',
    '修改后文本',
    '修正后文本',
    '改写如下',
  ]

  for (const marker of markers) {
    const markerIndex = normalized.lastIndexOf(marker)
    if (markerIndex < 0) {
      continue
    }

    let candidate = normalized.slice(markerIndex + marker.length)
    candidate = candidate.replace(/^[：:\s]+/u, '').trim()
    if (!candidate) {
      continue
    }

    const lines = candidate.split('\n')
    const collected: string[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {
        if (collected.length > 0) {
          break
        }
        continue
      }

      if (collected.length > 0 && /^(#{1,6}\s|[-*_]{3,}\s*$|\*\*[^*]+\*\*[:：]?$)/u.test(trimmed)) {
        break
      }

      collected.push(line)
    }

    const extracted = stripLeadingMarkdownDecorators(collected.join('\n'))
    if (extracted) {
      return extracted
    }
  }

  return ''
}

function extractBubbleReplacementText(action: SelectionAction | undefined, result: string) {
  const normalized = stripLeadingMarkdownDecorators(result.replace(/\r\n/g, '\n').trim())
  if (!normalized) {
    return ''
  }

  if (action === 'consistency') {
    return extractConsistencyReplacementText(normalized) || normalized
  }

  const betweenDividers = stripLeadingMarkdownDecorators(extractBetweenDividers(normalized))
  if (betweenDividers) {
    return betweenDividers
  }

  const blocks = splitTextBlocks(normalized)
  if (blocks.length <= 1) {
    return normalized
  }

  let start = 0
  let end = blocks.length

  while (start < end && isExplanationLikeBlock(blocks[start])) {
    start += 1
  }

  while (end > start && isExplanationLikeBlock(blocks[end - 1])) {
    end -= 1
  }

  const candidate = blocks.slice(start, end).join('\n\n').trim()
  return candidate || normalized
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
  const [isMemoryPanelOpen, setIsMemoryPanelOpen] = useState(false)
  const [chapterMemory, setChapterMemory] = useState<ChapterMemory | null>(null)
  const [isMemoryLoading, setIsMemoryLoading] = useState(false)
  const [memorySummaryDraft, setMemorySummaryDraft] = useState('')
  const [isCompletingChapter, setIsCompletingChapter] = useState(false)
  const [bubbleDialog, setBubbleDialog] = useState<BubbleDialogState | null>(null)
  const [aiPreview, setAIPreview] = useState<EditorAIPreviewContext | null>(() =>
    typeof window === 'undefined' ? null : readEditorAIPreviewContext(),
  )
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
      saveMode: 'auto' | 'manual'
    }) => {
      return updateChapter(targetChapterId, {
        title: payload.title.trim(),
        status: payload.status,
        plain_text: payload.plainText,
        content: payload.contentHtml,
        notes: payload.notes.trim() || null,
      })
    },
    onSuccess: async (updatedChapter: Chapter, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      setDrafts((prev) => ({
        ...prev,
        [updatedChapter.id]: buildEditorForm(updatedChapter),
      }))
      setDirtyChapterIds((prev) => ({
        ...prev,
        [updatedChapter.id]: false,
      }))
      if (variables.saveMode === 'manual') {
        toast.success('章节已保存')
      }
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

  useEffect(() => {
    setChapterMemory(null)
    setMemorySummaryDraft('')
    setIsMemoryLoading(false)
  }, [chapterId])

  useEffect(() => {
    if (!chapterId || !isMemoryPanelOpen) {
      return
    }

    let cancelled = false
    setIsMemoryLoading(true)

    void getChapterMemory(chapterId)
      .then((memory) => {
        if (cancelled) return
        setChapterMemory(memory)
        setMemorySummaryDraft(memory?.summary_short ?? '')
      })
      .catch(() => {
        if (cancelled) return
        toast.error('加载章节记忆失败')
      })
      .finally(() => {
        if (cancelled) return
        setIsMemoryLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [chapterId, isMemoryPanelOpen])

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
        saveMode: 'auto',
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

  async function handleOpenMemoryPanel() {
    if (!chapterId) return
    setIsMemoryPanelOpen(true)
  }

  async function handleRefreshMemory() {
    if (!chapterId) return
    setIsMemoryLoading(true)
    try {
      const memory = await refreshChapterMemory(chapterId)
      setChapterMemory(memory)
      setMemorySummaryDraft(memory.summary_short ?? '')
      toast.success('章节记忆已重新生成')
    } catch {
      toast.error('记忆生成失败')
    } finally {
      setIsMemoryLoading(false)
    }
  }

  async function handleSaveMemory() {
    if (!chapterId || !chapterMemory) return
    try {
      const updated = await updateChapterMemory(chapterId, { summary_short: memorySummaryDraft || null })
      setChapterMemory(updated)
      toast.success('章节记忆已保存')
    } catch {
      toast.error('保存失败')
    }
  }

  async function handleDeleteMemoryItem(field: keyof ChapterMemory, index: number) {
    if (!chapterId || !chapterMemory) return
    const list = chapterMemory[field] as Record<string, unknown>[]
    const updated = list.filter((_, i) => i !== index)
    try {
      const result = await updateChapterMemory(chapterId, { [field]: updated })
      setChapterMemory(result)
    } catch {
      toast.error('删除失败')
    }
  }

  async function handleCompleteChapter() {
    if (!chapterId || !chapter) return
    setIsCompletingChapter(true)
    try {
      let updatedChapter = await updateChapter(chapterId, { status: 'done' })
      if (!updatedChapter.summary) {
        const memory = chapterMemory ?? (await getChapterMemory(chapterId))
        if (memory?.summary_short) {
          updatedChapter = await updateChapter(chapterId, { summary: memory.summary_short })
        }
      }
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      updateFormField('status', 'done')
      toast.success('本章已标记为已定稿')
    } catch {
      toast.error('操作失败')
    } finally {
      setIsCompletingChapter(false)
    }
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
      model_provider: runtimeSettingsQuery.data?.provider ?? null,
      model_id: runtimeSettingsQuery.data?.model_id ?? null,
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
      const replacementText = extractBubbleReplacementText(bubbleDialog?.action, bubbleGen.result) || bubbleGen.result.trim()

      const applied = editorRef.current?.applyGeneratedText({
        text: replacementText,
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
      saveMode: 'manual',
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
    function handleAIPreview(event: Event) {
      const customEvent = event as CustomEvent<EditorAIPreviewContext | null>
      const preview = customEvent.detail

      if (!preview) {
        setAIPreview(null)
        return
      }

      if (preview.projectId !== projectId || preview.chapterId !== chapter?.id) {
        return
      }

      setAIPreview(preview)
    }

    window.addEventListener(EDITOR_AI_PREVIEW_EVENT, handleAIPreview as EventListener)
    return () => {
      window.removeEventListener(EDITOR_AI_PREVIEW_EVENT, handleAIPreview as EventListener)
    }
  }, [chapter?.id, projectId])

  useEffect(() => {
    function handleAICommand(event: Event) {
      const customEvent = event as CustomEvent<EditorAICommand>
      const command = customEvent.detail
      if (!command || command.projectId !== projectId || command.chapterId != chapter?.id) {
        return
      }

      if (command.type === 'discard-generated-text') {
        setAIPreview(null)
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
          setAIPreview(null)
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
      setAIPreview(null)
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
        <Card className="overflow-hidden border border-border bg-background shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          <CardHeader className="gap-5 border-b border-border bg-sidebar/80 px-6 py-5">
            <div className="space-y-4">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Link to={`/projects/${projectId}`} className="inline-flex items-center gap-1 text-muted-foreground transition hover:text-foreground">
                    <CaretLeft className="size-4" />
                    返回工作台
                  </Link>
                  <span>·</span>
                  <span>{projectQuery.data.title}</span>
                </div>
                <div className="space-y-3">
                  <div className="min-w-0 space-y-3 text-center">
                    <input
                      value={activeForm.title}
                      onChange={(event) => updateFormField('title', event.target.value)}
                      placeholder="未命名章节"
                      maxLength={200}
                      className="w-full border-none bg-transparent px-0 text-center text-3xl font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground md:text-4xl"
                    />
                    <div className="flex flex-col items-center justify-center gap-x-3 gap-y-2 text-sm text-muted-foreground sm:flex-row">
                      <div className="relative" ref={statusMenuRef}>
                        <button
                          type="button"
                          onClick={() => setIsStatusMenuOpen((open) => !open)}
                          className="inline-flex h-8 items-center gap-2 rounded-full border border-border/80 bg-background px-3 text-sm font-medium text-foreground transition hover:border-primary/35 hover:bg-background"
                        >
                          <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
                            {getChapterStatusLabel(activeForm.status)}
                          </span>
                          <CaretDown
                            className={cn('size-4 text-muted-foreground transition', isStatusMenuOpen && 'rotate-180')}
                          />
                        </button>
                        {isStatusMenuOpen ? (
                          <div className="absolute left-0 top-[calc(100%+10px)] z-20 min-w-[220px] rounded-xl border border-border bg-popover/98 p-2 text-sm text-popover-foreground shadow-[0_1px_3px_rgba(0,0,0,0.04)] backdrop-blur">
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
                      <span className="text-sm text-muted-foreground/90">{'最近更新 '}{formatDate(chapter.updated_at)}</span>
                      {activeForm.status !== 'done' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-10 shrink-0 rounded-xl border-border bg-background px-4 text-foreground/85"
                          onClick={handleCompleteChapter}
                          disabled={isCompletingChapter}
                        >
                          {isCompletingChapter ? <Spinner className="size-4 animate-spin" /> : <BookBookmark className="size-4" />}
                          {'完成本章'}
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-10 shrink-0 rounded-xl border-border bg-background px-4 text-foreground/85"
                        onClick={() => setIsVersionDialogOpen(true)}
                      >
                        <ClockClockwise className="size-4" />
                        {'版本历史'}
                      </Button>
                    </div>
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
                previewText={aiPreview?.text ?? ''}
                isPreviewStreaming={aiPreview?.isStreaming ?? false}
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
                className="bg-card shadow-sm"
                placeholder="从这里开始写正文。右侧 AI 面板和参考抽屉作为辅助层存在，不再挤占主写作空间。"
              />
            </section>

            <section className="border-t border-border px-6 py-6">
              <label className="mb-1 block text-sm font-medium text-foreground/85" htmlFor="chapter-notes">
                章节备注
              </label>
              <p className="mb-3 text-xs leading-5 text-muted-foreground">
                会作为「作者意图」注入 AI 续写和记忆检索，影响生成方向。适合写节奏要求、伏笔提醒、本章目标等。
              </p>
              <Textarea
                id="chapter-notes"
                value={activeForm.notes}
                onChange={handleNotesChange}
                rows={5}
                className="min-h-[132px] rounded-xl border-border bg-background text-foreground placeholder:text-muted-foreground"
                placeholder="例如：这章节奏放慢，重点写两人之间的试探；回收第 3 章密信伏笔。"
              />
            </section>

            <section className="border-t border-border px-6 py-4">
              <button
                type="button"
                className="flex w-full items-center justify-between text-sm font-medium text-foreground/85 hover:text-foreground"
                onClick={handleOpenMemoryPanel}
              >
                <span className="flex items-center gap-2">章节记忆</span>
                <CaretRight className={cn('size-4 transition-transform', isMemoryPanelOpen && 'rotate-90')} />
              </button>

              {isMemoryPanelOpen ? (
                <div className="mt-4 space-y-4">
                  {isMemoryLoading ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Spinner className="size-3.5 animate-spin" />
                      正在加载...
                    </div>
                  ) : !chapterMemory ? (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">暂无章节记忆。保存有内容的章节后，系统会自动提取记忆。</p>
                      <Button variant="outline" size="sm" className="h-8 rounded-lg px-3 text-xs" onClick={handleRefreshMemory}>
                        <ArrowClockwise className="size-3.5" />
                        立即生成
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          上次更新：{formatDate(chapterMemory.updated_at)}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 rounded-lg px-2 text-xs text-muted-foreground hover:text-foreground"
                          onClick={handleRefreshMemory}
                          disabled={isMemoryLoading}
                        >
                          <ArrowClockwise className="size-3" />
                          重新生成
                        </Button>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground/75">摘要</label>
                        <Textarea
                          value={memorySummaryDraft}
                          onChange={(e) => setMemorySummaryDraft(e.target.value)}
                          rows={3}
                          className="min-h-18 rounded-xl border-border bg-background text-sm text-foreground placeholder:text-muted-foreground"
                          placeholder="章节摘要（可编辑）"
                        />
                      </div>

                      {chapterMemory.key_events.length > 0 ? (
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-foreground/75">关键事件</label>
                          <ul className="space-y-1">
                            {chapterMemory.key_events.map((item, index) => {
                              const label = String((item as Record<string, unknown>).title ?? (item as Record<string, unknown>).summary ?? '')
                              return (
                                <li key={index} className="flex items-start justify-between gap-2 rounded-lg px-2 py-1.5 text-xs text-foreground/80 hover:bg-accent">
                                  <span className="min-w-0 flex-1 truncate">{label}</span>
                                  <button type="button" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteMemoryItem('key_events', index)}>×</button>
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      ) : null}

                      {chapterMemory.open_loops.length > 0 ? (
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-foreground/75">未解悬念</label>
                          <ul className="space-y-1">
                            {chapterMemory.open_loops.map((item, index) => {
                              const label = String((item as Record<string, unknown>).label ?? (item as Record<string, unknown>).description ?? '')
                              return (
                                <li key={index} className="flex items-start justify-between gap-2 rounded-lg px-2 py-1.5 text-xs text-foreground/80 hover:bg-accent">
                                  <span className="min-w-0 flex-1">{label}</span>
                                  <button type="button" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteMemoryItem('open_loops', index)}>×</button>
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      ) : null}

                      {chapterMemory.character_state_changes.length > 0 ? (
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-foreground/75">角色变化</label>
                          <ul className="space-y-1">
                            {chapterMemory.character_state_changes.map((item, index) => {
                              const name = String((item as Record<string, unknown>).character_id_or_name ?? '')
                              const after = String((item as Record<string, unknown>).after ?? '')
                              const label = name && after ? `${name}：${after}` : name || after
                              return (
                                <li key={index} className="flex items-start justify-between gap-2 rounded-lg px-2 py-1.5 text-xs text-foreground/80 hover:bg-accent">
                                  <span className="min-w-0 flex-1">{label}</span>
                                  <button type="button" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteMemoryItem('character_state_changes', index)}>×</button>
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      ) : null}

                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          className="h-8 rounded-lg px-3 text-xs"
                          onClick={handleSaveMemory}
                        >
                          保存记忆
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
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
              {saveChapterMutation.isPending ? <Spinner className="size-4 animate-spin" /> : <FloppyDisk className="size-4" />}
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
                    <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-muted/45 p-4 text-sm leading-7 text-foreground/85">
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
              <div className="rounded-xl border border-border bg-muted/45 px-4 py-3">
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
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3">
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
                    ? <><Spinner className="size-4 animate-spin" />生成中...</>
                    : <><Sparkle className="size-4" />{bubbleGen.result.trim() ? '重新生成' : '开始生成'}</>}
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
                      <PaperPlaneRight className="size-4" />
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
