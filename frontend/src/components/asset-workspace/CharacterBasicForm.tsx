import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { X } from '@phosphor-icons/react'
import type { Character, CharacterPayload } from '@/types/api'

interface CharacterBasicFormProps {
  character: Character
  onChange: (payload: Partial<CharacterPayload>) => void
}

interface FormState {
  name: string
  alias: string
  description: string
  tags: string[]
  tagInput: string
}

function characterToForm(c: Character): FormState {
  return {
    name: c.name,
    alias: c.alias || '',
    description: c.description || '',
    tags: c.tags
      ? c.tags
          .split(/[，,、/]/)
          .map((t) => t.trim())
          .filter(Boolean)
      : [],
    tagInput: '',
  }
}

export function CharacterBasicForm({ character, onChange }: CharacterBasicFormProps) {
  const [form, setForm] = useState(() => characterToForm(character))

  useEffect(() => {
    setForm(characterToForm(character))
  }, [character.id])

  const emitChange = useCallback(
    (updates: Partial<FormState>) => {
      const newForm = { ...form, ...updates }
      setForm(newForm)
      onChange({
        name: newForm.name.trim(),
        alias: newForm.alias.trim() || null,
        description: newForm.description.trim() || null,
        tags: newForm.tags.length > 0 ? newForm.tags.join(', ') : null,
      })
    },
    [form, onChange],
  )

  const addTag = () => {
    const tag = form.tagInput.trim()
    if (tag && !form.tags.includes(tag)) {
      emitChange({ tags: [...form.tags, tag], tagInput: '' })
    }
  }

  const removeTag = (tag: string) => {
    emitChange({ tags: form.tags.filter((t) => t !== tag) })
  }

  return (
    <div className="space-y-4 p-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground/85">姓名</label>
          <Input
            value={form.name}
            onChange={(e) => emitChange({ name: e.target.value })}
            placeholder="角色姓名"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground/85">别名</label>
          <Input
            value={form.alias}
            onChange={(e) => emitChange({ alias: e.target.value })}
            placeholder="可选"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground/85">描述</label>
        <Textarea
          value={form.description}
          onChange={(e) => emitChange({ description: e.target.value })}
          placeholder="简短描述"
          rows={3}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground/85">标签</label>
        <div className="flex flex-wrap gap-1.5">
          {form.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1">
              {tag}
              <button type="button" onClick={() => removeTag(tag)} className="ml-0.5">
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={form.tagInput}
            onChange={(e) => setForm({ ...form, tagInput: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTag()
              }
            }}
            placeholder="输入标签后回车"
            className="h-8"
          />
        </div>
      </div>
    </div>
  )
}
