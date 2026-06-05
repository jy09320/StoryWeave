import type {
  Character,
  CharacterChatRequest,
  CharacterChatSession,
  CharacterChatSessionCreatePayload,
  CharacterPayload,
} from '@/types/api'
import { apiClient } from '@/lib/api-client'

// ---------------------------------------------------------------------------
// Character CRUD (moved from services/projects.ts for co-location)
// ---------------------------------------------------------------------------

export async function listCharacters(keyword?: string) {
  const { data } = await apiClient.get<Character[]>('/characters/', { params: keyword ? { keyword } : undefined })
  return data
}

export async function createCharacter(payload: CharacterPayload) {
  const { data } = await apiClient.post<Character>('/characters/', payload)
  return data
}

export async function updateCharacter(characterId: string, payload: Partial<CharacterPayload>) {
  const { data } = await apiClient.put<Character>(`/characters/${characterId}`, payload)
  return data
}

export async function deleteCharacter(characterId: string) {
  await apiClient.delete(`/characters/${characterId}`)
  return characterId
}

// ---------------------------------------------------------------------------
// Character Chat Sessions
// ---------------------------------------------------------------------------

export async function listCharacterChatSessions(characterId: string) {
  const { data } = await apiClient.get<CharacterChatSession[]>(`/characters/${characterId}/chat-sessions`)
  return data
}

export async function createCharacterChatSession(characterId: string, payload: CharacterChatSessionCreatePayload) {
  const { data } = await apiClient.post<CharacterChatSession>(`/characters/${characterId}/chat-sessions`, payload)
  return data
}

export async function getCharacterChatSession(characterId: string, sessionId: string) {
  const { data } = await apiClient.get<CharacterChatSession>(`/characters/${characterId}/chat-sessions/${sessionId}`)
  return data
}

export async function deleteCharacterChatSession(characterId: string, sessionId: string) {
  await apiClient.delete(`/characters/${characterId}/chat-sessions/${sessionId}`)
  return sessionId
}

// ---------------------------------------------------------------------------
// Streaming chat
// ---------------------------------------------------------------------------

function buildAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('sw_token')}`,
  }
}

export async function streamCharacterChat(
  characterId: string,
  sessionId: string,
  payload: CharacterChatRequest,
  handlers: {
    onChunk: (text: string) => void
    onDone: () => void
    onError: (error: string) => void
  },
  signal?: AbortSignal,
) {
  const baseURL = apiClient.defaults.baseURL ?? ''
  const response = await fetch(`${baseURL}/characters/${characterId}/chat-sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify(payload),
    signal,
  })

  if (!response.ok || !response.body) {
    const text = await response.text()
    throw new Error(text || '对话请求失败')
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

      const parsed = JSON.parse(dataValue) as { content?: string; error?: string }

      if (eventName === 'error') {
        handlers.onError(parsed.error ?? '对话失败')
        return
      }
      if (eventName === 'text' && parsed.content) {
        handlers.onChunk(parsed.content)
      }
      if (eventName === 'done') {
        handlers.onDone()
      }
    }
  }
}
