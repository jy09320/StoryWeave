import { RichTextField } from './RichTextField'

interface WorldSettingFieldProps {
  label: string
  value: string | null
  onChange: (value: string) => void
  placeholder?: string
}

export function WorldSettingField({ label, value, onChange, placeholder }: WorldSettingFieldProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground/85">{label}</label>
      <RichTextField value={value} onChange={onChange} placeholder={placeholder} />
    </div>
  )
}
