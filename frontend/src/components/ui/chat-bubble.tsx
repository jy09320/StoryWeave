import type { HTMLAttributes, ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Sparkle } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

interface ChatBubbleProps extends HTMLAttributes<HTMLDivElement> {
  role: 'user' | 'assistant'
  source?: string
  streaming?: boolean
  children?: ReactNode
}

export function ChatBubble({ role, source, streaming, children, className, ...props }: ChatBubbleProps) {
  const isUser = role === 'user'

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start', className)} {...props}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
        className={cn(
          'max-w-[85%] px-4 py-2.5',
          isUser
            ? 'rounded-2xl rounded-br-md bg-foreground/6'
            : 'rounded-2xl rounded-bl-md bg-primary/6',
        )}
      >
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkle className="size-3 text-primary" />
            <span className="text-[10px] font-medium text-primary/70">偶记</span>
            {source && (
              <span className="text-[10px] text-text-tertiary ml-1">· {source}</span>
            )}
          </div>
        )}

        <div className="text-[12px] leading-relaxed text-foreground/75">
          {children}
          {streaming && (
            <motion.span
              className="inline-block w-px h-3.5 bg-primary/60 ml-0.5 align-middle"
              animate={{ opacity: [1, 0] }}
              transition={{ duration: 0.6, repeat: Infinity }}
            />
          )}
        </div>
      </motion.div>
    </div>
  )
}
