import { useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { BookOpenText, PencilLine, Plus, Search, Trash2, Users2 } from 'lucide-react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/empty-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
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

export function CharactersPage() {
  const [keyword, setKeyword] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['characters'] })
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['characters'] })
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['characters'] })
      toast.success('角色已删除')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const characters = charactersQuery.data ?? []
  const charactersWithTags = useMemo(() => characters.filter((character) => Boolean(character.tags?.trim())).length, [characters])

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
      <section className="grid gap-4 xl:grid-cols-[1.6fr_0.4fr]">
        <Card className="border border-white/10 bg-white/6 shadow-2xl shadow-black/10">
          <CardHeader className="gap-3 pb-3">
            <CardTitle className="max-w-3xl text-2xl font-semibold leading-tight text-white sm:text-3xl">
              全局角色库，先把人物资产沉淀下来
            </CardTitle>
            <CardDescription className="max-w-2xl text-sm leading-6 text-slate-300">
              角色先集中维护，再在不同项目里复用与挂接，后续会成为 AI 续写、设定检查和项目工作台的公共上下文来源。
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <FeatureCard
              title="统一角色卡"
              description="聚合名称、别名、背景、性格与关系信息。"
              icon={<Users2 className="size-5 text-violet-300" />}
            />
            <FeatureCard
              title="项目复用"
              description="同一角色后续可挂接到多个创作项目。"
              icon={<BookOpenText className="size-5 text-sky-300" />}
            />
            <FeatureCard
              title="AI 上下文基础"
              description="为后续设定检查与 Prompt 注入准备结构化素材。"
              icon={<PencilLine className="size-5 text-emerald-300" />}
            />
          </CardContent>
          <CardFooter className="flex flex-col items-start gap-3 border-white/10 bg-white/4 sm:flex-row sm:items-center sm:justify-between">
            <form className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row" onSubmit={handleSearchSubmit}>
              <div className="relative min-w-[260px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                <Input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="搜索角色名、别名或标签"
                  className="pl-9"
                />
              </div>
              <Button type="submit" variant="outline">
                搜索
              </Button>
            </form>
            <CharacterDialog
              open={isCreateOpen}
              onOpenChange={(open) => {
                setIsCreateOpen(open)
                if (!open) {
                  setCreateForm(defaultFormState)
                }
              }}
              title="创建角色"
              description="先补齐最关键的人物信息，后续可继续完善角色设定。"
              form={createForm}
              onChange={setCreateForm}
              onSubmit={handleCreateSubmit}
              pending={createCharacterMutation.isPending}
              trigger={
                <Button>
                  <Plus className="size-4" />
                  新建角色
                </Button>
              }
              submitLabel="创建角色"
            />
          </CardFooter>
        </Card>

        <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
          <MetricCard label="角色总数" value={characters.length} hint="可复用于不同项目" />
          <MetricCard label="已打标签" value={charactersWithTags} hint="便于后续筛选与分组" />
          <MetricCard label="当前筛选" value={searchKeyword ? 1 : 0} hint={searchKeyword ? `关键词：${searchKeyword}` : '当前显示全部角色'} />
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">角色列表</h2>
            <p className="text-sm leading-6 text-slate-400">先把角色设定积累下来，下一步会接入项目工作台的角色绑定。</p>
          </div>
        </div>

        {characters.length === 0 ? (
          <EmptyState
            title={searchKeyword ? '没有匹配的角色' : '角色库还是空的'}
            description={
              searchKeyword
                ? '换一个关键词搜索，或直接新建一个角色卡。'
                : '先创建第一个角色，后续即可在项目中挂接并作为 AI 上下文使用。'
            }
            action={
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="size-4" />
                创建角色
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {characters.map((character) => (
              <Card key={character.id} className="border border-white/10 bg-white/6 shadow-lg shadow-black/5">
                <CardHeader className="gap-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-xl text-white">{character.name}</CardTitle>
                        {character.alias ? (
                          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300">
                            别名：{character.alias}
                          </span>
                        ) : null}
                      </div>
                      <CardDescription>{character.description?.trim() || '还没有角色简介，可补充人物定位与用途。'}</CardDescription>
                    </div>
                    <CardAction className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEditDialog(character)}>
                        编辑
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(character)}>
                        <Trash2 className="size-4" />
                        <span className="sr-only">删除角色</span>
                      </Button>
                    </CardAction>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-slate-300">
                  <InfoBlock label="标签" value={character.tags || '未设置标签'} />
                  <InfoBlock label="性格" value={character.personality || '未填写性格'} />
                  <InfoBlock label="背景" value={character.background || '未填写背景'} />
                  <InfoBlock label="关系备注" value={character.relationship_notes || '未填写关系备注'} />
                </CardContent>
                <CardFooter className="justify-between border-white/10 bg-white/4 text-xs text-slate-400">
                  <span>创建于 {formatDate(character.created_at)}</span>
                  <span>更新于 {formatDate(character.updated_at)}</span>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </section>

      <CharacterDialog
        open={Boolean(editingCharacter)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingCharacter(null)
            setEditForm(defaultFormState)
          }
        }}
        title="编辑角色"
        description="更新角色资料，后续项目挂接和 AI 引用都会同步使用最新内容。"
        form={editForm}
        onChange={setEditForm}
        onSubmit={handleEditSubmit}
        pending={updateCharacterMutation.isPending}
        submitLabel="保存修改"
      />
    </div>
  )
}

