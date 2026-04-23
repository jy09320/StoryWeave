import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowUpDown,
  BookOpen,
  BrainCircuit,
  ChevronRight,
  FilePlus2,
  PenSquare,
  Sparkles,
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

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border border-white/10 bg-white/6 shadow-lg shadow-black/5">
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
            <CardDescription className="max-w-3xl text-sm leading-7 text-slate-300">
              {project.description?.trim() || '暂无项目简介。当前工作台优先承接项目结构、章节推进与 AI 写作入口，后续继续扩展角色、世界观与一致性控制。'}
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-wrap items-center gap-3 border-white/10 bg-white/4">
            <WorkspaceMetricCard label="章节数量" value={`${chapters.length}`} hint="已纳入当前项目结构" />
            <WorkspaceMetricCard
              label="累计字数"
              value={`${chapters.reduce((sum, chapter) => sum + chapter.word_count, 0)}`}
              hint="按章节统计已写正文"
            />
            <WorkspaceMetricCard label="角色数量" value={`${projectCharacters.length}`} hint="已绑定到当前项目的角色" />
            <WorkspaceMetricCard label="来源作品" value={project.source_work || '原创项目'} hint="用于标记创作背景" />
          </CardFooter>
        </Card>

        <Card className="border border-white/10 bg-white/6 shadow-lg shadow-black/5">
          <CardHeader>
            <CardTitle className="text-xl text-white">当前工作重点</CardTitle>
            <CardDescription>把结构导航、角色资产、世界观设定与 AI 辅助分层表达，避免信息都挤在章节列表里。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <WorkspaceFocusCard
              title="结构导航"
              description="围绕章节树快速切换、排序与进入编辑器。"
              icon={<BookOpen className="size-4 text-emerald-300" />}
            />
            <WorkspaceFocusCard
              title="角色绑定"
              description="把全局角色库挂到项目里，后续作为剧情推进与 AI 上下文基础。"
              icon={<Users2 className="size-4 text-sky-300" />}
            />
            <WorkspaceFocusCard
              title="世界观设定"
              description="整理规则、势力、地点与时间线，为一致性检查准备基础信息。"
              icon={<Globe2 className="size-4 text-amber-300" />}
            />
            <WorkspaceFocusCard
              title="AI 辅助入口"
              description="已可跳转到工具箱执行续写、改写与设定检查任务。"
              icon={<Sparkles className="size-4 text-violet-300" />}
            />
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
        <aside className="space-y-4">
          <Card className="border border-white/10 bg-white/6">
            <CardHeader>
              <CardTitle className="text-lg text-white">结构导航</CardTitle>
              <CardDescription>当前先聚焦章节树，同时把角色和世界观入口显式暴露出来。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-300">
              <div className="rounded-2xl border border-primary/20 bg-primary/8 p-3">
                <div className="text-sm font-medium text-white">章节管理</div>
                <p className="mt-1 text-xs leading-5 text-slate-400">按章节组织当前作品主线，是本阶段的核心工作入口。</p>
              </div>
              <div className="grid gap-2">
                <Link
                  to={`/characters`}
                  className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-white/10 bg-transparent px-3 text-sm font-medium text-white transition hover:bg-white/10"
                >
                  打开全局角色库
                </Link>
                <Link
                  to={`/ai-toolbox?task=continue&projectId=${project.id}${selectedChapter ? `&chapterId=${selectedChapter.id}` : ''}`}
                  className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-primary/20 bg-primary/10 px-3 text-sm font-medium text-white transition hover:bg-primary/20"
                >
                  进入 AI 续写任务
                </Link>
                <Link
                  to={`/ai-toolbox?task=consistency&projectId=${project.id}${selectedChapter ? `&chapterId=${selectedChapter.id}` : ''}`}
                  className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-white/10 bg-transparent px-3 text-sm font-medium text-white transition hover:bg-white/10"
                >
                  进入设定检查任务
                </Link>
                <Link
                  to="/"
                  className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-white/10 bg-transparent px-3 text-sm font-medium text-white transition hover:bg-white/10"
                >
                  返回项目面板
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-white/10 bg-white/6">
            <CardHeader>
              <CardTitle className="text-lg text-white">新增章节</CardTitle>
              <CardDescription>先建立章节结构，再进入编辑页面补全正文与 AI 生成内容。</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={handleCreateChapter}>
                <Input
                  value={newChapter.title}
                  onChange={(event) => setNewChapter({ title: event.target.value })}
                  placeholder="例如：第一章 · 雪夜重逢"
                  maxLength={200}
                />
                <Button type="submit" className="w-full" disabled={createChapterMutation.isPending}>
                  <FilePlus2 className="size-4" />
                  {createChapterMutation.isPending ? '创建中...' : '创建章节'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </aside>

        <section className="space-y-4">
          <Card className="border border-white/10 bg-white/6">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-xl text-white">章节结构</CardTitle>
                  <CardDescription>从这里选择当前要推进的章节，并完成排序、删除和进入编辑器等操作。</CardDescription>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/10 px-3 py-1 text-xs text-slate-400">
                  <ArrowUpDown className="size-3.5 text-primary" />
                  工作台主导航
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {chapters.length === 0 ? (
                <EmptyState title="这个项目还没有章节" description="先在左侧创建章节，随后即可进入编辑工作流。" />
              ) : (
                <div className="space-y-3">
                  {chapters.map((chapter, index) => {
                    const isSelected = selectedChapter?.id === chapter.id

                    return (
                      <button
                        key={chapter.id}
                        type="button"
                        onClick={() => setSelectedChapterId(chapter.id)}
                        className={[
                          'w-full rounded-3xl border p-4 text-left transition',
                          isSelected
                            ? 'border-primary/50 bg-primary/10 shadow-lg shadow-primary/10'
                            : 'border-white/10 bg-black/10 hover:border-white/20 hover:bg-white/6',
                        ].join(' ')}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-slate-400">
                                第 {chapter.order_index} 章
                              </span>
                              <StatusBadge status={chapter.status} className="py-0.5" />
                            </div>
                            <h3 className="text-base font-medium text-white">{chapter.title}</h3>
                            <p className="text-xs text-slate-400">
                              {chapter.word_count} 字 · 最近更新 {formatDate(chapter.updated_at)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
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

          <Card className="border border-white/10 bg-white/6">
            <CardHeader>
              <CardTitle className="text-xl text-white">章节摘要面板</CardTitle>
              <CardDescription>展示当前选中章节的基础信息，并提供进入编辑器的入口。</CardDescription>
            </CardHeader>
            <CardContent>
              {!selectedChapter ? (
                <EmptyState
                  title="尚未选中章节"
                  description="从上方章节列表中选择一个章节，即可查看其摘要信息。"
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
                      {selectedChapter.summary?.trim() || '当前章节还没有摘要，后续可在 AI 生成或保存流程中自动补充。'}
                    </p>
                  </div>

                  <Separator className="bg-white/10" />

                  <div className="grid gap-4 md:grid-cols-3">
                    <MetaCard label="当前字数" value={`${selectedChapter.word_count}`} />
                    <MetaCard label="正文状态" value={selectedChapter.content ? '已有草稿' : '待开始'} />
                    <MetaCard label="备注" value={selectedChapter.notes?.trim() || '暂无备注'} />
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Link
                      to={`/projects/${project.id}/editor/${selectedChapter.id}`}
                      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90"
                    >
                      <PenSquare className="size-4" />
                      打开编辑器
                      <ChevronRight className="size-4" />
                    </Link>
                    <Link
                      to={`/ai-toolbox?task=continue&projectId=${project.id}&chapterId=${selectedChapter.id}`}
                      className="inline-flex h-8 items-center justify-center rounded-lg border border-white/10 bg-transparent px-3 text-sm font-medium text-white transition hover:bg-white/10"
                    >
                      续写任务
                    </Link>
                    <Button
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

        <aside className="space-y-4">
          <Card className="border border-white/10 bg-white/6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-white">
                <Users2 className="size-5 text-sky-300" />
                项目角色
              </CardTitle>
              <CardDescription>把全局角色库中的人物挂接到当前项目，方便后续 AI 与设定检查引用。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {projectCharacters.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 py-5 text-sm leading-6 text-slate-400">
                  当前项目还没有绑定角色。先在下方添加，后续这里会成为项目人物关系的主入口。
                </div>
              ) : (
                <div className="space-y-3">
                  {projectCharacters.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-white/10 bg-black/10 p-4">
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
                <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 py-5 text-sm leading-6 text-slate-400">
                  没有可追加的角色。你可以先去 [`CharactersPage`](frontend/src/pages/characters-page.tsx:86) 创建更多角色。
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

          <Card className="border border-white/10 bg-white/6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-white">
                <Globe2 className="size-5 text-amber-300" />
                世界观摘要
              </CardTitle>
              <CardDescription>先在工作台里沉淀标题、概览和核心规则，后续再扩展为更完整的设定面板。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-black/10 p-4 text-sm text-slate-300">
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
              更新角色在当前项目中的定位与备注，后续 AI 上下文会优先消费这里的项目内信息。
            </DialogDescription>
          </DialogHeader>

          {editingProjectCharacter ? (
            <form className="space-y-4" onSubmit={handleUpdateProjectCharacter}>
              <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-slate-300">
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

function WorkspaceMetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="min-w-[148px] rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs leading-5 text-slate-400">{hint}</div>
    </div>
  )
}

function WorkspaceFocusCard({
  title,
  description,
  icon,
}: {
  title: string
  description: string
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-xl border border-white/10 bg-white/8 p-2">{icon}</div>
        <div className="space-y-1">
          <div className="text-sm font-medium text-white">{title}</div>
          <p className="text-sm leading-6 text-slate-300">{description}</p>
        </div>
      </div>
    </div>
  )
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-2 text-sm leading-6 text-white">{value}</div>
    </div>
  )
}
