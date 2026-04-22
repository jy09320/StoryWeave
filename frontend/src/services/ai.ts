import type { AIGeneratePayload } from '@/types/api'

const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api'

function buildSseUrl() {
  return `${baseURL}/ai/generate`
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
    const events = buffer.split('\n\n')
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
