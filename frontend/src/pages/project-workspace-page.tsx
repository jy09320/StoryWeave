import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowUpDown,
  BookOpen,
  ChevronRight,
  FilePlus2,
  FileUp,
  PenSquare,
  Trash2,
  UserPlus,
  Users2,
  Globe2,
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
  getProject,
  importProjectKnowledge,
  listCharacters,
  reorderChapters,
  updateChapter,
  updateProjectCharacter,
} from '@/services/projects'
import type {
  Chapter,
  ChapterReorderItem,
  ChapterUpdatePayload,
  Character,
  ProjectImportResult,
  ProjectCharacter,
  ProjectCharacterUpdatePayload,
  ProjectDetail,
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

interface ProjectImportDraftState {
  sourceText: string
  guidance: string
}

const defaultChapterDraft: ChapterDraftState = {
  title: '',
}

const defaultCharacterLinkDraft: CharacterLinkDraftState = {
  characterId: '',
  roleLabel: '',
  summary: '',
}

const defaultCharacterLinkEditState: CharacterLinkEditState = {
  roleLabel: '',
  summary: '',
}

const defaultProjectImportDraft: ProjectImportDraftState = {
  sourceText: '',
  guidance: '',
}

function buildCharacterLinkUpdatePayload(editState: CharacterLinkEditState): ProjectCharacterUpdatePayload {
  return {
    role_label: editState.roleLabel.trim() || null,
    summary: editState.summary.trim() || null,
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

function getLatestUpdatedChapter(chapters: Chapter[]) {
  if (!chapters.length) {
    return null
  }

  return [...chapters].sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime())[0]
}

function getChapterStatusSummary(chapter: Chapter | null) {
  if (!chapter) {
    return '待开始'
  }

  return chapter.content ? '已有草稿' : '待开始'
}

function getNextActionLabel(chapter: Chapter | null) {
  if (!chapter) {
    return '先创建一个章节'
  }

  return chapter.content ? '直接进入编辑器续写' : '进入编辑器建立正文'
}

export function ProjectWorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null)
  const [newChapter, setNewChapter] = useState<ChapterDraftState>(defaultChapterDraft)
  const [characterLinkDraft, setCharacterLinkDraft] = useState<CharacterLinkDraftState>(defaultCharacterLinkDraft)
  const [editingProjectCharacter, setEditingProjectCharacter] = useState<ProjectCharacter | null>(null)
  const [characterLinkEditDraft, setCharacterLinkEditDraft] = useState<CharacterLinkEditState>(defaultCharacterLinkEditState)
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const [projectImportDraft, setProjectImportDraft] = useState<ProjectImportDraftState>(defaultProjectImportDraft)
  const [latestImportResult, setLatestImportResult] = useState<ProjectImportResult | null>(null)

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
  const latestUpdatedChapter = useMemo(() => getLatestUpdatedChapter(chapters), [chapters])
  const selectedChapter = useMemo(() => {
    if (!chapters.length) {
      return null
    }

    if (selectedChapterId) {
      return chapters.find((chapter) => chapter.id === selectedChapterId) ?? chapters[0]
    }

    return latestUpdatedChapter ?? chapters[0]
  }, [chapters, latestUpdatedChapter, selectedChapterId])

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
    mutationFn: ({ projectId, payload }: { projectId: string; payload: Parameters<typeof attachProjectCharacter>[1] }) =>
      attachProjectCharacter(projectId, payload),
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
    mutationFn: ({
      projectId,
      linkId,
      payload,
    }: {
      projectId: string
      linkId: string
      payload: ProjectCharacterUpdatePayload
    }) => updateProjectCharacter(projectId, linkId, payload),
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

  const importProjectKnowledgeMutation = useMutation({
    mutationFn: async () =>
      importProjectKnowledge(projectId ?? '', {
        source_text: projectImportDraft.sourceText,
        guidance: projectImportDraft.guidance.trim() || null,
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      setLatestImportResult(result)
      setProjectImportDraft(defaultProjectImportDraft)
      toast.success(
        `已导入 ${result.imported_character_count} 个角色，新增 ${result.created_character_count} 个，并${result.world_setting_updated ? '同步更新了世界观' : '保留了现有世界观'}`,
      )
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

    createChapterMutation.mutate({ project_id: projectId, title })
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

    attachCharacterMutation.mutate({
      projectId: projectId ?? '',
      payload: {
        character_id: characterLinkDraft.characterId,
        role_label: characterLinkDraft.roleLabel.trim() || null,
        summary: characterLinkDraft.summary.trim() || null,
      },
    })
  }

  function handleUpdateProjectCharacter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!editingProjectCharacter) {
      return
    }

    updateProjectCharacterMutation.mutate({
      projectId: projectId ?? '',
      linkId: editingProjectCharacter.id,
      payload: buildCharacterLinkUpdatePayload(characterLinkEditDraft),
    })
  }

  function handleImportProjectKnowledge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!projectImportDraft.sourceText.trim()) {
      toast.error('请先粘贴要导入的项目资料')
      return
    }

    importProjectKnowledgeMutation.mutate()
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
  const totalWords = chapters.reduce((sum, chapter) => sum + chapter.word_count, 0)
  const summaryActions = [
    {
      label: '继续当前章节',
      to: selectedChapter ? `/projects/${project.id}/editor/${selectedChapter.id}` : null,
      tone: 'primary' as const,
      icon: <PenSquare className="size-4" />,
    },
    {
      label: '世界观设定',
      to: `/projects/${project.id}/world`,
      tone: 'secondary' as const,
      icon: <Globe2 className="size-4" />,
    },
    {
      label: '角色管理',
      to: `/projects/${project.id}/characters`,
      tone: 'secondary' as const,
      icon: <Users2 className="size-4" />,
    },
    {
      label: '导入资料',
      to: null,
      tone: 'secondary' as const,
      icon: <FileUp className="size-4" />,
    },
  ]

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[28px] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(249,250,251,0.9))] shadow-[0_20px_50px_rgba(148,163,184,0.12)]">
        <div className="border-b border-border/70 px-6 py-5 lg:px-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium uppercase tracking-[0.24em] text-primary/80">工作台</span>
                <span>最近更新 {formatDate(project.updated_at)}</span>
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-3xl font-semibold tracking-tight text-foreground">{project.title}</h1>
                  <StatusBadge status={project.status} />
                  <span className="inline-flex h-7 items-center rounded-full border border-border bg-background px-3 text-xs text-muted-foreground">
                    {formatProjectType(project.type)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                  <span>{project.source_work || '原创项目'}</span>
                  <span>{chapters.length} 章</span>
                  <span>{totalWords} 字</span>
                  <span>{projectCharacters.length} 角色</span>
                  <span>{worldSetting?.title?.trim() ? '世界观已配置' : '世界观待完善'}</span>
                </div>
              </div>
              {project.description?.trim() ? (
                <p className="max-w-4xl text-sm leading-7 text-muted-foreground">{project.description.trim()}</p>
              ) : null}
            </div>

            <div className="xl:w-[280px] xl:shrink-0">
              <div className="rounded-2xl border border-border/70 bg-background/80 p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">创作活跃</div>
                    <div className="mt-1 text-lg font-semibold text-foreground">{activeDays} / 21 天</div>
                  </div>
                  <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                    最近推进 {latestUpdatedChapter ? formatDate(latestUpdatedChapter.updated_at) : '暂无'}
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-7 gap-1.5">
                  {activityMap.map((item) => (
                    <div key={item.key} className="space-y-1">
                      <div
                        title={`${item.label} · ${item.count} 个章节更新 · ${item.words} 字`}
                        className={[
                          'h-6 rounded-md border border-border/50 transition',
                          item.count === 0
                            ? 'bg-muted/35'
                            : item.words > 3000
                              ? 'bg-emerald-400/80'
                              : item.words > 1000
                                ? 'bg-emerald-400/55'
                                : 'bg-emerald-400/30',
                        ].join(' ')}
                      />
                      <div className="text-center text-[10px] text-muted-foreground">{item.label}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
                    <BookOpen className="size-3.5 text-primary" />
                    活跃 {activeDays}/21
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
                    <Users2 className="size-3.5 text-primary" />
                    角色 {projectCharacters.length}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
                    <Globe2 className="size-3.5 text-primary" />
                    {worldSetting?.title?.trim() ? '设定已接入' : '设定待补充'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-b border-border/70 px-6 py-4 lg:px-7">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
            <WorkspaceStatCell label="章节数" value={`${chapters.length}`} />
            <WorkspaceStatCell label="总字数" value={`${totalWords}`} />
            <WorkspaceStatCell label="当前章节" value={selectedChapter?.title || '未选中'} valueClassName="text-lg" />
            <WorkspaceStatCell label="角色绑定" value={`${projectCharacters.length}`} />
            <WorkspaceStatCell
              label="最近推进"
              value={latestUpdatedChapter ? formatDate(latestUpdatedChapter.updated_at) : '暂无'}
              valueClassName="text-lg"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 px-6 py-4 lg:px-7">
          {summaryActions.map((action) => {
            if (action.label === '导入资料') {
              return (
                <Button
                  key={action.label}
                  type="button"
                  variant="outline"
                  className="h-10 rounded-full border-border bg-background px-4"
                  onClick={() => setIsImportDialogOpen(true)}
                >
                  {action.icon}
                  {action.label}
                </Button>
              )
            }

            if (!action.to) {
              return null
            }

            return (
              <Link
                key={action.label}
                to={action.to}
                className={[
                  'inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition',
                  action.tone === 'primary'
                    ? 'bg-primary text-primary-foreground hover:opacity-90'
                    : 'border border-border bg-background text-foreground hover:bg-muted',
                ].join(' ')}
              >
                {action.icon}
                {action.label}
              </Link>
            )
          })}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="overflow-hidden rounded-[28px] border border-border/70 bg-background shadow-[0_18px_40px_rgba(148,163,184,0.10)]">
          <div className="border-b border-border/70 px-6 py-5 lg:px-7">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-semibold text-foreground">章节管理</h2>
                  <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
                    <ArrowUpDown className="size-3.5 text-primary" />
                    工作台主导航
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                  <span>共 {chapters.length} 章</span>
                  <span>当前选中 {selectedChapter ? `第 ${selectedChapter.order_index} 章` : '未选中章节'}</span>
                  <span>优先处理正文、摘要与排序</span>
                </div>
              </div>

              <form className="flex w-full max-w-xl flex-col gap-2 sm:flex-row" onSubmit={handleCreateChapter}>
                <Input
                  value={newChapter.title}
                  onChange={(event) => setNewChapter({ title: event.target.value })}
                  placeholder="搜索或直接输入新章节标题，例如：第一章 · 雪夜重逢"
                  maxLength={200}
                  className="h-11 rounded-full border-border bg-muted/20 px-4"
                />
                <Button className="h-11 rounded-full px-5" type="submit" disabled={createChapterMutation.isPending}>
                  <FilePlus2 className="size-4" />
                  {createChapterMutation.isPending ? '创建中...' : '新建章节'}
                </Button>
              </form>
            </div>
          </div>

          {chapters.length === 0 ? (
            <div className="px-6 py-8 lg:px-7">
              <EmptyState title="这个项目还没有章节" description="先创建一个章节。" />
            </div>
          ) : (
            <div className="divide-y divide-border/70">
              {chapters.map((chapter, index) => {
                const isSelected = selectedChapter?.id === chapter.id

                return (
                  <div
                    key={chapter.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedChapterId(chapter.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setSelectedChapterId(chapter.id)
                      }
                    }}
                    className={[
                      'group relative grid gap-4 px-6 py-5 transition lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:px-7',
                      isSelected ? 'bg-primary/6' : 'hover:bg-muted/30',
                    ].join(' ')}
                  >
                    <div
                      className={[
                        'absolute inset-y-3 left-3 hidden w-1 rounded-full transition lg:block',
                        isSelected ? 'bg-primary' : 'bg-transparent group-hover:bg-primary/30',
                      ].join(' ')}
                    />

                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="rounded-full border border-border bg-background px-2.5 py-1">第 {chapter.order_index} 章</span>
                        <StatusBadge status={chapter.status} className="py-0.5" />
                        <span>{chapter.word_count} 字</span>
                        <span>最近更新 {formatDate(chapter.updated_at)}</span>
                      </div>

                      <div className="flex flex-wrap items-end gap-3">
                        <h3 className="truncate text-lg font-semibold text-foreground">{chapter.title}</h3>
                        <span className="text-sm text-muted-foreground">{chapter.content ? '已有正文，可直接续写' : '尚未开始正文编写'}</span>
                      </div>

                      <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
                        {chapter.summary?.trim() || chapter.notes?.trim() || '暂无章节摘要，建议补充一句剧情目标或当前推进说明。'}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Link
                        to={`/projects/${project.id}/editor/${chapter.id}`}
                        className="inline-flex h-9 items-center justify-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
                        onClick={(event) => event.stopPropagation()}
                      >
                        编辑
                      </Link>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 rounded-full px-3"
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
                        className="h-9 rounded-full px-3"
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
                        className="h-9 rounded-full px-3"
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
                )
              })}
            </div>
          )}

          <div className="border-t border-border/70 bg-muted/20 px-6 py-5 lg:px-7">
            {!selectedChapter ? (
              <div className="text-sm text-muted-foreground">尚未选中章节，请从上方列表选择一个章节继续工作。</div>
            ) : (
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px] xl:items-start">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    <span className="rounded-full border border-border bg-background px-3 py-1">第 {selectedChapter.order_index} 章</span>
                    <StatusBadge status={selectedChapter.status} />
                    <span>最近更新 {formatDate(selectedChapter.updated_at)}</span>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-2xl font-semibold text-foreground">{selectedChapter.title}</h3>
                    <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
                      {selectedChapter.summary?.trim() || '当前章节还没有摘要，建议补充一句场景目标、冲突或本章推进节点。'}
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <InlineMetaItem label="当前字数" value={`${selectedChapter.word_count}`} />
                    <InlineMetaItem label="正文状态" value={getChapterStatusSummary(selectedChapter)} />
                    <InlineMetaItem label="备注" value={selectedChapter.notes?.trim() || '暂无备注'} />
                    <InlineMetaItem
                      label="章节位置"
                      value={selectedChapter === latestUpdatedChapter ? '最近推进章节' : '当前选中章节'}
                    />
                    <InlineMetaItem label="下一动作" value={getNextActionLabel(selectedChapter)} />
                    <InlineMetaItem label="AI 处理" value="长文本改写、对照统一可进入 AI 工具箱" />
                  </div>
                </div>

                <div className="rounded-2xl border border-border/70 bg-background/90 p-4 shadow-sm">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">当前章节操作</div>
                  <div className="mt-2 text-lg font-semibold text-foreground">{selectedChapter.title}</div>
                  <div className="mt-4 grid gap-2">
                    <Link
                      to={`/projects/${project.id}/editor/${selectedChapter.id}`}
                      className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
                    >
                      <PenSquare className="size-4" />
                      打开编辑器
                      <ChevronRight className="size-4" />
                    </Link>
                    <Link
                      to={`/ai-toolbox?task=continue&projectId=${project.id}&chapterId=${selectedChapter.id}`}
                      className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                    >
                      续写任务
                    </Link>
                    <Button
                      className="h-10 rounded-full"
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
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <Card className="border border-border bg-card/95">
            <CardHeader>
              <CardTitle className="text-lg text-foreground">当前项目步骤</CardTitle>
              <CardDescription className="text-muted-foreground">工作台负责选章和整理，正文编辑回到编辑器完成。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {latestUpdatedChapter ? (
                <div className="rounded-md border border-border bg-muted/35 p-4">
                  <div className="text-xs text-muted-foreground">最近推进</div>
                  <div className="mt-1 text-sm font-medium text-foreground">{latestUpdatedChapter.title}</div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    第 {latestUpdatedChapter.order_index} 章 · {latestUpdatedChapter.word_count} 字 · {formatDate(latestUpdatedChapter.updated_at)}
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-border bg-muted/35 px-4 py-4 text-sm text-muted-foreground">
                  先创建一个章节，再开始推进写作。
                </div>
              )}

              <div className="grid gap-2">
                {selectedChapter ? (
                  <Link
                    to={`/projects/${project.id}/editor/${selectedChapter.id}`}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-amber-500 px-4 text-sm font-medium text-black transition hover:opacity-90"
                  >
                    <PenSquare className="size-4" />
                    进入当前选中章节
                  </Link>
                ) : null}
                {latestUpdatedChapter && selectedChapter?.id !== latestUpdatedChapter.id ? (
                  <Link
                    to={`/projects/${project.id}/editor/${latestUpdatedChapter.id}`}
                    className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-background px-4 text-sm text-foreground transition hover:bg-muted"
                  >
                    回到最近推进章节
                  </Link>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border bg-card/95">
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2 text-lg text-foreground">
                  <Users2 className="size-5 text-primary" />
                  项目角色
                </CardTitle>
                <CardDescription className="mt-1">管理项目内角色与绑定信息。在侧边栏角色库页面可使用角色 AI 助手。</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-border bg-muted/35 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">角色摘要</div>
                    <div className="mt-1 text-2xl font-semibold text-foreground">{projectCharacters.length}</div>
                  </div>
                  <div className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">已绑定角色</div>
                </div>
                <div className="mt-3 space-y-2">
                  {projectCharacters.length === 0 ? (
                    <p className="text-sm leading-6 text-muted-foreground">当前项目还没有绑定角色，可手动绑定，也可在角色库页面通过角色 AI 助手分析资料。</p>
                  ) : (
                    projectCharacters.slice(0, 3).map((item) => (
                      <div key={item.id} className="rounded-xl border border-border/70 bg-background/90 px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{item.character.name}</span>
                          {item.role_label ? (
                            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                              {item.role_label}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {item.summary?.trim() || item.character.description?.trim() || '暂无项目内角色说明'}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="grid gap-2">
                <Button type="button" variant="outline" onClick={() => setIsImportDialogOpen(true)}>
                  <FileUp className="size-4" />
                  导入角色资料
                </Button>
              </div>

              <Separator className="bg-border" />

              {charactersQuery.isLoading ? (
                <LoadingState label="正在加载角色库选项..." className="py-6" />
              ) : charactersQuery.isError ? (
                <div className="rounded-2xl border border-dashed border-rose-500/30 bg-rose-500/5 px-4 py-5 text-sm leading-6 text-rose-200">
                  角色库加载失败，暂时无法绑定角色。
                </div>
              ) : availableCharacters.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted/35 px-4 py-5 text-sm leading-6 text-muted-foreground">
                  没有可追加的角色。
                </div>
              ) : (
                <form className="space-y-3" onSubmit={handleAttachCharacter}>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground/85">选择角色</label>
                    <select
                      value={characterLinkDraft.characterId}
                      onChange={(event) =>
                        setCharacterLinkDraft((prev) => ({
                          ...prev,
                          characterId: event.target.value,
                        }))
                      }
                      className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:border-primary"
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
                    <label className="text-sm font-medium text-foreground/85">项目内定位</label>
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
                    <label className="text-sm font-medium text-foreground/85">项目内说明</label>
                    <Textarea
                      value={characterLinkDraft.summary}
                      onChange={(event) =>
                        setCharacterLinkDraft((prev) => ({
                          ...prev,
                          summary: event.target.value,
                        }))
                      }
                      rows={4}
                      placeholder="补充该角色在当前项目中的关系、冲突或使用约束"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={attachCharacterMutation.isPending}>
                    <UserPlus className="size-4" />
                    {attachCharacterMutation.isPending ? '绑定中...' : '绑定到当前项目'}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <Card className="border border-border bg-card/95">
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2 text-lg text-foreground">
                  <Globe2 className="size-5 text-primary" />
                  世界观摘要
                </CardTitle>
                <CardDescription className="mt-1">查看设定摘要。在世界观设定页可使用世界观 AI 助手。</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-6 text-foreground/85">
              <div className="rounded-2xl border border-border bg-muted/35 px-4 py-4">
                <p>
                  <span className="text-muted-foreground">标题：</span>
                  {worldSetting?.title || '尚未设置'}
                </p>
                <p className="mt-3 line-clamp-3">
                  <span className="text-muted-foreground">概览：</span>
                  {worldSetting?.overview?.trim() || '尚未填写世界观概览'}
                </p>
                <p className="mt-3 line-clamp-3">
                  <span className="text-muted-foreground">规则：</span>
                  {worldSetting?.rules?.trim() || '尚未填写世界规则'}
                </p>
                <p className="mt-3 line-clamp-3">
                  <span className="text-muted-foreground">时间线：</span>
                  {worldSetting?.timeline?.trim() || '尚未填写时间线摘要'}
                </p>
              </div>

              <div className="grid gap-2">
                <Button type="button" variant="outline" onClick={() => setIsImportDialogOpen(true)}>
                  <FileUp className="size-4" />
                  导入世界观资料
                </Button>
              </div>

              <div className="grid gap-2">
                <Link
                  to={`/projects/${project.id}/world`}
                  className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90"
                >
                  打开完整世界观页面
                </Link>
                <Link
                  to={`/ai-toolbox?task=consistency&projectId=${project.id}${selectedChapter ? `&chapterId=${selectedChapter.id}` : ''}`}
                  className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-border bg-muted/35 px-3 text-sm font-medium text-foreground transition hover:bg-muted"
                >
                  交给 AI 做一致性检查
                </Link>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>

      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>导入项目资料</DialogTitle>
            <DialogDescription>
              粘贴原文、人物设定或条目说明，系统会自动抽取角色并可同步更新当前项目世界观。
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleImportProjectKnowledge}>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/85">待导入内容</label>
              <Textarea
                value={projectImportDraft.sourceText}
                onChange={(event) =>
                  setProjectImportDraft((prev) => ({
                    ...prev,
                    sourceText: event.target.value,
                  }))
                }
                rows={12}
                placeholder="粘贴角色表、项目简介、已有世界观设定或原始素材。"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/85">导入指引（可选）</label>
              <Textarea
                value={projectImportDraft.guidance}
                onChange={(event) =>
                  setProjectImportDraft((prev) => ({
                    ...prev,
                    guidance: event.target.value,
                  }))
                }
                rows={3}
                placeholder="例如：保留已有命名，不覆盖现有角色关系。"
              />
            </div>

            {latestImportResult ? (
              <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-4 text-sm leading-6 text-foreground/85">
                <div className="font-medium text-foreground">最近一次导入结果</div>
                <div className="mt-2 text-muted-foreground">
                  已导入 {latestImportResult.imported_character_count} 个角色，新增 {latestImportResult.created_character_count} 个角色，
                  {latestImportResult.world_setting_updated ? '并同步更新了世界观。' : '未修改当前世界观。'}
                </div>
              </div>
            ) : null}

            <Separator />

            <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-4 text-sm leading-6 text-muted-foreground">
              世界观 AI 补全入口已迁移到独立的“世界观 AI”对话框中。这里保留纯资料导入职责，用于统一导入项目背景、角色素材与条目说明。
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsImportDialogOpen(false)}>
                关闭
              </Button>
              <Button type="submit" disabled={importProjectKnowledgeMutation.isPending}>
                {importProjectKnowledgeMutation.isPending ? '导入中...' : '开始导入'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingProjectCharacter)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingProjectCharacter(null)
            setCharacterLinkEditDraft(defaultCharacterLinkEditState)
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>编辑项目角色定位</DialogTitle>
            <DialogDescription>更新角色在当前项目中的定位与备注。</DialogDescription>
          </DialogHeader>

          {editingProjectCharacter ? (
            <form className="space-y-4" onSubmit={handleUpdateProjectCharacter}>
              <div className="rounded-2xl border border-border bg-muted/35 px-4 py-3 text-sm text-foreground/85">
                当前角色：<span className="font-medium text-foreground">{editingProjectCharacter.character.name}</span>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/85">项目内定位</label>
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
                <label className="text-sm font-medium text-foreground/85">项目内备注</label>
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

function WorkspaceStatCell({
  label,
  value,
  valueClassName,
}: {
  label: string
  value: string
  valueClassName?: string
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3 shadow-sm">
      <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <div className={[`mt-2 text-2xl font-semibold text-foreground`, valueClassName || ''].join(' ').trim()}>{value}</div>
    </div>
  )
}

function InlineMetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm leading-6 text-foreground">{value}</div>
    </div>
  )
}
