import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const statusMap: Record<string, string> = {
  draft: '草稿',
  active: '进行中',
  paused: '暂停',
  completed: '已完成',
}

interface StatusBadgeProps {
  status: string
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const variantClass =
    status === 'completed'
      ? 'bg-emerald-500/15 text-emerald-300'
      : status === 'active'
        ? 'bg-sky-500/15 text-sky-300'
        : status === 'paused'
          ? 'bg-amber-500/15 text-amber-300'
          : 'bg-slate-500/15 text-slate-300'

  return (
    <Badge className={cn('border-none px-3 py-1 text-xs', variantClass, className)}>
      {statusMap[status] ?? status}
    </Badge>
  )
}
