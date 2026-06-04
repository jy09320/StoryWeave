import { useSyncExternalStore } from 'react'

import type {
  CharacterActionItem,
  ProjectAssetAIMessage,
  ProjectAssetAIType,
  StoryQASourceRef,
  WorldSettingPatch,
} from '@/types/api'

export interface ProjectAIWorkspaceSession {
  id: string
  assetType: ProjectAssetAIType
  title: string
  createdAt: string
}

export type ProjectAIWorkspaceDetailTab = 'result' | 'context' | 'task'
export type ProjectAIWorkspaceTaskStatus = 'idle' | 'running' | 'done' | 'failed'

export interface ProjectAIWorkspaceSessionState {
  messages: ProjectAssetAIMessage[]
  streamingText: string | null
  inputText: string
  guidance: string
  latestWorldPatch: WorldSettingPatch | null
  latestCharacterActions: CharacterActionItem[] | null
  latestQASources: StoryQASourceRef[]
  latestQAQueryTerms: string[]
  notes: string[]
  appliedSources: string[]
  uploadedFiles: Array<{ file_id: string; filename: string }>
  fileIds: string[]
  taskStatus: ProjectAIWorkspaceTaskStatus
  lastError: string | null
  updatedAt: string | null
  isApplying: boolean
  isUploadingFile: boolean
}

export interface ProjectAIWorkspaceState {
  sessions: ProjectAIWorkspaceSession[]
  activeSessionId: string | null
  detailTab: ProjectAIWorkspaceDetailTab
  sessionStateMap: Record<string, ProjectAIWorkspaceSessionState>
}

interface ProjectAIWorkspaceStore {
  listeners: Set<() => void>
  state: ProjectAIWorkspaceState
}

function buildStorageKey(projectId: string) {
  return `storyweave.ai-workspace.${projectId}`
}

function buildWelcomeMessage(assetType: ProjectAssetAIType): ProjectAssetAIMessage {
  if (assetType === 'world_setting') {
    return {
      id: `${assetType}-welcome`,
      role: 'system',
      title: '世界观 AI 助手',
      content:
        '你好！我是世界观 AI 助手，可以帮你完善世界背景、规则、势力和地图等设定。\n\n可以直接和我对话，上传 .txt / .md 文档，或者说出具体指令（如"补全该世界的时间线"），我会引导你一步步完善。',
    }
  }

  if (assetType === 'story_qa') {
    return {
      id: `${assetType}-welcome`,
      role: 'system',
      title: '故事问答',
      content:
        '你好！我是故事知识库助手，可以回答关于这部小说的任何问题。\n\n试试问我：\n· 主角第一次出场是在哪一章？\n· 某个道具是什么时候出现的？\n· 当前有哪些未解决的伏笔？',
    }
  }

  return {
    id: `${assetType}-welcome`,
    role: 'system',
    title: '角色 AI 助手',
    content:
      '你好！我是角色 AI 助手，可以帮你从资料中识别角色、整理角色设定和关系。\n\n可以直接和我对话，描述你的角色，上传人物资料文档，我会生成结构化的角色建议供你确认。',
  }
}

function createEmptySessionState(assetType: ProjectAssetAIType): ProjectAIWorkspaceSessionState {
  return {
    messages: [buildWelcomeMessage(assetType)],
    streamingText: null,
    inputText: '',
    guidance: '',
    latestWorldPatch: null,
    latestCharacterActions: null,
    latestQASources: [],
    latestQAQueryTerms: [],
    notes: [],
    appliedSources: [],
    uploadedFiles: [],
    fileIds: [],
    taskStatus: 'idle',
    lastError: null,
    updatedAt: null,
    isApplying: false,
    isUploadingFile: false,
  }
}

export function buildDefaultAISessions(projectId: string): ProjectAIWorkspaceSession[] {
  const now = new Date().toISOString()
  return [
    {
      id: `${projectId}:project_character:default`,
      assetType: 'project_character',
      title: '默认会话',
      createdAt: now,
    },
    {
      id: `${projectId}:world_setting:default`,
      assetType: 'world_setting',
      title: '默认会话',
      createdAt: now,
    },
    {
      id: `${projectId}:story_qa:default`,
      assetType: 'story_qa',
      title: '默认会话',
      createdAt: now,
    },
  ]
}

