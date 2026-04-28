import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowUpDown,
  BookOpen,
  BrainCircuit,
  ChevronRight,
  FilePlus2,
  PenSquare,
  Trash2,
  UserPlus,
  Users2,
  Globe2,
  PencilLine,
  SquarePen,
  Unlink,
} from 'lucide-react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/empty-state'
import { LoadingState } from '@/components/loading-state'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { formatDate, formatProjectType } from '@/lib/format'
import { queryClient } from '@/lib/query-client'
import {
  attachProjectCharacter,
  createChapter,
  deleteChapter,
  deleteProjectCharacter,
  getProject,
  listCharacters,
  reorderChapters,
  updateChapter,
  updateProjectCharacter,
  updateProjectWorldSetting,
} from '@/services/projects'
import type {
  Chapter,
  ChapterReorderItem,
  ChapterUpdatePayload,
  Character,
  ProjectCharacter,
  ProjectCharacterUpdatePayload,
  ProjectDetail,
  WorldSetting,
  WorldSettingPayload,
} from '@/types/api'

interface ChapterDraftState {
  title: string
}

interface CharacterLinkDraftState {
  characterId: string
  roleLabel: string
  summary: string
}

interface CharacterLinkEditState {
  roleLabel: string
  summary: string
}

interface WorldSettingDraftState {
  title: string
  overview: string
  rules: string
  factions: string
  locations: string
  timeline: string
  extra_notes: string
}

const defaultChapterDraft: ChapterDraftState = {
  title: '',
}

const defaultCharacterLinkDraft: CharacterLinkDraftState = {
  characterId: '',
  roleLabel: '',
  summary: '',
}

const defaultWorldSettingDraft: WorldSettingDraftState = {
  title: '',
  overview: '',
  rules: '',
  factions: '',
  locations: '',
  timeline: '',
  extra_notes: '',
}

const defaultCharacterLinkEditState: CharacterLinkEditState = {
  roleLabel: '',
  summary: '',
}

function buildCharacterLinkUpdatePayload(editState: CharacterLinkEditState): ProjectCharacterUpdatePayload {
  return {
    role_label: editState.roleLabel.trim() || null,
    summary: editState.summary.trim() || null,
  }
}

function buildWorldSettingDraft(worldSetting: WorldSetting | null | undefined): WorldSettingDraftState {
  if (!worldSetting) {
    return defaultWorldSettingDraft
  }

  return {
    title: worldSetting.title ?? '',
    overview: worldSetting.overview ?? '',
    rules: worldSetting.rules ?? '',
    factions: worldSetting.factions ?? '',
    locations: worldSetting.locations ?? '',
    timeline: worldSetting.timeline ?? '',
    extra_notes: worldSetting.extra_notes ?? '',
  }
}

function buildActivityMap(chapters: Chapter[]) {
  const today = new Date()
  return Array.from({ length: 21 }, (_, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() - (20 - index))
    const key = date.toISOString().slice(0, 10)
    const updatedChapters = chapters.filter((chapter) => chapter.updated_at.slice(0, 10) === key)
    const totalWords = updatedChapters.reduce((sum, chapter) => sum + chapter.word_count, 0)

    return {
      key,
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      count: updatedChapters.length,
      words: totalWords,
    }
  })
}

