import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { LoaderCircle, Pencil, Plus, Server, Star, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  clearAIRuntimeCapabilitySnapshot,
  getCapabilityStatusMeta,
  matchAIRuntimeCapabilitySnapshot,
  saveAIRuntimeCapabilitySnapshot,
} from '@/lib/ai-runtime-capabilities'
import { queryClient } from '@/lib/query-client'
import { buildRuntimeModelOptions, MODEL_PROVIDER_OPTIONS } from '@/lib/ai-runtime'
import {
  activateAIRuntimeConfig,
  checkAIRuntimeCapabilities,
  createAIRuntimeConfig,
  deleteAIRuntimeConfig,
  getAIRuntimeSettings,
  listAIRuntimeConfigs,
  listAIRuntimeModels,
  updateAIRuntimeConfig,
  type AIRuntimeCapabilityCheckResponse,
  type AIRuntimeCapabilityItem,
  type AIRuntimeConfig,
  type AIModelOption,
} from '@/services/ai'

interface ConfigFormState {
  name: string
  provider: string
  modelId: string
  baseUrl: string
  apiKey: string
}

const emptyFormState: ConfigFormState = {
  name: '',
  provider: 'openai',
  modelId: 'gpt-4o',
  baseUrl: '',
  apiKey: '',
}

function capabilityBadgeClassName(status: AIRuntimeCapabilityItem['status']) {
  return getCapabilityStatusMeta(status).className
}

function CapabilityRow({ label, item }: { label: string; item: AIRuntimeCapabilityItem }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <Badge variant="outline" className={capabilityBadgeClassName(item.status)}>
          {item.summary}
        </Badge>
      </div>
      {item.detail ? <div className="mt-2 text-xs leading-5 text-muted-foreground">{item.detail}</div> : null}
    </div>
  )
}

function ProviderLabel({ provider }: { provider: string }) {
  const option = MODEL_PROVIDER_OPTIONS.find((o) => o.value === provider)
  return <>{option?.label ?? provider}</>
}

type ModelCategory = '大语言模型' | '视觉模型' | '全模态模型' | '向量模型' | '其他'

function classifyModel(modelId: string): ModelCategory {
  const id = modelId.toLowerCase()
  if (/text-embedding|embedding/.test(id)) return '向量模型'
  if (/qwen.*vl|vl.*qwen|vision/.test(id)) return '视觉模型'
  if (/audio|speech|tts|asr|cosyvoice|sambert|paraformer/.test(id)) return '全模态模型'
  if (/qwen|gpt|deepseek|llama|mistral|gemini|claude|baichuan|yi-|internlm|chatglm|glm/.test(id)) return '大语言模型'
  return '其他'
}

const CATEGORY_ORDER: ModelCategory[] = ['大语言模型', '视觉模型', '全模态模型', '向量模型', '其他']

