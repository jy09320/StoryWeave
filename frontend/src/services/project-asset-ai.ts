import { apiClient } from '@/lib/api-client'
import type {
  AssetChatRequest,
  AssetChatSSEEvent,
  ProjectAssetFileUploadResponse,
  WorldSettingAnalyzeRequest,
  WorldSettingAnalyzeResponse,
  WorldSettingApplyRequest,
  WorldSettingApplyResponse,
  CharacterAnalyzeRequest,
  CharacterAnalyzeResponse,
  CharacterApplyRequest,
  CharacterApplyResponse,
} from '@/types/api'

export async function uploadProjectAssetFile(
  projectId: string,
  file: File,
): Promise<ProjectAssetFileUploadResponse> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await apiClient.post<ProjectAssetFileUploadResponse>(
    `/projects/${projectId}/ai-assets/files`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return data
}

export async function analyzeWorldSetting(
  projectId: string,
  payload: WorldSettingAnalyzeRequest,
): Promise<WorldSettingAnalyzeResponse> {
  const { data } = await apiClient.post<WorldSettingAnalyzeResponse>(
    `/projects/${projectId}/ai-assets/world-setting/analyze`,
    payload,
  )
  return data
}

export async function applyWorldSettingPatch(
  projectId: string,
  payload: WorldSettingApplyRequest,
): Promise<WorldSettingApplyResponse> {
  const { data } = await apiClient.post<WorldSettingApplyResponse>(
    `/projects/${projectId}/ai-assets/world-setting/apply`,
    payload,
  )
  return data
}

export async function analyzeCharacters(
  projectId: string,
  payload: CharacterAnalyzeRequest,
): Promise<CharacterAnalyzeResponse> {
  const { data } = await apiClient.post<CharacterAnalyzeResponse>(
    `/projects/${projectId}/ai-assets/characters/analyze`,
    payload,
  )
  return data
}

export async function applyCharacterPatch(
  projectId: string,
  payload: CharacterApplyRequest,
): Promise<CharacterApplyResponse> {
  const { data } = await apiClient.post<CharacterApplyResponse>(
    `/projects/${projectId}/ai-assets/characters/apply`,
    payload,
  )
  return data
}

const baseURL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000/api'

export async function streamAssetChat(
  projectId: string,
  payload: AssetChatRequest,
  onEvent: (event: AssetChatSSEEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${baseURL}/projects/${projectId}/ai-assets/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  })

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '')
    let errorMessage = '对话请求失败'
    try {
      const parsed = JSON.parse(text) as { detail?: string }
      errorMessage = parsed.detail ?? errorMessage
    } catch {
      if (text) errorMessage = text
    }
    throw new Error(errorMessage)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const normalizedBuffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const events = normalizedBuffer.split('\n\n')
    buffer = events.pop() ?? ''

    for (const rawEvent of events) {
      const lines = rawEvent.split('\n')
      const eventLine = lines.find((line) => line.startsWith('event:'))
      const dataLine = lines.find((line) => line.startsWith('data:'))
      const eventName = eventLine?.replace('event:', '').trim()
      const dataValue = dataLine?.replace('data:', '').trim()

      if (!dataValue || !eventName) continue

      try {
        const parsed = JSON.parse(dataValue) as Record<string, unknown>
        onEvent({ type: eventName, ...parsed } as AssetChatSSEEvent)
      } catch {
        // Malformed SSE data — skip
      }
    }
  }
}