function FeatureCard({ title, description, icon }: { title: string; description: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
      <div className="mb-3 flex items-start gap-3">
        <div className="rounded-xl border border-white/10 bg-white/8 p-2">{icon}</div>
        <div className="space-y-1">
          <div className="text-sm font-medium text-white">{title}</div>
          <p className="text-sm leading-6 text-slate-300">{description}</p>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <Card className="border border-white/10 bg-white/6">
      <CardContent className="space-y-2 py-5">
        <div className="text-sm text-slate-400">{label}</div>
        <div className="text-3xl font-semibold text-white">{value}</div>
        <div className="text-xs leading-5 text-slate-500">{hint}</div>
      </CardContent>
    </Card>
  )
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1 rounded-2xl border border-white/10 bg-black/10 p-3">
      <div className="text-xs uppercase tracking-[0.24em] text-slate-500">{label}</div>
      <div className="text-sm leading-6 text-slate-200">{value}</div>
    </div>
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
      <DialogContent className="max-w-3xl border-white/10 bg-slate-950/98">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={onSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200">角色名称</label>
              <Input value={form.name} onChange={(event) => onChange((prev) => ({ ...prev, name: event.target.value }))} required />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200">别名</label>
              <Input value={form.alias} onChange={(event) => onChange((prev) => ({ ...prev, alias: event.target.value }))} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-200">标签</label>
            <Input
              value={form.tags}
              onChange={(event) => onChange((prev) => ({ ...prev, tags: event.target.value }))}
              placeholder="例如：主角 / 反派 / 导师"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-200">角色简介</label>
            <Textarea value={form.description} onChange={(event) => onChange((prev) => ({ ...prev, description: event.target.value }))} rows={3} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200">人物档案</label>
              <Textarea value={form.profile} onChange={(event) => onChange((prev) => ({ ...prev, profile: event.target.value }))} rows={4} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200">性格特征</label>
              <Textarea value={form.personality} onChange={(event) => onChange((prev) => ({ ...prev, personality: event.target.value }))} rows={4} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200">背景经历</label>
              <Textarea value={form.background} onChange={(event) => onChange((prev) => ({ ...prev, background: event.target.value }))} rows={4} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200">关系备注</label>
              <Textarea
                value={form.relationship_notes}
                onChange={(event) => onChange((prev) => ({ ...prev, relationship_notes: event.target.value }))}
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
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