export function RuntimeSettingsPanel() {
  const runtimeSettingsQuery = useQuery({
    queryKey: ['ai-runtime-settings'],
    queryFn: getAIRuntimeSettings,
  })

  const configsQuery = useQuery({
    queryKey: ['ai-runtime-configs'],
    queryFn: listAIRuntimeConfigs,
  })

  const [form, setForm] = useState<ConfigFormState>(emptyFormState)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [availableModels, setAvailableModels] = useState<AIModelOption[]>([])
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [capabilityResult, setCapabilityResult] = useState<AIRuntimeCapabilityCheckResponse | null>(null)

  useEffect(() => {
    if (!runtimeSettingsQuery.data) return
    setCapabilityResult(matchAIRuntimeCapabilitySnapshot(runtimeSettingsQuery.data))
  }, [runtimeSettingsQuery.data])

  const activeConfig = configsQuery.data?.find((c) => c.is_active) ?? null

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

  const hasSavedKey = Boolean(
    editingId
      ? configsQuery.data?.find((c) => c.id === editingId)?.api_key_masked
      : runtimeSettingsQuery.data?.api_key_masked,
  )

  // --- mutations ---

  const createMutation = useMutation({
    mutationFn: createAIRuntimeConfig,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['ai-runtime-configs'] })
      await queryClient.invalidateQueries({ queryKey: ['ai-runtime-settings'] })
      setShowForm(false)
      setEditingId(null)
      setForm(emptyFormState)
      setAvailableModels([])
      toast.success('配置已创建')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '创建配置失败')
    },
  })

  const patchMutation = useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & Record<string, unknown>) => updateAIRuntimeConfig(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['ai-runtime-configs'] })
      await queryClient.invalidateQueries({ queryKey: ['ai-runtime-settings'] })
      setShowForm(false)
      setEditingId(null)
      setForm(emptyFormState)
      setAvailableModels([])
      toast.success('配置已更新')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '更新配置失败')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteAIRuntimeConfig,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['ai-runtime-configs'] })
      await queryClient.invalidateQueries({ queryKey: ['ai-runtime-settings'] })
      toast.success('配置已删除')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '删除配置失败')
    },
  })

  const activateMutation = useMutation({
    mutationFn: activateAIRuntimeConfig,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['ai-runtime-configs'] })
      await queryClient.invalidateQueries({ queryKey: ['ai-runtime-settings'] })
      clearAIRuntimeCapabilitySnapshot()
      setCapabilityResult(null)
      toast.success('已切换活跃配置')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '切换配置失败')
    },
  })

  const capabilityMutation = useMutation({
    mutationFn: checkAIRuntimeCapabilities,
    onSuccess: (result) => {
      saveAIRuntimeCapabilitySnapshot(result)
      setCapabilityResult(result)
      toast.success('已完成运行时能力检测')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '运行时能力检测失败')
    },
  })

  // --- handlers ---

  function handleNew() {
    setEditingId(null)
    setForm(emptyFormState)
    setAvailableModels([])
    setShowForm(true)
  }

  function handleEdit(config: AIRuntimeConfig) {
    setEditingId(config.id)
    setForm({
      name: config.name,
      provider: config.provider,
      modelId: config.model_id,
      baseUrl: config.base_url ?? '',
      apiKey: '',
    })
    setAvailableModels([])
    setShowForm(true)
  }

  function handleCancel() {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyFormState)
    setAvailableModels([])
  }

  function handleDelete(config: AIRuntimeConfig) {
    if (config.is_active) {
      toast.error('不能删除当前活跃的配置')
      return
    }
    if (window.confirm(`确定要删除配置「${config.name}」吗？`)) {
      deleteMutation.mutate(config.id)
    }
  }

  function handleActivate(config: AIRuntimeConfig) {
    if (config.is_active) return
    activateMutation.mutate(config.id)
  }

  async function handleLoadModels() {
    setIsLoadingModels(true)
    try {
      const configId = editingId ?? undefined
      const response = await listAIRuntimeModels(configId)
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

    const name = form.name.trim()
    const modelId = form.modelId.trim()
    const apiKey = form.apiKey.trim()

    if (!name) {
      toast.error('请填写配置名称')
      return
    }
    if (!modelId) {
      toast.error('请先选择或填写默认模型')
      return
    }

    if (editingId) {
      const patch: Record<string, unknown> = { name, provider: form.provider, model_id: modelId, base_url: form.baseUrl.trim() || null }
      if (apiKey) patch.api_key = apiKey
      patchMutation.mutate({ id: editingId, ...patch })
    } else {
      if (!apiKey) {
        toast.error('首次保存时必须填写 API Key')
        return
      }
      createMutation.mutate({
        name,
        provider: form.provider,
        model_id: modelId,
        base_url: form.baseUrl.trim() || null,
        api_key: apiKey,
      })
    }
  }

  function handleCheckCapabilities() {
    if (activeConfig) {
      capabilityMutation.mutate({ provider: activeConfig.provider, model_id: activeConfig.model_id })
    }
  }

  // --- loading / error states ---

  if (runtimeSettingsQuery.isLoading || configsQuery.isLoading) {
    return (
      <Card className="border border-border bg-card/95">
        <CardContent className="flex min-h-65 items-center justify-center">
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
        <CardContent className="flex min-h-65 flex-col items-center justify-center gap-4 text-center">
          <div className="space-y-2">
            <div className="text-lg font-semibold text-foreground">设置中心加载失败</div>
            <div className="text-sm text-muted-foreground">
              {runtimeSettingsQuery.error instanceof Error ? runtimeSettingsQuery.error.message : '未能获取 AI 运行时配置。'}
            </div>
          </div>
          <Button variant="outline" onClick={() => { runtimeSettingsQuery.refetch(); configsQuery.refetch() }}>
            重新加载
          </Button>
        </CardContent>
      </Card>
    )
  }

  const settings = runtimeSettingsQuery.data
  const configs = configsQuery.data ?? []
  const isSaving = createMutation.isPending || patchMutation.isPending

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
      {/* Left: config list + form */}
      <div className="space-y-4">
        {/* Config list card */}
        <Card className="border border-border bg-card/95 shadow-[0_16px_36px_rgba(148,163,184,0.16)]">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardDescription className="text-primary/80">配置管理</CardDescription>
                <CardTitle className="text-2xl text-foreground">API 配置列表</CardTitle>
              </div>
              <Button size="sm" onClick={handleNew} disabled={showForm}>
                <Plus className="size-4 mr-1" />
                新增配置
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {configs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
                还没有任何配置，点击「新增配置」创建第一个 API 配置。
              </div>
            ) : (
              <div className="space-y-2">
                {configs.map((config) => {
                  const active = config.is_active
                  const editing = editingId === config.id
                  return (
                    <div
                      key={config.id}
                      className={[
                        'flex items-center gap-3 rounded-2xl border p-4 transition cursor-pointer',
                        active
                          ? 'border-primary/30 bg-primary/8'
                          : editing
                            ? 'border-primary/20 bg-primary/5'
                            : 'border-border bg-muted/35 hover:border-primary/20',
                      ].join(' ')}
                      onClick={() => handleActivate(config)}
                    >
                      <div className="flex items-center gap-2 shrink-0">
                        {active ? (
                          <Star className="size-4 text-primary fill-primary" />
                        ) : (
                          <Star className="size-4 text-muted-foreground/30" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground truncate">{config.name}</span>
                          {active ? (
                            <Badge variant="outline" className="border-primary/30 text-primary text-xs">活跃</Badge>
                          ) : null}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <ProviderLabel provider={config.provider} />
                          <span>·</span>
                          <span className="truncate">{config.model_id}</span>
                          {config.api_key_masked ? (
                            <>
                              <span>·</span>
                              <span>{config.api_key_masked}</span>
                            </>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={(e) => { e.stopPropagation(); handleEdit(config) }}
                          title="编辑"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); handleDelete(config) }}
                          disabled={active}
                          title={active ? '不能删除活跃配置' : '删除'}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit/Create form */}
        {showForm ? (
          <Card className="border border-border bg-card/95 shadow-[0_16px_36px_rgba(148,163,184,0.16)]">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-lg text-foreground">
                  {editingId ? '编辑配置' : '新增配置'}
                </CardTitle>
                <Button variant="ghost" size="icon" className="size-8" onClick={handleCancel}>
                  <X className="size-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <form className="space-y-5" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground/85" htmlFor="config-name">配置名称</label>
                  <Input
                    id="config-name"
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="例如 OpenAI 官方、Deepseek、本地网关"
                  />
                </div>

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
                    <label className="text-sm font-medium text-foreground/85" htmlFor="config-base-url">
                      Base URL
                    </label>
                    <Input
                      id="config-base-url"
                      value={form.baseUrl}
                      onChange={(event) => setForm((prev) => ({ ...prev, baseUrl: event.target.value }))}
                      placeholder={form.provider === 'anthropic' ? '例如 https://api.anthropic.com' : '例如 https://api.openai.com/v1'}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground/85">可用模型</label>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={handleLoadModels}
                      disabled={isLoadingModels || (!hasSavedKey && !form.apiKey.trim())}
                      type="button"
                    >
                      {isLoadingModels ? '获取中...' : '刷新模型列表'}
                    </Button>
                    {!hasSavedKey && !form.apiKey.trim() ? (
                      <div className="text-xs leading-5 text-amber-300">请先填写 API Key，再刷新模型列表。</div>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground/85" htmlFor="config-api-key">
                    API Key
                  </label>
                  <Input
                    id="config-api-key"
                    type="password"
                    value={form.apiKey}
                    onChange={(event) => setForm((prev) => ({ ...prev, apiKey: event.target.value }))}
                    placeholder={hasSavedKey ? '留空则沿用当前已保存的 API Key' : '首次保存时必须填写 API Key'}
                  />
                  {hasSavedKey ? (
                    <div className="text-xs text-muted-foreground">当前已保存 Key。再次打开页面时不会回填明文。</div>
                  ) : null}
                </div>

                {availableModels.length > 0 ? (
                  <div className="rounded-2xl border border-border bg-muted/35 p-4">
                    <div className="mb-3 text-sm font-medium text-foreground">
                      当前可用模型
                      <span className="ml-2 text-xs font-normal text-muted-foreground">共 {availableModels.length} 个</span>
                    </div>
                    <div className="space-y-3">
                      {CATEGORY_ORDER.map((category) => {
                        const models = availableModels.filter((m) => classifyModel(m.id) === category)
                        if (models.length === 0) return null
                        return (
                          <div key={category}>
                            <div className="mb-1.5 text-xs font-medium text-muted-foreground/70">{category}</div>
                            <div className="flex flex-wrap gap-2">
                              {models.map((model) => {
                                const selected = model.id === form.modelId
                                return (
                                  <button
                                    key={model.id}
                                    type="button"
                                    className={[
                                      'rounded-full border px-3 py-1.5 text-xs transition',
                                      selected
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
                        )
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={handleCancel}>
                    取消
                  </Button>
                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? '保存中...' : editingId ? '保存修改' : '创建配置'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* Right: active config + capabilities */}
      <div className="space-y-4">
        <Card className="border border-border bg-card/95 shadow-[0_16px_36px_rgba(148,163,184,0.16)]">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-lg text-foreground">
                <Server className="size-4 text-primary" />
                当前生效配置
              </CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCheckCapabilities}
                disabled={capabilityMutation.isPending || !activeConfig}
              >
                {capabilityMutation.isPending ? '检测中...' : '检测能力'}
              </Button>
            </div>
            <CardDescription>
              兼容性检测的是当前已生效的运行时配置，不代表所有网关具备同等兼容性。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-foreground/85">
            {activeConfig ? (
              <>
                <div className="rounded-2xl border border-primary/18 bg-primary/8 p-4">
                  <div>配置名：{activeConfig.name}</div>
                  <div className="mt-2">提供商：<ProviderLabel provider={activeConfig.provider} /></div>
                  <div className="mt-2">默认模型：{activeConfig.model_id}</div>
                  <div className="mt-2">来源：{settings.source === 'database' ? '运行时配置接口' : '环境变量'}</div>
                </div>
                <div className="rounded-2xl border border-border bg-muted/35 p-4">
                  <div>Base URL：{activeConfig.base_url || '使用默认地址'}</div>
                  <div className="mt-2">Key：{activeConfig.api_key_masked || '未展示'}</div>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                还没有任何配置。点击「新增配置」创建一个。
              </div>
            )}
            {!activeConfig?.api_key_masked ? <div className="text-xs text-amber-300">请先保存可用的 API Key，再进行能力检测。</div> : null}

            {capabilityResult ? (
              <div className="space-y-2 pt-1">
                <div className="text-xs text-muted-foreground">
                  已检测 {capabilityResult.provider} / {capabilityResult.model_id}
                  <span className="ml-2">{new Date(capabilityResult.checked_at).toLocaleString('zh-CN')}</span>
                </div>
                <CapabilityRow label="文本生成" item={capabilityResult.text_generation} />
                <CapabilityRow label="结构化助手" item={capabilityResult.structured_output} />
                <CapabilityRow label="Tool Calling" item={capabilityResult.tool_calling} />
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
                保存配置后点击「检测能力」，可验证该模型是否支持文本生成与结构化输出。
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
