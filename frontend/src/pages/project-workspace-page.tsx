import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowUpDown, ChevronRight, FilePlus2, PenSquare, Trash2 } from 'lucide-react'
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

  const chapters = projectQuery.data?.chapters ?? []
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
    <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <Card className="border border-white/10 bg-white/6">
          <CardHeader className="gap-3">
            <CardDescription className="text-primary/80">项目概览</CardDescription>
            <CardTitle className="text-2xl text-white">{project.title}</CardTitle>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <StatusBadge status={project.status} />
              <span className="rounded-full border border-white/10 px-2.5 py-1">
                {formatProjectType(project.type)}
              </span>
              <span>最近更新 {formatDate(project.updated_at)}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-300">
            <p className="leading-7 text-slate-300">
              {project.description?.trim() || '暂无项目简介，可先创建章节并在编辑器页逐步补充内容。'}
            </p>
            <div className="rounded-2xl border border-white/10 bg-black/10 p-3 text-xs text-slate-400">
              <p>来源作品：{project.source_work || '未设置'}</p>
              <p className="mt-2">章节数量：{chapters.length}</p>
            </div>
          </CardContent>
          <CardFooter className="border-white/10 bg-white/4">
            <Link
              to="/"
              className="inline-flex h-8 w-full items-center justify-center rounded-lg border border-white/10 bg-transparent px-3 text-sm font-medium text-white transition hover:bg-white/10"
            >
              返回项目面板
            </Link>
          </CardFooter>
        </Card>

        <Card className="border border-white/10 bg-white/6">
          <CardHeader>
            <CardTitle className="text-lg text-white">新增章节</CardTitle>
            <CardDescription>先建立章节结构，下一步再进入编辑页面补全正文。</CardDescription>
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
                <CardTitle className="text-xl text-white">章节列表</CardTitle>
                <CardDescription>支持选择章节、删除章节，并进行基础排序调整。</CardDescription>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/10 px-3 py-1 text-xs text-slate-400">
                <ArrowUpDown className="size-3.5 text-primary" />
                MVP 顺序调整
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {chapters.length === 0 ? (
              <EmptyState
                title="这个项目还没有章节"
                description="先在左侧创建章节，随后即可进入编辑工作流。"
              />
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
                    to={`/projects/${project.id}?chapterId=${selectedChapter.id}`}
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90"
                  >
                    <PenSquare className="size-4" />
                    打开编辑入口
                    <ChevronRight className="size-4" />
                  </Link>
                  <Button
                    variant="outline"
                    onClick={() =>
                      updateChapterMutation.mutate({
                        chapterId: selectedChapter.id,
                        payload: { status: selectedChapter.status === 'draft' ? 'active' : 'draft' },
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