function normalizeState(projectId: string, raw: Partial<ProjectAIWorkspaceState> | null): ProjectAIWorkspaceState {
  const sessions = raw?.sessions?.length ? raw.sessions : buildDefaultAISessions(projectId)
  const activeSessionId =
    raw?.activeSessionId && sessions.some((item) => item.id === raw.activeSessionId)
      ? raw.activeSessionId
      : sessions[0]?.id ?? null
  const detailTab = raw?.detailTab ?? 'result'
  const sessionStateMap: Record<string, ProjectAIWorkspaceSessionState> = {}

  for (const session of sessions) {
    sessionStateMap[session.id] = {
      ...createEmptySessionState(session.assetType),
      ...(raw?.sessionStateMap?.[session.id] ?? {}),
      messages:
        raw?.sessionStateMap?.[session.id]?.messages?.length
          ? raw.sessionStateMap[session.id].messages
          : createEmptySessionState(session.assetType).messages,
      uploadedFiles: raw?.sessionStateMap?.[session.id]?.uploadedFiles ?? [],
      fileIds: raw?.sessionStateMap?.[session.id]?.fileIds ?? [],
      notes: raw?.sessionStateMap?.[session.id]?.notes ?? [],
      appliedSources: raw?.sessionStateMap?.[session.id]?.appliedSources ?? [],
    }
  }

  return {
    sessions,
    activeSessionId,
    detailTab,
    sessionStateMap,
  }
}

const stores = new Map<string, ProjectAIWorkspaceStore>()

function readPersistedState(projectId: string) {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = window.localStorage.getItem(buildStorageKey(projectId))
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as Partial<ProjectAIWorkspaceState>
  } catch {
    window.localStorage.removeItem(buildStorageKey(projectId))
    return null
  }
}

function persistState(projectId: string, state: ProjectAIWorkspaceState) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(buildStorageKey(projectId), JSON.stringify(state))
}

function ensureStore(projectId: string) {
  const existing = stores.get(projectId)
  if (existing) {
    return existing
  }

  const store: ProjectAIWorkspaceStore = {
    listeners: new Set(),
    state: normalizeState(projectId, readPersistedState(projectId)),
  }
  stores.set(projectId, store)
  return store
}

function emit(projectId: string) {
  const store = ensureStore(projectId)
  persistState(projectId, store.state)
  for (const listener of store.listeners) {
    listener()
  }
}

function updateStoreState(projectId: string, updater: (current: ProjectAIWorkspaceState) => ProjectAIWorkspaceState) {
  const store = ensureStore(projectId)
  store.state = normalizeState(projectId, updater(store.state))
  emit(projectId)
}

export function useProjectAIWorkspaceStore(projectId: string | undefined) {
  const resolvedProjectId = projectId ?? '__missing__'

  const state = useSyncExternalStore(
    (listener) => {
      const store = ensureStore(resolvedProjectId)
      store.listeners.add(listener)
      return () => {
        store.listeners.delete(listener)
      }
    },
    () => ensureStore(resolvedProjectId).state,
    () => ensureStore(resolvedProjectId).state,
  )

  return {
    state,
    actions: {
      setActiveSessionId(sessionId: string | null) {
        updateStoreState(resolvedProjectId, (current) => ({
          ...current,
          activeSessionId: sessionId,
        }))
      },
      setDetailTab(detailTab: ProjectAIWorkspaceDetailTab) {
        updateStoreState(resolvedProjectId, (current) => ({
          ...current,
          detailTab,
        }))
      },
      createSession(assetType: ProjectAssetAIType) {
        updateStoreState(resolvedProjectId, (current) => {
          const index = current.sessions.filter((item) => item.assetType === assetType).length + 1
          const nextSession: ProjectAIWorkspaceSession = {
            id: `${resolvedProjectId}:${assetType}:${Date.now()}`,
            assetType,
            title: `会话 ${index}`,
            createdAt: new Date().toISOString(),
          }

          return {
            ...current,
            sessions: [...current.sessions, nextSession],
            activeSessionId: nextSession.id,
          }
        })
      },
      deleteSession(sessionId: string) {
        updateStoreState(resolvedProjectId, (current) => {
          const nextSessions = current.sessions.filter((item) => item.id !== sessionId)
          const nextSessionStateMap = { ...current.sessionStateMap }
          delete nextSessionStateMap[sessionId]

          const nextActiveSessionId =
            current.activeSessionId === sessionId
              ? nextSessions[0]?.id ?? null
              : current.activeSessionId

          return {
            ...current,
            sessions: nextSessions,
            activeSessionId: nextActiveSessionId,
            sessionStateMap: nextSessionStateMap,
          }
        })
      },
      updateSessionState(sessionId: string, updater: (prev: ProjectAIWorkspaceSessionState) => ProjectAIWorkspaceSessionState) {
        updateStoreState(resolvedProjectId, (current) => ({
          ...current,
          sessionStateMap: {
            ...current.sessionStateMap,
            [sessionId]: updater(
              current.sessionStateMap[sessionId] ??
                createEmptySessionState(
                  current.sessions.find((item) => item.id === sessionId)?.assetType ?? 'project_character',
                ),
            ),
          },
        }))
      },
    },
  }
}
