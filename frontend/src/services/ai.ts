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

export async function streamGenerate(payload: AIGeneratePayload, onMessage: (chunk: string) => void) {
  const response = await fetch(`${apiClient.defaults.baseURL}/ai/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('sw_token')}`,
    },
    body: JSON.stringify(payload),
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
