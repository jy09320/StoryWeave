interface DimensionSwitcherProps {
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}

export function DimensionSwitcher({ value, options, onChange }: DimensionSwitcherProps) {
  return (
    <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition ${
            value === option.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
