import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import {
  ArrowLeft,
  Bot,
  BookCopy,
  ChevronDown,
  ChevronRight,
  Home,
  LoaderCircle,
  LogOut,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  SendHorizontal,
  Settings2,
  Sparkles,
  Users2,
} from 'lucide-react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { ModelPickerDialog } from '@/components/ai/model-picker-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  EDITOR_AI_DRAFT_EVENT,
  writeEditorAIPreviewContext,
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
import { debugContinuationPipeline, generateWithContinuationPipeline, getAIContextPreview, getAIRetrievalPreview, getAIRuntimeSettings, isAbortError, listAIRuntimeModels, normalizeAIError, streamGenerate, type AIModelOption } from '@/services/ai'
import { getProject } from '@/services/projects'
import type { AIGeneratePayload, AIContextPreviewResponse, AIContinuationDebugResponse, AIContinuationGenerateResponse, AIRetrievalPreviewResponse, ProjectDetail } from '@/types/api'
import { useAuth } from '@/contexts/auth-context'

const primaryNavItems = [
  { to: '/workspace', label: '首页', icon: Home, end: true },
  { to: '/characters', label: '角色库', icon: Users2, end: false },
  { to: '/ai-toolbox', label: 'AI 工具箱', icon: Sparkles, end: false },
  { to: '/settings', label: '设置', icon: Settings2, end: false },
]

type UtilityTabKey = 'characters' | 'world'
type AIChatMessageRole = 'assistant' | 'user'

interface AIChatMessage {
  id: string
  role: AIChatMessageRole
  content: string
}

interface AIComposerState {
  instruction: string
  modelId: string
  result: string
  isGenerating: boolean
  requestId: number
}

interface AIPanelSnapshot {
  aiState: AIComposerState
  aiMessages: AIChatMessage[]
  contextPreview: AIContextPreviewResponse | null
  retrievalPreview: AIRetrievalPreviewResponse | null
  pipelineDebug: AIContinuationDebugResponse | null
  pipelineResult: AIContinuationGenerateResponse | null
  useContinuationPipeline: boolean
  isContextPreviewOpen: boolean
  isContextPreviewDialogOpen: boolean
  isRetrievalPreviewOpen: boolean
  isPipelineDebugOpen: boolean
  isPipelineResultOpen: boolean
}

const utilityTabs: Array<{ key: UtilityTabKey; label: string }> = [
  { key: 'characters', label: '角色' },
  { key: 'world', label: '设定' },
]

const actionLabelMap = {
  polish: 'AI 润色',
  expand: '扩写',
  rewrite: '改写',
  consistency: '一致性检查',
} as const

const DEFAULT_CONTINUE_INSTRUCTION = '请基于当前正文继续写下去，保持风格一致，并自然衔接上一段。'

const DEFAULT_AI_PANEL_WIDTH = 420
const MIN_AI_PANEL_WIDTH = 320
const MAX_AI_PANEL_WIDTH = 640
const EDITOR_SHORTCUT_HINT_STORAGE_KEY = 'storyweave-editor-shortcut-hint-dismissed'
const EDITOR_AI_PANEL_SNAPSHOTS_STORAGE_KEY = 'storyweave-editor-ai-panel-snapshots'
const DEFAULT_AI_COMPOSER_STATE: AIComposerState = {
  instruction: DEFAULT_CONTINUE_INSTRUCTION,
  modelId: '',
  result: '',
  isGenerating: false,
  requestId: 0,
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

function buildDefaultAIComposerState(context: EditorUtilityContext | null): AIComposerState {
  return {
    ...DEFAULT_AI_COMPOSER_STATE,
    instruction: getAIInstruction(context),
  }
}

function readAIPanelSnapshots() {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const raw = window.sessionStorage.getItem(EDITOR_AI_PANEL_SNAPSHOTS_STORAGE_KEY)
    if (!raw) {
      return {}
    }

    const parsed = JSON.parse(raw) as Record<string, AIPanelSnapshot>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeAIPanelSnapshots(snapshots: Record<string, AIPanelSnapshot>) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.sessionStorage.setItem(EDITOR_AI_PANEL_SNAPSHOTS_STORAGE_KEY, JSON.stringify(snapshots))
  } catch {
    // ignore storage write failures
  }
}

