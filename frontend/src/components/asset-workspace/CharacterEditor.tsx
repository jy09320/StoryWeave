import { useCallback, useRef, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { listCharacters, updateCharacter } from '@/services/characters'
import { CharacterBasicForm } from './CharacterBasicForm'
import { RichTextField } from './RichTextField'
import type { Character, CharacterPayload } from '@/types/api'

interface CharacterEditorProps {
  characterId: string
  onDirtyChange?: (dirty: boolean) => void
}

export function CharacterEditor({ characterId, onDirtyChange }: CharacterEditorProps) {
  const queryClient = useQueryClient()
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingPayloadRef = useRef<Partial<CharacterPayload>>({})

  // There is no getCharacter(id) endpoint — use listCharacters and filter
  const { data: characters, isLoading } = useQuery<Character[]>({
    queryKey: ['characters'],
    queryFn: () => listCharacters(),
  })

  const character = useMemo(
    () => characters?.find((c) => c.id === characterId),
    [characters, characterId],
  )

  const updateMutation = useMutation({
    mutationFn: (payload: Partial<CharacterPayload>) => updateCharacter(characterId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['characters'] })
      onDirtyChange?.(false)
    },
    onError: (error: Error) => {
      toast.error(`保存失败: ${error.message}`)
    },
  })

  const scheduleSave = useCallback(
    (payload: Partial<CharacterPayload>) => {
      pendingPayloadRef.current = { ...pendingPayloadRef.current, ...payload }
      onDirtyChange?.(true)

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        if (Object.keys(pendingPayloadRef.current).length > 0) {
          updateMutation.mutate(pendingPayloadRef.current)
          pendingPayloadRef.current = {}
        }
      }, 300)
    },
    [updateMutation, onDirtyChange],
  )

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  if (isLoading || !character) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        加载中...
      </div>
    )
  }

  return (
    <Tabs defaultValue="basic" className="h-full">
      <div className="border-b border-border px-4">
        <TabsList className="h-9 bg-transparent">
          <TabsTrigger value="basic">基础信息</TabsTrigger>
          <TabsTrigger value="personality">性格特征</TabsTrigger>
          <TabsTrigger value="background">人物背景</TabsTrigger>
          <TabsTrigger value="relationships">人际关系</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="basic" className="mt-0">
        <CharacterBasicForm character={character} onChange={scheduleSave} />
      </TabsContent>

      <TabsContent value="personality" className="mt-0 p-4">
        <RichTextField
          value={character.personality}
          onChange={(v) => scheduleSave({ personality: v })}
          placeholder="描述角色的性格特征..."
        />
      </TabsContent>

      <TabsContent value="background" className="mt-0 p-4">
        <RichTextField
          value={character.background}
          onChange={(v) => scheduleSave({ background: v })}
          placeholder="描述角色的背景故事..."
        />
      </TabsContent>

      <TabsContent value="relationships" className="mt-0 p-4">
        <RichTextField
          value={character.relationship_notes}
          onChange={(v) => scheduleSave({ relationship_notes: v })}
          placeholder="描述角色的人际关系..."
        />
      </TabsContent>
    </Tabs>
  )
}
