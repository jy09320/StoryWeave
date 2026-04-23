import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowUpDown, BookOpen, BrainCircuit, ChevronRight, FilePlus2, PenSquare, ScrollText, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/empty-state'
import { LoadingState } from '@/components/loading-state'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
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
import { formatDate, formatProjectType } from '@/lib/format'
import { queryClient } from '@/lib/query-client'
import {
  createChapter,
  deleteChapter,
  getProject,
  reorderChapters,
  updateChapter,
} from '@/services/projects'
import type { Chapter, ChapterReorderItem, ChapterUpdatePayload, ProjectDetail } from '@/types/api'

interface ChapterDraftState {
  title: string
}

const defaultChapterDraft: ChapterDraftState = {
  title: '',
}

export function ProjectWorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null)
  const [newChapter, setNewChapter] = useState<ChapterDraftState>(defaultChapterDraft)

  const projectQuery = useQuery<ProjectDetail, Error>({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId ?? ''),
    enabled: Boolean(projectId),
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
            <WorkspaceMetricCard label="来源作品" value={project.source_work || '原创项目'} hint="用于标记创作背景" />
          </CardFooter>
        </Card>

        <Card className="border border-white/10 bg-white/6 shadow-lg shadow-black/5">
          <CardHeader>
            <CardTitle className="text-xl text-white">当前工作重点</CardTitle>
            <CardDescription>把结构导航、当前推进与 AI 辅助分层表达，避免信息都挤在章节列表里。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <WorkspaceFocusCard
              title="结构导航"
              description="围绕章节树快速切换、排序与进入编辑器。"
              icon={<BookOpen className="size-4 text-emerald-300" />}
            />
            <WorkspaceFocusCard
              title="当前推进"
              description="选中章节后查看状态、字数和最近更新时间，便于判断下一步要写哪一章。"
              icon={<ScrollText className="size-4 text-sky-300" />}
            />
            <WorkspaceFocusCard
              title="AI 辅助入口"
              description="后续在编辑器中承接续写、改写、设定辅助和一致性检查。"
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
              <CardDescription>当前先聚焦章节树，后续这里可扩展角色、世界观与设定条目入口。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-300">
              <div className="rounded-2xl border border-primary/20 bg-primary/8 p-3">
                <div className="text-sm font-medium text-white">章节管理</div>
                <p className="mt-1 text-xs leading-5 text-slate-400">按章节组织当前作品主线，是本阶段的核心工作入口。</p>
              </div>
              <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 p-3 text-xs leading-6 text-slate-400">
                预留入口：角色库、世界观、时间线、设定冲突检查。
              </div>
              <Link
                to="/"
                className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-white/10 bg-transparent px-3 text-sm font-medium text-white transition hover:bg-white/10"
              >
                返回项目面板
              </Link>
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
              <CardTitle className="flex items-center gap-2 text-xl text-white">
                <BrainCircuit className="size-5 text-primary" />
                当前章节摘要面板
              </CardTitle>
              <CardDescription>把当前章节的推进状态、摘要与编辑入口单独放在右侧，形成更清晰的工作分区。</CardDescription>
            </CardHeader>
            <CardContent>
              {!selectedChapter ? (
                <EmptyState
                  title="尚未选中章节"
                  description="从中间章节结构中选择一个章节，即可查看其摘要信息。"
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

                  <div className="grid gap-4 md:grid-cols-1 xl:grid-cols-1">
                    <MetaCard label="当前字数" value={`${selectedChapter.word_count}`} />
                    <MetaCard label="正文状态" value={selectedChapter.content ? '已有草稿' : '待开始'} />
                    <MetaCard label="备注" value={selectedChapter.notes?.trim() || '暂无备注'} />
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Link
                      to={`/projects/${project.id}/editor/${selectedChapter.id}`}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
                    >
                      <PenSquare className="size-4" />
                      打开编辑器
                      <ChevronRight className="size-4" />
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
        </aside>
      </div>
    </div>
  )
}

function WorkspaceMetricCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="min-w-[160px] rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{hint}</p>
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
      <div className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-white">
        {icon}
        {title}
      </div>
      <p className="text-sm leading-6 text-slate-400">{description}</p>
    </div>
  )
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/10 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-3 text-sm leading-6 text-slate-200">{value}</p>
    </div>
  )
}
