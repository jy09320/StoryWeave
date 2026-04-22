interface EmptyStateProps {
  title: string
  description: string
  action?: React.ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 bg-white/4 px-6 text-center">
      <div className="max-w-md space-y-3">
        <h3 className="text-xl font-semibold text-white">{title}</h3>
        <p className="text-sm leading-6 text-slate-400">{description}</p>
        {action ? <div className="flex justify-center pt-2">{action}</div> : null}
      </div>
    </div>
  )
}
