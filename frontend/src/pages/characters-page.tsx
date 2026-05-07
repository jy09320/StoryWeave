import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'


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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { readEditorRouteContext } from '@/lib/editor-route-context'
import { formatDate } from '@/lib/format'
import { queryClient } from '@/lib/query-client'
import {
  attachProjectCharacter,
  deleteCharacter,
  getProject,
  listCharacters,
  updateCharacter,
} from '@/services/projects'
import type {
  Character,
  CharacterPayload,
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

  const [searchKeyword] = useState('')
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null)
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null)
  const [editForm, setEditForm] = useState<CharacterFormState>(defaultFormState)
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
  const characters = useMemo(() => charactersQuery.data ?? [], [charactersQuery.data])
  const projectCharacters = useMemo(() => projectQuery.data?.project_characters ?? [], [projectQuery.data?.project_characters])
  const linkedCharacterIds = useMemo(() => new Set(projectCharacters.map((item) => item.character_id)), [projectCharacters])
  const displayedCharacters = useMemo(
    () => (isProjectScoped ? characters.filter((character) => linkedCharacterIds.has(character.id)) : characters),
    [characters, isProjectScoped, linkedCharacterIds],
  )
  const editorRouteContext = useMemo(() => readEditorRouteContext(), [])
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

  function openEditDialog(character: Character) {
    setEditingCharacter(character)
    setEditForm(getInitialFormState(character))
  }

  function handleDelete(character: Character) {
    const confirmed = window.confirm(`确认删除角色“${character.name}”吗？已关联到项目的关系也会被移除。`)
    if (!confirmed) {
      return
    }

    deleteCharacterMutation.mutate(character.id)
  }

  function handleAttachToProject(character: Character) {
    if (!projectId) {
      return
    }

    attachCharacterMutation.mutate({ projectId, characterId: character.id })
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
      <div className="space-y-6 pb-8">
        {editorRouteContext && !isProjectScoped ? (
          <Card className="border border-border bg-card/95 shadow-[0_12px_30px_rgba(148,163,184,0.14)]">
            <CardContent className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <div className="text-sm font-medium text-foreground">当前仍有章节上下文</div>
                <div className="text-sm text-muted-foreground">
                  {editorRouteContext.projectTitle || '当前项目'} / {editorRouteContext.chapterTitle || '当前章节'}
                </div>
              </div>
              <Link
                to={`/projects/${editorRouteContext.projectId}/editor/${editorRouteContext.chapterId}`}
                className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 text-sm text-foreground transition hover:bg-muted"
              >
                返回当前章节
              </Link>
            </CardContent>
          </Card>
        ) : null}

        {isProjectScoped ? (
          <section className="space-y-4">
            {displayedCharacters.length === 0 ? (
              <EmptyState
                title={searchKeyword ? '没有匹配的角色' : '当前项目还没有角色'}
                description={searchKeyword ? '换个关键词再试试。' : '先创建角色，或把已有角色绑定到当前项目。'}
              />
            ) : (
              <>
                <CharacterList
                  characters={displayedCharacters}
                  selectedCharacter={selectedCharacter}
                  linkedCharacterIds={linkedCharacterIds}
                  isProjectScoped={isProjectScoped}
                  onSelect={setSelectedCharacterId}
                />
                {selectedCharacter ? (
                  <CharacterDetail
                    character={selectedCharacter}
                    isProjectScoped={isProjectScoped}
                    linkedCharacterIds={linkedCharacterIds}
                    attachPending={attachCharacterMutation.isPending}
                    deletePending={deleteCharacterMutation.isPending}
                    onAttach={() => handleAttachToProject(selectedCharacter)}
                    onEdit={() => openEditDialog(selectedCharacter)}
                    onDelete={() => handleDelete(selectedCharacter)}
                  />
                ) : null}
              </>
            )}
          </section>
        ) : (
          /* Global: original layout */
          <>
            {displayedCharacters.length === 0 ? (
              <EmptyState
                title={searchKeyword ? '没有匹配的角色' : '角色库还是空的'}
                description={searchKeyword ? '换个关键词再试。' : '先创建一个角色。'}
              />
            ) : (
              <section className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
                <aside>
                  <CharacterList
                    characters={displayedCharacters}
                    selectedCharacter={selectedCharacter}
                    linkedCharacterIds={linkedCharacterIds}
                    isProjectScoped={false}
                    onSelect={setSelectedCharacterId}
                  />
                </aside>

                <section className="min-w-0 space-y-4">
                  {selectedCharacter ? (
                    <CharacterDetail
                      character={selectedCharacter}
                      isProjectScoped={false}
                      linkedCharacterIds={linkedCharacterIds}
                      attachPending={attachCharacterMutation.isPending}
                      deletePending={deleteCharacterMutation.isPending}
                      onAttach={() => handleAttachToProject(selectedCharacter)}
                      onEdit={() => openEditDialog(selectedCharacter)}
                      onDelete={() => handleDelete(selectedCharacter)}
                    />
                  ) : null}
                </section>
              </section>
            )}
          </>
        )}

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
      </div>
    </>
  )
}

interface CharacterListProps {
  characters: Character[]
  selectedCharacter: Character | null
  linkedCharacterIds: Set<string>
  isProjectScoped: boolean
  onSelect: (id: string) => void
}

function CharacterList({ characters, selectedCharacter, linkedCharacterIds, isProjectScoped, onSelect }: CharacterListProps) {
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
                  : 'border-border bg-background/90 hover:border-primary/20 hover:bg-muted/35',
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
                      className="rounded-full border border-border bg-muted/35 px-2 py-0.5 text-[11px] text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </button>
          )
        })}
      </CardContent>
    </Card>
  )
}

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
  return (
    <>
      <Card className="border border-border bg-card/95">
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
                <Trash2 className="size-4" />
                删除角色
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardFooter className="flex flex-col items-start gap-2 border-border bg-muted/35 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>创建于 {formatDate(character.created_at)}</span>
          <span>更新于 {formatDate(character.updated_at)}</span>
        </CardFooter>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
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
        <div className="rounded-md border border-border bg-muted/35 p-4 text-sm leading-7 text-foreground/85">{value}</div>
      </CardContent>
    </Card>
  )
}

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