export function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const { projectId, chapterId } = useParams<{ projectId?: string; chapterId?: string }>()
  const { user, logout } = useAuth()
  const [isProjectTreeOpen, setIsProjectTreeOpen] = useState(true)
  const [isUtilityOpen, setIsUtilityOpen] = useState(false)
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false)
  const [activeUtilityTab, setActiveUtilityTab] = useState<UtilityTabKey>('characters')
  const [aiPanelWidth, setAIPanelWidth] = useState(DEFAULT_AI_PANEL_WIDTH)
  const [aiResizeState, setAIResizeState] = useState<{ startX: number; startWidth: number } | null>(null)
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
  const [isShortcutMenuOpen, setIsShortcutMenuOpen] = useState(false)
  const [aiState, setAIState] = useState<AIComposerState>(DEFAULT_AI_COMPOSER_STATE)
  const [aiMessages, setAIMessages] = useState<AIChatMessage[]>([])
  const [contextPreview, setContextPreview] = useState<AIContextPreviewResponse | null>(null)
  const [retrievalPreview, setRetrievalPreview] = useState<AIRetrievalPreviewResponse | null>(null)
  const [pipelineDebug, setPipelineDebug] = useState<AIContinuationDebugResponse | null>(null)
  const [pipelineResult, setPipelineResult] = useState<AIContinuationGenerateResponse | null>(null)
  const [useContinuationPipeline, setUseContinuationPipeline] = useState(false)
  const [isContextPreviewLoading, setIsContextPreviewLoading] = useState(false)
  const [isRetrievalPreviewLoading, setIsRetrievalPreviewLoading] = useState(false)
  const [isPipelineDebugLoading, setIsPipelineDebugLoading] = useState(false)
  const [isContextPreviewOpen, setIsContextPreviewOpen] = useState(false)
  const [isContextPreviewDialogOpen, setIsContextPreviewDialogOpen] = useState(false)
  const [isRetrievalPreviewOpen, setIsRetrievalPreviewOpen] = useState(false)
  const [isPipelineDebugOpen, setIsPipelineDebugOpen] = useState(false)
  const [isPipelineResultOpen, setIsPipelineResultOpen] = useState(true)
  const generationAbortRef = useRef<AbortController | null>(null)
  const aiPanelSnapshotRef = useRef<Record<string, AIPanelSnapshot>>(readAIPanelSnapshots())
  const previousAIScopeKeyRef = useRef<string | null>(null)
  const shortcutMenuRef = useRef<HTMLDivElement | null>(null)

  const isProjectScoped = Boolean(projectId) && location.pathname.startsWith(`/projects/${projectId}`)
  const isEditorRoute = isProjectScoped && location.pathname.includes('/editor/')
  const isAIWorkspaceRoute = isProjectScoped && location.pathname.endsWith('/ai-workspace')
  const utilityRouteScope = isEditorRoute ? 'editor' : isAIWorkspaceRoute ? 'ai-workspace' : isProjectScoped ? 'project' : 'global'

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
      setIsAIPanelOpen(false)
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

  const prevUtilityRouteScopeRef = useRef(utilityRouteScope)
  useEffect(() => {
    if (prevUtilityRouteScopeRef.current !== utilityRouteScope) {
      setIsUtilityOpen(false)
      prevUtilityRouteScopeRef.current = utilityRouteScope
    }
  }, [utilityRouteScope])

  useEffect(() => {
    if (!isEditorRoute) {
      setIsShortcutMenuOpen(false)
    }
  }, [isEditorRoute])

  useEffect(() => {
    if (!isEditorRoute || typeof window === 'undefined') {
      return
    }

    if (window.localStorage.getItem(EDITOR_SHORTCUT_HINT_STORAGE_KEY) === '1') {
      return
    }

    toast('快捷键已启用', {
      id: 'editor-shortcut-hint',
      description: 'Ctrl+B 项目栏，Ctrl+J 参考栏，Ctrl+L AI 面板',
      duration: 5000,
    })
    window.localStorage.setItem(EDITOR_SHORTCUT_HINT_STORAGE_KEY, '1')
  }, [isEditorRoute])

  useEffect(() => {
    if (!isZenMode) {
      return
    }

    setIsProjectTreeOpen(false)
    setIsUtilityOpen(false)
    setIsAIPanelOpen(false)
    setIsShortcutMenuOpen(false)
  }, [isZenMode])

  useEffect(() => {
    if (!isShortcutMenuOpen) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      if (!shortcutMenuRef.current?.contains(event.target as Node)) {
        setIsShortcutMenuOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsShortcutMenuOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isShortcutMenuOpen])

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

      setIsAIPanelOpen(true)
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

      if (key === 'l' && isEditorRoute && !isZenMode) {
        event.preventDefault()
        setIsAIPanelOpen((prev) => !prev)
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [isEditorRoute, isProjectScoped, isZenMode])

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
  }, [isEditorRoute, location.pathname])

  useEffect(() => {
    if (!aiResizeState) {
      return
    }

    const { startX, startWidth } = aiResizeState

    function handlePointerMove(event: PointerEvent) {
      const delta = startX - event.clientX
      const nextWidth = Math.min(MAX_AI_PANEL_WIDTH, Math.max(MIN_AI_PANEL_WIDTH, startWidth + delta))
      setAIPanelWidth(nextWidth)
    }

    function handlePointerUp() {
      setAIResizeState(null)
    }

    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [aiResizeState])

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
        title: '全局角色库',
        description: '',
      }
    }

    if (isProjectScoped && location.pathname.endsWith('/characters')) {
      return {
        eyebrow: project?.title ?? '项目角色库',
        title: '角色库',
        description: '',
      }
    }

    if (isProjectScoped && location.pathname.endsWith('/ai-workspace')) {
      return {
        eyebrow: project?.title ?? 'AI 工作区',
        title: 'AI 工作区',
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
  const shouldRenderAIPanel = isEditorRoute && isAIPanelOpen && !isZenMode
  const scopedEditorAIDraft =
    editorAIDraftContext?.projectId === projectId && editorAIDraftContext?.chapterId === chapterId
      ? editorAIDraftContext
      : null
  const currentAIScopeKey = projectId && chapterId ? `${projectId}:${chapterId}` : null
  const selectedModelId = aiState.modelId.trim() || runtimeSettingsQuery.data?.model_id || ''
  const hasSavedRuntimeKey = Boolean(runtimeSettingsQuery.data?.api_key_masked)
  const hasAIPanelHistory =
    aiMessages.length > 0 ||
    Boolean(aiState.result.trim()) ||
    Boolean(contextPreview) ||
    Boolean(retrievalPreview) ||
    Boolean(pipelineDebug) ||
    Boolean(pipelineResult) ||
    aiState.instruction.trim() !== getAIInstruction(scopedEditorUtilityContext)

  useEffect(() => {
    if (!currentAIScopeKey) {
      return
    }

    aiPanelSnapshotRef.current[currentAIScopeKey] = {
      aiState: { ...aiState, isGenerating: false },
      aiMessages,
      contextPreview,
      retrievalPreview,
      pipelineDebug,
      pipelineResult,
      useContinuationPipeline,
      isContextPreviewOpen,
      isContextPreviewDialogOpen,
      isRetrievalPreviewOpen,
      isPipelineDebugOpen,
      isPipelineResultOpen,
    }
    writeAIPanelSnapshots(aiPanelSnapshotRef.current)
  }, [aiMessages, aiState, contextPreview, retrievalPreview, pipelineDebug, pipelineResult, useContinuationPipeline, currentAIScopeKey, isContextPreviewDialogOpen, isContextPreviewOpen, isRetrievalPreviewOpen, isPipelineDebugOpen, isPipelineResultOpen])

  useEffect(() => {
    const previousScopeKey = previousAIScopeKeyRef.current
    if (previousScopeKey && previousScopeKey !== currentAIScopeKey) {
      const previousSnapshot = aiPanelSnapshotRef.current[previousScopeKey]
      if (previousSnapshot) {
        aiPanelSnapshotRef.current[previousScopeKey] = {
          ...previousSnapshot,
          aiState: {
            ...previousSnapshot.aiState,
            isGenerating: false,
          },
          contextPreview: null,
          retrievalPreview: null,
          pipelineDebug: null,
          pipelineResult: null,
          useContinuationPipeline: previousSnapshot.useContinuationPipeline ?? false,
          isContextPreviewOpen: false,
          isContextPreviewDialogOpen: false,
          isRetrievalPreviewOpen: false,
          isPipelineDebugOpen: false,
          isPipelineResultOpen: true,
        }
        writeAIPanelSnapshots(aiPanelSnapshotRef.current)
      }
    }

    generationAbortRef.current?.abort()
    generationAbortRef.current = null
    writeEditorAIPreviewContext(null)

    if (!currentAIScopeKey) {
      setAIState(buildDefaultAIComposerState(null))
      setAIMessages([])
      setContextPreview(null)
      setRetrievalPreview(null)
      setPipelineDebug(null)
      setPipelineResult(null)
      setUseContinuationPipeline(false)
      setIsContextPreviewOpen(false)
      setIsContextPreviewDialogOpen(false)
      setIsRetrievalPreviewOpen(false)
      setIsPipelineDebugOpen(false)
      setIsPipelineResultOpen(true)
      previousAIScopeKeyRef.current = currentAIScopeKey
      return
    }

    const nextSnapshot = aiPanelSnapshotRef.current[currentAIScopeKey]
    if (nextSnapshot) {
      setAIState(nextSnapshot.aiState)
      setAIMessages(nextSnapshot.aiMessages)
      setContextPreview(nextSnapshot.contextPreview)
      setRetrievalPreview(nextSnapshot.retrievalPreview ?? null)
      setPipelineDebug(nextSnapshot.pipelineDebug ?? null)
      setPipelineResult(nextSnapshot.pipelineResult ?? null)
      setUseContinuationPipeline(nextSnapshot.useContinuationPipeline ?? false)
      setIsContextPreviewOpen(nextSnapshot.isContextPreviewOpen)
      setIsContextPreviewDialogOpen(nextSnapshot.isContextPreviewDialogOpen)
      setIsRetrievalPreviewOpen(nextSnapshot.isRetrievalPreviewOpen ?? false)
      setIsPipelineDebugOpen(nextSnapshot.isPipelineDebugOpen ?? false)
      setIsPipelineResultOpen(nextSnapshot.isPipelineResultOpen ?? true)
    } else {
      setAIState(buildDefaultAIComposerState(scopedEditorUtilityContext))
      setAIMessages([])
      setContextPreview(null)
      setRetrievalPreview(null)
      setPipelineDebug(null)
      setPipelineResult(null)
      setUseContinuationPipeline(false)
      setIsContextPreviewOpen(false)
      setIsContextPreviewDialogOpen(false)
      setIsRetrievalPreviewOpen(false)
      setIsPipelineDebugOpen(false)
      setIsPipelineResultOpen(true)
    }

    previousAIScopeKeyRef.current = currentAIScopeKey
  }, [currentAIScopeKey])

  useEffect(() => {
    setAIState((prev) => ({
      ...prev,
      result: '',
      isGenerating: false,
      requestId: prev.isGenerating ? prev.requestId + 1 : prev.requestId,
      instruction: getAIInstruction(scopedEditorUtilityContext),
    }))
    setContextPreview(null)
    setRetrievalPreview(null)
    setIsContextPreviewOpen(false)
    setIsContextPreviewDialogOpen(false)
    setIsRetrievalPreviewOpen(false)
    generationAbortRef.current?.abort()
    generationAbortRef.current = null
    writeEditorAIPreviewContext(null)
  }, [scopedEditorUtilityContext?.updatedAt])

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
    generationAbortRef.current?.abort()
    generationAbortRef.current = null
    setAIState((prev) => ({ ...prev, isGenerating: false, requestId: prev.requestId + 1 }))
    if (projectId && chapterId) {
      writeEditorAIPreviewContext({
        projectId,
        chapterId,
        text: aiState.result,
        isStreaming: false,
        updatedAt: new Date().toISOString(),
      })
    }
    toast.info('已停止本次 AI 续写')
  }

  function handleClearCurrentAIPanelHistory() {
    generationAbortRef.current?.abort()
    generationAbortRef.current = null

    if (currentAIScopeKey) {
      delete aiPanelSnapshotRef.current[currentAIScopeKey]
      writeAIPanelSnapshots(aiPanelSnapshotRef.current)
    }

    setAIState(buildDefaultAIComposerState(scopedEditorUtilityContext))
    setAIMessages([])
    setContextPreview(null)
    setRetrievalPreview(null)
    setPipelineDebug(null)
    setPipelineResult(null)
    setUseContinuationPipeline(false)
    setIsContextPreviewOpen(false)
    setIsContextPreviewDialogOpen(false)
    setIsRetrievalPreviewOpen(false)
    setIsPipelineDebugOpen(false)
    setIsPipelineResultOpen(true)
    writeEditorAIPreviewContext(null)
    toast.message('已清空当前章节的 AI 记录')
  }

  async function handleLoadContextPreview() {
    if (!projectId || !chapterId) {
      return
    }

    const sourceText =
      (scopedEditorUtilityContext?.action === 'expand'
        ? scopedEditorUtilityContext.selectedText
        : scopedEditorAIDraft?.plainText)?.trim() ?? ''

    const payload: AIGeneratePayload = {
      project_id: projectId,
      chapter_id: chapterId,
      text: sourceText,
      instruction: aiState.instruction.trim() || DEFAULT_CONTINUE_INSTRUCTION,
      model_provider: runtimeSettingsQuery.data?.provider ?? null,
      model_id: selectedModelId || null,
    }

    setIsContextPreviewLoading(true)
    setIsRetrievalPreviewLoading(true)
    try {
      const [preview, retrieval] = await Promise.all([
        getAIContextPreview(payload),
        getAIRetrievalPreview(payload),
      ])
      setContextPreview(preview)
      setRetrievalPreview(retrieval)
      setIsContextPreviewOpen(true)
      setIsContextPreviewDialogOpen(false)
      setIsRetrievalPreviewOpen(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '上下文预览加载失败')
    } finally {
      setIsContextPreviewLoading(false)
      setIsRetrievalPreviewLoading(false)
    }
  }

  async function handleGenerate() {
    if (!projectId || !chapterId) {
      return
    }

    generationAbortRef.current?.abort()
    const abortController = new AbortController()
    generationAbortRef.current = abortController

    const sourceText = (scopedEditorUtilityContext?.action === 'expand' ? scopedEditorUtilityContext.selectedText : scopedEditorAIDraft?.plainText)?.trim() ?? ''

    const submittedInstruction = aiState.instruction.trim() || DEFAULT_CONTINUE_INSTRUCTION
    const requestId = aiState.requestId + 1
    const assistantMessageId = `assistant-${requestId}`
    let accumulatedResult = ''

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
    writeEditorAIPreviewContext({
      projectId,
      chapterId,
      text: '',
      isStreaming: true,
      updatedAt: new Date().toISOString(),
    })

    const payload: AIGeneratePayload = {
      project_id: projectId,
      chapter_id: chapterId,
      text: sourceText,
      instruction: submittedInstruction,
      model_provider: runtimeSettingsQuery.data?.provider ?? null,
      model_id: selectedModelId || null,
    }

    try {
      if (useContinuationPipeline) {
        const result = await generateWithContinuationPipeline(payload)
        accumulatedResult = result.final_content
        setPipelineResult(result)
        setIsPipelineResultOpen(true)
        setPipelineDebug((prev) =>
          prev && prev.final_content === result.final_content
            ? prev
            : null,
        )
        setAIMessages((prev) =>
          prev.map((message) =>
            message.id === assistantMessageId
              ? { ...message, content: accumulatedResult }
              : message,
          ),
        )
        setAIState((prev) => {
          if (prev.requestId !== requestId) {
            return prev
          }
          return {
            ...prev,
            result: accumulatedResult,
            isGenerating: false,
          }
        })
        if (result.warnings.length > 0) {
          toast.message(`Pipeline 风险提示：${result.warnings[0]}`)
        }
      } else {
        setPipelineResult(null)
        await streamGenerate(
          payload,
          (chunk) => {
            accumulatedResult += chunk
            setAIState((prev) => {
              if (prev.requestId !== requestId || !prev.isGenerating) {
                return prev
              }

              return {
                ...prev,
                result: accumulatedResult,
              }
            })
            if (projectId && chapterId) {
              writeEditorAIPreviewContext({
                projectId,
                chapterId,
                text: accumulatedResult,
                isStreaming: true,
                updatedAt: new Date().toISOString(),
              })
            }
            setAIMessages((prev) =>
              prev.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, content: accumulatedResult }
                  : message,
              ),
            )
          },
          { signal: abortController.signal, timeoutMs: 90_000, retryCount: 1 },
        )
      }

      if (projectId && chapterId) {
        writeEditorAIPreviewContext({
          projectId,
          chapterId,
          text: accumulatedResult,
          isStreaming: false,
          updatedAt: new Date().toISOString(),
        })
      }
      setAIState((prev) => (prev.requestId === requestId ? { ...prev, isGenerating: false } : prev))
    } catch (error) {
      const normalizedError = normalizeAIError(error)
      setAIState((prev) => (prev.requestId === requestId ? { ...prev, isGenerating: false } : prev))
      if (isAbortError(normalizedError)) {
        setAIMessages((prev) => prev.filter((message) => message.id !== assistantMessageId || message.content.trim()))
        toast.message('已停止本次 AI 续写')
      } else {
        setAIMessages((prev) =>
          prev.map((message) =>
            message.id === assistantMessageId && !message.content.trim()
              ? { ...message, content: normalizedError instanceof Error ? normalizedError.message : 'AI 续写失败' }
              : message,
          ),
        )
        toast.error(normalizedError instanceof Error ? normalizedError.message : 'AI 续写失败')
      }
    } finally {
      if (generationAbortRef.current === abortController) {
        generationAbortRef.current = null
      }
    }
  }

  async function handleRunPipelineDebug() {
    if (!projectId || !chapterId) {
      return
    }

    const sourceText =
      (scopedEditorUtilityContext?.action === 'expand'
        ? scopedEditorUtilityContext.selectedText
        : scopedEditorAIDraft?.plainText)?.trim() ?? ''

    const payload: AIGeneratePayload = {
      project_id: projectId,
      chapter_id: chapterId,
      text: sourceText,
      instruction: aiState.instruction.trim() || DEFAULT_CONTINUE_INSTRUCTION,
      model_provider: runtimeSettingsQuery.data?.provider ?? null,
      model_id: selectedModelId || null,
    }

    setIsPipelineDebugLoading(true)
    try {
      const result = await debugContinuationPipeline(payload)
      setPipelineDebug(result)
      setIsPipelineDebugOpen(true)
      toast.success('已生成 pipeline 调试结果')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Pipeline 调试失败'
      toast.error(message.includes('timeout') ? 'Pipeline 调试超时：这条链路会串行调用 Planner、Writer、Checker，当前模型响应过慢或卡住了。' : message)
    } finally {
      setIsPipelineDebugLoading(false)
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
    writeEditorAIPreviewContext(null)
    setAIState((prev) => ({ ...prev, result: '', isGenerating: false }))
  }

  function closeUtilityDrawer() {
    if (scopedEditorUtilityContext?.updatedAt) {
      setDismissedUtilityContextAt(scopedEditorUtilityContext.updatedAt)
    }

    setIsUtilityOpen(false)
  }

  function closeAIPanel() {
    if (scopedEditorUtilityContext?.updatedAt) {
      setDismissedUtilityContextAt(scopedEditorUtilityContext.updatedAt)
    }

    setIsAIPanelOpen(false)
  }

  function renderAIPanel(onClose?: () => void) {
    const primaryLabel = scopedEditorUtilityContext?.action === 'expand' ? '选区扩写' : '章节续写'
    const resultApplyLabel = scopedEditorUtilityContext?.action === 'expand' ? '插入到选区后' : '追加到正文'
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#fcfcfd]">
        <div className="flex items-center justify-between border-b border-[#eef0f3] px-4 py-3">
          <SectionLabel>AI 侧栏</SectionLabel>
          <div className="flex items-center gap-2">
            {hasAIPanelHistory ? (
              <button
                type="button"
                onClick={handleClearCurrentAIPanelHistory}
                className="inline-flex h-8 items-center justify-center rounded-full border border-[#d1d5db] bg-white px-3 text-[11px] text-[#4b5563] transition hover:border-[#9ca3af] hover:text-[#111827]"
              >
                清空记录
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onClose?.()}
              className="inline-flex h-8 items-center justify-center rounded-full border border-[#d1d5db] bg-white px-3 text-[11px] text-[#4b5563] transition hover:border-[#9ca3af] hover:text-[#111827]"
            >
              收起
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="border-b border-[#eef0f3] px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <Bot className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[#111827]">{primaryLabel}</div>
                <div className="mt-1 text-xs leading-5 text-[#6b7280]">
                  {!hasSavedRuntimeKey
                    ? '请先在设置中心保存 API Key 后再开始生成。'
                    : '补充续写目标、情绪和限制条件后即可开始生成。'}
                </div>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            <div className="flex min-h-full flex-col justify-end">
              <div className="space-y-4">
                {scopedEditorUtilityContext ? (
                  <div className="mr-8 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-amber-700">
                      {actionLabelMap[scopedEditorUtilityContext.action]}
                    </div>
                    <div className="text-sm leading-6 text-[#4b5563]">{scopedEditorUtilityContext.selectedText}</div>
                  </div>
                ) : null}

                {aiMessages.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#d1d5db] bg-white/80 px-4 py-5 text-sm leading-6 text-[#6b7280]">
                    暂无对话。直接输入这次续写的目标、情绪推进、禁用内容或文风限制，消息区会优先保留给生成结果。
                  </div>
                ) : null}

                {aiMessages.map((message) => (
                  <div key={message.id} className={clsx('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}>
                    <div
                      className={clsx(
                        'max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-6',
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
          </div>

          <div className="border-t border-[#eef0f3] bg-white px-4 py-3">
            <div className="rounded-[18px] border border-[#d1d5db] bg-[#fcfcfd] p-3">
              <textarea
                value={aiState.instruction}
                onChange={(event) => setAIState((prev) => ({ ...prev, result: '', instruction: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    if (!aiState.isGenerating) {
                      void handleGenerate()
                    }
                  }
                }}
                rows={3}
                className="min-h-[72px] w-full resize-none border-none bg-transparent text-sm leading-6 text-[#111827] outline-none placeholder:text-[#9ca3af]"
                placeholder="描述续写目标、情绪、节奏或限制条件。按 Enter 发送，Shift+Enter 换行。"
              />

              <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#eef0f3] pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleOpenModelDialog}
                    disabled={isLoadingModels || !hasSavedRuntimeKey || runtimeSettingsQuery.isLoading}
                    className="inline-flex h-8 items-center gap-2 rounded-full border border-[#d1d5db] bg-white px-3 text-[11px] text-[#4b5563] transition hover:border-[#9ca3af] hover:text-[#111827] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="max-w-[180px] truncate">
                      {isLoadingModels ? '加载模型中...' : selectedModelId || '选择模型'}
                    </span>
                    <ChevronRight className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleLoadContextPreview()}
                    disabled={isContextPreviewLoading || isRetrievalPreviewLoading || aiState.isGenerating}
                    className="inline-flex h-8 items-center gap-2 rounded-full border border-[#d1d5db] bg-white px-3 text-[11px] text-[#4b5563] transition hover:border-[#9ca3af] hover:text-[#111827] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isContextPreviewLoading || isRetrievalPreviewLoading ? <LoaderCircle className="size-3 animate-spin" /> : <BookCopy className="size-3.5" />}
                    上下文预览
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRunPipelineDebug()}
                    disabled={isPipelineDebugLoading || aiState.isGenerating}
                    className="inline-flex h-8 items-center gap-2 rounded-full border border-[#d1d5db] bg-white px-3 text-[11px] text-[#4b5563] transition hover:border-[#9ca3af] hover:text-[#111827] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isPipelineDebugLoading ? <LoaderCircle className="size-3 animate-spin" /> : <Bot className="size-3.5" />}
                    Pipeline 调试
                  </button>
                  <button
                    type="button"
                    onClick={() => setUseContinuationPipeline((prev) => !prev)}
                    disabled={aiState.isGenerating}
                    className={clsx(
                      'inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-50',
                      useContinuationPipeline
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                        : 'border-[#d1d5db] bg-white text-[#4b5563] hover:border-[#9ca3af] hover:text-[#111827]',
                    )}
                  >
                    <Bot className="size-3.5" />
                    {useContinuationPipeline ? 'Pipeline 已启用' : '使用旧链路'}
                  </button>
                </div>
                {aiState.result.trim() && !aiState.isGenerating ? (
                  <button
                    type="button"
                    onClick={handleApplyGeneratedText}
                    className="inline-flex h-9 items-center justify-center rounded-xl bg-[#111827] px-4 text-xs font-medium text-white transition hover:bg-[#1f2937]"
                  >
                    {resultApplyLabel}
                  </button>
                ) : null}
              </div>

              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => {
                    if (aiState.isGenerating) {
                      handleStopGeneration()
                      return
                    }
                    void handleGenerate()
                  }}
                  className={clsx(
                    'inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium text-white transition',
                    aiState.isGenerating ? 'bg-[#f59e0b] hover:bg-[#d97706]' : 'bg-emerald-500 hover:bg-emerald-600',
                  )}
                >
                  {aiState.isGenerating ? <LoaderCircle className="size-3.5 animate-spin" /> : <SendHorizontal className="size-3.5" />}
                  {aiState.isGenerating ? '停止生成' : '发送'}
                </button>
              </div>

              {pipelineResult && useContinuationPipeline ? (
                <div className="mt-3 rounded-[18px] border border-[#dbe3ea] bg-white">
                  <button
                    type="button"
                    onClick={() => setIsPipelineResultOpen((prev) => !prev)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left"
                  >
                    <div>
                      <div className="text-xs font-medium text-[#111827]">Pipeline 风险提示</div>
                      <div className="mt-0.5 text-[11px] text-[#6b7280]">
                        severity: {pipelineResult.continuity_report?.severity ?? 'unknown'} · warnings: {pipelineResult.warnings.length}
                      </div>
                    </div>
                    <ChevronDown className={clsx('size-4 text-[#6b7280] transition', isPipelineResultOpen && 'rotate-180')} />
                  </button>
                  {isPipelineResultOpen ? (
                    <div className="space-y-3 border-t border-[#eef0f3] px-3 py-3">
                      <div
                        className={clsx(
                          'rounded-2xl border px-3 py-3 text-sm',
                          pipelineResult.continuity_report?.severity === 'high'
                            ? 'border-rose-200 bg-rose-50 text-rose-700'
                            : pipelineResult.continuity_report?.severity === 'medium'
                              ? 'border-amber-200 bg-amber-50 text-amber-700'
                              : 'border-emerald-200 bg-emerald-50 text-emerald-700',
                        )}
                      >
                        {pipelineResult.continuity_report?.summary || '未发现明显连续性风险。'}
                      </div>
                      {pipelineResult.warnings.length > 0 ? (
                        <div className="rounded-2xl border border-[#eef0f3] bg-[#fcfcfd] px-3 py-3">
                          <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-[#6b7280]">Warnings</div>
                          <div className="space-y-1">
                            {pipelineResult.warnings.map((item) => (
                              <div key={item} className="text-xs leading-6 text-[#4b5563]">
                                {item}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {pipelineResult.fallbacks.length > 0 ? (
                        <div className="rounded-2xl border border-[#eef0f3] bg-[#fcfcfd] px-3 py-3">
                          <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-[#6b7280]">Fallbacks</div>
                          <div className="flex flex-wrap gap-1.5">
                            {pipelineResult.fallbacks.map((item) => (
                              <span key={item} className="rounded-full border border-[#d1d5db] bg-white px-2 py-0.5 text-[11px] text-[#4b5563]">
                                {item}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {contextPreview ? (
                <div className="mt-3 rounded-[18px] border border-[#dbe3ea] bg-white">
                  <button
                    type="button"
                    onClick={() => setIsContextPreviewOpen((prev) => !prev)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left"
                  >
                      <div>
                        <div className="text-xs font-medium text-[#111827]">上下文预览</div>
                        <div className="mt-0.5 text-[11px] text-[#6b7280]">
                          intent: {contextPreview.intent} · sections: {contextPreview.sections.length}
                        </div>
                      </div>
                    <ChevronDown className={clsx('size-4 text-[#6b7280] transition', isContextPreviewOpen && 'rotate-180')} />
                  </button>
                  {isContextPreviewOpen ? (
                    <div className="space-y-3 border-t border-[#eef0f3] px-3 py-3">
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-[#6b7280]">
                        <div>recent memory: {contextPreview.metadata.recent_memory_count ?? 0}</div>
                        <div>story memory: {contextPreview.metadata.has_story_memory ? 'yes' : 'no'}</div>
                        <div>chapter found: {contextPreview.metadata.chapter_found ? 'yes' : 'no'}</div>
                        <div>prev tail: {contextPreview.metadata.has_previous_chapter_tail ? 'yes' : 'no'}</div>
                        <div>retrieved chunks: {contextPreview.metadata.retrieved_chunk_count ?? 0}</div>
                        <div>query terms: {contextPreview.metadata.retrieval_query_terms?.length ?? 0}</div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] text-[#6b7280]">侧栏仅展示摘要，完整内容可在弹窗中查看。</div>
                        <button
                          type="button"
                          onClick={() => setIsContextPreviewDialogOpen(true)}
                          className="inline-flex h-7 items-center rounded-full border border-[#d1d5db] bg-white px-3 text-[11px] text-[#4b5563] transition hover:border-[#9ca3af] hover:text-[#111827]"
                        >
                          全量查看
                        </button>
                      </div>
                      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                        {contextPreview.sections.map((section) => (
                          <div key={section.title} className="rounded-2xl border border-[#eef0f3] bg-[#fcfcfd] px-3 py-3">
                            <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-[#6b7280]">{section.title}</div>
                            <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-6 text-[#374151]">{section.content}</pre>
                          </div>
                        ))}
                      </div>
                      <div className="rounded-2xl border border-[#dbe3ea] bg-[#f8fafc] px-3 py-3">
                        <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-[#6b7280]">Final Instruction</div>
                        <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-6 text-[#111827]">{contextPreview.final_instruction}</pre>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {retrievalPreview ? (
                <div className="mt-3 rounded-[18px] border border-[#dbe3ea] bg-white">
                  <button
                    type="button"
                    onClick={() => setIsRetrievalPreviewOpen((prev) => !prev)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left"
                  >
                    <div>
                      <div className="text-xs font-medium text-[#111827]">检索预览</div>
                      <div className="mt-0.5 text-[11px] text-[#6b7280]">
                        chunks: {retrievalPreview.chunks.length} · terms: {retrievalPreview.query_terms.length}
                      </div>
                    </div>
                    <ChevronDown className={clsx('size-4 text-[#6b7280] transition', isRetrievalPreviewOpen && 'rotate-180')} />
                  </button>
                  {isRetrievalPreviewOpen ? (
                    <div className="space-y-3 border-t border-[#eef0f3] px-3 py-3">
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-[#6b7280]">
                        <div>candidate: {retrievalPreview.metadata.candidate_count ?? 0}</div>
                        <div>matched: {retrievalPreview.metadata.matched_count ?? 0}</div>
                        <div>returned: {retrievalPreview.metadata.returned_count ?? 0}</div>
                        <div>chapter found: {retrievalPreview.metadata.chapter_found ? 'yes' : 'no'}</div>
                      </div>
                      <div className="rounded-2xl border border-[#eef0f3] bg-[#fcfcfd] px-3 py-3">
                        <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-[#6b7280]">Query Terms</div>
                        <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto pr-1">
                          {retrievalPreview.query_terms.length > 0 ? (
                            retrievalPreview.query_terms.map((term) => (
                              <span key={term} className="rounded-full border border-[#d1d5db] bg-white px-2 py-0.5 text-[11px] text-[#4b5563]">
                                {term}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-[#6b7280]">暂无 query terms</span>
                          )}
                        </div>
                      </div>
                      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                        {retrievalPreview.chunks.map((chunk) => (
                          <div key={chunk.chunk_id} className="rounded-2xl border border-[#eef0f3] bg-[#fcfcfd] px-3 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-[11px] uppercase tracking-[0.18em] text-[#6b7280]">
                                  Chapter {chunk.chapter_order} · Chunk {chunk.chunk_index + 1}
                                </div>
                                <div className="mt-1 text-xs font-medium text-[#111827]">{chunk.scene_label || '未命名片段'}</div>
                              </div>
                              <div className="rounded-full border border-[#d1d5db] bg-white px-2 py-0.5 text-[11px] text-[#4b5563]">
                                {chunk.score.toFixed(2)}
                              </div>
                            </div>
                            <pre className="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-6 text-[#374151]">
                              {chunk.content_short || chunk.content}
                            </pre>
                            {chunk.match_reasons.length > 0 ? (
                              <div className="mt-2 space-y-1">
                                {chunk.match_reasons.map((reason) => (
                                  <div key={`${chunk.chunk_id}-${reason}`} className="text-[11px] text-[#6b7280]">
                                    {reason}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))}
                        {retrievalPreview.chunks.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-[#d1d5db] px-3 py-4 text-xs text-[#6b7280]">
                            当前没有召回到可用正文片段。
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {pipelineDebug ? (
                <div className="mt-3 rounded-[18px] border border-[#dbe3ea] bg-white">
                  <button
                    type="button"
                    onClick={() => setIsPipelineDebugOpen((prev) => !prev)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left"
                  >
                    <div>
                      <div className="text-xs font-medium text-[#111827]">Pipeline 调试</div>
                      <div className="mt-0.5 text-[11px] text-[#6b7280]">
                        severity: {pipelineDebug.continuity_report?.severity ?? 'unknown'} · fallback: {pipelineDebug.fallbacks.length}
                      </div>
                    </div>
                    <ChevronDown className={clsx('size-4 text-[#6b7280] transition', isPipelineDebugOpen && 'rotate-180')} />
                  </button>
                  {isPipelineDebugOpen ? (
                    <div className="space-y-3 border-t border-[#eef0f3] px-3 py-3">
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-[#6b7280]">
                        <div>planner: {String(pipelineDebug.metadata?.planner_used ?? false)}</div>
                        <div>retriever: {String(pipelineDebug.metadata?.retriever_used ?? false)}</div>
                        <div>checker: {String(pipelineDebug.metadata?.checker_used ?? false)}</div>
                        <div>warnings: {pipelineDebug.warnings.length}</div>
                      </div>
                      {pipelineDebug.fallbacks.length > 0 ? (
                        <div className="rounded-2xl border border-[#eef0f3] bg-[#fcfcfd] px-3 py-3">
                          <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-[#6b7280]">Fallbacks</div>
                          <div className="flex flex-wrap gap-1.5">
                            {pipelineDebug.fallbacks.map((item) => (
                              <span key={item} className="rounded-full border border-[#d1d5db] bg-white px-2 py-0.5 text-[11px] text-[#4b5563]">
                                {item}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <div className="rounded-2xl border border-[#eef0f3] bg-[#fcfcfd] px-3 py-3">
                        <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-[#6b7280]">Plan</div>
                        <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-6 text-[#374151]">{JSON.stringify(pipelineDebug.plan, null, 2)}</pre>
                      </div>
                      <div className="rounded-2xl border border-[#eef0f3] bg-[#fcfcfd] px-3 py-3">
                        <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-[#6b7280]">Continuity Report</div>
                        <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-6 text-[#374151]">{JSON.stringify(pipelineDebug.continuity_report, null, 2)}</pre>
                      </div>
                      <div className="rounded-2xl border border-[#dbe3ea] bg-[#f8fafc] px-3 py-3">
                        <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-[#6b7280]">Pipeline Output</div>
                        <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-6 text-[#111827]">{pipelineDebug.final_content}</pre>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

          </div>
        </div>
      </div>
    )
  }

  const modelDialog = (
    <ModelPickerDialog
      open={isModelDialogOpen}
      onOpenChange={setIsModelDialogOpen}
      selectedModelId={selectedModelId}
      availableModels={availableModels}
      isLoadingModels={isLoadingModels}
      hasSavedRuntimeKey={hasSavedRuntimeKey}
      onRefresh={() => void handleLoadModels()}
      onSelect={(modelId) => {
        setAIState((prev) => ({ ...prev, result: '', modelId }))
        toast.success(`下一次生成将使用模型：${modelId}`)
      }}
    />
  )

  const contextPreviewDialog = contextPreview ? (
    <Dialog open={isContextPreviewDialogOpen} onOpenChange={setIsContextPreviewDialogOpen}>
      <DialogContent className="max-w-5xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-5">
          <DialogTitle>上下文预览</DialogTitle>
        </DialogHeader>
        <div className="max-h-[78vh] space-y-4 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
            <div>intent: {contextPreview.intent}</div>
            <div>sections: {contextPreview.sections.length}</div>
            <div>recent memory: {contextPreview.metadata.recent_memory_count ?? 0}</div>
            <div>story memory: {contextPreview.metadata.has_story_memory ? 'yes' : 'no'}</div>
            <div>chapter found: {contextPreview.metadata.chapter_found ? 'yes' : 'no'}</div>
            <div>prev tail: {contextPreview.metadata.has_previous_chapter_tail ? 'yes' : 'no'}</div>
          </div>
          <div className="space-y-3">
            {contextPreview.sections.map((section) => (
              <div key={section.title} className="rounded-2xl border border-border bg-background px-4 py-4">
                <div className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">{section.title}</div>
                <pre className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground">{section.content}</pre>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-border bg-muted/25 px-4 py-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Final Instruction</div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(contextPreview.final_instruction)
                    toast.success('已复制完整上下文指令')
                  } catch {
                    toast.error('复制失败')
                  }
                }}
                className="inline-flex h-7 items-center rounded-full border border-border bg-background px-3 text-[11px] text-foreground/75 transition hover:border-primary/35 hover:text-foreground"
              >
                复制
              </button>
            </div>
            <pre className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground">{contextPreview.final_instruction}</pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  ) : null

  return (
    <div className="flex h-screen bg-background text-foreground selection:bg-primary/15 selection:text-foreground">
      {modelDialog}
      {contextPreviewDialog}
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

        <div className="mt-4 flex flex-col items-center gap-2">
          <div className="rounded-full border border-primary/15 bg-primary/10 px-2.5 py-1 text-[10px] text-primary">
            就绪
          </div>
          {user ? (
            <div className="flex flex-col items-center gap-1.5">
              <div
                className="flex size-8 items-center justify-center rounded-full border border-border bg-muted text-[11px] font-medium text-foreground"
                title={user.email}
              >
                {user.email[0].toUpperCase()}
              </div>
              <button
                type="button"
                title="退出登录"
                onClick={() => { logout(); navigate('/login') }}
                className="flex size-8 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <LogOut className="size-3.5" />
              </button>
            </div>
          ) : null}
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
                to={`/projects/${projectId}/ai-workspace`}
                label="AI 工作区"
                active={location.pathname === `/projects/${projectId}/ai-workspace`}
              />
              <ProjectTreeLink
                to={`/projects/${projectId}/characters`}
                label="角色库"
                active={location.pathname === `/projects/${projectId}/characters`}
              />
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
                  <div className="group relative">
                    <button
                      type="button"
                      aria-label="切换项目栏，快捷键 Ctrl+B"
                      className="inline-flex size-10 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition hover:border-primary/25 hover:text-foreground"
                      onClick={() => setIsProjectTreeOpen((prev) => !prev)}
                    >
                      {isProjectTreeOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
                    </button>
                    <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1 text-xs text-popover-foreground shadow-lg group-hover:block">
                      项目栏 Ctrl+B
                    </div>
                  </div>
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
                        <Link
                          to={`/projects/${projectId}`}
                          className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm text-[#4b5563] transition hover:border-[#d1d5db] hover:text-[#111827]"
                        >
                          <ArrowLeft className="size-4" />
                          返回写作台
                        </Link>
                        {!isZenMode ? (
                          <>
                            <HeaderIconButton
                              icon={BookCopy}
                              label="参考栏"
                              shortcut="Ctrl+J"
                              active={isUtilityOpen}
                              onClick={() => setIsUtilityOpen((prev) => !prev)}
                            />
                            <HeaderIconButton
                              icon={Bot}
                              label="AI 面板"
                              shortcut="Ctrl+L"
                              active={isAIPanelOpen}
                              onClick={() => setIsAIPanelOpen((prev) => !prev)}
                            />
                            <div className="relative" ref={shortcutMenuRef}>
                              <button
                                type="button"
                                aria-label="查看完整快捷键"
                                onClick={() => setIsShortcutMenuOpen((prev) => !prev)}
                                className={clsx(
                                  'inline-flex h-10 items-center rounded-xl px-3 text-xs transition',
                                  isShortcutMenuOpen
                                    ? 'bg-primary/10 text-primary'
                                    : 'text-muted-foreground hover:bg-background hover:text-foreground',
                                )}
                              >
                                快捷键
                              </button>
                              {isShortcutMenuOpen ? (
                                <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-2xl border border-border bg-popover p-3 shadow-xl">
                                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Shortcuts</div>
                                  <div className="mt-3 space-y-2 text-sm text-popover-foreground">
                                    <ShortcutRow label="项目栏" shortcut="Ctrl+B" />
                                    <ShortcutRow label="参考栏" shortcut="Ctrl+J" />
                                    <ShortcutRow label="AI 面板" shortcut="Ctrl+L" />
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </>
                        ) : null}
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
                    {isZenMode ? (
                      <div className="hidden rounded-xl border border-secondary bg-secondary px-3 py-2 text-xs text-secondary-foreground xl:block">
                        专注模式已启用
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          </header>

          <main
            className={clsx(
              'min-h-0 flex-1 px-4 md:px-5',
              isAIWorkspaceRoute ? 'overflow-hidden py-4' : 'overflow-y-auto py-5',
            )}
          >
            <Outlet />
          </main>
        </div>

        {shouldRenderUtility ? (
          <aside className="hidden w-[360px] shrink-0 border-l border-border bg-card/96 xl:flex xl:flex-col">
            <div className="border-b border-border px-5 py-4">
              <div className="grid grid-cols-2 rounded-2xl bg-muted/75 p-1">
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

            <div className="flex-1 overflow-y-auto px-5 py-5">
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
                    to={`/projects/${projectId}/characters`}
                    label="打开项目角色库"
                    meta="专页支持返回当前章节"
                    active={location.pathname === `/projects/${projectId}/characters`}
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
            </div>

            <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
              {project ? `最近更新 ${formatDate(project.updated_at)}` : '等待项目上下文'}
            </div>
          </aside>
        ) : null}

        {shouldRenderAIPanel ? (
          <div className="relative hidden shrink-0 xl:block" style={{ width: aiPanelWidth }}>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="调整 AI 侧栏宽度"
              className="absolute inset-y-0 left-0 z-10 w-3 cursor-col-resize"
              onPointerDown={(event) => {
                event.preventDefault()
                setAIResizeState({ startX: event.clientX, startWidth: aiPanelWidth })
              }}
            />
            <aside
              className="ml-3 flex h-full flex-col border-l border-border bg-[#fcfcfd]"
              style={{ width: aiPanelWidth - 12 }}
            >
              <div className="min-h-0 flex-1">{renderAIPanel(closeAIPanel)}</div>
            </aside>
          </div>
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
                  to={`/projects/${projectId}/ai-workspace`}
                  label="AI 工作区"
                  active={location.pathname === `/projects/${projectId}/ai-workspace`}
                  onNavigate={() => setIsProjectTreeOpen(false)}
                />
                <ProjectTreeLink
                  to={`/projects/${projectId}/characters`}
                  label="角色库"
                  active={location.pathname === `/projects/${projectId}/characters`}
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
              <div className="grid flex-1 grid-cols-2 rounded-2xl bg-[#f3f4f6] p-1">
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

            <div className="flex-1 overflow-y-auto px-5 py-5">
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
                    to={`/projects/${projectId}/characters`}
                    label="打开项目角色库"
                    meta="专页支持返回当前章节"
                    active={location.pathname === `/projects/${projectId}/characters`}
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
            </div>
          </aside>
        </div>
      ) : null}

      {shouldRenderAIPanel ? (
        <div
          className="fixed inset-0 z-40 bg-black/30 xl:hidden"
          onClick={closeAIPanel}
          aria-hidden="true"
        >
          <aside
            className="ml-auto flex h-full w-[min(92vw,440px)] flex-col border-l border-[#e5e7eb] bg-[#fcfcfd] shadow-2xl shadow-black/10"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="min-h-0 flex-1">{renderAIPanel(closeAIPanel)}</div>
          </aside>
        </div>
      ) : null}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{children}</div>
}

function HeaderIconButton({
  icon: Icon,
  label,
  shortcut,
  active = false,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  shortcut: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        aria-label={`${label}，快捷键 ${shortcut}`}
        onClick={onClick}
        className={clsx(
          'inline-flex size-10 items-center justify-center rounded-xl border bg-white transition',
          active
            ? 'border-primary/35 bg-primary/10 text-primary'
            : 'border-[#e5e7eb] text-[#6b7280] hover:border-[#d1d5db] hover:text-[#111827]',
        )}
      >
        <Icon className="size-4" />
      </button>
      <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1 text-xs text-popover-foreground shadow-lg group-hover:block">
        {label} {shortcut}
      </div>
    </div>
  )
}

function ShortcutRow({ label, shortcut }: { label: string; shortcut: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2">
      <span>{label}</span>
      <span className="text-xs text-muted-foreground">{shortcut}</span>
    </div>
  )
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


