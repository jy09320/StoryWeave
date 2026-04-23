import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  status: string
  className?: string
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; className?: string }> = {
  draft: { label: '草稿', variant: 'secondary', className: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
  active: { label: '进行中', variant: 'default', className: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
  paused: { label: '暂停', variant: 'outline', className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  completed: { label: '已完成', variant: 'default', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  writing: { label: '写作中', variant: 'default', className: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
  review: { label: '待审阅', variant: 'outline', className: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  done: { label: '已定稿', variant: 'default', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
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
