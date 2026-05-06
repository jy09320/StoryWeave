import type { AIRuntimeCapabilityCheckResponse, AIRuntimeSettings } from '@/services/ai'

const AI_RUNTIME_CAPABILITY_STORAGE_KEY = 'storyweave.ai-runtime-capability'

export function saveAIRuntimeCapabilitySnapshot(result: AIRuntimeCapabilityCheckResponse) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(AI_RUNTIME_CAPABILITY_STORAGE_KEY, JSON.stringify(result))
}

export function readAIRuntimeCapabilitySnapshot() {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = window.localStorage.getItem(AI_RUNTIME_CAPABILITY_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as AIRuntimeCapabilityCheckResponse
  } catch {
    window.localStorage.removeItem(AI_RUNTIME_CAPABILITY_STORAGE_KEY)
    return null
  }
}

export function clearAIRuntimeCapabilitySnapshot() {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(AI_RUNTIME_CAPABILITY_STORAGE_KEY)
}

export function matchAIRuntimeCapabilitySnapshot(
  settings: Pick<AIRuntimeSettings, 'provider' | 'model_id'> | null | undefined,
  override?: { provider?: string | null; modelId?: string | null },
) {
  const snapshot = readAIRuntimeCapabilitySnapshot()
  if (!snapshot) {
    return null
  }

  const provider = override?.provider?.trim() || settings?.provider?.trim()
  const modelId = override?.modelId?.trim() || settings?.model_id?.trim()
  if (!provider || !modelId) {
    return null
  }

  if (snapshot.provider !== provider || snapshot.model_id !== modelId) {
    return null
  }

  return snapshot
}

export function getCapabilityStatusMeta(status: 'available' | 'failed' | 'unsupported') {
  if (status === 'available') {
    return {
      label: '可用',
      className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
    }
  }

  if (status === 'failed') {
    return {
      label: '失败',
      className: 'border-rose-500/25 bg-rose-500/10 text-rose-300',
    }
  }

  return {
    label: '不推荐',
    className: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
  }
}
