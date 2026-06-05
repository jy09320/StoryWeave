import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'lined' | 'inked' | 'note'

interface InfoBlockProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant
  label: string
  children: ReactNode
}

const variantClasses: Record<Variant, { wrapper: string; label: string; value: string }> = {
  lined: {
    wrapper: 'pl-3 border-l border-ink-stroke',
    label: 'text-[10px] uppercase tracking-widest text-text-tertiary mb-1',
    value: 'text-sm text-foreground/80',
  },
  inked: {
    wrapper: 'rounded-lg bg-surface-accent/50 px-3.5 py-2.5',
    label: 'text-[10px] uppercase tracking-widest text-primary/60 mb-1',
    value: 'text-sm text-foreground/80',
  },
  note: {
    wrapper: 'rounded-lg bg-amber-50/50 px-3.5 py-2.5 border border-amber-200/30',
    label: 'text-[10px] uppercase tracking-widest text-amber-600/60 mb-1',
    value: 'text-sm text-foreground/80',
  },
}

export function InfoBlock({ variant = 'lined', label, children, className, ...props }: InfoBlockProps) {
  const v = variantClasses[variant]
  return (
    <div className={cn(v.wrapper, className)} {...props}>
      <div className={v.label}>{label}</div>
      <div className={v.value}>{children}</div>
    </div>
  )
}
