import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Bot, KeyRound, LoaderCircle, RefreshCw, Server, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { queryClient } from '@/lib/query-client'
import { buildRuntimeModelOptions, MODEL_PROVIDER_OPTIONS } from '@/lib/ai-runtime'
import {
  getAIRuntimeSettings,
  listAIRuntimeModels,
  updateAIRuntimeSettings,
  type AIModelOption,
} from '@/services/ai'

interface RuntimeSettingsFormState {
  provider: string
  modelId: string
  baseUrl: string
  apiKey: string
}

const initialFormState: RuntimeSettingsFormState = {
  provider: 'openai',
  modelId: 'gpt-4o',
  baseUrl: '',
  apiKey: '',
}

export function RuntimeSettingsPanel() {
  const runtimeSettingsQuery = useQuery({
    queryKey: ['ai-runtime-settings'],
    queryFn: getAIRuntimeSettings,
  })

  const [form, setForm] = useState<RuntimeSettingsFormState>(initialFormState)
  const [availableModels, setAvailableModels] = useState<AIModelOption[]>([])
  const [isLoadingModels, setIsLoadingModels] = useState(false)

  useEffect(() => {
    if (!runtimeSettingsQuery.data) {
      return
    }

    setForm({
      provider: runtimeSettingsQuery.data.provider,
      modelId: runtimeSettingsQuery.data.model_id,
      baseUrl: runtimeSettingsQuery.data.base_url ?? '',
      apiKey: '',
    })
  }, [runtimeSettingsQuery.data])

  const modelOptions = useMemo(
    () =>
      buildRuntimeModelOptions({
        selectedModelId: form.modelId,
        runtimeModelId: runtimeSettingsQuery.data?.model_id,
        provider: form.provider,
        availableModels,
      }),
    [availableModels, form.modelId, form.provider, runtimeSettingsQuery.data?.model_id],
  )
  const hasSavedKey = Boolean(runtimeSettingsQuery.data?.api_key_masked)

  const saveMutation = useMutation({
    mutationFn: updateAIRuntimeSettings,
    onSuccess: async (saved) => {
      queryClient.setQueryData(['ai-runtime-settings'], saved)
      await queryClient.invalidateQueries({ queryKey: ['ai-runtime-settings'] })
      setForm({
        provider: saved.provider,
        modelId: saved.model_id,
        baseUrl: saved.base_url ?? '',
        apiKey: '',
      })
      toast.success('AI 运行时配置已更新')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '更新 AI 运行时配置失败')
    },
  })

  async function handleLoadModels() {
    setIsLoadingModels(true)
    try {
      const response = await listAIRuntimeModels()
      setAvailableModels(response.models)
      toast.success(`已获取 ${response.models.length} 个可用模型`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '获取可用模型失败')
    } finally {
      setIsLoadingModels(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const modelId = form.modelId.trim()
    const apiKey = form.apiKey.trim()
    if (!modelId) {
      toast.error('请先选择或填写默认模型')
      return
    }

    if (!apiKey && !hasSavedKey) {
      toast.error('首次保存时必须填写 API Key')
      return
    }

    saveMutation.mutate({
      provider: form.provider,
      model_id: modelId,
      base_url: form.baseUrl.trim() || null,
      api_key: apiKey || null,
    })
  }

  if (runtimeSettingsQuery.isLoading) {
    return (
      <Card className="border border-border bg-card/95">
        <CardContent className="flex min-h-[260px] items-center justify-center">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            正在加载 AI 运行时配置...
          </div>
        </CardContent>
      </Card>
    )
  }

  if (runtimeSettingsQuery.isError || !runtimeSettingsQuery.data) {
    return (
      <Card className="border border-border bg-card/95">
        <CardContent className="flex min-h-[260px] flex-col items-center justify-center gap-4 text-center">
          <div className="space-y-2">
            <div className="text-lg font-semibold text-foreground">设置中心加载失败</div>
            <div className="text-sm text-muted-foreground">
              {runtimeSettingsQuery.error instanceof Error ? runtimeSettingsQuery.error.message : '未能获取 AI 运行时配置。'}
            </div>
          </div>
          <Button variant="outline" onClick={() => runtimeSettingsQuery.refetch()}>
            重新加载
          </Button>
        </CardContent>
      </Card>
    )
  }

  const settings = runtimeSettingsQuery.data

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
      <Card className="border border-border bg-card/95 shadow-[0_16px_36px_rgba(148,163,184,0.16)]">
        <CardHeader>
          <CardDescription className="text-primary/80">全局配置</CardDescription>
          <CardTitle className="text-2xl text-foreground">AI 运行时设置</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/85">模型提供商</label>
                <Select value={form.provider} onValueChange={(value) => setForm((prev) => ({ ...prev, provider: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择模型提供商" />
                  </SelectTrigger>
                  <SelectContent>
                    {MODEL_PROVIDER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/85">默认模型</label>
                <Select value={form.modelId} onValueChange={(value) => setForm((prev) => ({ ...prev, modelId: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择默认模型" />
                  </SelectTrigger>
                  <SelectContent>
                    {modelOptions.map((modelId) => (
                      <SelectItem key={modelId} value={modelId}>
                        {modelId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/85" htmlFor="runtime-base-url">
                  OpenAI 兼容 Base URL
                </label>
                <Input
                  id="runtime-base-url"
                  value={form.baseUrl}
                  onChange={(event) => setForm((prev) => ({ ...prev, baseUrl: event.target.value }))}
                  placeholder="例如 https://api.openai.com/v1"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/85">可用模型</label>
                <Button variant="outline" className="w-full" onClick={handleLoadModels} disabled={isLoadingModels || !hasSavedKey} type="button">
                  {isLoadingModels ? '获取中...' : '刷新模型列表'}
                </Button>
                {!hasSavedKey ? <div className="text-xs leading-5 text-amber-300">请先保存可用的 API Key，再刷新模型列表。</div> : null}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/85" htmlFor="runtime-api-key">
                API Key
              </label>
              <Input
                id="runtime-api-key"
                type="password"
                value={form.apiKey}
                onChange={(event) => setForm((prev) => ({ ...prev, apiKey: event.target.value }))}
                placeholder={settings.api_key_masked ? '留空则沿用当前已保存的 API Key' : '首次保存时必须填写 API Key'}
              />
              {settings.api_key_masked ? (
                <div className="text-xs text-muted-foreground">当前已保存 Key：{settings.api_key_masked}。再次打开页面时不会回填明文。</div>
              ) : null}
            </div>

            {availableModels.length > 0 ? (
              <div className="rounded-2xl border border-border bg-muted/35 p-4">
                <div className="mb-3 text-sm font-medium text-foreground">当前可用模型</div>
                <div className="flex flex-wrap gap-2">
                  {availableModels.map((model) => {
                    const active = model.id === form.modelId
                    return (
                      <button
                        key={model.id}
                        type="button"
                        className={[
                          'rounded-full border px-3 py-1.5 text-xs transition',
                          active
                            ? 'border-primary bg-primary/15 text-primary'
                            : 'border-border bg-background text-muted-foreground hover:border-primary/25 hover:text-foreground',
                        ].join(' ')}
                        onClick={() => setForm((prev) => ({ ...prev, modelId: model.id }))}
                      >
                        {model.id}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}

            <div className="flex justify-end">
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? '保存中...' : '保存并立即生效'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card className="border border-border bg-card/95 shadow-[0_16px_36px_rgba(148,163,184,0.16)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-foreground">
              <Server className="size-4 text-primary" />
              当前生效配置
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-foreground/85">
            <div className="rounded-2xl border border-primary/18 bg-primary/8 p-4">
              <div>提供商：{settings.provider}</div>
              <div className="mt-2">默认模型：{settings.model_id}</div>
              <div className="mt-2">来源：{settings.source === 'database' ? '运行时配置接口' : '环境变量'}</div>
            </div>
            <div className="rounded-2xl border border-border bg-muted/35 p-4">
              <div>Base URL：{settings.base_url || '使用默认地址'}</div>
              <div className="mt-2">Key：{settings.api_key_masked || '未展示'}</div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border bg-card/95 shadow-[0_16px_36px_rgba(148,163,184,0.16)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-foreground">
              <Sparkles className="size-4 text-primary" />
              使用说明
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-foreground/85">
            <div className="rounded-2xl border border-border bg-muted/35 p-4">
              AI 写作工作台和 AI 工具箱只负责选模型与执行任务，提供商、Key、Base URL 统一在这里维护。
            </div>
            <div className="rounded-2xl border border-border bg-muted/35 p-4">
              <div className="flex items-center gap-2 text-foreground">
                <Bot className="size-4 text-primary" />
                先刷新模型列表，再保存默认模型。
              </div>
              <div className="mt-2 flex items-center gap-2 text-muted-foreground">
                <KeyRound className="size-4" />
                修改 API Key 后会立即影响后端新发起的 AI 请求。
              </div>
              <div className="mt-2 flex items-center gap-2 text-muted-foreground">
                <RefreshCw className="size-4" />
                若外部服务变更模型清单，回到这里刷新即可。
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
