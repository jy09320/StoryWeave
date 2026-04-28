interface EmptyStateProps {
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card/85 px-6 text-center shadow-sm">
      <div className="max-w-md space-y-3">
        <h3 className="text-xl font-semibold text-foreground">{title}</h3>
        {description ? <p className="text-sm leading-6 text-muted-foreground">{description}</p> : null}
        {action ? <div className="flex justify-center pt-2">{action}</div> : null}
      </div>
    </div>
  )
}
