import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import {
  Bot,
  CheckCircle2,
  Clock3,
  Globe2,
  LoaderCircle,
  MessageCircleQuestion,
  Plus,
  Search,
  Sparkles,
  Trash2,
  TriangleAlert,
  Users2,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  ProjectAssetAIPanel,
  type ProjectAssetAIPanelState,
} from '@/components/project-asset-ai-panel'
import { EmptyState } from '@/components/empty-state'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getCapabilityStatusMeta, matchAIRuntimeCapabilitySnapshot } from '@/lib/ai-runtime-capabilities'
import {
  type ProjectAIWorkspaceDetailTab,
  type ProjectAIWorkspaceSession,
  type ProjectAIWorkspaceSessionState,
  useProjectAIWorkspaceStore,
} from '@/lib/project-ai-workspace'
import { queryClient } from '@/lib/query-client'
import {
  applyCharacterPatch,
  analyzeCharacters,
  analyzeWorldSetting,
  applyWorldSettingPatch,
  uploadProjectAssetFile,
} from '@/services/project-asset-ai'
import { getAIRuntimeSettings, askStoryQA } from '@/services/ai'
import { getProject } from '@/services/projects'
import type {
  AssetChatSSEDraftReadyEvent,
  ProjectAssetAIMessage,
  ProjectAssetAIType,
  ProjectDetail,
  CharacterActionItem,
  WorldSettingPatch,
} from '@/types/api'

type SessionTaskStatus = ProjectAIWorkspaceSessionState['taskStatus']

const tabOptions: Array<{ key: ProjectAIWorkspaceDetailTab; label: string }> = [
  { key: 'result', label: '结果' },
  { key: 'context', label: '上下文' },
  { key: 'task', label: '任务' },
]

function displaySessionTitle(session: ProjectAIWorkspaceSession) {
  if (session.assetType === 'story_qa') {
    const title = session.title.replace(/^故事问答\s*\/\s*/, '').trim()
    return !title || title === '默认会话' ? '故事问答' : title
  }
  const title = session.title.replace(/^角色助手\s*\/\s*/, '').replace(/^世界观助手\s*\/\s*/, '').trim()

  if (!title || title === '默认会话') {
    return session.assetType === 'project_character' ? '角色助手' : '世界观助手'
  }

  if (
    session.assetType === 'world_setting' &&
    ['世界规则', '势力', '地点', '时间线'].every((keyword) => title.includes(keyword))
  ) {
    return '世界观助手'
  }

  return title
}

function stripToolMessages(messages: ProjectAssetAIMessage[]) {
  return messages.filter((message) => message.role !== 'tool')
}

