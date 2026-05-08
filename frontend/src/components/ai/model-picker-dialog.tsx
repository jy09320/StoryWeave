import { useEffect } from 'react'
import { LoaderCircle, X } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { AIModelOption } from '@/services/ai'

interface ModelPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedModelId: string
  availableModels: AIModelOption[]
  isLoadingModels: boolean
  hasSavedRuntimeKey?: boolean
  onRefresh: () => void
  onSelect: (modelId: string) => void
}

export function ModelPickerDialog({
  open,
  onOpenChange,
  selectedModelId,
  availableModels,
  isLoadingModels,
  hasSavedRuntimeKey = true,
  onRefresh,
  onSelect,
}: ModelPickerDialogProps) {
  useEffect(() => {
    if (!open) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onOpenChange(false)
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onOpenChange, open])

  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[80]">
      <button
        type="button"
        aria-label="关闭模型选择"
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <div className="absolute left-1/2 top-1/2 z-[81] grid w-[min(720px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl border border-border bg-popover shadow-2xl shadow-slate-300/40">
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div>
            <div className="text-lg font-semibold text-foreground">选择模型</div>
            <div className="mt-1 text-sm leading-6 text-muted-foreground">
              这里切换当前任务使用的模型，运行时配置仍在设置中心维护。
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
              当前模型：{selectedModelId || '未选择'}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={onRefresh} disabled={isLoadingModels || !hasSavedRuntimeKey}>
                {isLoadingModels ? <LoaderCircle className="size-4 animate-spin" /> : null}
                {isLoadingModels ? '获取中...' : '刷新模型列表'}
              </Button>
              <Link
                to="/settings"
                className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm text-foreground transition hover:bg-muted"
              >
                设置中心
              </Link>
            </div>
          </div>

          {!hasSavedRuntimeKey ? (
            <div className="rounded-xl border border-amber-300/40 bg-amber-500/10 px-3 py-2 text-sm leading-6 text-amber-200">
              请先在设置中心保存可用的 API Key，再刷新模型列表。
            </div>
          ) : null}

          <ScrollArea className="h-[360px] rounded-2xl border border-border bg-muted/20">
            <div className="space-y-2 p-3">
              {availableModels.length > 0 ? (
                availableModels.map((model) => {
                  const isSelected = model.id === selectedModelId

                  return (
                    <button
                      key={model.id}
                      type="button"
                      className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                        isSelected
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-background/80 text-foreground hover:border-primary/30 hover:bg-muted/60'
                      }`}
                      onClick={() => {
                        onSelect(model.id)
                        onOpenChange(false)
                      }}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{model.id}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {model.owned_by?.trim() ? `来源：${model.owned_by}` : '已连接模型'}
                        </div>
                      </div>
                      <div className="shrink-0 text-xs">{isSelected ? '当前使用' : '切换'}</div>
                    </button>
                  )
                })
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-background/60 px-4 py-6 text-sm leading-6 text-muted-foreground">
                  {hasSavedRuntimeKey ? '还没有加载模型列表。点击上方“刷新模型列表”后再选择。' : '暂无可选模型。'}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}
