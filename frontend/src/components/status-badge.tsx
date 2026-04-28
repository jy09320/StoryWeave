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
  draft: { label: '草稿', variant: 'secondary', className: 'border-white/10 bg-white/[0.03] text-slate-300' },
  active: { label: '进行中', variant: 'default', className: 'border-amber-500/20 bg-amber-500/10 text-amber-200' },
  paused: { label: '暂停', variant: 'outline', className: 'border-white/10 bg-white/[0.03] text-slate-300' },
  completed: { label: '已完成', variant: 'default', className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200' },
  writing: { label: '写作中', variant: 'default', className: 'border-amber-500/20 bg-amber-500/10 text-amber-200' },
  review: { label: '待审阅', variant: 'outline', className: 'border-white/10 bg-white/[0.03] text-slate-300' },
  done: { label: '已定稿', variant: 'default', className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200' },
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
