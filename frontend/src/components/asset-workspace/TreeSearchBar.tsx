import { MagnifyingGlass } from '@phosphor-icons/react'
import { Input } from '@/components/ui/input'

interface TreeSearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function TreeSearchBar({ value, onChange, placeholder = '搜索...' }: TreeSearchBarProps) {
  return (
    <div className="relative">
      <MagnifyingGlass className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 pl-9 text-sm"
      />
    </div>
  )
}