function buildWorldSettingResultMessage(params: {
  userMessage: string
  notes: string[]
  patch: WorldSettingPatch
  appliedSources: string[]
}) {
  const patchLines = [
    params.patch.title?.trim() ? `标题：${params.patch.title.trim()}` : '',
    params.patch.overview?.trim() ? `概览：${params.patch.overview.trim()}` : '',
    params.patch.rules?.trim() ? `规则：${params.patch.rules.trim()}` : '',
    params.patch.factions?.trim() ? `势力：${params.patch.factions.trim()}` : '',
    params.patch.locations?.trim() ? `地点：${params.patch.locations.trim()}` : '',
    params.patch.timeline?.trim() ? `时间线：${params.patch.timeline.trim()}` : '',
    params.patch.extra_notes?.trim() ? `补充备注：${params.patch.extra_notes.trim()}` : '',
  ].filter(Boolean)
  const noteLines = params.notes.filter((item) => item.trim()).map((item) => `- ${item.trim()}`)
  const sourceLine = params.appliedSources.length > 0 ? `参考来源：${params.appliedSources.join('、')}` : ''

  return [
    params.userMessage.trim() ? '我已根据你的要求整理出一版世界观设定草案。' : '我已整理出一版世界观设定草案。',
    patchLines.length > 0 ? patchLines.join('\n') : '这次没有生成可写入的结构化字段，请调整指令后重试。',
    noteLines.length > 0 ? `说明：\n${noteLines.join('\n')}` : '',
    sourceLine,
    patchLines.length > 0 ? '如果方向符合预期，可以直接应用写入。' : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

function buildCharacterResultMessage(params: {
  userMessage: string
  notes: string[]
  actions: CharacterActionItem[]
}) {
  const actionLines = params.actions.map((action, index) => {
    const parts = [
      `${index + 1}. ${action.action === 'create_and_attach' ? '新建并绑定角色' : '更新项目角色'}：${action.name}`,
      action.role_label?.trim() ? `角色定位：${action.role_label.trim()}` : '',
      action.summary?.trim() ? `摘要：${action.summary.trim()}` : '',
      action.description?.trim() ? `描述：${action.description.trim()}` : '',
      action.profile?.trim() ? `人物档案：${action.profile.trim()}` : '',
      action.personality?.trim() ? `性格：${action.personality.trim()}` : '',
      action.background?.trim() ? `背景：${action.background.trim()}` : '',
      action.relationship_notes?.trim() ? `关系备注：${action.relationship_notes.trim()}` : '',
      action.tags?.trim() ? `标签：${action.tags.trim()}` : '',
    ].filter(Boolean)

    return parts.join('\n')
  })
  const noteLines = params.notes.filter((item) => item.trim()).map((item) => `- ${item.trim()}`)

  return [
    params.userMessage.trim() ? '我已根据你的要求整理出一版角色建议草稿。' : '我已整理出一版角色建议草稿。',
    actionLines.length > 0 ? actionLines.join('\n\n') : '这次没有生成可写入的角色动作，请调整指令后重试。',
    noteLines.length > 0 ? `说明：\n${noteLines.join('\n')}` : '',
    actionLines.length > 0 ? '如果这些建议符合预期，可以直接应用写入。' : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

function statusBadge(status: SessionTaskStatus) {
  if (status === 'running') {
    return {
      label: '执行中',
      className: 'border-sky-500/25 bg-sky-500/10 text-sky-300',
      icon: LoaderCircle,
    }
  }
  if (status === 'done') {
    return {
      label: '已完成',
      className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
      icon: CheckCircle2,
    }
  }
  if (status === 'failed') {
    return {
      label: '失败',
      className: 'border-rose-500/25 bg-rose-500/10 text-rose-300',
      icon: TriangleAlert,
    }
  }
  return {
    label: '空闲',
    className: 'border-border bg-background text-muted-foreground',
    icon: Clock3,
  }
}

export function ProjectAIWorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { state: workspaceState, actions } = useProjectAIWorkspaceStore(projectId)
  const { sessions, activeSessionId, detailTab, sessionStateMap } = workspaceState

  const projectQuery = useQuery<ProjectDetail, Error>({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId ?? ''),
    enabled: Boolean(projectId),
    staleTime: 60_000,
  })

  const runtimeSettingsQuery = useQuery({
    queryKey: ['ai-runtime-settings'],
    queryFn: getAIRuntimeSettings,
    staleTime: 60_000,
  })

  const activeSession = useMemo(
    () => sessions.find((item) => item.id === activeSessionId) ?? sessions[0] ?? null,
    [activeSessionId, sessions],
  )
  const activeSessionState = activeSession ? sessionStateMap[activeSession.id] ?? null : null
  const capabilitySnapshot = matchAIRuntimeCapabilitySnapshot(runtimeSettingsQuery.data)
  const groupedSessions = useMemo(
    () => ({
      project_character: sessions.filter((item) => item.assetType === 'project_character'),
      world_setting: sessions.filter((item) => item.assetType === 'world_setting'),
      story_qa: sessions.filter((item) => item.assetType === 'story_qa'),
    }),
    [sessions],
  )
  const project = projectQuery.data ?? null

  function updateSessionState(
    sessionId: string,
    updater: (prev: ProjectAIWorkspaceSessionState) => ProjectAIWorkspaceSessionState,
  ) {
    actions.updateSessionState(sessionId, updater)
  }

  function handleCreateSession(assetType: ProjectAssetAIType) {
    actions.createSession(assetType)
    actions.setDetailTab('result')
  }

  function handleDeleteSession(session: ProjectAIWorkspaceSession) {
    const confirmed = window.confirm(`确认删除“${session.title}”吗？该会话的消息、上传文件引用和待应用结果都会清除。`)
    if (!confirmed) {
      return
    }
    actions.deleteSession(session.id)
    actions.setDetailTab('task')
    toast.success('会话已删除')
  }

  async function handleUploadFile(session: ProjectAIWorkspaceSession, file: File) {
    if (!projectId) {
      return
    }
    updateSessionState(session.id, (prev) => ({ ...prev, isUploadingFile: true }))
    try {
      const result = await uploadProjectAssetFile(projectId, file)
      updateSessionState(session.id, (prev) => ({
        ...prev,
        uploadedFiles: [...prev.uploadedFiles, { file_id: result.file_id, filename: result.filename }],
        fileIds: [...prev.fileIds, result.file_id],
        isUploadingFile: false,
      }))
      toast.success(`已上传：${result.filename}`)
    } catch (error) {
      updateSessionState(session.id, (prev) => ({ ...prev, isUploadingFile: false }))
      toast.error(error instanceof Error ? error.message : '上传文件失败')
    }
  }

  function handleDraftReady(sessionId: string, event: AssetChatSSEDraftReadyEvent) {
    updateSessionState(sessionId, (prev) => ({
      ...prev,
      latestWorldPatch: event.asset_type === 'world_setting' ? event.patch : prev.latestWorldPatch,
      latestCharacterActions: event.asset_type === 'project_character' ? event.actions : prev.latestCharacterActions,
      notes: event.notes,
      appliedSources: event.applied_sources ?? [],
      taskStatus: 'done',
      lastError: null,
      updatedAt: new Date().toISOString(),
    }))
    actions.setDetailTab('result')
  }

  async function handleSendSession(session: ProjectAIWorkspaceSession) {
    if (!projectId) {
      return
    }

    const currentState = sessionStateMap[session.id]
    const text = currentState.inputText.trim()

    if (!text && currentState.fileIds.length === 0) {
      toast.error('请先输入消息或上传文件')
      return
    }

    // story_qa 只需要文本，不需要文件
    if (session.assetType === 'story_qa' && !text) {
      toast.error('请先输入你的问题')
      return
    }

    if (currentState.streamingText !== null) {
      return
    }

    const userMessage: ProjectAssetAIMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text || `[已上传 ${currentState.fileIds.length} 个文件]`,
    }

    updateSessionState(session.id, (prev) => ({
      ...prev,
      messages: [...stripToolMessages(prev.messages), userMessage],
      inputText: '',
      streamingText: '',
      taskStatus: 'running',
      lastError: null,
      updatedAt: new Date().toISOString(),
    }))

    let accumulatedText = ''

    try {
      if (session.assetType === 'story_qa') {
        const response = await askStoryQA({
          project_id: projectId,
          question: text,
        })

        accumulatedText = response.answer

        updateSessionState(session.id, (prev) => ({
          ...prev,
          messages: [
            ...stripToolMessages(prev.messages),
            {
              id: `ai-${Date.now()}`,
              role: 'result',
              content: accumulatedText,
            },
          ],
          streamingText: null,
          taskStatus: 'done',
          lastError: null,
          latestQASources: response.sources,
          latestQAQueryTerms: response.query_terms,
          updatedAt: new Date().toISOString(),
        }))
        actions.setDetailTab('result')
        return
      }

      if (session.assetType === 'world_setting') {
        const response = await analyzeWorldSetting(projectId, {
          message: text,
          guidance: currentState.guidance.trim() || null,
          file_ids: currentState.fileIds,
        })

        handleDraftReady(session.id, {
          type: 'draft_ready',
          asset_type: 'world_setting',
          patch: response.patch,
          actions: null,
          notes: response.notes,
          applied_sources: response.applied_sources,
        })

        accumulatedText = buildWorldSettingResultMessage({
          userMessage: text,
          notes: response.notes,
          patch: response.patch,
          appliedSources: response.applied_sources,
        })
      } else {
        const response = await analyzeCharacters(projectId, {
          message: text,
          guidance: currentState.guidance.trim() || null,
          file_ids: currentState.fileIds,
        })

        handleDraftReady(session.id, {
          type: 'draft_ready',
          asset_type: 'project_character',
          patch: null,
          actions: response.actions,
          notes: response.notes,
        })

        accumulatedText = buildCharacterResultMessage({
          userMessage: text,
          notes: response.notes,
          actions: response.actions,
        })
      }

      updateSessionState(session.id, (prev) => ({
        ...prev,
        messages: [
          ...stripToolMessages(prev.messages),
          {
            id: `ai-${Date.now()}`,
            role: 'result',
            content: accumulatedText,
          },
        ],
        streamingText: null,
        taskStatus: 'done',
        lastError: null,
        updatedAt: new Date().toISOString(),
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : '对话请求失败'
      updateSessionState(session.id, (prev) => ({
        ...prev,
        messages: stripToolMessages(prev.messages),
        streamingText: null,
        taskStatus: 'failed',
        lastError: message,
        updatedAt: new Date().toISOString(),
      }))
      toast.error(message)
    }
  }

  async function handleApplyCurrentResult() {
    if (!projectId || !activeSession || !activeSessionState) {
      return
    }
    updateSessionState(activeSession.id, (prev) => ({ ...prev, isApplying: true }))
    try {
      if (activeSession.assetType === 'world_setting') {
        if (!activeSessionState.latestWorldPatch) {
          updateSessionState(activeSession.id, (prev) => ({ ...prev, isApplying: false }))
          toast.error('当前没有可写入的世界观结果')
          return
        }
        const result = await applyWorldSettingPatch(projectId, { patch: activeSessionState.latestWorldPatch })
        toast.success(result.world_setting_updated ? '世界观建议已写入项目' : '没有需要写入的变更')
      } else {
        if (!activeSessionState.latestCharacterActions?.length) {
          updateSessionState(activeSession.id, (prev) => ({ ...prev, isApplying: false }))
          toast.error('当前没有可写入的角色建议')
          return
        }
        const result = await applyCharacterPatch(projectId, { actions: activeSessionState.latestCharacterActions })
        toast.success(result.errors.length > 0 ? `已写入，另有 ${result.errors.length} 条需要人工处理` : '角色建议已写入项目')
      }
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      updateSessionState(activeSession.id, (prev) => ({
        ...prev,
        latestWorldPatch: activeSession.assetType === 'world_setting' ? null : prev.latestWorldPatch,
        latestCharacterActions: activeSession.assetType === 'project_character' ? null : prev.latestCharacterActions,
        notes:
          activeSession.assetType === 'world_setting' || activeSession.assetType === 'project_character'
            ? []
            : prev.notes,
        appliedSources:
          activeSession.assetType === 'world_setting' || activeSession.assetType === 'project_character'
            ? []
            : prev.appliedSources,
        isApplying: false,
      }))
    } catch (error) {
      updateSessionState(activeSession.id, (prev) => ({ ...prev, isApplying: false }))
      toast.error(error instanceof Error ? error.message : '应用写入失败')
    }
  }

  if (!projectId) {
    return <EmptyState title="缺少项目标识" description="当前路由中没有有效的项目 ID。" />
  }

  if (projectQuery.isLoading || sessions.length === 0) {
    return <LoadingState label="正在加载 AI 工作区..." />
  }

  if (projectQuery.isError || !project) {
    return (
      <EmptyState
        title="AI 工作区加载失败"
        description={projectQuery.error?.message || '未能读取当前项目。'}
        action={
          <Button variant="outline" onClick={() => projectQuery.refetch()}>
            重新加载
          </Button>
        }
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <section className="grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-card/95 shadow-[0_16px_36px_rgba(148,163,184,0.12)] xl:grid-cols-[300px_minmax(0,1fr)_360px]">
        <aside className="min-h-0 border-b border-border bg-muted/15 xl:border-b-0 xl:border-r">
          <Card className="flex h-full min-h-0 flex-col rounded-none border-0 bg-transparent shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Bot className="size-4 text-primary" />
                会话树
              </CardTitle>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto">
              <SessionGroup
                title="角色助手"
                icon={Users2}
                sessions={groupedSessions.project_character}
                activeSessionId={activeSessionId}
                sessionStateMap={sessionStateMap}
                onSelect={(sessionId) => actions.setActiveSessionId(sessionId)}
                onCreate={() => handleCreateSession('project_character')}
                onDelete={handleDeleteSession}
              />
              <SessionGroup
                title="世界观助手"
                icon={Globe2}
                sessions={groupedSessions.world_setting}
                activeSessionId={activeSessionId}
                sessionStateMap={sessionStateMap}
                onSelect={(sessionId) => actions.setActiveSessionId(sessionId)}
                onCreate={() => handleCreateSession('world_setting')}
                onDelete={handleDeleteSession}
              />
              <SessionGroup
                title="故事问答"
                icon={MessageCircleQuestion}
                sessions={groupedSessions.story_qa}
                activeSessionId={activeSessionId}
                sessionStateMap={sessionStateMap}
                onSelect={(sessionId) => actions.setActiveSessionId(sessionId)}
                onCreate={() => handleCreateSession('story_qa')}
                onDelete={handleDeleteSession}
              />
            </CardContent>
          </Card>
        </aside>

        <div className="min-h-0 border-b border-border xl:border-b-0 xl:border-r">
          {sessions.map((session) => {
            const state = sessionStateMap[session.id]
            const visible = session.id === activeSession?.id
            const panelState: ProjectAssetAIPanelState = {
              messages: state.messages,
              streamingText: state.streamingText,
              inputText: state.inputText,
              guidance: state.guidance,
            }

            return (
              <div key={session.id} className={visible ? 'flex h-full min-h-0 flex-col' : 'hidden'}>
                <Card className="flex h-full min-h-0 flex-col rounded-none border-0 bg-transparent shadow-none">
                  <CardHeader className="border-b border-border py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-xl text-foreground">{displaySessionTitle(session)}</CardTitle>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {capabilitySnapshot ? (
                          <Badge
                            variant="outline"
                            className={getCapabilityStatusMeta(capabilitySnapshot.structured_output.status).className}
                          >
                            {capabilitySnapshot.structured_output.summary}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-border bg-background text-muted-foreground">
                            能力未检测
                          </Badge>
                        )}
                        <StatusPill status={state.taskStatus} />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="min-h-0 flex-1 p-0">
                    {session.assetType === 'story_qa' ? (
                      <StoryQAPanel
                        state={state}
                        onInputChange={(text) => updateSessionState(session.id, (prev) => ({ ...prev, inputText: text }))}
                        onSend={() => void handleSendSession(session)}
                      />
                    ) : (
                    <div className="h-full min-h-0 [&>div]:rounded-none [&>div]:border-0">
                      <ProjectAssetAIPanel
                        projectId={project.id}
                        assetType={session.assetType}
                        sessionId={session.id}
                        controlledState={panelState}
                        onControlledStateChange={(updater) => {
                          updateSessionState(session.id, (prev) => {
                            const nextPanelState = updater({
                              messages: prev.messages,
                              streamingText: prev.streamingText,
                              inputText: prev.inputText,
                              guidance: prev.guidance,
                            })
                            return {
                              ...prev,
                              ...nextPanelState,
                            }
                          })
                        }}
                        onSendMessage={async () => await handleSendSession(session)}
                        latestWorldPatch={state.latestWorldPatch}
                        latestCharacterActions={state.latestCharacterActions}
                        isApplying={state.isApplying}
                        onFileUpload={async (file) => await handleUploadFile(session, file)}
                        isUploadingFile={state.isUploadingFile}
                        uploadedFiles={state.uploadedFiles}
                        fileIds={state.fileIds}
                      />
                    </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )
          })}
        </div>

        <aside className="min-h-0 overflow-hidden bg-muted/10">
          <Card className="flex h-full min-h-0 flex-col rounded-none border-0 bg-transparent shadow-none">
            <CardHeader>
              <div className="grid grid-cols-3 rounded-xl bg-muted/70 p-1">
                {tabOptions.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => actions.setDetailTab(tab.key)}
                    className={[
                      'rounded-lg px-3 py-2 text-sm font-medium transition',
                      detailTab === tab.key
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    ].join(' ')}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto">
              {detailTab === 'result' ? (
                <ResultTab
                  session={activeSession}
                  state={activeSessionState}
                  onApply={() => void handleApplyCurrentResult()}
                />
              ) : null}
              {detailTab === 'context' ? <ContextTab project={project} /> : null}
              {detailTab === 'task' ? <TaskTab session={activeSession} state={activeSessionState} /> : null}
            </CardContent>
          </Card>

        </aside>
      </section>
    </div>
  )
}

function SessionGroup({
  title,
  icon: Icon,
  sessions,
  activeSessionId,
  sessionStateMap,
  onSelect,
  onCreate,
  onDelete,
}: {
  title: string
  icon: typeof Users2
  sessions: ProjectAIWorkspaceSession[]
  activeSessionId: string | null
  sessionStateMap: Record<string, ProjectAIWorkspaceSessionState>
  onSelect: (sessionId: string) => void
  onCreate: () => void
  onDelete: (session: ProjectAIWorkspaceSession) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Icon className="size-4 text-primary" />
          {title}
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex size-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition hover:text-foreground"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      <div className="space-y-2">
        {sessions.map((session) => (
          <div
            key={session.id}
            className={[
              'flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition',
              session.id === activeSessionId
                ? 'border-primary/30 bg-primary/10'
                : 'border-border bg-background/90 hover:border-primary/20 hover:bg-muted/35',
            ].join(' ')}
          >
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onSelect(session.id)}>
              <div className="truncate text-sm font-medium text-foreground">{displaySessionTitle(session)}</div>
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {sessionStateMap[session.id]?.updatedAt
                  ? `最近更新：${new Date(sessionStateMap[session.id].updatedAt as string).toLocaleTimeString('zh-CN')}`
                  : '尚未开始'}
              </div>
            </button>
            <StatusPill status={sessionStateMap[session.id]?.taskStatus ?? 'idle'} compact />
            <button
              type="button"
              title="删除会话"
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-rose-500/10 hover:text-rose-500"
              onClick={(event) => {
                event.stopPropagation()
                onDelete(session)
              }}
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatusPill({ status, compact = false }: { status: SessionTaskStatus; compact?: boolean }) {
  const meta = statusBadge(status)
  const Icon = meta.icon

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${meta.className}`}>
      <Icon className={compact && status === 'running' ? 'size-3 animate-spin' : 'size-3'} />
      {!compact ? meta.label : null}
    </span>
  )
}

function ResultTab({
  session,
  state,
  onApply,
}: {
  session: ProjectAIWorkspaceSession | null
  state: ProjectAIWorkspaceSessionState | null
  onApply: () => void
}) {
  if (!session || !state) {
    return null
  }

  // story_qa: 展示来源引用
  if (session.assetType === 'story_qa') {
    const hasSources = state.latestQASources.length > 0
    const typeLabel: Record<string, string> = {
      chapter: '章节',
      entity: '实体',
      event: '事件',
      relation: '关系',
      open_loop: '伏笔',
    }
    return (
      <div className="space-y-4">
        <div className="text-sm font-medium text-foreground">引用来源</div>
        {hasSources ? (
          <div className="space-y-2">
            {state.latestQASources.map((src, index) => (
              <div key={`${src.label}-${index}`} className="rounded-xl border border-border bg-muted/35 p-3">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    {typeLabel[src.type] ?? src.type}
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {src.chapter_order != null ? `第 ${src.chapter_order + 1} 章 · ` : ''}{src.label}
                  </span>
                </div>
                {src.excerpt ? (
                  <div className="mt-1.5 text-xs leading-5 text-muted-foreground line-clamp-2">{src.excerpt}</div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
            提问后这里会展示 AI 引用的来源。
          </div>
        )}
        {state.latestQAQueryTerms.length > 0 ? (
          <div>
            <div className="mb-2 text-xs text-muted-foreground">检索词</div>
            <div className="flex flex-wrap gap-1.5">
              {state.latestQAQueryTerms.map((term) => (
                <span key={term} className="rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground">
                  {term}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  const hasWorldResult = session.assetType === 'world_setting' && state.latestWorldPatch
  const hasCharacterResult = session.assetType === 'project_character' && state.latestCharacterActions?.length

  return (
    <div className="space-y-4">
      <div className="text-sm font-medium text-foreground">当前结果</div>

      {hasWorldResult ? (
        <div className="space-y-2">
          {Object.entries(state.latestWorldPatch ?? {}).map(([key, value]) =>
            value ? (
              <div key={key} className="rounded-xl border border-border bg-muted/35 p-3">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{key}</div>
                <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground/85">{value}</div>
              </div>
            ) : null,
          )}
        </div>
      ) : null}

      {hasCharacterResult ? (
        <div className="space-y-2">
          {(state.latestCharacterActions ?? []).map((action, index) => (
            <div key={`${action.name}-${index}`} className="rounded-xl border border-border bg-muted/35 p-3">
              <div className="text-sm font-medium text-foreground">
                {index + 1}. {action.name}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {action.role_label || action.summary || action.profile || action.description || '暂无附加说明'}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {!hasWorldResult && !hasCharacterResult ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
          当前会话还没有结构化结果。生成完成后，这里会展示待写入内容。
        </div>
      ) : null}

      {state.notes.length > 0 && (hasWorldResult || hasCharacterResult) ? (
        <div className="rounded-xl border border-border bg-background p-3">
          <div className="text-sm font-medium text-foreground">说明</div>
          <ul className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
            {state.notes.map((note, index) => (
              <li key={`${index}-${note}`}>- {note}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <Button
        className="w-full disabled:bg-muted disabled:text-muted-foreground"
        onClick={onApply}
        disabled={state.isApplying || (!hasWorldResult && !hasCharacterResult)}
      >
        {state.isApplying ? '写入中...' : '应用写入'}
      </Button>
    </div>
  )
}

function ContextTab({ project }: { project: ProjectDetail }) {
  return (
    <div className="space-y-3">
      <ContextBlock label="项目简介" value={project.description?.trim() || '暂无项目简介'} />
      <ContextBlock label="角色数量" value={`当前项目已绑定 ${project.project_characters.length} 名角色`} />
      <ContextBlock label="世界观标题" value={project.world_setting?.title || '尚未维护世界观'} />
      <ContextBlock label="最近章节" value={project.chapters[0]?.title || '当前项目还没有章节'} />
    </div>
  )
}

function TaskTab({
  session,
  state,
}: {
  session: ProjectAIWorkspaceSession | null
  state: ProjectAIWorkspaceSessionState | null
}) {
  if (!session || !state) {
    return null
  }

  const meta = statusBadge(state.taskStatus)

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-muted/35 p-4">
        <div className="text-sm font-medium text-foreground">{displaySessionTitle(session)}</div>
        <div className="mt-2 flex items-center gap-2">
          <Badge variant="outline" className={meta.className}>
            {meta.label}
          </Badge>
          <Badge variant="outline" className="border-border bg-background text-muted-foreground">
            {session.assetType === 'project_character' ? '角色助手' : session.assetType === 'story_qa' ? '故事问答' : '世界观助手'}
          </Badge>
        </div>
        <div className="mt-3 text-xs leading-5 text-muted-foreground">
          {state.updatedAt ? `最近更新：${new Date(state.updatedAt).toLocaleString('zh-CN')}` : '当前还没有任务记录'}
        </div>
      </div>

      {state.lastError ? (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/8 p-4 text-xs leading-5 text-rose-200">
          {state.lastError}
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-background p-4 text-xs leading-6 text-muted-foreground">
        已上传文件 {state.uploadedFiles.length} 个，待应用结果{' '}
        {state.latestCharacterActions?.length ?? (state.latestWorldPatch ? 1 : 0)} 条。
      </div>
    </div>
  )
}

function ContextBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/35 p-4">
      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-sm leading-6 text-foreground/85">{value}</div>
    </div>
  )
}

function StoryQAPanel({
  state,
  onInputChange,
  onSend,
}: {
  state: ProjectAIWorkspaceSessionState
  onInputChange: (text: string) => void
  onSend: () => void
}) {
  const isLoading = state.taskStatus === 'running'

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Message list */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        <div className="space-y-4">
          {state.messages.map((msg) => {
            if (msg.role === 'system') {
              return (
                <div key={msg.id} className="flex items-start gap-3 rounded-2xl border border-border bg-muted/20 p-4">
                  <Search className="mt-0.5 size-4 shrink-0 text-primary" />
                  <p className="whitespace-pre-line text-sm leading-6 text-muted-foreground">{msg.content}</p>
                </div>
              )
            }
            if (msg.role === 'user') {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-foreground/8 px-4 py-2.5 text-sm text-foreground">
                    {msg.content}
                  </div>
                </div>
              )
            }
            return (
              <div key={msg.id} className="flex justify-start">
                <div className="max-w-[90%] rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3">
                  <div className="mb-2 flex items-center gap-1.5">
                    <Sparkles className="size-3 text-primary" />
                    <span className="text-[11px] font-medium text-primary/70">偶记</span>
                  </div>
                  <p className="whitespace-pre-line text-sm leading-7 text-foreground">{msg.content}</p>
                </div>
              </div>
            )
          })}
          {isLoading ? (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                <LoaderCircle className="size-3.5 animate-spin text-primary" />
                正在查询故事记忆…
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-border p-4">
        <div className="relative">
          <input
            type="text"
            value={state.inputText}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
                e.preventDefault()
                onSend()
              }
            }}
            placeholder="问问你的故事：主角第一次出场在哪章？"
            disabled={isLoading}
            className="w-full rounded-xl border border-border bg-background py-2.5 pl-4 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={isLoading || !state.inputText.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex size-8 items-center justify-center rounded-lg bg-primary text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          >
            {isLoading ? <LoaderCircle className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
          </button>
        </div>
      </div>
    </div>
  )
}
