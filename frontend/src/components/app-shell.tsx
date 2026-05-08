import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import {
  ArrowLeft,
  Bot,
  BookCopy,
  Check,
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
  RefreshCw,
  SendHorizontal,
  Settings2,
  Sparkles,
  Users2,
} from 'lucide-react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
import type { AIGeneratePayload, AIContextPreviewResponse, AIContinuationDebugResponse, AIContinuationGenerateResponse, AIContinuationTraceStep, AIRetrievalPreviewResponse, ProjectDetail } from '@/types/api'
import { useAuth } from '@/contexts/auth-context'

const primaryNavItems = [
  { to: '/workspace', label: '首页', icon: Home, end: true },
  { to: '/characters', label: '角色库', icon: Users2, end: false },
  { to: '/ai-toolbox', label: 'AI 工具箱', icon: Sparkles, end: false },
  { to: '/settings', label: '设置', icon: Settings2, end: false },
]

type UtilityTabKey = 'characters' | 'world'
type AIChatMessageRole = 'assistant' | 'user'
type AIDiagnosticsTab = 'risk' | 'context' | 'retrieval' | 'pipeline'

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
  isDiagnosticsDialogOpen: boolean
  activeDiagnosticsTab: AIDiagnosticsTab
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
const AI_MODEL_USAGE_STORAGE_KEY = 'storyweave-ai-model-usage'
const DEFAULT_AI_PANEL_WIDTH = 420
const MIN_AI_PANEL_WIDTH = 320
const MAX_AI_PANEL_WIDTH = 640
const EDITOR_SHORTCUT_HINT_STORAGE_KEY = 'storyweave-editor-shortcut-hint-dismissed'
const EDITOR_AI_PANEL_SNAPSHOTS_STORAGE_KEY = 'storyweave-editor-ai-panel-snapshots'
const PIPELINE_TRACE_STEP_ORDER = ['planner', 'retriever', 'context_bundle', 'writer', 'checker', 'final_output'] as const
const PIPELINE_TRACE_STEP_META = [
  { step_key: 'planner', label: '分析承接点' },
  { step_key: 'retriever', label: '检索相关剧情' },
  { step_key: 'context_bundle', label: '整理角色与伏笔' },
  { step_key: 'writer', label: '生成正文' },
  { step_key: 'checker', label: '检查连续性' },
  { step_key: 'final_output', label: '完成' },
] as const
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

function buildLivePipelineTrace(elapsedMs: number): AIContinuationTraceStep[] {
  const liveIndex = Math.min(Math.floor(elapsedMs / 1800), PIPELINE_TRACE_STEP_META.length - 1)
  return PIPELINE_TRACE_STEP_META.map((item, index) => ({
    step_key: item.step_key,
    label: item.label,
    status: index < liveIndex ? 'completed' : index === liveIndex ? 'running' : 'pending',
    warnings: [],
    fallbacks: [],
    duration_ms: index < liveIndex ? 1800 : undefined,
  }))
}

function getUserVisibleTraceSteps(trace: AIContinuationTraceStep[] | null | undefined): AIContinuationTraceStep[] {
  const steps = trace ?? []
  const mapped = PIPELINE_TRACE_STEP_ORDER
    .map((key) => steps.find((item) => item.step_key === key))
    .filter((item): item is AIContinuationTraceStep => Boolean(item))
  return mapped
}

function getTraceStatusTone(status: string) {
  if (status === 'completed') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  }
  if (status === 'running') {
    return 'border-sky-200 bg-sky-50 text-sky-700'
  }
  if (status === 'skipped') {
    return 'border-amber-200 bg-amber-50 text-amber-700'
  }
  if (status === 'failed') {
    return 'border-rose-200 bg-rose-50 text-rose-700'
  }
  return 'border-[#e5e7eb] bg-white text-[#6b7280]'
}

function getTraceStatusLabel(status: string) {
  if (status === 'completed') {
    return '已完成'
  }
  if (status === 'running') {
    return '进行中'
  }
  if (status === 'skipped') {
    return '已跳过'
  }
  if (status === 'failed') {
    return '失败'
  }
  return '待开始'
}

