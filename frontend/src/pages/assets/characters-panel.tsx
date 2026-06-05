import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PencilSimple, Spinner, ChatCenteredText, Plus, PaperPlaneRight, Sparkle, Trash, User } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { clsx } from 'clsx'

import { EmptyState } from '@/components/empty-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { formatDate } from '@/lib/format'
import {
  deleteCharacter,
  updateCharacter,
} from '@/services/projects'
import {
  listCharacters,
  createCharacter,
  generatePortrait,
  listPortraitModels,
  listCharacterChatSessions,
  createCharacterChatSession,
  deleteCharacterChatSession,
  streamCharacterChat,
} from '@/services/characters'
import { listProjects, getProject } from '@/services/projects'
import type {
  Character,
  CharacterChatSession,
  CharacterPayload,
  Project,
  ProjectDetail,
} from '@/types/api'


interface CharacterFormState {
  name: string
  alias: string
  tags: string
  description: string
  profile: string
  personality: string
  background: string
  relationship_notes: string
}

const defaultFormState: CharacterFormState = {
  name: '',
  alias: '',
  tags: '',
  description: '',
  profile: '',
  personality: '',
  background: '',
  relationship_notes: '',
}

function buildPayload(form: CharacterFormState): CharacterPayload {
  return {
    name: form.name.trim(),
    alias: form.alias.trim() || null,
    tags: form.tags.trim() || null,
    description: form.description.trim() || null,
    profile: form.profile.trim() || null,
    personality: form.personality.trim() || null,
    background: form.background.trim() || null,
    relationship_notes: form.relationship_notes.trim() || null,
  }
}

function getInitialFormState(character?: Character | null): CharacterFormState {
  if (!character) {
    return defaultFormState
  }

  return {
    name: character.name,
    alias: character.alias ?? '',
    tags: character.tags ?? '',
    description: character.description ?? '',
    profile: character.profile ?? '',
    personality: character.personality ?? '',
    background: character.background ?? '',
    relationship_notes: character.relationship_notes ?? '',
  }
}

function splitTags(tags?: string | null) {
  if (!tags?.trim()) {
    return []
  }

  return tags
    .split(/[，,、/]/)
    .map((item) => item.trim())
    .filter(Boolean)
}


