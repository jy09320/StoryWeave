import type { AIGeneratePayload } from '@/types/api'

const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api'

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

function buildSseUrl() {
  return `${baseURL}/ai/generate`
}

async function readErrorMessage(response: Response, fallback: string) {
  const text = await response.text()
  if (!text) {
    return fallback
  }

  try {
    const parsed = JSON.parse(text) as {
      detail?: string
      message?: string
      error?: { message?: string }
    }
    return parsed.detail || parsed.message || parsed.error?.message || text
  } catch {
    return text
  }
}

export async function getAIRuntimeSettings() {
  const response = await fetch(`${baseURL}/ai/runtime-settings`)
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, '获取 AI 运行时配置失败'))
  }
  return (await response.json()) as AIRuntimeSettings
}

export async function updateAIRuntimeSettings(payload: AIRuntimeSettingsPayload) {
  const response = await fetch(`${baseURL}/ai/runtime-settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, '更新 AI 运行时配置失败'))
  }

  return (await response.json()) as AIRuntimeSettings
}

export async function listAIRuntimeModels() {
  const response = await fetch(`${baseURL}/ai/runtime-settings/models`)
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, '获取可用模型列表失败'))
  }
  return (await response.json()) as AIModelListResponse
}

export async function streamGenerate(payload: AIGeneratePayload, onMessage: (chunk: string) => void) {
  const response = await fetch(buildSseUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok || !response.body) {
    throw new Error(await readErrorMessage(response, 'AI 生成请求失败'))
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
