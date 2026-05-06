import type { AIGeneratePayload } from '@/types/api'
import { apiClient } from '@/lib/api-client'

export interface AIRuntimeSettings {
  provider: string
  model_id: string
  base_url: string | null
  api_key_masked: string | null
  source: string
  updated_at: string | null
}

export interface AIRuntimeSettingsPayload {
  provider: string
  model_id: string
  base_url?: string | null
  api_key?: string | null
}

export interface AIModelOption {
  id: string
  owned_by: string | null
}

export interface AIModelListResponse {
  provider: string
  source: string
  models: AIModelOption[]
}

export interface AIRuntimeCapabilityItem {
  status: 'available' | 'failed' | 'unsupported'
  summary: string
  detail: string | null
}

export interface AIRuntimeCapabilityCheckResponse {
  provider: string
  model_id: string
  checked_at: string
  text_generation: AIRuntimeCapabilityItem
  structured_output: AIRuntimeCapabilityItem
  tool_calling: AIRuntimeCapabilityItem
}

interface AIGenerateOnceResponse {
  content: string
}

export async function getAIRuntimeSettings() {
  const { data } = await apiClient.get<AIRuntimeSettings>('/ai/runtime-settings')
  return data
}

export async function updateAIRuntimeSettings(payload: AIRuntimeSettingsPayload) {
  const { data } = await apiClient.put<AIRuntimeSettings>('/ai/runtime-settings', payload)
  return data
}

export async function listAIRuntimeModels() {
  const { data } = await apiClient.get<AIModelListResponse>('/ai/runtime-settings/models')
  return data
}

export async function checkAIRuntimeCapabilities(payload?: { provider?: string | null; model_id?: string | null }) {
  const { data } = await apiClient.post<AIRuntimeCapabilityCheckResponse>('/ai/runtime-settings/capabilities/check', payload ?? {})
  return data
}

function buildAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('sw_token')}`,
  }
}

function createTimeoutController(timeoutMs: number, externalSignal?: AbortSignal) {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(new DOMException('AI generation timeout', 'AbortError')), timeoutMs)

  const abortFromExternal = () => controller.abort(externalSignal?.reason)
  if (externalSignal) {
    if (externalSignal.aborted) {
      abortFromExternal()
    } else {
      externalSignal.addEventListener('abort', abortFromExternal, { once: true })
    }
  }

  return {
    signal: controller.signal,
    dispose: () => {
      window.clearTimeout(timeoutId)
      if (externalSignal) {
        externalSignal.removeEventListener('abort', abortFromExternal)
      }
    },
  }
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

async function generateTextOnce(payload: AIGeneratePayload, signal?: AbortSignal) {
  const response = await fetch(`${apiClient.defaults.baseURL}/ai/generate-once`, {
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify(payload),
    signal,
  })

  const text = await response.text()
  if (!response.ok) {
    throw new Error(text || 'AI 生成请求失败')
  }

  const parsed = JSON.parse(text) as AIGenerateOnceResponse
  return parsed.content ?? ''
}

async function streamGenerateAttempt(payload: AIGeneratePayload, onMessage: (chunk: string) => void, signal?: AbortSignal) {
  const response = await fetch(`${apiClient.defaults.baseURL}/ai/generate`, {
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify(payload),
    signal,
  })

  if (!response.ok || !response.body) {
    const text = await response.text()
    throw new Error(text || 'AI 生成请求失败')
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

      if (!dataValue) continue

      const parsed = JSON.parse(dataValue) as { content?: string; error?: string; status?: string }

      if (eventName === 'error') {
        throw new Error(parsed.error ?? 'AI 生成失败')
      }

      if (eventName === 'message' && parsed.content) {
        onMessage(parsed.content)
      }
    }
  }
}

export async function streamGenerate(
  payload: AIGeneratePayload,
  onMessage: (chunk: string) => void,
  options?: { signal?: AbortSignal; timeoutMs?: number; retryCount?: number },
) {
  const timeoutMs = options?.timeoutMs ?? 60_000
  const retryCount = options?.retryCount ?? 1

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    const timeoutController = createTimeoutController(timeoutMs, options?.signal)
    try {
      await streamGenerateAttempt(payload, onMessage, timeoutController.signal)
      timeoutController.dispose()
      return
    } catch (error) {
      timeoutController.dispose()
      if (isAbortError(error)) {
        throw error
      }

      if (attempt === retryCount) {
        break
      }
    }
  }

  const timeoutController = createTimeoutController(timeoutMs, options?.signal)
  try {
    const content = await generateTextOnce(payload, timeoutController.signal)
    if (content) {
      onMessage(content)
    }
  } finally {
    timeoutController.dispose()
  }
}
