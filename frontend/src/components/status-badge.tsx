import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  status: string
  className?: string
}

const statusConfig: Record<
  string,
  {
    label: string
    variant: 'default' | 'secondary' | 'outline' | 'destructive'
    className?: string
  }
> = {
  draft: { label: '草稿', variant: 'secondary', className: 'border-border bg-background text-muted-foreground' },
  active: { label: '进行中', variant: 'default', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  paused: { label: '暂停', variant: 'outline', className: 'border-border bg-background text-muted-foreground' },
  completed: { label: '已完成', variant: 'default', className: 'border-primary/18 bg-primary/10 text-primary' },
  writing: { label: '写作中', variant: 'default', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  review: { label: '待审阅', variant: 'outline', className: 'border-border bg-background text-muted-foreground' },
  done: { label: '已定稿', variant: 'default', className: 'border-primary/18 bg-primary/10 text-primary' },
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] || { label: status, variant: 'secondary' as const }

  return (
    <Badge
      variant={config.variant}
      className={cn('px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider', config.className, className)}
    >
      {config.label}
    </Badge>
  )
}