export function AssetsCharactersPanel() {
  const queryClient = useQueryClient()

  const [searchKeyword] = useState('')
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null)
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null)
  const [editForm, setEditForm] = useState<CharacterFormState>(defaultFormState)
  const [activeTab, setActiveTab] = useState<'detail' | 'chat'>('detail')

  // Create-character dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createForm, setCreateForm] = useState<CharacterFormState>(defaultFormState)

  const charactersQuery = useQuery<Character[], Error>({
    queryKey: ['characters', searchKeyword],
    queryFn: () => listCharacters(searchKeyword || undefined),
  })

  const updateCharacterMutation = useMutation({
    mutationFn: ({ characterId, payload }: { characterId: string; payload: Partial<CharacterPayload> }) =>
      updateCharacter(characterId, payload),
    onSuccess: async (character: Character) => {
      await queryClient.invalidateQueries({ queryKey: ['characters'] })
      setSelectedCharacterId(character.id)
      setEditingCharacter(null)
      setEditForm(defaultFormState)
      toast.success('角色信息已更新')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const deleteCharacterMutation = useMutation({
    mutationFn: deleteCharacter,
    onSuccess: async (_, deletedId) => {
      await queryClient.invalidateQueries({ queryKey: ['characters'] })
      setSelectedCharacterId((current) => (current === deletedId ? null : current))
      toast.success('角色已删除')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const createCharacterMutation = useMutation({
    mutationFn: (payload: CharacterPayload) => createCharacter(payload),
    onSuccess: async (character: Character) => {
      await queryClient.invalidateQueries({ queryKey: ['characters'] })
      setSelectedCharacterId(character.id)
      setActiveTab('detail')
      setCreateDialogOpen(false)
      setCreateForm(defaultFormState)
      toast.success(`角色「${character.name}」已创建`)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const generatePortraitMutation = useMutation({
    mutationFn: ({ characterId, modelId }: { characterId: string; modelId?: string }) =>
      generatePortrait(characterId, modelId),
    onSuccess: async (character: Character) => {
      await queryClient.invalidateQueries({ queryKey: ['characters'] })
      toast.success(`角色「${character.name}」的形象已生成`)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const characters = useMemo(() => charactersQuery.data ?? [], [charactersQuery.data])
  const displayedCharacters = characters

  // Build character → project(s) mapping from all project details
  const projectsQuery = useQuery<Project[], Error>({
    queryKey: ['projects'],
    queryFn: listProjects,
    staleTime: 60_000,
  })
  const projects = projectsQuery.data ?? []

  // Fetch all project details in parallel to get project_characters join data
  const projectDetailsQueries = useQuery<ProjectDetail[], Error>({
    queryKey: ['project-details-for-characters', projects.map((p) => p.id).join(',')],
    queryFn: async () => {
      if (projects.length === 0) return []
      return Promise.all(projects.map((p) => getProject(p.id)))
    },
    enabled: projects.length > 0,
    staleTime: 60_000,
  })

  // characterId → Project[]
  const characterProjectsMap = useMemo<Map<string, Project[]>>(() => {
    const map = new Map<string, Project[]>()
    for (const detail of projectDetailsQueries.data ?? []) {
      const project = projects.find((p) => p.id === detail.id)
      if (!project) continue
      for (const pc of detail.project_characters) {
        const existing = map.get(pc.character_id) ?? []
        existing.push(project)
        map.set(pc.character_id, existing)
      }
    }
    return map
  }, [projectDetailsQueries.data, projects])
  const selectedCharacter = useMemo(
    () => displayedCharacters.find((character) => character.id === selectedCharacterId) ?? displayedCharacters[0] ?? null,
    [displayedCharacters, selectedCharacterId],
  )

  function ensureSelectedCharacter() {
    if (!displayedCharacters.length) {
      setSelectedCharacterId(null)
      return
    }

    if (!selectedCharacterId || !displayedCharacters.some((character) => character.id === selectedCharacterId)) {
      setSelectedCharacterId(displayedCharacters[0].id)
    }
  }

  if (selectedCharacterId && !displayedCharacters.some((character) => character.id === selectedCharacterId)) {
    ensureSelectedCharacter()
  }

  function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!editingCharacter) {
      return
    }

    const payload = buildPayload(editForm)
    if (!payload.name) {
      toast.error('请输入角色名称')
      return
    }

    updateCharacterMutation.mutate({
      characterId: editingCharacter.id,
      payload,
    })
  }

  function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const payload = buildPayload(createForm)
    if (!payload.name) {
      toast.error('请输入角色名称')
      return
    }

    createCharacterMutation.mutate(payload)
  }

  function openEditDialog(character: Character) {
    setEditingCharacter(character)
    setEditForm(getInitialFormState(character))
  }

  function handleDelete(character: Character) {
    const confirmed = window.confirm(`确认删除角色"${character.name}"吗？已关联到项目的关系也会被移除。`)
    if (!confirmed) {
      return
    }

    deleteCharacterMutation.mutate(character.id)
  }

  function handleSelectCharacter(id: string) {
    setSelectedCharacterId(id)
    setActiveTab('detail')
  }

  if (charactersQuery.isLoading) {
    return <LoadingState label="正在加载角色库..." />
  }

  if (charactersQuery.isError) {
    return (
      <EmptyState
        title="角色库加载失败"
        description={charactersQuery.error?.message || '请检查后端服务是否已启动。'}
        action={
          <Button variant="outline" onClick={() => charactersQuery.refetch()}>
            重新加载
          </Button>
        }
      />
    )
  }

  return (
    <>
      <div className="flex h-full gap-0">

        {displayedCharacters.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              title={searchKeyword ? '没有匹配的角色' : '角色库还是空的'}
              description={searchKeyword ? '换个关键词再试。' : '先创建一个角色。'}
              action={
                <Button onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="size-4" />
                  新建角色
                </Button>
              }
            />
          </div>
        ) : (
          <>
            {/* Left: character list */}
            <aside className="w-65 shrink-0 border-r border-border flex flex-col bg-sidebar">
              <CharacterList
                characters={displayedCharacters}
                selectedCharacter={selectedCharacter}
                characterProjectsMap={characterProjectsMap}
                onSelect={handleSelectCharacter}
                onCreateNew={() => setCreateDialogOpen(true)}
              />
            </aside>

            {/* Right: detail / chat */}
            <section className="min-w-0 flex-1 flex flex-col overflow-hidden bg-background">
              {selectedCharacter ? (
                <>
                  {/* Tab bar */}
                  <div className="flex items-center border-b border-border px-6 pt-4 pb-0 gap-6">
                    <button
                      type="button"
                      onClick={() => setActiveTab('detail')}
                      className={clsx(
                        'pb-3 text-sm font-medium border-b-2 transition-colors',
                        activeTab === 'detail'
                          ? 'border-primary text-foreground'
                          : 'border-transparent text-muted-foreground hover:text-foreground',
                      )}
                    >
                      角色详情
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('chat')}
                      className={clsx(
                        'pb-3 flex items-center gap-1.5 text-sm font-medium border-b-2 transition-colors',
                        activeTab === 'chat'
                          ? 'border-primary text-foreground'
                          : 'border-transparent text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <ChatCenteredText className="size-3.5" />
                      AI 对话
                    </button>
                  </div>

                  <div className="flex-1 overflow-auto">
                    {activeTab === 'detail' ? (
                      <CharacterDetail
                        character={selectedCharacter}
                        deletePending={deleteCharacterMutation.isPending}
                        isGeneratingPortrait={generatePortraitMutation.isPending}
                        onEdit={() => openEditDialog(selectedCharacter)}
                        onDelete={() => handleDelete(selectedCharacter)}
                        onGeneratePortrait={(modelId) =>
                          generatePortraitMutation.mutate({ characterId: selectedCharacter.id, modelId })
                        }
                      />
                    ) : (
                      <CharacterChatPanel character={selectedCharacter} />
                    )}
                  </div>
                </>
              ) : null}
            </section>
          </>
        )}

        {/* Edit dialog */}
        <CharacterDialog
          open={Boolean(editingCharacter)}
          onOpenChange={(open) => {
            if (!open) {
              setEditingCharacter(null)
              setEditForm(defaultFormState)
            }
          }}
          title="编辑角色"
          description="更新角色资料"
          form={editForm}
          onChange={setEditForm}
          onSubmit={handleEditSubmit}
          pending={updateCharacterMutation.isPending}
          submitLabel="保存修改"
        />

        {/* Create dialog */}
        <CharacterDialog
          open={createDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              setCreateDialogOpen(false)
              setCreateForm(defaultFormState)
            }
          }}
          title="新建角色"
          description="创建一个新角色，加入全局角色库"
          form={createForm}
          onChange={setCreateForm}
          onSubmit={handleCreateSubmit}
          pending={createCharacterMutation.isPending}
          submitLabel="创建角色"
        />
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// CharacterList
// ---------------------------------------------------------------------------

interface CharacterListProps {
  characters: Character[]
  selectedCharacter: Character | null
  characterProjectsMap: Map<string, Project[]>
  onSelect: (id: string) => void
  onCreateNew?: () => void
}

const avatarColors = [
  'bg-violet-100 text-violet-600',
  'bg-sky-100 text-sky-600',
  'bg-emerald-100 text-emerald-600',
  'bg-amber-100 text-amber-600',
  'bg-rose-100 text-rose-600',
  'bg-indigo-100 text-indigo-600',
]

function getAvatarColor(name: string) {
  return avatarColors[name.charCodeAt(0) % avatarColors.length]
}

function CharacterRow({
  character,
  isActive,
  onSelect,
}: {
  character: Character
  isActive: boolean
  onSelect: () => void
}) {
  const tags = splitTags(character.tags)
  const initial = character.name.charAt(0)
  const avatarColor = getAvatarColor(character.name)

  return (
    <button
      type="button"
      onClick={onSelect}
      className={clsx(
        'group relative w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
        isActive ? 'bg-primary/8' : 'hover:bg-muted/50',
      )}
    >
      {isActive && (
        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-primary" />
      )}
      <div className="shrink-0">
        {character.portrait_url ? (
          <img
            src={character.portrait_url}
            alt={character.name}
            className="size-9 rounded-lg object-cover ring-1 ring-border/50"
          />
        ) : (
          <div className={clsx('flex size-9 items-center justify-center rounded-lg text-sm font-semibold', avatarColor)}>
            {initial}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="truncate text-sm font-medium text-foreground">{character.name}</span>
          {character.alias ? (
            <span className="shrink-0 text-[10px] text-muted-foreground/60 truncate max-w-16">{character.alias}</span>
          ) : null}
        </div>
        {tags.length > 0 ? (
          <div className="mt-1 flex gap-1 flex-wrap">
            {tags.slice(0, 2).map((tag) => (
              <span
                key={`${character.id}-${tag}`}
                className={clsx(
                  'rounded-sm px-1.5 py-0.5 text-[10px] leading-none',
                  isActive ? 'bg-primary/10 text-primary/70' : 'bg-muted text-muted-foreground',
                )}
              >
                {tag}
              </span>
            ))}
            {tags.length > 2 && (
              <span className="text-[10px] text-muted-foreground/50">+{tags.length - 2}</span>
            )}
          </div>
        ) : character.description ? (
          <div className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground/60">{character.description}</div>
        ) : null}
      </div>
    </button>
  )
}

function CharacterList({ characters, selectedCharacter, characterProjectsMap, onSelect, onCreateNew }: CharacterListProps) {
  // Build groups: projectId → { project, characters[] }, then unassigned group
  const { groups, unassigned } = useMemo(() => {
    const projectMap = new Map<string, { title: string; chars: Character[] }>()

    for (const character of characters) {
      const projs = characterProjectsMap.get(character.id)
      if (projs && projs.length > 0) {
        for (const proj of projs) {
          if (!projectMap.has(proj.id)) {
            projectMap.set(proj.id, { title: proj.title, chars: [] })
          }
          const group = projectMap.get(proj.id)!
          // avoid duplicates when character appears in multiple projects
          if (!group.chars.some((c) => c.id === character.id)) {
            group.chars.push(character)
          }
        }
      }
    }

    const unassigned = characters.filter((c) => !characterProjectsMap.has(c.id) || (characterProjectsMap.get(c.id)?.length ?? 0) === 0)

    return {
      groups: Array.from(projectMap.entries()).map(([id, g]) => ({ id, title: g.title, chars: g.chars })),
      unassigned,
    }
  }, [characters, characterProjectsMap])

  const hasGroups = groups.length > 0

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 shrink-0">
        <div>
          <div className="text-sm font-semibold text-foreground">角色列表</div>
          <div className="text-[11px] text-muted-foreground/60 mt-0.5">{characters.length} 个角色</div>
        </div>
        {onCreateNew ? (
          <button
            type="button"
            onClick={onCreateNew}
            className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary transition hover:bg-primary/20"
            title="新建角色"
          >
            <Plus className="size-3.5" />
          </button>
        ) : null}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        {hasGroups ? (
          <>
            {groups.map((group, idx) => {
              const spineColors = ['bg-violet-400', 'bg-sky-400', 'bg-emerald-400', 'bg-amber-400', 'bg-rose-400', 'bg-indigo-400']
              const spineColor = spineColors[idx % spineColors.length]
              return (
                <div key={group.id} className="mb-1">
                  {/* Group label */}
                  <div className="flex items-center gap-2 px-3 py-1.5">
                    <span className={clsx('h-2.5 w-1 rounded-full shrink-0', spineColor)} />
                    <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                      {group.title}
                    </span>
                  </div>
                  {group.chars.map((character) => (
                    <CharacterRow
                      key={character.id}
                      character={character}
                      isActive={selectedCharacter?.id === character.id}
                      onSelect={() => onSelect(character.id)}
                    />
                  ))}
                </div>
              )
            })}

            {unassigned.length > 0 && (
              <div className="mb-1">
                <div className="flex items-center gap-2 px-3 py-1.5">
                  <span className="h-2.5 w-1 rounded-full shrink-0 bg-muted-foreground/30" />
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/40">
                    未关联项目
                  </span>
                </div>
                {unassigned.map((character) => (
                  <CharacterRow
                    key={character.id}
                    character={character}
                    isActive={selectedCharacter?.id === character.id}
                    onSelect={() => onSelect(character.id)}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          // No project data yet or all unassigned — flat list
          characters.map((character) => (
            <CharacterRow
              key={character.id}
              character={character}
              isActive={selectedCharacter?.id === character.id}
              onSelect={() => onSelect(character.id)}
            />
          ))
        )}

        {onCreateNew ? (
          <button
            type="button"
            onClick={onCreateNew}
            className="flex w-full items-center justify-center gap-1.5 py-3 text-xs text-muted-foreground/50 transition hover:text-muted-foreground"
          >
            <Plus className="size-3" />
            新建角色
          </button>
        ) : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CharacterDetail
// ---------------------------------------------------------------------------

interface CharacterDetailProps {
  character: Character
  deletePending: boolean
  isGeneratingPortrait: boolean
  onEdit: () => void
  onDelete: () => void
  onGeneratePortrait: (modelId?: string) => void
}

function CharacterDetail({ character, deletePending, isGeneratingPortrait, onEdit, onDelete, onGeneratePortrait }: CharacterDetailProps) {
  const tags = splitTags(character.tags)

  const [portraitPopoverOpen, setPortraitPopoverOpen] = useState(false)
  const [selectedModelId, setSelectedModelId] = useState<string | undefined>(undefined)

  const portraitModelsQuery = useQuery({
    queryKey: ['portrait-models'],
    queryFn: listPortraitModels,
    staleTime: 5 * 60 * 1000,
    enabled: portraitPopoverOpen,
  })

  const availableModels = portraitModelsQuery.data ?? []

  function handleGenerate() {
    setPortraitPopoverOpen(false)
    onGeneratePortrait(selectedModelId)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Hero header */}
      <div className="relative px-8 pt-8 pb-6 border-b border-border/60">
        <div className="flex items-start gap-6">
          {/* Portrait */}
          <div className="relative shrink-0 group">
            {character.portrait_url ? (
              <img
                src={character.portrait_url}
                alt={character.name}
                className="size-24 rounded-2xl object-cover ring-2 ring-border shadow-md"
              />
            ) : (
              <div className="flex size-24 items-center justify-center rounded-2xl bg-linear-to-br from-primary/20 to-primary/5 ring-2 ring-border shadow-md">
                <User className="size-10 text-primary/40" />
              </div>
            )}
            {/* Portrait generate overlay — opens model picker popover */}
            <Popover open={portraitPopoverOpen} onOpenChange={setPortraitPopoverOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  disabled={isGeneratingPortrait}
                  className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/0 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100"
                  title={character.portrait_url ? '重新生成形象' : '生成形象'}
                >
                  {isGeneratingPortrait ? (
                    <Spinner className="size-5 animate-spin text-white" />
                  ) : (
                    <Sparkle className="size-5 text-white" />
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3" side="right" align="start">
                <div className="mb-2 text-sm font-medium text-foreground">选择图像模型</div>
                {portraitModelsQuery.isLoading ? (
                  <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                    <Spinner className="size-3.5 animate-spin" />
                    正在获取可用模型...
                  </div>
                ) : availableModels.length > 0 ? (
                  <div className="mb-3 flex flex-col gap-1">
                    {availableModels.map((modelId) => (
                      <button
                        key={modelId}
                        type="button"
                        onClick={() => setSelectedModelId(modelId)}
                        className={clsx(
                          'rounded-lg border px-3 py-2 text-left text-xs transition',
                          selectedModelId === modelId
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-muted/30 text-foreground hover:border-primary/30',
                        )}
                      >
                        {modelId}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mb-3 text-xs text-muted-foreground leading-5">
                    未检测到可用图像模型，将自动尝试已知模型（如 dall-e-3）。
                  </div>
                )}
                <Button size="sm" className="w-full" onClick={handleGenerate}>
                  <Sparkle className="size-3.5" />
                  {character.portrait_url ? '重新生成' : '生成形象'}
                </Button>
              </PopoverContent>
            </Popover>
          </div>

          {/* Name + meta */}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-foreground tracking-tight">{character.name}</h1>
                {character.alias ? (
                  <div className="mt-1 text-sm text-muted-foreground">
                    {character.alias.split(/[，,、]/).map(a => a.trim()).filter(Boolean).join(' · ')}
                  </div>
                ) : null}
              </div>
              {/* Action buttons */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={onEdit}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  <PencilSimple className="size-3" />
                  编辑
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={deletePending}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600"
                >
                  <Trash className="size-3" />
                  删除
                </button>
              </div>
            </div>

            {/* Description */}
            {character.description ? (
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed line-clamp-2">
                {character.description}
              </p>
            ) : null}

            {/* Tags */}
            {tags.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span
                    key={`${character.id}-${tag}`}
                    className="rounded-md bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Timestamps */}
        <div className="mt-4 flex items-center gap-3 text-[11px] text-muted-foreground/50">
          <span>创建于 {formatDate(character.created_at)}</span>
          <span>·</span>
          <span>更新于 {formatDate(character.updated_at)}</span>
        </div>
      </div>

      {/* Info blocks */}
      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="grid grid-cols-2 gap-x-8 gap-y-6">
          <InfoBlock label="人物档案" value={character.profile} placeholder="未填写人物档案" />
          <InfoBlock label="性格特征" value={character.personality} placeholder="未填写性格特征" />
          <InfoBlock label="背景经历" value={character.background} placeholder="未填写背景经历" />
          <InfoBlock label="关系备注" value={character.relationship_notes} placeholder="未填写关系备注" />
        </div>
      </div>
    </div>
  )
}

function InfoBlock({ label, value, placeholder }: { label: string; value?: string | null; placeholder: string }) {
  const isEmpty = !value?.trim()
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/60">{label}</span>
        <span className="flex-1 h-px bg-border/40" />
      </div>
      <p className={clsx(
        'text-sm leading-7 whitespace-pre-line',
        isEmpty ? 'text-muted-foreground/30 italic' : 'text-foreground/85',
      )}>
        {isEmpty ? placeholder : value}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CharacterDialog
// ---------------------------------------------------------------------------

interface CharacterDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  form: CharacterFormState
  onChange: React.Dispatch<React.SetStateAction<CharacterFormState>>
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  pending: boolean
  submitLabel: string
  trigger?: React.ReactNode
}

function CharacterDialog({
  open,
  onOpenChange,
  title,
  description,
  form,
  onChange,
  onSubmit,
  pending,
  submitLabel,
  trigger,
}: CharacterDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="flex max-h-[calc(100vh-2rem)] max-w-3xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form className="flex min-h-0 flex-1 flex-col overflow-hidden" onSubmit={onSubmit}>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/85">角色名称</label>
                <Input value={form.name} onChange={(event) => onChange((prev) => ({ ...prev, name: event.target.value }))} required />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/85">别名</label>
                <Input value={form.alias} onChange={(event) => onChange((prev) => ({ ...prev, alias: event.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/85">标签</label>
              <Input
                value={form.tags}
                onChange={(event) => onChange((prev) => ({ ...prev, tags: event.target.value }))}
                placeholder="例如：主角、反派、导师"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/85">角色简介</label>
              <Textarea value={form.description} onChange={(event) => onChange((prev) => ({ ...prev, description: event.target.value }))} rows={3} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/85">人物档案</label>
                <Textarea value={form.profile} onChange={(event) => onChange((prev) => ({ ...prev, profile: event.target.value }))} rows={4} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/85">性格特征</label>
                <Textarea value={form.personality} onChange={(event) => onChange((prev) => ({ ...prev, personality: event.target.value }))} rows={4} />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/85">背景经历</label>
                <Textarea value={form.background} onChange={(event) => onChange((prev) => ({ ...prev, background: event.target.value }))} rows={4} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/85">关系备注</label>
                <Textarea
                  value={form.relationship_notes}
                  onChange={(event) => onChange((prev) => ({ ...prev, relationship_notes: event.target.value }))}
                  rows={4}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="mt-5 shrink-0 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? '正在保存...' : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// CharacterChatPanel
// ---------------------------------------------------------------------------

interface ChatBubble {
  role: 'user' | 'assistant'
  content: string
}

function CharacterChatPanel({ character }: { character: Character }) {
  const queryClient = useQueryClient()

  // Session state
  const [sessions, setSessions] = useState<CharacterChatSession[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [loadingSessions, setLoadingSessions] = useState(false)

  // Chat state
  const [messages, setMessages] = useState<ChatBubble[]>([])
  const [inputText, setInputText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Project selector
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const projectsQuery = useQuery<Project[], Error>({
    queryKey: ['projects'],
    queryFn: listProjects,
  })

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Load sessions when character changes
  useEffect(() => {
    let cancelled = false
    setLoadingSessions(true)
    setSelectedSessionId(null)
    setMessages([])
    setError(null)

    listCharacterChatSessions(character.id)
      .then((data) => {
        if (cancelled) return
        setSessions(data)
        if (data.length > 0) {
          setSelectedSessionId(data[0].id)
          setMessages(data[0].messages)
        }
      })
      .catch(() => {
        if (!cancelled) setSessions([])
      })
      .finally(() => {
        if (!cancelled) setLoadingSessions(false)
      })

    return () => {
      cancelled = true
      abortRef.current?.abort()
    }
  }, [character.id])

  // Load messages when session changes
  useEffect(() => {
    if (!selectedSessionId) {
      setMessages([])
      return
    }

    const session = sessions.find((s) => s.id === selectedSessionId)
    if (session) {
      setMessages(session.messages)
    }
  }, [selectedSessionId, sessions])

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  const handleNewSession = useCallback(async () => {
    try {
      const session = await createCharacterChatSession(character.id, {
        project_id: selectedProjectId,
        title: `与${character.name}的对话`,
      })
      setSessions((prev) => [session, ...prev])
      setSelectedSessionId(session.id)
      setMessages([])
      setError(null)
    } catch {
      toast.error('创建会话失败')
    }
  }, [character.id, character.name, selectedProjectId])

  const handleDeleteSession = useCallback(async () => {
    if (!selectedSessionId) return

    const confirmed = window.confirm('确认删除这个对话会话吗？')
    if (!confirmed) return

    try {
      await deleteCharacterChatSession(character.id, selectedSessionId)
      setSessions((prev) => prev.filter((s) => s.id !== selectedSessionId))
      const remaining = sessions.filter((s) => s.id !== selectedSessionId)
      if (remaining.length > 0) {
        setSelectedSessionId(remaining[0].id)
        setMessages(remaining[0].messages)
      } else {
        setSelectedSessionId(null)
        setMessages([])
      }
      toast.success('会话已删除')
    } catch {
      toast.error('删除会话失败')
    }
  }, [character.id, selectedSessionId, sessions])

  const handleSendWithAutoSession = useCallback(async () => {
    const text = inputText.trim()
    if (!text || isStreaming) return

    let sessionId = selectedSessionId

    if (!sessionId) {
      try {
        const session = await createCharacterChatSession(character.id, {
          project_id: selectedProjectId,
          title: `与${character.name}的对话`,
        })
        setSessions((prev) => [session, ...prev])
        setSelectedSessionId(session.id)
        sessionId = session.id
      } catch {
        toast.error('创建会话失败')
        return
      }
    }

    setError(null)
    setIsStreaming(true)
    setStreamingContent('')
    setInputText('')

    const userBubble: ChatBubble = { role: 'user', content: text }
    setMessages((prev) => (sessionId === selectedSessionId ? [...prev, userBubble] : [userBubble]))

    const controller = new AbortController()
    abortRef.current = controller

    let acc = ''
    try {
      await streamCharacterChat(
        character.id,
        sessionId,
        { message: text, project_id: selectedProjectId },
        {
          onChunk: (chunk) => {
            acc += chunk
            setStreamingContent(acc)
          },
          onDone: () => {
            setMessages((prev) => [...prev, { role: 'assistant', content: acc }])
            setStreamingContent('')
            setIsStreaming(false)
            queryClient.invalidateQueries({ queryKey: ['characters'] })
          },
          onError: (err) => {
            setError(err)
            setIsStreaming(false)
            setStreamingContent('')
          },
        },
        controller.signal,
      )
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : '对话请求失败')
      setIsStreaming(false)
      setStreamingContent('')
    }
  }, [inputText, isStreaming, selectedSessionId, character.id, character.name, selectedProjectId, queryClient])

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
    setIsStreaming(false)
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSendWithAutoSession()
      }
    },
    [handleSendWithAutoSession],
  )

  return (
    <div className="flex h-full flex-col border-0 bg-transparent">
      {/* Top bar: session selector + project selector */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        {/* Session selector */}
        <select
          value={selectedSessionId ?? ''}
          onChange={(e) => {
            const val = e.target.value || null
            setSelectedSessionId(val)
            setError(null)
          }}
          className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm text-foreground"
          disabled={loadingSessions}
        >
          {sessions.length === 0 ? (
            <option value="">暂无会话</option>
          ) : (
            sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title || '未命名会话'}
              </option>
            ))
          )}
        </select>

        <Button variant="outline" size="sm" onClick={handleNewSession}>
          <Plus className="size-3.5" />
          新会话
        </Button>

        {selectedSessionId ? (
          <Button variant="ghost" size="sm" onClick={handleDeleteSession}>
            <Trash className="size-3.5" />
          </Button>
        ) : null}

        {/* Project selector */}
        <select
          value={selectedProjectId ?? ''}
          onChange={(e) => setSelectedProjectId(e.target.value || null)}
          className="h-8 min-w-35 rounded-md border border-border bg-background px-2 text-sm text-foreground"
        >
          <option value="">无项目上下文</option>
          {(projectsQuery.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </div>

      {/* Messages area */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        <div className="space-y-4">
          {messages.length === 0 && !isStreaming ? (
            <div className="flex h-full items-center justify-center py-16">
              <div className="text-center text-sm text-muted-foreground">
                <Sparkle className="mx-auto mb-2 size-8 text-primary/30" />
                <p>向「{character.name}」发送第一条消息吧</p>
                <p className="mt-1 text-xs">AI 将以角色口吻回复你</p>
              </div>
            </div>
          ) : null}

          {messages.map((msg, i) => (
            <div key={`${selectedSessionId}-${i}`} className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              {msg.role === 'user' ? (
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-foreground/8 px-4 py-2.5 text-sm text-foreground">
                  {msg.content}
                </div>
              ) : (
                <div className="max-w-[90%] rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3">
                  <div className="mb-2 flex items-center gap-1.5">
                    <Sparkle className="size-3 text-primary" />
                    <span className="text-[11px] font-medium text-primary/70">{character.name}</span>
                  </div>
                  <p className="whitespace-pre-line text-sm leading-7 text-foreground">{msg.content}</p>
                </div>
              )}
            </div>
          ))}

          {/* Streaming content */}
          {isStreaming && streamingContent ? (
            <div className="flex justify-start">
              <div className="max-w-[90%] rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3">
                <div className="mb-2 flex items-center gap-1.5">
                  <Sparkle className="size-3 text-primary" />
                  <span className="text-[11px] font-medium text-primary/70">{character.name}</span>
                </div>
                <p className="whitespace-pre-line text-sm leading-7 text-foreground">{streamingContent}</p>
              </div>
            </div>
          ) : null}

          {/* Loading indicator */}
          {isStreaming && !streamingContent ? (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                <Spinner className="size-3.5 animate-spin text-primary" />
                {character.name}正在思考…
              </div>
            </div>
          ) : null}

          {/* Error */}
          {error ? (
            <div className="flex justify-start">
              <div className="max-w-[90%] rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            </div>
          ) : null}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-border p-4">
        <div className="flex gap-2">
          <Textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`和${character.name}聊点什么...（Shift+Enter 换行）`}
            disabled={isStreaming}
            rows={2}
            className="min-h-10 flex-1 resize-none rounded-xl border-border bg-background text-sm placeholder:text-muted-foreground focus:border-primary/40 focus:ring-1 focus:ring-primary/30 disabled:opacity-50"
          />
          {isStreaming ? (
            <Button variant="outline" onClick={handleStop} className="self-end">
              停止
            </Button>
          ) : (
            <Button
              onClick={handleSendWithAutoSession}
              disabled={!inputText.trim()}
              className="self-end"
            >
              <PaperPlaneRight className="size-3.5" />
              发送
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
