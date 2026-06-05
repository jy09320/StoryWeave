import { useCallback, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { getProject, updateProjectWorldSetting } from '@/services/projects'
import { WorldSettingField } from './WorldSettingField'
import type { ProjectDetail, WorldSettingPayload } from '@/types/api'

interface WorldSettingEditorProps {
  projectId: string
  field: 'overview' | 'rules' | 'factions' | 'locations' | 'timeline' | 'extra_notes'
  onDirtyChange?: (dirty: boolean) => void
}

const FIELD_CONFIG: Record<string, { label: string; placeholder: string }> = {
  overview: { label: '总览', placeholder: '描述世界观的整体概况...' },
  rules: { label: '世界规则', placeholder: '描述世界运行的规则...' },
  factions: { label: '势力分布', placeholder: '描述各势力及其关系...' },
  locations: { label: '重要地点', placeholder: '描述重要的地理位置...' },
  timeline: { label: '时间线', placeholder: '描述重要的时间节点...' },
  extra_notes: { label: '备注', placeholder: '其他补充信息...' },
}

export function WorldSettingEditor({ projectId, field, onDirtyChange }: WorldSettingEditorProps) {
  const queryClient = useQueryClient()
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: project, isLoading } = useQuery<ProjectDetail>({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId),
    enabled: Boolean(projectId),
  })

  const worldSetting = project?.world_setting

  const updateMutation = useMutation({
    mutationFn: (payload: WorldSettingPayload) =>
      updateProjectWorldSetting(projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      onDirtyChange?.(false)
    },
    onError: (error) => {
      toast.error(`保存失败: ${error.message}`)
    },
  })

  const scheduleSave = useCallback(
    (key: keyof WorldSettingPayload, value: string) => {
      onDirtyChange?.(true)
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        const payload: WorldSettingPayload = {
          [key]: key === 'title' ? value || undefined : value || null,
        }
        updateMutation.mutate(payload)
      }, 300)
    },
    [updateMutation, onDirtyChange],
  )

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        加载中...
      </div>
    )
  }

  const config = FIELD_CONFIG[field]
  const fieldValue = worldSetting?.[field] ?? null

  return (
    <div className="p-4">
      {field === 'overview' && worldSetting && (
        <div className="mb-4 space-y-1.5">
          <label className="text-sm font-medium text-foreground/85">标题</label>
          <Input
            value={worldSetting.title || ''}
            onChange={(e) => scheduleSave('title', e.target.value)}
            placeholder="世界观标题"
          />
        </div>
      )}
      <WorldSettingField
        label={config.label}
        value={fieldValue}
        onChange={(value) => scheduleSave(field, value)}
        placeholder={config.placeholder}
      />
    </div>
  )
}
