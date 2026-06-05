import { Plus, TreeStructure } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'

interface EmptyStateProps {
  onCreateNew: () => void
}

export function EmptyState({ onCreateNew }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
      <TreeStructure className="size-12 opacity-30" />
      <div className="text-center">
        <p className="text-sm font-medium">还没有打开任何内容</p>
        <p className="mt-1 text-xs">从左侧树中选择一个节点，或创建新的</p>
      </div>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={onCreateNew}>
        <Plus className="size-4" />
        新建
      </Button>
    </div>
  )
}
