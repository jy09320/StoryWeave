import { useEffect, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { BookOpenText, PencilLine, Plus, Search, Trash2, Users2 } from 'lucide-react'
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
import { createCharacter, deleteCharacter, listCharacters, updateCharacter } from '@/services/projects'
import type { Character, CharacterPayload } from '@/types/api'

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
  const [keyword, setKeyword] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null)
  const [createForm, setCreateForm] = useState<CharacterFormState>(defaultFormState)
  const [editForm, setEditForm] = useState<CharacterFormState>(defaultFormState)

  const charactersQuery = useQuery<Character[], Error>({
    queryKey: ['characters', searchKeyword],
    queryFn: () => listCharacters(searchKeyword || undefined),
  })

  const createCharacterMutation = useMutation({
    mutationFn: createCharacter,
    onSuccess: async (character: Character) => {
      await queryClient.invalidateQueries({ queryKey: ['characters'] })
      setSelectedCharacterId(character.id)
      setIsCreateOpen(false)
      setCreateForm(defaultFormState)
      toast.success('角色已创建')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
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

  const characters = charactersQuery.data ?? []
  const editorRouteContext = useMemo(() => readEditorRouteContext(), [])
  const selectedCharacter = useMemo(
    () => characters.find((character) => character.id === selectedCharacterId) ?? characters[0] ?? null,
    [characters, selectedCharacterId],
  )
  const charactersWithTags = useMemo(() => characters.filter((character) => Boolean(character.tags?.trim())).length, [characters])
  const charactersWithProfile = useMemo(
    () => characters.filter((character) => Boolean(character.profile?.trim() || character.personality?.trim())).length,
    [characters],
  )

  useEffect(() => {
    if (!characters.length) {
      setSelectedCharacterId(null)
      return
    }

    if (!selectedCharacterId || !characters.some((character) => character.id === selectedCharacterId)) {
      setSelectedCharacterId(characters[0].id)
    }
  }, [characters, selectedCharacterId])

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSearchKeyword(keyword.trim())
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
    <div className="space-y-6 pb-8">
      {editorRouteContext ? (
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

      <section>
        <Card className="border border-border bg-card/95 shadow-[0_18px_44px_rgba(148,163,184,0.16)]">
          <CardContent className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold leading-tight text-foreground">全局角色库</h1>
                  {searchKeyword ? (
                    <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                      当前筛选：{searchKeyword}
                    </span>
                  ) : null}
                </div>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  集中维护可复用角色档案。编辑器提及、悬停信息和 AI 任务都会直接读取这里。
                </p>
              </div>

              <CharacterDialog
                open={isCreateOpen}
                onOpenChange={(open) => {
                  setIsCreateOpen(open)
                  if (!open) {
                    setCreateForm(defaultFormState)
                  }
                }}
                title="创建角色"
                description="填写角色信息"
                form={createForm}
                onChange={setCreateForm}
                onSubmit={handleCreateSubmit}
                pending={createCharacterMutation.isPending}
                trigger={
                  <Button className="w-full xl:w-auto" size="sm">
                    <Plus className="size-4" />
                    {'\u65b0\u5efa\u89d2\u8272'}
                  </Button>
                }
                submitLabel="创建角色"
              />
            </div>

            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
              <form className="flex w-full flex-col gap-2 sm:flex-row" onSubmit={handleSearchSubmit}>
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    placeholder="搜索角色名、别名、标签"
                    className="pl-9"
                  />
                </div>
                <Button className="w-full sm:w-auto" size="sm" type="submit" variant="outline">
                  {'\u641c\u7d22'}
                </Button>
              </form>

              <div className="grid grid-cols-3 gap-2 xl:min-w-[360px]">
                <MetricInline label="角色总数" value={characters.length} />
                <MetricInline label="已打标签" value={charactersWithTags} />
                <MetricInline
                  label="资料较完整"
                  value={charactersWithProfile}
                  hint={searchKeyword ? '筛选结果内' : '含人设或档案'}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <FeaturePill title="统一角色卡" icon={<Users2 className="size-3.5 text-primary" />} />
              <FeaturePill title="项目复用" icon={<BookOpenText className="size-3.5 text-muted-foreground" />} />
              <FeaturePill title="AI 上下文底座" icon={<PencilLine className="size-3.5 text-primary" />} />
            </div>
          </CardContent>
        </Card>
      </section>

      {characters.length === 0 ? (
        <EmptyState
          title={searchKeyword ? '没有匹配的角色' : '角色库还是空的'}
          description={searchKeyword ? '换个关键词再试。' : '先创建一个角色。'}
          action={
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="size-4" />
              创建角色
            </Button>
          }
        />
      ) : (
        <section className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-4">
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

                  return (
                    <button
                      key={character.id}
                      type="button"
                      onClick={() => setSelectedCharacterId(character.id)}
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
          </aside>

          <section className="min-w-0 space-y-4">
            {selectedCharacter ? (
              <>
                <Card className="border border-border bg-card/95">
                  <CardHeader className="gap-3">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <CardTitle className="text-2xl text-foreground sm:text-3xl">{selectedCharacter.name}</CardTitle>
                          {selectedCharacter.alias ? (
                            <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">
                              别名：{selectedCharacter.alias}
                            </span>
                          ) : null}
                        </div>
                        <CardDescription className="max-w-3xl text-sm leading-6 text-muted-foreground">
                          {selectedCharacter.description?.trim() || '这名角色还没有补充摘要。'}
                        </CardDescription>
                        <div className="flex flex-wrap gap-2">
                          {splitTags(selectedCharacter.tags).length > 0 ? (
                            splitTags(selectedCharacter.tags).map((tag) => (
                              <span
                                key={`${selectedCharacter.id}-${tag}`}
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
                        <Button className="w-full sm:w-auto" variant="outline" onClick={() => openEditDialog(selectedCharacter)}>
                          编辑资料
                        </Button>
                        <Button
                          className="w-full sm:w-auto"
                          variant="ghost"
                          onClick={() => handleDelete(selectedCharacter)}
                          disabled={deleteCharacterMutation.isPending}
                        >
                          <Trash2 className="size-4" />
                          删除角色
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardFooter className="flex flex-col items-start gap-2 border-border bg-muted/35 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                    <span>创建于 {formatDate(selectedCharacter.created_at)}</span>
                    <span>更新于 {formatDate(selectedCharacter.updated_at)}</span>
                  </CardFooter>
                </Card>

                <div className="grid gap-4 xl:grid-cols-2">
                  <InfoBlock label="人物档案" value={selectedCharacter.profile || '未填写人物档案'} />
                  <InfoBlock label="性格特征" value={selectedCharacter.personality || '未填写性格特征'} />
                  <InfoBlock label="背景经历" value={selectedCharacter.background || '未填写背景经历'} />
                  <InfoBlock label="关系备注" value={selectedCharacter.relationship_notes || '未填写关系备注'} />
                </div>
              </>
            ) : null}
          </section>
        </section>
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
  )
}

function FeaturePill({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-border bg-muted/35 px-2.5 py-1.5 text-xs text-foreground/85">
      <span className="rounded-sm bg-background p-1">{icon}</span>
      <span>{title}</span>
    </div>
  )
}

function MetricInline({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/35 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold text-foreground">{value}</div>
      {hint ? <div className="mt-1 truncate text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
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
  onChange: Dispatch<SetStateAction<CharacterFormState>>
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
