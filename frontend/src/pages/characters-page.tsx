import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useScrollReveal, useStaggerReveal } from '@/hooks/use-scroll-reveal'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { Spinner, ChatCenteredText, Plus, PaperPlaneRight, Sparkle, Trash } from '@phosphor-icons/react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { EmptyState } from '@/components/empty-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { formatDate } from '@/lib/format'
import { AssetWorkspace, type TreeNode, type Tab } from '@/components/asset-workspace/AssetWorkspace'
import { CharacterEditor } from '@/components/asset-workspace/CharacterEditor'
import {
  attachProjectCharacter,
  deleteCharacter,
  getProject,
  updateCharacter,
} from '@/services/projects'
import {
  listCharacters,
  createCharacter,
  listCharacterChatSessions,
  createCharacterChatSession,
  deleteCharacterChatSession,
  streamCharacterChat,
} from '@/services/characters'
import { listProjects } from '@/services/projects'
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


export function CharactersPage() {
  const { projectId } = useParams<{ projectId?: string }>()
  const isProjectScoped = Boolean(projectId)
  const queryClient = useQueryClient()

  const topRevealRef = useScrollReveal<HTMLDivElement>()
  const globalGridRevealRef = useScrollReveal<HTMLDivElement>()

  const [searchKeyword] = useState('')
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null)
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null)
  const [editForm, setEditForm] = useState<CharacterFormState>(defaultFormState)
  const [activeTab, setActiveTab] = useState<'detail' | 'chat'>('detail')

  // Workspace state for project-scoped view
  const [workspaceSearch, setWorkspaceSearch] = useState('')
  const [workspaceDimension, setWorkspaceDimension] = useState('tags')
  const [openTabs, setOpenTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  // Create-character dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createForm, setCreateForm] = useState<CharacterFormState>(defaultFormState)
  const [deleteCharacterTarget, setDeleteCharacterTarget] = useState<Character | null>(null)

  const projectQuery = useQuery<ProjectDetail, Error>({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId ?? ''),
    enabled: isProjectScoped,
  })

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
      if (isProjectScoped) {
        await queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      }
      setSelectedCharacterId((current) => (current === deletedId ? null : current))
      toast.success('角色已删除')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const attachCharacterMutation = useMutation({
    mutationFn: ({ projectId: currentProjectId, characterId }: { projectId: string; characterId: string }) =>
      attachProjectCharacter(currentProjectId, { character_id: characterId, role_label: null, summary: null }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      toast.success('角色已加入当前项目')
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

  const characters = useMemo(() => charactersQuery.data ?? [], [charactersQuery.data])
  const projectCharacters = useMemo(() => projectQuery.data?.project_characters ?? [], [projectQuery.data?.project_characters])
  const linkedCharacterIds = useMemo(() => new Set(projectCharacters.map((item) => item.character_id)), [projectCharacters])
  const displayedCharacters = useMemo(
    () => (isProjectScoped ? characters.filter((character) => linkedCharacterIds.has(character.id)) : characters),
    [characters, isProjectScoped, linkedCharacterIds],
  )
  const selectedCharacter = useMemo(
    () => displayedCharacters.find((character) => character.id === selectedCharacterId) ?? displayedCharacters[0] ?? null,
    [displayedCharacters, selectedCharacterId],
  )

  // Tree nodes for workspace view
  const treeNodes = useMemo((): TreeNode[] => {
    if (!characters) return []

    const filtered = workspaceSearch
      ? characters.filter(
          (c) =>
            c.name.toLowerCase().includes(workspaceSearch.toLowerCase()) ||
            (c.alias && c.alias.toLowerCase().includes(workspaceSearch.toLowerCase()))
        )
      : characters

    if (workspaceDimension === 'none') {
      return filtered.map((c) => ({
        id: c.id,
        label: c.name,
        type: 'leaf' as const,
        meta: c.alias || undefined,
      }))
    }

    // Group by tags
    const groups = new Map<string, typeof characters>()
    for (const char of filtered) {
      const groupKey = char.tags?.split(',')[0]?.trim() || '未分组'
      if (!groups.has(groupKey)) groups.set(groupKey, [])
      groups.get(groupKey)!.push(char)
    }

    return Array.from(groups.entries()).map(([label, chars]) => ({
      id: `group-${label}`,
      label,
      type: 'group' as const,
      children: chars.map((c) => ({
        id: c.id,
        label: c.name,
        type: 'leaf' as const,
        meta: c.alias || undefined,
      })),
    }))
  }, [characters, workspaceSearch, workspaceDimension])

  // Tab management handlers
  const handleNodeSelect = useCallback(
    (nodeId: string) => {
      if (nodeId.startsWith('group-')) return
      if (!openTabs.find((t) => t.id === nodeId)) {
        const char = characters?.find((c) => c.id === nodeId)
        if (char) {
          setOpenTabs((prev) => [...prev, { id: char.id, label: char.name }])
        }
      }
      setActiveTabId(nodeId)
    },
    [openTabs, characters]
  )

  const handleTabClose = useCallback(
    (tabId: string) => {
      setOpenTabs((prev) => {
        const next = prev.filter((t) => t.id !== tabId)
        if (activeTabId === tabId) {
          setActiveTabId(next.length > 0 ? next[next.length - 1].id : null)
        }
        return next
      })
    },
    [activeTabId]
  )

  const handleCreateNew = useCallback(() => {
    setCreateDialogOpen(true)
  }, [])

  const handleDirtyChange = useCallback(
    (dirty: boolean) => {
      if (activeTabId) {
        setOpenTabs((prev) =>
          prev.map((t) => (t.id === activeTabId ? { ...t, dirty } : t))
        )
      }
    },
    [activeTabId]
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

  function handleDeleteCharacterConfirm() {
    if (!deleteCharacterTarget) return
    deleteCharacterMutation.mutate(deleteCharacterTarget.id)
    setDeleteCharacterTarget(null)
  }

  function handleAttachToProject(character: Character) {
    if (!projectId) {
      return
    }

    attachCharacterMutation.mutate({ projectId, characterId: character.id })
  }

  function handleSelectCharacter(id: string) {
    setSelectedCharacterId(id)
    setActiveTab('detail')
  }

  if (isProjectScoped && !projectId) {
    return <EmptyState title="项目标识缺失" description="当前路由中没有有效的项目 ID。" />
  }

  if (isProjectScoped && projectQuery.isLoading) {
    return <LoadingState label="正在加载项目角色库..." />
  }

  if (isProjectScoped && (projectQuery.isError || !projectQuery.data)) {
    return (
      <EmptyState
        title="项目角色库加载失败"
        description={projectQuery.error?.message || '未能读取当前项目，请稍后重试。'}
        action={
          <Button variant="outline" onClick={() => projectQuery.refetch()}>
            重新加载
          </Button>
        }
      />
    )
  }

  if (charactersQuery.isLoading) {
    return <LoadingState label={isProjectScoped ? '正在加载项目角色库...' : '正在加载角色库...'} />
  }

  if (charactersQuery.isError) {
    return (
      <EmptyState
        title={isProjectScoped ? '项目角色库加载失败' : '角色库加载失败'}
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
      <div ref={topRevealRef} className="space-y-6 pb-8">

        {isProjectScoped ? (
          <div className="h-[calc(100vh-120px)]">
            <AssetWorkspace
              treeNodes={treeNodes}
              selectedNodeId={activeTabId}
              onNodeSelect={handleNodeSelect}
              onCreateNew={handleCreateNew}
              searchValue={workspaceSearch}
              onSearchChange={setWorkspaceSearch}
              dimension={workspaceDimension}
              dimensionOptions={[
                { value: 'tags', label: '按标签' },
                { value: 'none', label: '不分组' },
              ]}
              onDimensionChange={setWorkspaceDimension}
              typeFilter={null}
              tabs={openTabs}
              activeTabId={activeTabId}
              onTabSelect={setActiveTabId}
              onTabClose={handleTabClose}
              renderEditor={(tabId) => (
                <CharacterEditor
                  key={tabId}
                  characterId={tabId}
                  onDirtyChange={handleDirtyChange}
                />
              )}
            />
          </div>
        ) : (
          /* Global: two-column layout with tabs */
          <>
            {displayedCharacters.length === 0 ? (
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
            ) : (
              <section ref={globalGridRevealRef} className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
                <aside>
                  <CharacterList
                    characters={displayedCharacters}
                    selectedCharacter={selectedCharacter}
                    linkedCharacterIds={linkedCharacterIds}
                    isProjectScoped={false}
                    onSelect={handleSelectCharacter}
                    onCreateNew={() => setCreateDialogOpen(true)}
                  />
                </aside>

                <section className="min-w-0 space-y-4">
                  {selectedCharacter ? (
                    <>
                      {/* Tab bar */}
                      <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
                        <button
                          type="button"
                          onClick={() => setActiveTab('detail')}
                          className={[
                            'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition',
                            activeTab === 'detail'
                              ? 'bg-background text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground',
                          ].join(' ')}
                        >
                          角色详情
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab('chat')}
                          className={[
                            'flex items-center justify-center gap-1.5 flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition',
                            activeTab === 'chat'
                              ? 'bg-background text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground',
                          ].join(' ')}
                        >
                          <ChatCenteredText className="size-3.5" />
                          AI 对话
                        </button>
                      </div>

                      {activeTab === 'detail' ? (
                        <CharacterDetail
                          character={selectedCharacter}
                          isProjectScoped={false}
                          linkedCharacterIds={linkedCharacterIds}
                          attachPending={attachCharacterMutation.isPending}
                          deletePending={deleteCharacterMutation.isPending}
                          onAttach={() => handleAttachToProject(selectedCharacter)}
                          onEdit={() => openEditDialog(selectedCharacter)}
                          onDelete={() => setDeleteCharacterTarget(selectedCharacter)}
                        />
                      ) : (
                        <CharacterChatPanel character={selectedCharacter} />
                      )}
                    </>
                  ) : null}
                </section>
              </section>
            )}
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

        <AlertDialog open={deleteCharacterTarget !== null} onOpenChange={(open) => { if (!open) setDeleteCharacterTarget(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认删除</AlertDialogTitle>
              <AlertDialogDescription>
                确认删除角色「{deleteCharacterTarget?.name}」吗？已关联到项目的关系也会被移除。此操作不可撤销。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleDeleteCharacterConfirm}
              >
                删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
  linkedCharacterIds: Set<string>
  isProjectScoped: boolean
  onSelect: (id: string) => void
  onCreateNew?: () => void
}

function CharacterList({ characters, selectedCharacter, linkedCharacterIds, isProjectScoped, onSelect, onCreateNew }: CharacterListProps) {
  return (
    <Card className="border border-border bg-card/95">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg text-foreground">角色列表</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">按名称、别名和标签定位</CardDescription>
          </div>
          <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">
            {characters.length} 条
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {characters.map((character) => {
          const tags = splitTags(character.tags)
          const isActive = selectedCharacter?.id === character.id
          const isLinked = linkedCharacterIds.has(character.id)

          return (
            <button
              key={character.id}
              type="button"
              onClick={() => onSelect(character.id)}
              className={[
                'w-full rounded-md border px-3 py-2.5 text-left transition',
                isActive
                  ? 'border-primary/30 bg-primary/10'
                  : 'border-border bg-background/90 hover:border-primary/20 hover:bg-muted/50',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="truncate text-sm font-medium text-foreground">{character.name}</div>
                    {character.alias ? (
                      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                        {character.alias}
                      </span>
                    ) : null}
                    {isProjectScoped && isLinked ? (
                      <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-600">
                        已在项目中
                      </span>
                    ) : null}
                  </div>
                  <div className="line-clamp-1 text-xs leading-5 text-muted-foreground">
                    {character.description?.trim() || character.personality?.trim() || '暂无角色摘要'}
                  </div>
                </div>
                <div className="shrink-0 text-[11px] text-muted-foreground">{formatDate(character.updated_at)}</div>
              </div>
              {tags.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {tags.slice(0, 3).map((tag) => (
                    <span
                      key={`${character.id}-${tag}`}
                      className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </button>
          )
        })}

        {/* Create new character button */}
        {onCreateNew ? (
          <button
            type="button"
            onClick={onCreateNew}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground transition hover:border-primary/30 hover:bg-muted/50 hover:text-foreground"
          >
            <Plus className="size-3.5" />
            新建角色
          </button>
        ) : null}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// CharacterDetail
// ---------------------------------------------------------------------------

interface CharacterDetailProps {
  character: Character
  isProjectScoped: boolean
  linkedCharacterIds: Set<string>
  attachPending: boolean
  deletePending: boolean
  onAttach: () => void
  onEdit: () => void
  onDelete: () => void
}

function CharacterDetail({ character, isProjectScoped, linkedCharacterIds, attachPending, deletePending, onAttach, onEdit, onDelete }: CharacterDetailProps) {
  const staggerRef = useStaggerReveal<HTMLDivElement>()

  return (
    <>
      <Card className="border border-border bg-card/95 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-2xl text-foreground sm:text-3xl">{character.name}</CardTitle>
                {character.alias ? (
                  <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">
                    别名：{character.alias}
                  </span>
                ) : null}
              </div>
              <CardDescription className="max-w-3xl text-sm leading-6 text-muted-foreground">
                {character.description?.trim() || '这名角色还没有补充摘要。'}
              </CardDescription>
              <div className="flex flex-wrap gap-2">
                {splitTags(character.tags).length > 0 ? (
                  splitTags(character.tags).map((tag) => (
                    <span
                      key={`${character.id}-${tag}`}
                      className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))
                ) : (
                  <span className="rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground">
                    暂无标签
                  </span>
                )}
              </div>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              {isProjectScoped && !linkedCharacterIds.has(character.id) ? (
                <Button className="w-full sm:w-auto" variant="outline" onClick={onAttach} disabled={attachPending}>
                  {attachPending ? '绑定中...' : '加入当前项目'}
                </Button>
              ) : null}
              <Button className="w-full sm:w-auto" variant="outline" onClick={onEdit}>
                编辑资料
              </Button>
              <Button className="w-full sm:w-auto" variant="ghost" onClick={onDelete} disabled={deletePending}>
                <Trash className="size-4" />
                删除角色
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardFooter className="flex flex-col items-start gap-2 border-border bg-muted/50 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>创建于 {formatDate(character.created_at)}</span>
          <span>更新于 {formatDate(character.updated_at)}</span>
        </CardFooter>
      </Card>

      <div ref={staggerRef} className="grid gap-4 xl:grid-cols-2">
        <InfoBlock label="人物档案" value={character.profile || '未填写人物档案'} />
        <InfoBlock label="性格特征" value={character.personality || '未填写性格特征'} />
        <InfoBlock label="背景经历" value={character.background || '未填写背景经历'} />
        <InfoBlock label="关系备注" value={character.relationship_notes || '未填写关系备注'} />
      </div>
    </>
  )
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border border-border bg-card/95">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border border-border bg-muted/50 p-4 text-sm leading-7 text-foreground/85">{value}</div>
      </CardContent>
    </Card>
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger ? <SheetTrigger asChild>{trigger}</SheetTrigger> : null}
      <SheetContent side="right" className="flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

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

          <SheetFooter className="mt-5 shrink-0 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? '正在保存...' : submitLabel}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
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
  const [deleteChatSessionOpen, setDeleteChatSessionOpen] = useState(false)

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

  const handleDeleteSessionConfirm = useCallback(async () => {
    if (!selectedSessionId) return

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
    setDeleteChatSessionOpen(false)
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
    <Card className="flex h-[calc(100vh-220px)] min-h-125 flex-col border border-border bg-card/95">
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
          <Button variant="ghost" size="sm" onClick={() => setDeleteChatSessionOpen(true)}>
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
                <div className="max-w-[85%] rounded-xl rounded-br-md bg-foreground/8 px-4 py-2.5 text-sm text-foreground">
                  {msg.content}
                </div>
              ) : (
                <div className="max-w-[90%] rounded-xl rounded-bl-md border border-border bg-card px-4 py-3">
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
              <div className="max-w-[90%] rounded-xl rounded-bl-md border border-border bg-card px-4 py-3">
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
              <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                <Spinner className="size-3.5 animate-spin text-primary" />
                {character.name}正在思考…
              </div>
            </div>
          ) : null}

          {/* Error */}
          {error ? (
            <div className="flex justify-start">
              <div className="max-w-[90%] rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
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

      <AlertDialog open={deleteChatSessionOpen} onOpenChange={setDeleteChatSessionOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确认删除这个对话会话吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleDeleteSessionConfirm()}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
