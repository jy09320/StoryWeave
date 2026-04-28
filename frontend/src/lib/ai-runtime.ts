import type { AIModelOption } from '@/services/ai'

export const MODEL_PROVIDER_OPTIONS = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'Anthropic', value: 'anthropic' },
] as const

export const FALLBACK_MODEL_BY_PROVIDER: Record<string, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-3-5-sonnet-latest',
}

export function buildRuntimeModelOptions(params: {
  selectedModelId?: string | null
  runtimeModelId?: string | null
  provider?: string | null
  availableModels?: AIModelOption[]
}) {
  const fallbackModelId = params.provider ? FALLBACK_MODEL_BY_PROVIDER[params.provider] : null

  return Array.from(
    new Set(
      [
        params.selectedModelId?.trim(),
        params.runtimeModelId?.trim(),
        fallbackModelId?.trim(),
        ...(params.availableModels ?? []).map((model) => model.id.trim()),
      ].filter(Boolean),
    ),
  ) as string[]
}
