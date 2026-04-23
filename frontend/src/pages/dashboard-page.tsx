import { useMemo, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from 'react'
import { useMutation, useQueries, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  BookOpen,
  BrainCircuit,
  Clock3,
  FileText,
  PenLine,
  PenSquare,
  Plus,
  Sparkles,
  Swords,
  Trash2,
  WandSparkles,
} from 'lucide-react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/empty-state'
import { LoadingState } from '@/components/loading-state'
import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { formatDate, formatProjectType } from '@/lib/format'
import { queryClient } from '@/lib/query-client'
import {
  createProject,
  deleteProject,
  listProjects,
  updateProject,
  getProject,
} from '@/services/projects'
import type { Chapter, Project, ProjectDetail, ProjectPayload, ProjectStatus, ProjectType } from '@/types/api'

const PROJECT_TYPE_OPTIONS: Array<{ label: string; value: ProjectType }> = [
  { label: '原创', value: 'original' },
  { label: '同人', value: 'fanfiction' },
  { label: 'ACG 二创', value: 'acg' },
  { label: '影视衍生', value: 'tv_movie' },
]

const PROJECT_STATUS_OPTIONS: Array<{ label: string; value: ProjectStatus }> = [
  { label: '草稿', value: 'draft' },
  { label: '进行中', value: 'active' },
  { label: '暂停', value: 'paused' },
  { label: '已完成', value: 'completed' },
]

interface ProjectFormState {
  title: string
  description: string
  type: ProjectType
  source_work: string
  status: ProjectStatus
}

const defaultFormState: ProjectFormState = {
  title: '',
  description: '',
  type: 'original',
  source_work: '',
  status: 'draft',
}

function buildPayload(form: ProjectFormState): ProjectPayload {
  return {
    title: form.title.trim(),
    description: form.description.trim() || null,
    type: form.type,
    source_work: form.source_work.trim() || null,
    status: form.status,
  }
}

function getInitialFormState(project?: Project | null): ProjectFormState {
  if (!project) {
    return defaultFormState
  }

  return {
    title: project.title,
    description: project.description ?? '',
    type: (project.type as ProjectType) ?? 'original',
    source_work: project.source_work ?? '',
    status: (project.status as ProjectStatus) ?? 'draft',
  }
}

export function DashboardPage() {
  const navigate = useNavigate()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [createForm, setCreateForm] = useState<ProjectFormState>(defaultFormState)
  const [editForm, setEditForm] = useState<ProjectFormState>(defaultFormState)

  const projectsQuery = useQuery<Project[], Error>({
    queryKey: ['projects'],
    queryFn: listProjects,
  })

  const projectStats = useMemo(() => {
    const projects = projectsQuery.data ?? []

    return {
      total: projects.length,
      draft: projects.filter((project: Project) => project.status === 'draft').length,
      active: projects.filter((project: Project) => project.status === 'active').length,
      completed: projects.filter((project: Project) => project.status === 'completed').length,
    }
  }, [projectsQuery.data])

  const createProjectMutation = useMutation({
    mutationFn: createProject,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
      setIsCreateOpen(false)
      setCreateForm(defaultFormState)
      toast.success('项目已创建')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const updateProjectMutation = useMutation({
    mutationFn: ({ projectId, payload }: { projectId: string; payload: Partial<ProjectPayload> }) =>
      updateProject(projectId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
      setEditingProject(null)
      setEditForm(defaultFormState)
      toast.success('项目信息已更新')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const deleteProjectMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast.success('项目已删除')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const payload = buildPayload(createForm)
    if (!payload.title) {
      toast.error('请输入项目标题')
      return
    }

    createProjectMutation.mutate(payload)
  }

  function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!editingProject) {
      return
    }

    const payload = buildPayload(editForm)
    if (!payload.title) {
      toast.error('请输入项目标题')
      return
    }

    updateProjectMutation.mutate({
      projectId: editingProject.id,
      payload,
    })
  }

  function handleDelete(project: Project) {
    const confirmed = window.confirm(`确认删除项目“${project.title}”吗？该操作将同时删除关联章节。`)
    if (!confirmed) {
      return
    }

    deleteProjectMutation.mutate(project.id)
  }

  function openEditDialog(project: Project) {
    setEditingProject(project)
    setEditForm(getInitialFormState(project))
  }

  const projects = projectsQuery.data ?? []
  const recentProjects = [...projects]
    .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime())
    .slice(0, 3)

  const recentProjectDetailsQueries = useQueries({
    queries: recentProjects.map((project) => ({
      queryKey: ['project', project.id],
      queryFn: () => getProject(project.id),
      staleTime: 60_000,
      enabled: !projectsQuery.isLoading && !projectsQuery.isError,
    })),
  })

  const recentChapterCards = useMemo(() => {
    return recentProjectDetailsQueries
      .flatMap((query, index) => {
        const project = recentProjects[index]
        const projectDetail = query.data as ProjectDetail | undefined

        if (!project || !projectDetail) {
          return []
        }

        return projectDetail.chapters
          .filter((chapter: Chapter) => Boolean(chapter.updated_at))
          .map((chapter: Chapter) => ({
            project,
            chapter,
          }))
      })
      .sort((left, right) => new Date(right.chapter.updated_at).getTime() - new Date(left.chapter.updated_at).getTime())
      .slice(0, 4)
  }, [recentProjectDetailsQueries, recentProjects])

  const isRecentChaptersLoading = recentProjectDetailsQueries.some((query) => query.isLoading)
  const recentChaptersError = recentProjectDetailsQueries.find((query) => query.isError)?.error

  if (projectsQuery.isLoading) {
    return <LoadingState label="正在加载项目面板..." />
  }

  if (projectsQuery.isError) {
    return (
      <EmptyState
        title="项目数据加载失败"
        description={projectsQuery.error?.message || '请检查后端服务是否已启动。'}
        action={
          <Button variant="outline" onClick={() => projectsQuery.refetch()}>
            重新加载
          </Button>
        }
      />
    )
  }

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-700">
      <section className="grid gap-6 xl:grid-cols-[1.8fr_0.8fr]">
        <Card className="relative overflow-hidden border-white/10 bg-slate-900/40 backdrop-blur-xl shadow-2xl transition-all duration-300 hover:border-white/20">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
          <CardHeader className="relative z-10 gap-1 pb-3">
            <CardTitle className="max-w-3xl text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
              探索故事的无限可能
            </CardTitle>
            <CardDescription className="max-w-2xl text-base leading-relaxed text-slate-400">
              在这里开启你的创作之旅。无论是构建宏大的史诗，还是记录瞬时的灵感，AI 将全程辅助你的笔尖。
            </CardDescription>
          </CardHeader>
          <CardContent className="relative z-10 space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <FeatureEntryCard
                title="长篇创作"
                description="构建卷章，管理世界观。"
                icon={<BookOpen className="size-5 text-emerald-400" />}
                className="hover:bg-emerald-500/5 transition-colors"
              />
              <FeatureEntryCard
                title="短篇速写"
                description="记录灵感，即兴创作。"
                icon={<PenLine className="size-5 text-sky-400" />}
                className="hover:bg-sky-500/5 transition-colors"
              />
              <Card className="group relative border-white/10 bg-white/5 p-5 transition-all hover:border-violet-500/30 hover:bg-violet-500/5">
                <div className="mb-4 flex items-start gap-4">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-2.5 group-hover:scale-110 transition-transform">
                    <Sparkles className="size-5 text-violet-400" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-white">AI 章节续写</div>
                    <p className="text-xs leading-relaxed text-slate-400">智能衔接上下文。</p>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full border-white/10 hover:bg-white/10"
                  onClick={() => navigate('/ai-toolbox?task=continue')}
                >
                  打开工具箱
                </Button>
              </Card>
              <FeatureEntryCard
                title="设定检查"
                description="核对角色与逻辑一致性。"
                icon={<BrainCircuit className="size-5 text-amber-400" />}
                className="hover:bg-amber-500/5 transition-colors"
              />
            </div>
          </CardContent>
          <CardFooter className="relative z-10 flex flex-col items-start gap-4 border-t border-white/5 bg-white/5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-400">
              <span className="inline-flex items-center gap-2 px-1">
                <BookOpen className="size-4 text-primary/80" />
                <span className="font-medium text-slate-200">{projectStats.total}</span> 个作品
              </span>
              <span className="inline-flex items-center gap-2 px-1">
                <PenSquare className="size-4 text-primary/80" />
                <span className="font-medium text-slate-200">{projectStats.active}</span> 进行中
              </span>
            </div>
            <ProjectDialog
              open={isCreateOpen}
              onOpenChange={(open) => {
                setIsCreateOpen(open)
                if (!open) {
                  setCreateForm(defaultFormState)
                }
              }}
              title="创建新项目"
              description="填写基础信息，开启你的下一个精彩篇章。"
              form={createForm}
              onChange={setCreateForm}
              onSubmit={handleCreateSubmit}
              pending={createProjectMutation.isPending}
              trigger={
                <Button className="shadow-lg shadow-primary/20">
                  <Plus className="size-4 mr-2" />
                  开始新创作
                </Button>
              }
              submitLabel="创建项目"
            />
          </CardFooter>
        </Card>


        <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
          <StatCard label="草稿项目" value={projectStats.draft} hint="等待补全设定与结构" />
          <StatCard label="进行中" value={projectStats.active} hint="适合立即继续写作" />
          <StatCard label="已完成" value={projectStats.completed} hint="可扩展番外或重修" />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="grid gap-4">
          <Card className="border border-white/10 bg-white/6 shadow-lg shadow-black/5">
            <CardHeader>
              <CardTitle className="text-xl text-white">最近继续写作</CardTitle>
              <CardDescription>按最后更新时间排序，优先把你带回最近正在推进的项目。</CardDescription>
            </CardHeader>
          <CardContent className="space-y-4">
            {recentProjects.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-slate-500">
                还没有最近作品记录。开启你的第一个精彩故事吧。
              </div>
            ) : (
              <div className="grid gap-4">
                {recentProjects.map((project) => (
                  <Card
                    key={project.id}
                    className="group relative flex flex-col gap-4 border-white/5 bg-white/5 p-5 transition-all hover:border-white/10 hover:bg-white/8 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="relative z-10 space-y-2.5">
                      <div className="flex flex-wrap items-center gap-3 text-[10px] font-medium uppercase tracking-wider text-slate-500">
                        <StatusBadge status={project.status} />
                        <Badge variant="outline" className="bg-white/5 text-slate-400 border-white/10">{formatProjectType(project.type)}</Badge>
                        <span className="flex items-center gap-1">
                          <Clock3 className="size-3" />
                          {formatDate(project.updated_at)}
                        </span>
                      </div>
                      <div className="text-lg font-bold tracking-tight text-white group-hover:text-primary transition-colors">{project.title}</div>
                      <p className="line-clamp-2 max-w-xl text-sm leading-relaxed text-slate-400">
                        {project.description?.trim() || '暂无项目简介，建议补充主线设定、风格目标与创作边界。'}
                      </p>
                    </div>
                    <div className="relative z-10 flex shrink-0 items-center gap-3">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-slate-400 hover:text-white"
                        onClick={() => openEditDialog(project)}
                      >
                        编辑
                      </Button>
                      <Link
                        to={`/projects/${project.id}`}
                        className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                      >
                        继续写作
                      </Link>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
          </Card>

          <Card className="border border-white/10 bg-white/6 shadow-lg shadow-black/5">
            <CardHeader>
              <CardTitle className="text-xl text-white">最近编辑章节</CardTitle>
              <CardDescription>直接回到上次推进的章节，减少从项目页重新定位的步骤。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentProjects.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 py-6 text-sm leading-7 text-slate-400">
                  先创建项目和章节，这里会自动整理最近编辑过的章节入口。
                </div>
              ) : recentChaptersError ? (
                <div className="rounded-2xl border border-dashed border-rose-500/30 bg-rose-500/5 px-4 py-6 text-sm leading-7 text-rose-200">
                  最近章节加载失败，请稍后刷新页面后重试。
                </div>
              ) : isRecentChaptersLoading && recentChapterCards.length === 0 ? (
                <LoadingState label="正在整理最近章节..." />
              ) : recentChapterCards.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 py-6 text-sm leading-7 text-slate-400">
                  最近项目里还没有章节记录，可先进入工作台创建章节结构。
                </div>
              ) : (
                recentChapterCards.map(({ project, chapter }) => (
                  <RecentChapterCard key={chapter.id} project={project} chapter={chapter} />
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border border-white/10 bg-white/6 shadow-lg shadow-black/5">
          <CardHeader>
            <CardTitle className="text-xl text-white">AI 工具精选</CardTitle>
            <CardDescription>先把高频工具显式放出来，降低功能发现成本。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <ToolHighlightCard
              title="章节续写"
              description="基于当前正文和指令流式生成后续内容。"
              icon={<Sparkles className="size-4 text-violet-300" />}
            />
            <ToolHighlightCard
              title="对白增强"
              description="后续适合加入对话节奏、人物语气与张力优化。"
              icon={<WandSparkles className="size-4 text-sky-300" />}
            />
            <ToolHighlightCard
              title="冲突检查"
              description="围绕角色设定、时间线和世界观规则做一致性提醒。"
              icon={<Swords className="size-4 text-amber-300" />}
            />
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-slate-200">
              <div className="font-medium text-white">统一入口已升级为任务入口</div>
              <p className="mt-2 leading-6 text-slate-400">
                现在可以直接进入续写、改写与设定检查任务页，按当前创作目标发起 AI 请求。
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  to="/ai-toolbox?task=continue"
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
                >
                  进入续写任务
                </Link>
                <Link
                  to="/ai-toolbox?task=rewrite"
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-white/10 bg-transparent px-4 text-sm font-medium text-white transition hover:bg-white/10"
                >
                  进入改写任务
                </Link>
                <Link
                  to="/ai-toolbox?task=consistency"
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-white/10 bg-transparent px-4 text-sm font-medium text-white transition hover:bg-white/10"
                >
                  进入设定检查
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-white">我的作品</h2>
            <p className="text-sm text-slate-400">保留完整项目管理能力，同时把入口表达从“管理”转向“继续创作”。</p>
          </div>
        </div>

        {projects.length === 0 ? (
          <EmptyState
            title="尚未建立创作档案"
            description="每一个伟大的故事都始于一个简单的念头。现在就创建你的第一个项目吧。"
            action={
              <Button onClick={() => setIsCreateOpen(true)} className="shadow-lg shadow-primary/20">
                <Plus className="size-4 mr-2" />
                创建第一个项目
              </Button>
            }
          />
        ) : (
          <div className="grid gap-6 xl:grid-cols-2">
            {projects.map((project: Project) => (
              <Card key={project.id} className="group overflow-hidden border border-white/10 bg-slate-900/40 backdrop-blur-md transition-all duration-300 hover:border-white/20 hover:shadow-xl hover:shadow-black/20">
                <CardHeader className="gap-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        <StatusBadge status={project.status} />
                        <span className="rounded-full bg-white/5 px-2.5 py-1 text-slate-400 border border-white/5">
                          {formatProjectType(project.type)}
                        </span>
                      </div>
                      <CardTitle className="text-2xl font-bold tracking-tight text-white group-hover:text-primary transition-colors">{project.title}</CardTitle>
                    </div>
                    <CardAction className="flex gap-2">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="size-9 rounded-xl text-slate-400 hover:bg-white/10 hover:text-white"
                        onClick={() => openEditDialog(project)}
                      >
                        <PenSquare className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-9 rounded-xl text-slate-500 hover:bg-rose-500/10 hover:text-rose-400"
                        onClick={() => handleDelete(project)}
                        disabled={deleteProjectMutation.isPending}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </CardAction>
                  </div>
                  <CardDescription className="line-clamp-2 text-sm leading-relaxed text-slate-400">
                    {project.description?.trim() || '暂无项目简介，建议补充主线设定、风格目标与创作边界。'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 py-2 sm:grid-cols-2">
                  <InfoBlock label="来源作品" value={project.source_work || '原创作品'} />
                  <InfoBlock label="模型配置" value={project.default_model_id || '使用全局默认'} />
                </CardContent>
                <CardFooter className="mt-4 flex items-center justify-between border-t border-white/5 bg-white/5 py-4">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Clock3 className="size-3.5" />
                    <span>更新于 {formatDate(project.updated_at)}</span>
                  </div>
                  <Link
                    to={`/projects/${project.id}`}
                    className="inline-flex h-9 items-center justify-center rounded-xl bg-white/5 px-4 text-sm font-bold text-white transition-all hover:bg-primary hover:text-primary-foreground hover:shadow-lg hover:shadow-primary/20"
                  >
                    进入工作台
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </section>

      <ProjectDialog
        open={Boolean(editingProject)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingProject(null)
            setEditForm(defaultFormState)
          }
        }}
        title="编辑项目"
        description="调整项目基础信息，保持项目列表与后续工作台上下文一致。"
        form={editForm}
        onChange={setEditForm}
        onSubmit={handleEditSubmit}
        pending={updateProjectMutation.isPending}
        submitLabel="保存修改"
      />
    </div>
  )
}

function FeatureEntryCard({ 
  title, 
  description, 
  icon, 
  className 
}: { 
  title: string; 
  description: string; 
  icon: ReactNode;
  className?: string;
}) {
  return (
    <Card className={clsx(
      "group border-white/10 bg-white/5 p-5 transition-all hover:border-white/20",
      className
    )}>
      <div className="mb-4 inline-flex rounded-xl border border-white/10 bg-white/5 p-2.5 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <div className="space-y-1.5">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="text-xs leading-relaxed text-slate-400">{description}</p>
      </div>
    </Card>
  )
}

function ToolHighlightCard({ title, description, icon }: { title: string; description: string; icon: ReactNode }) {
  return (
    <Card className="group border-white/5 bg-white/5 p-4 transition-all hover:border-white/10 hover:bg-white/8">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
        <div className="rounded-lg bg-white/5 p-1.5 group-hover:bg-primary/10 transition-colors">
          {icon}
        </div>
        {title}
      </div>
      <p className="text-xs leading-relaxed text-slate-400">{description}</p>
    </Card>
  )
}

function StatCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <Card className="group border border-white/10 bg-white/5 transition-all hover:border-white/20 hover:bg-white/8">
      <CardContent className="space-y-1 py-5">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
        <div className="flex items-baseline gap-2">
          <p className="text-3xl font-bold tracking-tight text-white group-hover:text-primary transition-colors">{value}</p>
          <span className="text-xs text-slate-600">个</span>
        </div>
        <p className="text-[10px] leading-relaxed text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">{hint}</p>
      </CardContent>
    </Card>
  )
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-white/5 bg-white/5 p-3 transition-colors group-hover:bg-white/10">
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">{label}</p>
      <p className="mt-1.5 line-clamp-1 text-sm font-medium text-slate-300">{value}</p>
    </Card>
  )
}

function RecentChapterCard({ project, chapter }: { project: Project; chapter: Chapter }) {
  const chapterSummary =
    chapter.summary?.trim() || chapter.notes?.trim() || '暂无章节摘要。'

  return (
    <Card className="group relative border-white/5 bg-white/5 p-5 transition-all hover:border-white/10 hover:bg-white/8">
      <div className="flex flex-wrap items-center gap-3 text-[10px] font-medium uppercase tracking-wider text-slate-500">
        <StatusBadge status={project.status} />
        <Badge variant="outline" className="bg-white/5 text-slate-400 border-white/10">{project.title}</Badge>
        <span className="flex items-center gap-1">
          <Clock3 className="size-3" />
          {formatDate(chapter.updated_at)}
        </span>
      </div>

      <div className="mt-4 flex items-start justify-between gap-6">
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 gap-1.5 px-2.5 py-1 text-[11px] font-bold">
              <FileText className="size-3.5" />
              第 {chapter.order_index} 章
            </Badge>
            <Badge variant="outline" className="bg-white/5 text-slate-400 border-white/10 gap-1.5 px-2.5 py-1 text-[11px] font-medium">
              <Sparkles className="size-3.5 text-slate-500" />
              {chapter.word_count} 字
            </Badge>
          </div>
          <h3 className="text-base font-bold text-white group-hover:text-primary transition-colors">{chapter.title}</h3>
          <p className="line-clamp-2 text-sm leading-relaxed text-slate-400">{chapterSummary}</p>
        </div>

        <div className="flex shrink-0 flex-col gap-2">
          <Link
            to={`/projects/${project.id}/editor/${chapter.id}`}
            className="inline-flex h-9 items-center justify-center rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground shadow-lg shadow-primary/10 transition-all hover:scale-[1.05] active:scale-[0.95]"
          >
            继续编辑
          </Link>
          <Link
            to={`/projects/${project.id}`}
            className="inline-flex h-9 items-center justify-center rounded-xl border border-white/5 bg-white/5 px-4 text-xs font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            工作台
          </Link>
        </div>
      </div>
    </Card>
  )
}

interface ProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  form: ProjectFormState
  onChange: Dispatch<SetStateAction<ProjectFormState>>
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  pending: boolean
  submitLabel: string
  trigger?: ReactNode
}

function ProjectDialog({
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
}: ProjectDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="max-w-2xl border-white/10 bg-slate-950/98">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={onSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-200" htmlFor="project-title">
              项目标题
            </label>
            <Input
              id="project-title"
              value={form.title}
              onChange={(event) => onChange((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="例如：雪夜东京 · 平行世界支线"
              maxLength={200}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200">项目类型</label>
              <Select
                value={form.type}
                onValueChange={(value) => onChange((prev) => ({ ...prev, type: value as ProjectType }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择项目类型" />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200">项目状态</label>
              <Select
                value={form.status}
                onValueChange={(value) => onChange((prev) => ({ ...prev, status: value as ProjectStatus }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择项目状态" />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-200" htmlFor="project-source-work">
              来源作品
            </label>
            <Input
              id="project-source-work"
              value={form.source_work}
              onChange={(event) => onChange((prev) => ({ ...prev, source_work: event.target.value }))}
              placeholder="同人项目可填写原作名称，原创项目可留空"
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-200" htmlFor="project-description">
              项目简介
            </label>
            <Textarea
              id="project-description"
              value={form.description}
              onChange={(event) => onChange((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="记录题材、主线冲突、风格目标与创作边界"
              rows={5}
              maxLength={4000}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? '处理中...' : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
