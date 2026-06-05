import { useState, useEffect } from 'react'
import { Spinner } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

interface EnhanceDescriptionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  characterName: string
  sourceWork: string
  enhancedDescription: string | null
  isLoading: boolean
  error: string | null
  onConfirm: (description: string) => void
  onSkip: () => void
  onRegenerate: () => void
}

export function EnhanceDescriptionDialog({
  open,
  onOpenChange,
  characterName,
  sourceWork,
  enhancedDescription,
  isLoading,
  error,
  onConfirm,
  onSkip,
  onRegenerate,
}: EnhanceDescriptionDialogProps) {
  const [editedDescription, setEditedDescription] = useState('')

  useEffect(() => {
    if (enhancedDescription) {
      setEditedDescription(enhancedDescription)
    }
  }, [enhancedDescription])

  function handleConfirm() {
    if (editedDescription.trim()) {
      onConfirm(editedDescription.trim())
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>AI 外貌增强</DialogTitle>
          <DialogDescription>
            原作：《{sourceWork}》 · 角色：{characterName}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Spinner className="size-4 animate-spin" />
              AI 正在生成外貌描述...
            </div>
          ) : error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {error}
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/85">
                AI 生成的外貌描述（可编辑）：
              </label>
              <Textarea
                value={editedDescription}
                onChange={(e) => setEditedDescription(e.target.value)}
                rows={6}
                placeholder="AI 生成的外貌描述将显示在这里..."
                className="resize-none"
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {enhancedDescription && !isLoading && (
            <Button variant="outline" onClick={onRegenerate}>
              重新生成
            </Button>
          )}
          <Button variant="outline" onClick={onSkip}>
            跳过，直接生成
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading || !editedDescription.trim()}
          >
            确认并生成肖像
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
