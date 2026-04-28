import { LoaderCircle } from 'lucide-react'

import { cn } from '@/lib/utils'

interface LoadingStateProps {
  label?: string
  className?: string
}

export function LoadingState({ label = '正在加载数据...', className }: LoadingStateProps) {
  return (
    <div
      className={cn(
        'flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-3xl border border-border bg-card/90 text-muted-foreground shadow-sm',
        className,
      )}
    >
      <LoaderCircle className="size-6 animate-spin text-primary" />
      <p className="text-sm">{label}</p>
    </div>
  )
}