export function ProjectWorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null)
  const [newChapter, setNewChapter] = useState<ChapterDraftState>(defaultChapterDraft)
  const [characterLinkDraft, setCharacterLinkDraft] = useState<CharacterLinkDraftState>(defaultCharacterLinkDraft)
  const [editingProjectCharacter, setEditingProjectCharacter] = useState<ProjectCharacter | null>(null)
  const [characterLinkEditDraft, setCharacterLinkEditDraft] = useState<CharacterLinkEditState>(defaultCharacterLinkEditState)
  const [worldSettingDraft, setWorldSettingDraft] = useState<WorldSettingDraftState>(defaultWorldSettingDraft)

  const projectQuery = useQuery<ProjectDetail, Error>({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId ?? ''),
    enabled: Boolean(projectId),
  })

  const charactersQuery = useQuery<Character[], Error>({
    queryKey: ['characters'],
    queryFn: () => listCharacters(),
  })

  const chapters = useMemo(() => projectQuery.data?.chapters ?? [], [projectQuery.data?.chapters])
  const selectedChapter = useMemo(() => {
    if (!chapters.length) {
      return null
    }

    if (selectedChapterId) {
      return chapters.find((chapter) => chapter.id === selectedChapterId) ?? chapters[0]
    }

    return chapters[0]
  }, [chapters, selectedChapterId])

  const projectCharacters = useMemo(() => projectQuery.data?.project_characters ?? [], [projectQuery.data?.project_characters])
  const worldSetting = projectQuery.data?.world_setting ?? null

  useEffect(() => {
    if (projectQuery.data) {
      setWorldSettingDraft(buildWorldSettingDraft(projectQuery.data.world_setting))
    }
  }, [projectQuery.data])

  const availableCharacters = useMemo(() => {
    const linkedIds = new Set(projectCharacters.map((item) => item.character_id))
    return (charactersQuery.data ?? []).filter((character) => !linkedIds.has(character.id))
  }, [charactersQuery.data, projectCharacters])

  const createChapterMutation = useMutation({
    mutationFn: createChapter,
    onSuccess: async (chapter: Chapter) => {
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      setSelectedChapterId(chapter.id)
      setNewChapter(defaultChapterDraft)
      toast.success('章节已创建')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const updateChapterMutation = useMutation({
    mutationFn: ({ chapterId, payload }: { chapterId: string; payload: ChapterUpdatePayload }) =>
      updateChapter(chapterId, payload),
    onSuccess: async (chapter: Chapter) => {
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      setSelectedChapterId(chapter.id)
      toast.success('章节信息已更新')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const deleteChapterMutation = useMutation({
    mutationFn: deleteChapter,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      setSelectedChapterId(null)
      toast.success('章节已删除')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const reorderMutation = useMutation({
    mutationFn: ({ payload }: { payload: ChapterReorderItem[] }) => reorderChapters(projectId ?? '', payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      toast.success('章节顺序已更新')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const attachCharacterMutation = useMutation({
    mutationFn: ({ characterId, roleLabel, summary }: CharacterLinkDraftState) =>
      attachProjectCharacter(projectId ?? '', {
        character_id: characterId,
        role_label: roleLabel.trim() || null,
        summary: summary.trim() || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      setCharacterLinkDraft(defaultCharacterLinkDraft)
      toast.success('角色已加入项目')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const updateProjectCharacterMutation = useMutation({
    mutationFn: ({ linkId, payload }: { linkId: string; payload: ProjectCharacterUpdatePayload }) =>
      updateProjectCharacter(projectId ?? '', linkId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      setEditingProjectCharacter(null)
      setCharacterLinkEditDraft(defaultCharacterLinkEditState)
      toast.success('项目角色信息已更新')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const detachCharacterMutation = useMutation({
    mutationFn: (linkId: string) => deleteProjectCharacter(projectId ?? '', linkId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      toast.success('角色已移出项目')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const updateWorldSettingMutation = useMutation({
    mutationFn: (payload: WorldSettingPayload) => updateProjectWorldSetting(projectId ?? '', payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      toast.success('世界观设定已保存')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  function handleCreateChapter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const title = newChapter.title.trim()
    if (!projectId || !title) {
      toast.error('请输入章节标题')
      return
    }

    createChapterMutation.mutate({
      project_id: projectId,
      title,
      order_index: 0,
      content: '',
      plain_text: '',
    })
  }

  function handleDeleteChapter(chapter: Chapter) {
    const confirmed = window.confirm(`确认删除章节“${chapter.title}”吗？`)
    if (!confirmed) {
      return
    }

    deleteChapterMutation.mutate(chapter.id)
  }

  function moveChapter(chapter: Chapter, direction: 'up' | 'down') {
    const index = chapters.findIndex((item) => item.id === chapter.id)
    if (index < 0) {
      return
    }

    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= chapters.length) {
      return
    }

    const reordered = [...chapters]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(targetIndex, 0, moved)

    const payload = reordered.map((item, orderIndex) => ({
      id: item.id,
      order_index: orderIndex + 1,
    }))

    reorderMutation.mutate({ payload })
  }

  function handleAttachCharacter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!characterLinkDraft.characterId) {
      toast.error('请先选择要绑定的角色')
      return
    }

    attachCharacterMutation.mutate(characterLinkDraft)
  }

  function handleDetachCharacter(linkId: string, name: string) {
    const confirmed = window.confirm(`确认将角色“${name}”从当前项目中移除吗？`)
    if (!confirmed) {
      return
    }

    detachCharacterMutation.mutate(linkId)
  }

  function openEditProjectCharacterDialog(projectCharacter: ProjectCharacter) {
    setEditingProjectCharacter(projectCharacter)
    setCharacterLinkEditDraft({
      roleLabel: projectCharacter.role_label ?? '',
      summary: projectCharacter.summary ?? '',
    })
  }

  function handleUpdateProjectCharacter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!editingProjectCharacter) {
      return
    }

    updateProjectCharacterMutation.mutate({
      linkId: editingProjectCharacter.id,
      payload: buildCharacterLinkUpdatePayload(characterLinkEditDraft),
    })
  }

  function handleSaveWorldSetting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const title = worldSettingDraft.title.trim()
    if (!title) {
      toast.error('请先填写世界观标题')
      return
    }

    updateWorldSettingMutation.mutate({
      title,
      overview: worldSettingDraft.overview.trim() || null,
      rules: worldSettingDraft.rules.trim() || null,
      factions: worldSettingDraft.factions.trim() || null,
      locations: worldSettingDraft.locations.trim() || null,
      timeline: worldSettingDraft.timeline.trim() || null,
      extra_notes: worldSettingDraft.extra_notes.trim() || null,
    })
  }

  if (!projectId) {
    return (
      <EmptyState
        title="项目标识缺失"
        description="当前路由中没有有效的项目 ID，无法加载工作区。"
        action={
          <Link
            to="/"
            className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            返回仪表盘
          </Link>
        }
      />
    )
  }

  if (projectQuery.isLoading) {
    return <LoadingState label="正在加载项目工作区..." />
  }

  if (projectQuery.isError || !projectQuery.data) {
    return (
      <EmptyState
        title="项目加载失败"
        description={projectQuery.error?.message || '未能读取项目详情，请稍后重试。'}
        action={
          <Button variant="outline" onClick={() => projectQuery.refetch()}>
            重新加载
          </Button>
        }
      />
    )
  }

  const project = projectQuery.data
  const activityMap = buildActivityMap(chapters)
  const activeDays = activityMap.filter((item) => item.count > 0).length

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border border-white/8 bg-[#161618]/92 shadow-lg shadow-black/10">
          <CardHeader className="gap-4">
            <CardDescription className="text-primary/80">项目工作台</CardDescription>
            <div className="space-y-3">
              <CardTitle className="text-3xl text-white">{project.title}</CardTitle>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <StatusBadge status={project.status} />
                <span className="rounded-full border border-white/10 px-2.5 py-1">{formatProjectType(project.type)}</span>
                <span>最近更新 {formatDate(project.updated_at)}</span>
              </div>
            </div>
            {project.description?.trim() ? (
              <CardDescription className="max-w-3xl text-sm leading-7 text-slate-300">{project.description.trim()}</CardDescription>
            ) : null}
          </CardHeader>
          <CardFooter className="flex flex-wrap items-center gap-3 border-white/10 bg-white/[0.03]">
            <WorkspaceMetricCard label="章节数量" value={`${chapters.length}`} />
            <WorkspaceMetricCard
              label="累计字数"
              value={`${chapters.reduce((sum, chapter) => sum + chapter.word_count, 0)}`}
            />
            <WorkspaceMetricCard label="角色数量" value={`${projectCharacters.length}`} />
            <WorkspaceMetricCard label="来源作品" value={project.source_work || '原创项目'} />
          </CardFooter>
        </Card>

        <Card className="border border-white/8 bg-[#161618]/92 shadow-lg shadow-black/10">
          <CardHeader>
            <CardTitle className="text-xl text-white">创作活跃度</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-7 gap-2">
              {activityMap.map((item) => (
                <div key={item.key} className="space-y-1">
                  <div
                    title={`${item.label} · ${item.count} 个章节更新 · ${item.words} 字`}
                    className={[
                      'h-10 rounded-sm border border-white/5',
                      item.count === 0
                        ? 'bg-white/[0.03]'
                        : item.words > 3000
                          ? 'bg-emerald-400/70'
                          : item.words > 1000
                            ? 'bg-emerald-400/45'
                            : 'bg-emerald-400/25',
                    ].join(' ')}
                  />
                  <div className="text-center text-[10px] text-slate-500">{item.label}</div>
                </div>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <WorkspaceFocusCard
                title="活跃天数"
                description={`${activeDays} / 21 天`}
                icon={<BookOpen className="size-4 text-amber-300" />}
              />
              <WorkspaceFocusCard
                title="角色资产"
                icon={<Users2 className="size-4 text-slate-200" />}
              />
              <WorkspaceFocusCard
                title="设定入口"
                icon={<Globe2 className="size-4 text-amber-300" />}
              />
            </div>
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-4">
          <Card className="border border-white/8 bg-[#161618]/92">
            <CardHeader>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="text-xl text-white">快速创建章节</CardTitle>
                </div>
                <form className="flex w-full max-w-md flex-col gap-2 sm:flex-row" onSubmit={handleCreateChapter}>
                  <Input
                    value={newChapter.title}
                    onChange={(event) => setNewChapter({ title: event.target.value })}
                    placeholder="例如：第一章 · 雪夜重逢"
                    maxLength={200}
                  />
                  <Button className="w-full sm:w-auto" type="submit" disabled={createChapterMutation.isPending}>
                    <FilePlus2 className="size-4" />
                    {createChapterMutation.isPending ? '创建中...' : '新建'}
                  </Button>
                </form>
              </div>
            </CardHeader>
          </Card>

          <Card className="border border-white/8 bg-[#161618]/92">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-xl text-white">章节列表</CardTitle>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-400">
                  <ArrowUpDown className="size-3.5 text-primary" />
                  工作台主导航
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {chapters.length === 0 ? (
                <EmptyState title="这个项目还没有章节" description="先创建一个章节。" />
              ) : (
                <div className="space-y-2">
                  {chapters.map((chapter, index) => {
                    const isSelected = selectedChapter?.id === chapter.id

                    return (
                      <button
                        key={chapter.id}
                        type="button"
                        onClick={() => setSelectedChapterId(chapter.id)}
                        className={[
                          'w-full rounded-md border px-4 py-3 text-left transition',
                          isSelected
                            ? 'border-primary/50 bg-primary/10 shadow-lg shadow-primary/10'
                            : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]',
                        ].join(' ')}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-slate-400">
                                第 {chapter.order_index} 章
                              </span>
                              <StatusBadge status={chapter.status} className="py-0.5" />
                            </div>
                            <h3 className="truncate text-base font-medium text-white">{chapter.title}</h3>
                            <p className="text-xs text-slate-400">
                              {chapter.word_count} 字 · 最近更新 {formatDate(chapter.updated_at)}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="w-full sm:w-auto"
                              disabled={index === 0 || reorderMutation.isPending}
                              onClick={(event) => {
                                event.stopPropagation()
                                moveChapter(chapter, 'up')
                              }}
                            >
                              上移
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="w-full sm:w-auto"
                              disabled={index === chapters.length - 1 || reorderMutation.isPending}
                              onClick={(event) => {
                                event.stopPropagation()
                                moveChapter(chapter, 'down')
                              }}
                            >
                              下移
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              className="w-full sm:w-auto"
                              disabled={deleteChapterMutation.isPending}
                              onClick={(event) => {
                                event.stopPropagation()
                                handleDeleteChapter(chapter)
                              }}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border border-white/8 bg-[#161618]/92">
            <CardHeader>
              <CardTitle className="text-xl text-white">章节摘要面板</CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedChapter ? (
                <EmptyState
                  title="尚未选中章节"
                  description="选择一个章节。"
                />
              ) : (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-400">
                      第 {selectedChapter.order_index} 章
                    </span>
                    <StatusBadge status={selectedChapter.status} />
                    <span className="text-xs text-slate-500">最近更新 {formatDate(selectedChapter.updated_at)}</span>
                  </div>

                  <div>
                    <h3 className="text-2xl font-semibold text-white">{selectedChapter.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-slate-300">
                      {selectedChapter.summary?.trim() || '当前章节还没有摘要。'}
                    </p>
                  </div>

                  <Separator className="bg-white/10" />

                  <div className="grid gap-4 md:grid-cols-3">
                    <MetaCard label="当前字数" value={`${selectedChapter.word_count}`} />
                    <MetaCard label="正文状态" value={selectedChapter.content ? '已有草稿' : '待开始'} />
                    <MetaCard label="备注" value={selectedChapter.notes?.trim() || '暂无备注'} />
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <Link
                      to={`/projects/${project.id}/editor/${selectedChapter.id}`}
                      className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 sm:w-auto"
                    >
                      <PenSquare className="size-4" />
                      打开编辑器
                      <ChevronRight className="size-4" />
                    </Link>
                    <Link
                      to={`/ai-toolbox?task=continue&projectId=${project.id}&chapterId=${selectedChapter.id}`}
                      className="inline-flex h-8 w-full items-center justify-center rounded-lg border border-white/10 bg-transparent px-3 text-sm font-medium text-white transition hover:bg-white/10 sm:w-auto"
                    >
                      续写任务
                    </Link>
                    <Button
                      className="w-full sm:w-auto"
                      variant="outline"
                      onClick={() =>
                        updateChapterMutation.mutate({
                          chapterId: selectedChapter.id,
                          payload: { status: selectedChapter.status === 'draft' ? 'writing' : 'draft' },
                        })
                      }
                      disabled={updateChapterMutation.isPending}
                    >
                      切换状态
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <Card className="border border-white/8 bg-[#161618]/92">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-white">
                <Users2 className="size-5 text-amber-300" />
                项目角色
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {projectCharacters.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-5 text-sm leading-6 text-slate-400">
                  当前项目还没有绑定角色。
                </div>
              ) : (
                <div className="space-y-3">
                  {projectCharacters.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-medium text-white">{item.character.name}</div>
                            {item.role_label ? (
                              <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-slate-300">
                                {item.role_label}
                              </span>
                            ) : null}
                          </div>
                          <p className="text-xs leading-5 text-slate-400">
                            {item.summary?.trim() || item.character.description?.trim() || '暂无项目内角色说明'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={updateProjectCharacterMutation.isPending}
                            onClick={() => openEditProjectCharacterDialog(item)}
                          >
                            <SquarePen className="size-4" />
                            <span className="sr-only">编辑项目角色</span>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={detachCharacterMutation.isPending}
                            onClick={() => handleDetachCharacter(item.id, item.character.name)}
                          >
                            <Unlink className="size-4" />
                            <span className="sr-only">移除角色</span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Separator className="bg-white/10" />

              {charactersQuery.isLoading ? (
                <LoadingState label="正在加载角色库选项..." className="py-6" />
              ) : charactersQuery.isError ? (
                <div className="rounded-2xl border border-dashed border-rose-500/30 bg-rose-500/5 px-4 py-5 text-sm leading-6 text-rose-200">
                  角色库加载失败，暂时无法绑定角色。
                </div>
              ) : availableCharacters.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-5 text-sm leading-6 text-slate-400">
                  没有可追加的角色。
                </div>
              ) : (
                <form className="space-y-3" onSubmit={handleAttachCharacter}>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-200">选择角色</label>
                    <select
                      value={characterLinkDraft.characterId}
                      onChange={(event) =>
                        setCharacterLinkDraft((prev) => ({
                          ...prev,
                          characterId: event.target.value,
                        }))
                      }
                      className="flex h-10 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-500 focus-visible:border-primary"
                    >
                      <option value="">请选择角色</option>
                      {availableCharacters.map((character) => (
                        <option key={character.id} value={character.id}>
                          {character.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-200">项目内定位</label>
                    <Input
                      value={characterLinkDraft.roleLabel}
                      onChange={(event) =>
                        setCharacterLinkDraft((prev) => ({
                          ...prev,
                          roleLabel: event.target.value,
                        }))
                      }
                      placeholder="例如：主角 / 搭档 / 对手"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-200">项目内备注</label>
                    <Textarea
                      value={characterLinkDraft.summary}
                      onChange={(event) =>
                        setCharacterLinkDraft((prev) => ({
                          ...prev,
                          summary: event.target.value,
                        }))
                      }
                      rows={3}
                      placeholder="补充角色在当前项目中的作用、关系或冲突定位"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={attachCharacterMutation.isPending}>
                    <UserPlus className="size-4" />
                    {attachCharacterMutation.isPending ? '绑定中...' : '添加到项目'}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <Card className="border border-white/8 bg-[#161618]/92">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-white">
                <Globe2 className="size-5 text-amber-300" />
                世界观摘要
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
                <div className="flex items-center gap-2 text-white">
                  <PencilLine className="size-4 text-amber-300" />
                  <span className="font-medium">当前摘要</span>
                </div>
                <div className="mt-3 space-y-3 text-sm leading-6 text-slate-400">
                  <p>
                    <span className="text-slate-500">标题：</span>
                    {worldSetting?.title || '尚未设置'}
                  </p>
                  <p>
                    <span className="text-slate-500">概览：</span>
                    {worldSetting?.overview?.trim() || '尚未填写世界观概览'}
                  </p>
                  <p>
                    <span className="text-slate-500">规则：</span>
                    {worldSetting?.rules?.trim() || '尚未填写世界规则'}
                  </p>
                </div>
              </div>

              <Link
                to={`/projects/${project.id}/world`}
                className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-white/10 bg-transparent px-3 text-sm font-medium text-white transition hover:bg-white/10"
              >
                进入完整世界观编辑页
              </Link>

              <form className="space-y-3" onSubmit={handleSaveWorldSetting}>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-200">标题</label>
                  <Input
                    value={worldSettingDraft.title}
                    onChange={(event) => setWorldSettingDraft((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder="例如：蒸汽帝国边境纪事"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-200">世界概览</label>
                  <Textarea
                    value={worldSettingDraft.overview}
                    onChange={(event) => setWorldSettingDraft((prev) => ({ ...prev, overview: event.target.value }))}
                    rows={3}
                    placeholder="概括时代背景、主要矛盾与整体气质"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-200">核心规则</label>
                  <Textarea
                    value={worldSettingDraft.rules}
                    onChange={(event) => setWorldSettingDraft((prev) => ({ ...prev, rules: event.target.value }))}
                    rows={3}
                    placeholder="例如：能力来源、政治秩序、魔法/科技边界"
                  />
                </div>
                <div className="grid gap-3">
                  <Input
                    value={worldSettingDraft.factions}
                    onChange={(event) => setWorldSettingDraft((prev) => ({ ...prev, factions: event.target.value }))}
                    placeholder="势力摘要（可选）"
                  />
                  <Input
                    value={worldSettingDraft.locations}
                    onChange={(event) => setWorldSettingDraft((prev) => ({ ...prev, locations: event.target.value }))}
                    placeholder="关键地点（可选）"
                  />
                  <Input
                    value={worldSettingDraft.timeline}
                    onChange={(event) => setWorldSettingDraft((prev) => ({ ...prev, timeline: event.target.value }))}
                    placeholder="时间线摘要（可选）"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-200">补充备注</label>
                  <Textarea
                    value={worldSettingDraft.extra_notes}
                    onChange={(event) => setWorldSettingDraft((prev) => ({ ...prev, extra_notes: event.target.value }))}
                    rows={3}
                    placeholder="记录暂未结构化但希望保留的设定信息"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={updateWorldSettingMutation.isPending}>
                  <BrainCircuit className="size-4" />
                  {updateWorldSettingMutation.isPending ? '保存中...' : worldSetting ? '更新世界观' : '创建世界观'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </aside>
      </div>

      <Dialog
        open={Boolean(editingProjectCharacter)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingProjectCharacter(null)
            setCharacterLinkEditDraft(defaultCharacterLinkEditState)
          }
        }}
      >
        <DialogContent className="max-w-xl border-white/10 bg-slate-950/95">
          <DialogHeader>
            <DialogTitle>编辑项目角色定位</DialogTitle>
            <DialogDescription>
              更新角色在当前项目中的定位与备注。
            </DialogDescription>
          </DialogHeader>

          {editingProjectCharacter ? (
            <form className="space-y-4" onSubmit={handleUpdateProjectCharacter}>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
                当前角色：<span className="font-medium text-white">{editingProjectCharacter.character.name}</span>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-200">项目内定位</label>
                <Input
                  value={characterLinkEditDraft.roleLabel}
                  onChange={(event) =>
                    setCharacterLinkEditDraft((prev) => ({
                      ...prev,
                      roleLabel: event.target.value,
                    }))
                  }
                  placeholder="例如：主角 / 搭档 / 对手 / 导师"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-200">项目内备注</label>
                <Textarea
                  value={characterLinkEditDraft.summary}
                  onChange={(event) =>
                    setCharacterLinkEditDraft((prev) => ({
                      ...prev,
                      summary: event.target.value,
                    }))
                  }
                  rows={5}
                  placeholder="补充该角色在当前项目中的关系、冲突、弧线或使用约束"
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingProjectCharacter(null)
                    setCharacterLinkEditDraft(defaultCharacterLinkEditState)
                  }}
                >
                  取消
                </Button>
                <Button type="submit" disabled={updateProjectCharacterMutation.isPending}>
                  {updateProjectCharacterMutation.isPending ? '保存中...' : '保存项目角色'}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function WorkspaceMetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-[148px] rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-semibold text-white">{value}</div>
      {hint ? <div className="mt-1 text-xs leading-5 text-slate-400">{hint}</div> : null}
    </div>
  )
}

function WorkspaceFocusCard({
  title,
  description,
  icon,
}: {
  title: string
  description?: string
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2">{icon}</div>
        <div className={description ? 'space-y-1' : ''}>
          <div className="text-sm font-medium text-white">{title}</div>
          {description ? <p className="text-sm leading-6 text-slate-300">{description}</p> : null}
        </div>
      </div>
    </div>
  )
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-2 text-sm leading-6 text-white">{value}</div>
    </div>
  )
}
