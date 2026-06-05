import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'default' | 'inked' | 'stamp'

interface SectionLabelProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant
}

const variantClasses: Record<Variant, string> = {
  default: 'text-[11px] uppercase tracking-[0.22em] text-text-secondary font-medium',
  inked: 'pl-3 border-l-2 border-ink-heavy text-[11px] uppercase tracking-[0.18em] text-text-secondary font-medium',
  stamp: 'inline-block rounded-full bg-surface-accent px-3 py-1 text-[10px] uppercase tracking-[0.2em] font-medium text-primary',
}

export function SectionLabel({ variant = 'default', className, children, ...props }: SectionLabelProps) {
  return (
    <div className={cn(variantClasses[variant], className)} {...props}>
      {children}
    </div>
  )
}