function formatTraceDuration(durationMs: number | null | undefined) {
  if (typeof durationMs !== 'number' || Number.isNaN(durationMs)) {
    return '--'
  }
  if (durationMs < 1000) {
    return `${durationMs} ms`
  }
  return `${(durationMs / 1000).toFixed(durationMs >= 10_000 ? 0 : 1)} s`
}

function summarizeTraceStep(step: AIContinuationTraceStep) {
  const summary = step.output_summary ?? {}
  if (step.step_key === 'planner') {
    const writingGoal = typeof summary.writing_goal === 'string' ? summary.writing_goal : ''
    return writingGoal || '已生成续写计划'
  }
  if (step.step_key === 'retriever') {
    const chunkCount = typeof summary.chunk_count === 'number' ? summary.chunk_count : 0
    const graphEvidenceCount = typeof summary.graph_evidence_count === 'number' ? summary.graph_evidence_count : 0
    return `召回 ${chunkCount} 段正文，${graphEvidenceCount} 条图谱证据`
  }
  if (step.step_key === 'context_bundle') {
    const estimatedTokens = typeof summary.estimated_tokens === 'number' ? summary.estimated_tokens : 0
    return `上下文装配完成，预计 ${estimatedTokens} tokens`
  }
  if (step.step_key === 'writer') {
    const contentLength = typeof summary.content_length === 'number' ? summary.content_length : 0
    return `正文生成完成，约 ${contentLength} 字符`
  }
  if (step.step_key === 'checker') {
    const severity = typeof summary.severity === 'string' ? summary.severity : 'unknown'
    return `连续性检查完成，风险等级 ${severity}`
  }
  if (step.step_key === 'fallback_decision') {
    const fallbackCount = typeof summary.fallback_count === 'number' ? summary.fallback_count : 0
    const warningCount = typeof summary.warning_count === 'number' ? summary.warning_count : 0
    return `${fallbackCount} 次 fallback，${warningCount} 条告警`
  }
  if (step.step_key === 'final_output') {
    return '结果已返回到编辑器'
  }
  return ''
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

interface AIModelUsageRecord {
  count: number
  lastUsedAt: number
}

function readAIModelUsage() {
  if (typeof window === 'undefined') {
    return {} as Record<string, AIModelUsageRecord>
  }

  try {
    const raw = window.localStorage.getItem(AI_MODEL_USAGE_STORAGE_KEY)
    if (!raw) {
      return {} as Record<string, AIModelUsageRecord>
    }

    const parsed = JSON.parse(raw) as Record<string, Partial<AIModelUsageRecord>>
    if (!parsed || typeof parsed !== 'object') {
      return {} as Record<string, AIModelUsageRecord>
    }

    return Object.fromEntries(
      Object.entries(parsed)
        .filter((entry): entry is [string, Partial<AIModelUsageRecord>] => typeof entry[0] === 'string')
        .map(([modelId, record]) => [
          modelId,
          {
            count: Number(record.count) > 0 ? Number(record.count) : 0,
            lastUsedAt: Number(record.lastUsedAt) > 0 ? Number(record.lastUsedAt) : 0,
          },
        ]),
    )
  } catch {
    return {} as Record<string, AIModelUsageRecord>
  }
}

function writeAIModelUsage(value: Record<string, AIModelUsageRecord>) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(AI_MODEL_USAGE_STORAGE_KEY, JSON.stringify(value))
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
  const [isShortcutMenuOpen, setIsShortcutMenuOpen] = useState(false)
  const [aiState, setAIState] = useState<AIComposerState>(DEFAULT_AI_COMPOSER_STATE)
  const [aiMessages, setAIMessages] = useState<AIChatMessage[]>([])
  const [contextPreview, setContextPreview] = useState<AIContextPreviewResponse | null>(null)
  const [retrievalPreview, setRetrievalPreview] = useState<AIRetrievalPreviewResponse | null>(null)
  const [pipelineDebug, setPipelineDebug] = useState<AIContinuationDebugResponse | null>(null)
  const [pipelineResult, setPipelineResult] = useState<AIContinuationGenerateResponse | null>(null)
  const [pipelineRunStartedAt, setPipelineRunStartedAt] = useState<number | null>(null)
  const [pipelineTraceTick, setPipelineTraceTick] = useState(0)
  const [useContinuationPipeline, setUseContinuationPipeline] = useState(false)
  const [isContextPreviewLoading, setIsContextPreviewLoading] = useState(false)
  const [isRetrievalPreviewLoading, setIsRetrievalPreviewLoading] = useState(false)
  const [isPipelineDebugLoading, setIsPipelineDebugLoading] = useState(false)
  const [isDiagnosticsDialogOpen, setIsDiagnosticsDialogOpen] = useState(false)
  const [activeDiagnosticsTab, setActiveDiagnosticsTab] = useState<AIDiagnosticsTab>('risk')
  const [modelUsage, setModelUsage] = useState<Record<string, AIModelUsageRecord>>(() => readAIModelUsage())
  const generationAbortRef = useRef<AbortController | null>(null)
  const aiPanelSnapshotRef = useRef<Record<string, AIPanelSnapshot>>(readAIPanelSnapshots())
  const previousAIScopeKeyRef = useRef<string | null>(null)
  const shortcutMenuRef = useRef<HTMLDivElement | null>(null)

  const diagnosticsTrace = useMemo(
    () => (pipelineDebug?.trace?.length ? pipelineDebug.trace : pipelineResult?.trace ?? []),
    [pipelineDebug, pipelineResult],
  )
  const pipelineStepTrace = useMemo(() => {
    if (aiState.isGenerating && useContinuationPipeline && pipelineRunStartedAt) {
      const elapsedMs = Math.max(0, (pipelineTraceTick || Date.now()) - pipelineRunStartedAt)
      return buildLivePipelineTrace(elapsedMs)
    }
    return getUserVisibleTraceSteps(diagnosticsTrace)
  }, [aiState.isGenerating, useContinuationPipeline, pipelineRunStartedAt, pipelineTraceTick, diagnosticsTrace])
  const pipelineTraceTotalDurationMs = useMemo(
    () => diagnosticsTrace.reduce((total, step) => total + (typeof step.duration_ms === 'number' ? step.duration_ms : 0), 0),
    [diagnosticsTrace],
  )
  const activePipelineStep = useMemo(
    () => pipelineStepTrace.find((step) => step.status === 'running') ?? pipelineStepTrace.find((step) => step.status === 'pending') ?? null,
    [pipelineStepTrace],
  )

  useEffect(() => {
    if (!(aiState.isGenerating && useContinuationPipeline && pipelineRunStartedAt)) {
      return
    }

    const timer = window.setInterval(() => {
      setPipelineTraceTick(Date.now())
    }, 900)
    return () => window.clearInterval(timer)
  }, [aiState.isGenerating, useContinuationPipeline, pipelineRunStartedAt])

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
      isDiagnosticsDialogOpen,
      activeDiagnosticsTab,
    }
    writeAIPanelSnapshots(aiPanelSnapshotRef.current)
  }, [aiMessages, aiState, contextPreview, retrievalPreview, pipelineDebug, pipelineResult, useContinuationPipeline, currentAIScopeKey, isDiagnosticsDialogOpen, activeDiagnosticsTab])

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
          isDiagnosticsDialogOpen: false,
          activeDiagnosticsTab: previousSnapshot.activeDiagnosticsTab ?? 'risk',
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
      setIsDiagnosticsDialogOpen(false)
      setActiveDiagnosticsTab('risk')
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
      setIsDiagnosticsDialogOpen(nextSnapshot.isDiagnosticsDialogOpen ?? false)
      setActiveDiagnosticsTab(nextSnapshot.activeDiagnosticsTab ?? 'risk')
    } else {
      setAIState(buildDefaultAIComposerState(scopedEditorUtilityContext))
      setAIMessages([])
      setContextPreview(null)
      setRetrievalPreview(null)
      setPipelineDebug(null)
      setPipelineResult(null)
      setUseContinuationPipeline(false)
      setIsDiagnosticsDialogOpen(false)
      setActiveDiagnosticsTab('risk')
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
    setIsDiagnosticsDialogOpen(false)
    setActiveDiagnosticsTab('risk')
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

  function recordModelUsage(modelId: string) {
    const nextUsage: Record<string, AIModelUsageRecord> = {
      ...modelUsage,
      [modelId]: {
        count: (modelUsage[modelId]?.count ?? 0) + 1,
        lastUsedAt: Date.now(),
      },
    }
    setModelUsage(nextUsage)
    writeAIModelUsage(nextUsage)
  }

  function handleSelectModel(modelId: string) {
    setAIState((prev) => ({ ...prev, result: '', modelId }))
    recordModelUsage(modelId)
    toast.success(`下一次生成将使用模型：${modelId}`)
  }

  function handleStopGeneration() {
    generationAbortRef.current?.abort()
    generationAbortRef.current = null
    setPipelineRunStartedAt(null)
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
    setPipelineRunStartedAt(null)
    setPipelineTraceTick(0)
    setUseContinuationPipeline(false)
    setIsDiagnosticsDialogOpen(false)
    setActiveDiagnosticsTab('risk')
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
      setActiveDiagnosticsTab('context')
      setIsDiagnosticsDialogOpen(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '上下文预览加载失败')
    } finally {
      setIsContextPreviewLoading(false)
      setIsRetrievalPreviewLoading(false)
    }
  }

  async function handleOpenDiagnosticsCenter() {
    if (contextPreview || retrievalPreview || pipelineResult || pipelineDebug) {
      openDiagnosticsDialog(
        pipelineResult
          ? 'risk'
          : contextPreview
            ? 'context'
            : retrievalPreview
              ? 'retrieval'
              : 'pipeline',
      )
      return
    }

    await handleLoadContextPreview()
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
    setPipelineResult(null)
    setPipelineDebug(null)
    setPipelineRunStartedAt(useContinuationPipeline ? Date.now() : null)
    setPipelineTraceTick(Date.now())
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
        setPipelineRunStartedAt(null)
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
      setPipelineRunStartedAt(null)
    } catch (error) {
      const normalizedError = normalizeAIError(error)
      setAIState((prev) => (prev.requestId === requestId ? { ...prev, isGenerating: false } : prev))
      setPipelineRunStartedAt(null)
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
      setActiveDiagnosticsTab('pipeline')
      setIsDiagnosticsDialogOpen(true)
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
    setPipelineRunStartedAt(null)
  }

  function openDiagnosticsDialog(tab: AIDiagnosticsTab) {
    setActiveDiagnosticsTab(tab)
    setIsDiagnosticsDialogOpen(true)
  }

  function handleSelectContinuationChain(nextUsePipeline: boolean) {
    if (currentAIScopeKey) {
      const previousSnapshot = aiPanelSnapshotRef.current[currentAIScopeKey]
      aiPanelSnapshotRef.current[currentAIScopeKey] = {
        ...previousSnapshot,
        aiState: { ...aiState, isGenerating: false },
        aiMessages,
        contextPreview,
        retrievalPreview,
        pipelineDebug,
        pipelineResult,
        useContinuationPipeline: nextUsePipeline,
        isDiagnosticsDialogOpen,
        activeDiagnosticsTab,
      }
      writeAIPanelSnapshots(aiPanelSnapshotRef.current)
    }
    setUseContinuationPipeline(nextUsePipeline)
    toast.success(`已切换为${nextUsePipeline ? 'Pipeline' : '旧链路'}生成`)
  }

  const diagnosticsTabs = [
    { key: 'risk' as const, label: '风险提示', visible: Boolean(pipelineResult) },
    { key: 'context' as const, label: '上下文', visible: Boolean(contextPreview) },
    { key: 'retrieval' as const, label: '检索', visible: Boolean(retrievalPreview) },
    { key: 'pipeline' as const, label: '链路追踪', visible: Boolean(pipelineDebug || pipelineResult?.trace?.length) },
  ].filter((item) => item.visible)

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
            {useContinuationPipeline && (aiState.isGenerating || pipelineStepTrace.length > 0) ? (
              <div className="mt-4 rounded-2xl border border-[#e5e7eb] bg-white px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-[#9ca3af]">Pipeline 进度</div>
                  {diagnosticsTrace.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => openDiagnosticsDialog('pipeline')}
                      className="inline-flex h-7 items-center rounded-full border border-[#d1d5db] bg-white px-3 text-[11px] text-[#4b5563] transition hover:border-[#9ca3af] hover:text-[#111827]"
                    >
                      查看链路
                    </button>
                  ) : null}
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-[#111827]">
                    {aiState.isGenerating
                      ? activePipelineStep
                        ? `${activePipelineStep.label}中`
                        : '正在准备 Pipeline'
                      : pipelineStepTrace[pipelineStepTrace.length - 1]?.status === 'completed'
                        ? 'Pipeline 已完成'
                        : 'Pipeline 已结束'}
                  </div>
                  {diagnosticsTrace.length > 0 ? (
                    <div className="text-xs text-[#9ca3af]">总耗时 {formatTraceDuration(pipelineTraceTotalDurationMs)}</div>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {pipelineStepTrace.map((step, index) => (
                    <div
                      key={step.step_key}
                      className={clsx(
                        'inline-flex min-h-[34px] items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition',
                        getTraceStatusTone(step.status),
                      )}
                    >
                      <span className="inline-flex size-4 items-center justify-center rounded-full bg-black/5 text-[10px] font-medium">
                        {step.status === 'completed' ? <Check className="size-3" /> : step.status === 'running' ? <LoaderCircle className="size-3 animate-spin" /> : index + 1}
                      </span>
                      <span>{step.label}</span>
                    </div>
                  ))}
                </div>
                {diagnosticsTrace.length > 0 ? (
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-xl bg-[#f8fafc] px-3 py-2 text-[#4b5563]">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-[#9ca3af]">告警</div>
                      <div className="mt-1 text-sm font-medium text-[#111827]">{pipelineResult?.warnings.length ?? pipelineDebug?.warnings.length ?? 0}</div>
                    </div>
                    <div className="rounded-xl bg-[#f8fafc] px-3 py-2 text-[#4b5563]">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-[#9ca3af]">Fallback</div>
                      <div className="mt-1 text-sm font-medium text-[#111827]">{pipelineResult?.fallbacks.length ?? pipelineDebug?.fallbacks.length ?? 0}</div>
                    </div>
                    <div className="rounded-xl bg-[#f8fafc] px-3 py-2 text-[#4b5563]">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-[#9ca3af]">步骤</div>
                      <div className="mt-1 text-sm font-medium text-[#111827]">{diagnosticsTrace.length}</div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
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

              <div className="mt-3 border-t border-[#eef0f3] pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        disabled={!hasSavedRuntimeKey || runtimeSettingsQuery.isLoading}
                        className="inline-flex h-8 w-[140px] items-center justify-between rounded-full border border-[#d1d5db] bg-white px-3 text-[11px] text-[#4b5563] transition hover:border-[#9ca3af] hover:text-[#111827] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="truncate">{isLoadingModels && !selectedModelId ? '加载模型中...' : selectedModelId || '选择模型'}</span>
                        <ChevronDown className="size-3.5 shrink-0 transition" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="top" align="start" className="w-[280px] p-2">
                      <div className="flex items-center justify-between px-1 pb-1.5">
                        <DropdownMenuLabel className="px-0 py-0">可用模型</DropdownMenuLabel>
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); void handleLoadModels() }}
                          disabled={isLoadingModels || !hasSavedRuntimeKey}
                          className="inline-flex size-6 items-center justify-center rounded-lg text-[#9ca3af] transition hover:bg-[#f3f4f6] hover:text-[#374151] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {isLoadingModels ? <LoaderCircle className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                        </button>
                      </div>
                      <DropdownMenuSeparator />
                      <div className="max-h-[320px] overflow-y-auto">
                        {availableModels.length === 0 ? (
                          <div className="px-2 py-3 text-xs leading-5 text-[#9ca3af]">
                            {hasSavedRuntimeKey ? '暂无模型，点击右上角刷新按钮加载' : '请先在设置中心配置 API Key'}
                          </div>
                        ) : (
                          <div className="space-y-0.5">
                            {availableModels.map((model) => {
                              const isSelected = model.id === selectedModelId
                              return (
                                <DropdownMenuItem
                                  key={model.id}
                                  onSelect={() => handleSelectModel(model.id)}
                                  className={isSelected ? 'bg-emerald-50 text-emerald-700 focus:bg-emerald-50 focus:text-emerald-700' : ''}
                                >
                                  <span className="truncate">{model.id}</span>
                                  {isSelected && <Check className="ml-auto size-3.5 shrink-0" />}
                                </DropdownMenuItem>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <button
                    type="button"
                    onClick={() => void handleOpenDiagnosticsCenter()}
                    disabled={isContextPreviewLoading || isRetrievalPreviewLoading || aiState.isGenerating}
                    className="inline-flex h-8 items-center gap-2 rounded-full border border-[#d1d5db] bg-white px-3 text-[11px] text-[#4b5563] transition hover:border-[#9ca3af] hover:text-[#111827] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isContextPreviewLoading || isRetrievalPreviewLoading ? <LoaderCircle className="size-3 animate-spin" /> : <BookCopy className="size-3.5" />}
                    诊断中心
                  </button>
                  <Select
                    value={useContinuationPipeline ? 'pipeline' : 'legacy'}
                    onValueChange={(value) => handleSelectContinuationChain(value === 'pipeline')}
                    disabled={aiState.isGenerating}
                  >
                    <SelectTrigger className="h-8 w-[120px] rounded-full border-[#d1d5db] bg-white px-3 text-[11px] text-[#4b5563] shadow-none hover:border-[#9ca3af] hover:text-[#111827]">
                      <SelectValue placeholder="选择链路" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="legacy">旧链路</SelectItem>
                      <SelectItem value="pipeline">Pipeline</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {aiState.result.trim() && !aiState.isGenerating ? (
                  <button
                    type="button"
                    onClick={handleApplyGeneratedText}
                    className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-xl bg-[#111827] px-4 text-sm font-medium text-white transition hover:bg-[#1f2937]"
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

            </div>

          </div>
        </div>
      </div>
    )
  }

  const diagnosticsDialog = diagnosticsTabs.length > 0 ? (
    <Dialog open={isDiagnosticsDialogOpen} onOpenChange={setIsDiagnosticsDialogOpen}>
      <DialogContent className="max-w-6xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <DialogTitle>诊断中心</DialogTitle>
            <button
              type="button"
              onClick={() => void handleRunPipelineDebug()}
              disabled={isPipelineDebugLoading || aiState.isGenerating}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-background px-4 text-xs text-foreground/75 transition hover:border-primary/35 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPipelineDebugLoading ? <LoaderCircle className="size-3.5 animate-spin" /> : <Bot className="size-3.5" />}
              运行深度诊断
            </button>
          </div>
        </DialogHeader>
        <div className="flex border-b border-border px-6 py-3">
          <div className="flex flex-wrap gap-2">
            {diagnosticsTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveDiagnosticsTab(tab.key)}
                className={clsx(
                  'inline-flex h-8 items-center rounded-full border px-3 text-xs transition',
                  activeDiagnosticsTab === tab.key
                    ? 'border-[#111827] bg-[#111827] text-white'
                    : 'border-border bg-background text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-[78vh] overflow-y-auto px-6 py-5">
          {activeDiagnosticsTab === 'risk' && pipelineResult ? (
            <div className="space-y-4">
              <div
                className={clsx(
                  'rounded-2xl border px-4 py-4 text-sm',
                  pipelineResult.continuity_report?.severity === 'high'
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : pipelineResult.continuity_report?.severity === 'medium'
                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-700',
                )}
              >
                {pipelineResult.continuity_report?.summary || '未发现明显连续性风险。'}
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                <div>severity: {pipelineResult.continuity_report?.severity ?? 'unknown'}</div>
                <div>warnings: {pipelineResult.warnings.length}</div>
                <div>fallbacks: {pipelineResult.fallbacks.length}</div>
                <div>checker: {pipelineResult.metadata?.checker_used ? 'enabled' : 'unknown'}</div>
              </div>
              {pipelineResult.warnings.length > 0 ? (
                <div className="rounded-2xl border border-border bg-background px-4 py-4">
                  <div className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">Warnings</div>
                  <div className="space-y-2">
                    {pipelineResult.warnings.map((item) => (
                      <div key={item} className="text-sm leading-7 text-foreground">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {pipelineResult.fallbacks.length > 0 ? (
                <div className="rounded-2xl border border-border bg-background px-4 py-4">
                  <div className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">Fallbacks</div>
                  <div className="flex flex-wrap gap-2">
                    {pipelineResult.fallbacks.map((item) => (
                      <span key={item} className="rounded-full border border-border bg-muted/20 px-3 py-1 text-xs text-foreground/75">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="rounded-2xl border border-border bg-background px-4 py-4">
                <div className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">Continuity Report</div>
                <pre className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground">
                  {JSON.stringify(pipelineResult.continuity_report, null, 2)}
                </pre>
              </div>
            </div>
          ) : null}

          {activeDiagnosticsTab === 'context' && contextPreview ? (
            <div className="space-y-4">
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
          ) : null}

          {activeDiagnosticsTab === 'retrieval' && retrievalPreview ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                <div>candidate: {retrievalPreview.metadata.candidate_count ?? 0}</div>
                <div>matched: {retrievalPreview.metadata.matched_count ?? 0}</div>
                <div>returned: {retrievalPreview.metadata.returned_count ?? 0}</div>
                <div>chapter found: {retrievalPreview.metadata.chapter_found ? 'yes' : 'no'}</div>
              </div>
              <div className="rounded-2xl border border-border bg-background px-4 py-4">
                <div className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">Query Terms</div>
                <div className="flex flex-wrap gap-2">
                  {retrievalPreview.query_terms.length > 0 ? (
                    retrievalPreview.query_terms.map((term) => (
                      <span key={term} className="rounded-full border border-border bg-muted/20 px-3 py-1 text-xs text-foreground/75">
                        {term}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">暂无 query terms</span>
                  )}
                </div>
              </div>
              <div className="space-y-3">
                {retrievalPreview.chunks.map((chunk) => (
                  <div key={chunk.chunk_id} className="rounded-2xl border border-border bg-background px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          Chapter {chunk.chapter_order} · Chunk {chunk.chunk_index + 1}
                        </div>
                        <div className="mt-1 text-sm font-medium text-foreground">{chunk.scene_label || '未命名片段'}</div>
                      </div>
                      <div className="rounded-full border border-border bg-muted/20 px-3 py-1 text-xs text-foreground/75">
                        {chunk.score.toFixed(2)}
                      </div>
                    </div>
                    <pre className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-foreground">
                      {chunk.content_short || chunk.content}
                    </pre>
                    {chunk.match_reasons.length > 0 ? (
                      <div className="mt-3 space-y-1">
                        {chunk.match_reasons.map((reason) => (
                          <div key={`${chunk.chunk_id}-${reason}`} className="text-xs text-muted-foreground">
                            {reason}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
                {retrievalPreview.chunks.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                    当前没有召回到可用正文片段。
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {activeDiagnosticsTab === 'pipeline' && (pipelineDebug || diagnosticsTrace.length > 0) ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-2xl border border-border bg-background px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">步骤数</div>
                  <div className="mt-1 text-lg font-semibold text-foreground">{diagnosticsTrace.length}</div>
                </div>
                <div className="rounded-2xl border border-border bg-background px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">总耗时</div>
                  <div className="mt-1 text-lg font-semibold text-foreground">{formatTraceDuration(pipelineTraceTotalDurationMs)}</div>
                </div>
                <div className="rounded-2xl border border-border bg-background px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Fallback</div>
                  <div className="mt-1 text-lg font-semibold text-foreground">{(pipelineDebug?.fallbacks ?? pipelineResult?.fallbacks ?? []).length}</div>
                </div>
                <div className="rounded-2xl border border-border bg-background px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">告警</div>
                  <div className="mt-1 text-lg font-semibold text-foreground">{(pipelineDebug?.warnings ?? pipelineResult?.warnings ?? []).length}</div>
                </div>
              </div>
              {diagnosticsTrace.length > 0 ? (
                <div className="space-y-3">
                  {diagnosticsTrace.map((step) => (
                    <div key={step.step_key} className="rounded-2xl border border-border bg-background px-4 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{step.step_key}</div>
                          <div className="mt-1 text-sm font-medium text-foreground">{step.label}</div>
                          {summarizeTraceStep(step) ? (
                            <div className="mt-1 text-xs leading-5 text-muted-foreground">{summarizeTraceStep(step)}</div>
                          ) : null}
                        </div>
                        <div className={clsx('rounded-full border px-3 py-1 text-xs', getTraceStatusTone(step.status))}>
                          {getTraceStatusLabel(step.status)}
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                        <div>耗时: {formatTraceDuration(step.duration_ms)}</div>
                        <div>warnings: {step.warnings.length}</div>
                        <div>fallbacks: {step.fallbacks.length}</div>
                      </div>
                      {step.input_summary && Object.keys(step.input_summary).length > 0 ? (
                        <div className="mt-3 rounded-xl bg-muted/25 px-3 py-3">
                          <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Input Summary</div>
                          <pre className="whitespace-pre-wrap break-words text-xs leading-6 text-foreground">{JSON.stringify(step.input_summary, null, 2)}</pre>
                        </div>
                      ) : null}
                      {step.output_summary && Object.keys(step.output_summary).length > 0 ? (
                        <div className="mt-3 rounded-xl bg-muted/25 px-3 py-3">
                          <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Output Summary</div>
                          <pre className="whitespace-pre-wrap break-words text-xs leading-6 text-foreground">{JSON.stringify(step.output_summary, null, 2)}</pre>
                        </div>
                      ) : null}
                      {step.warnings.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {step.warnings.map((item) => (
                            <span key={`${step.step_key}-warning-${item}`} className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-700">
                              {item}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {step.fallbacks.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {step.fallbacks.map((item) => (
                            <span key={`${step.step_key}-fallback-${item}`} className="rounded-full border border-border bg-muted/20 px-3 py-1 text-xs text-foreground/75">
                              {item}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {(pipelineDebug?.fallbacks ?? pipelineResult?.fallbacks ?? []).length > 0 ? (
                <div className="rounded-2xl border border-border bg-background px-4 py-4">
                  <div className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">Fallbacks</div>
                  <div className="flex flex-wrap gap-2">
                    {(pipelineDebug?.fallbacks ?? pipelineResult?.fallbacks ?? []).map((item) => (
                      <span key={item} className="rounded-full border border-border bg-muted/20 px-3 py-1 text-xs text-foreground/75">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {pipelineDebug ? (
                <>
                  <div className="rounded-2xl border border-border bg-background px-4 py-4">
                    <div className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">Plan</div>
                    <pre className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground">{JSON.stringify(pipelineDebug.plan, null, 2)}</pre>
                  </div>
                  <div className="rounded-2xl border border-border bg-background px-4 py-4">
                    <div className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">Continuity Report</div>
                    <pre className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground">{JSON.stringify(pipelineDebug.continuity_report, null, 2)}</pre>
                  </div>
                  <div className="rounded-2xl border border-border bg-muted/25 px-4 py-4">
                    <div className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">Pipeline Output</div>
                    <pre className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground">{pipelineDebug.final_content}</pre>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  ) : null

  return (
    <div className="flex h-screen bg-background text-foreground selection:bg-primary/15 selection:text-foreground">
      {diagnosticsDialog}
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


