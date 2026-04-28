import { useMemo, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from 'react'
import { useMutation, useQueries, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Clock3, FileText, Plus, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/empty-state'
import { LoadingState } from '@/components/loading-state'
import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { createProject, deleteProject, getProject, listProjects, updateProject } from '@/services/projects'
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

interface ContinueTarget {
  project: Project
  chapter: Chapter | null
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
      active: projects.filter((project) => project.status === 'active').length,
      completed: projects.filter((project) => project.status === 'completed').length,
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
    const confirmed = window.confirm(`确认删除项目“${project.title}”吗？该操作会同时删除关联章节。`)
    if (!confirmed) {
      return
    }

    deleteProjectMutation.mutate(project.id)
  }

  function openEditDialog(project: Project) {
    setEditingProject(project)
    setEditForm(getInitialFormState(project))
  }

  const projects = useMemo(
    () =>
      [...(projectsQuery.data ?? [])].sort(
        (left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
      ),
    [projectsQuery.data],
  )
  const recentProjects = projects.slice(0, 4)
  const otherProjects = projects.slice(0, 6)

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
      .slice(0, 5)
  }, [recentProjectDetailsQueries, recentProjects])

  const isRecentChaptersLoading = recentProjectDetailsQueries.some((query) => query.isLoading)
  const recentChaptersError = recentProjectDetailsQueries.find((query) => query.isError)?.error

  if (projectsQuery.isLoading) {
    return <LoadingState label="正在加载创作面板..." />
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

  const continueTarget: ContinueTarget | null = recentChapterCards[0]
    ? { project: recentChapterCards[0].project, chapter: recentChapterCards[0].chapter }
    : recentProjects[0]
      ? { project: recentProjects[0], chapter: null }
      : null

  return (
    <div className="space-y-6 pb-10">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="rounded-md border border-border bg-card/95 p-5 shadow-[0_16px_36px_rgba(148,163,184,0.16)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Continue Writing</div>
              {continueTarget ? (
                <>
                  <div className="space-y-2">
                    <div className="text-2xl font-semibold text-foreground">
                      {continueTarget.chapter?.title || continueTarget.project.title}
                    </div>
                    <div className="text-sm text-muted-foreground">{continueTarget.project.title}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <StatusBadge status={continueTarget.project.status} />
                    <Badge variant="outline" className="border-border bg-background text-muted-foreground">
                      {formatProjectType(continueTarget.project.type)}
                    </Badge>
                    {continueTarget.chapter ? <span>第 {continueTarget.chapter.order_index} 章</span> : null}
                    <span>最近更新 {formatDate(continueTarget.chapter?.updated_at || continueTarget.project.updated_at)}</span>
                  </div>
                  <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
                    {continueTarget.chapter?.summary?.trim() ||
                      continueTarget.chapter?.notes?.trim() ||
                      continueTarget.project.description?.trim() ||
                      '从这里回到最近推进的章节，直接进入正文。'}
                  </p>
                </>
              ) : (
                <>
                  <div className="text-2xl font-semibold text-foreground">还没有最近写作记录</div>
                  <p className="max-w-2xl text-sm leading-7 text-muted-foreground">先创建一个项目，再建立第一章。</p>
                </>
              )}
            </div>

            <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto">
              {continueTarget ? (
                <>
                  <Link
                    to={
                      continueTarget.chapter
                        ? `/projects/${continueTarget.project.id}/editor/${continueTarget.chapter.id}`
                        : `/projects/${continueTarget.project.id}`
                    }
                    className="inline-flex h-10 w-full items-center justify-center rounded-md bg-amber-500 px-4 text-sm font-medium text-black transition hover:opacity-90 sm:w-auto"
                  >
                    {continueTarget.chapter ? '继续当前章节' : '进入项目'}
                  </Link>
                  <Link
                    to={`/projects/${continueTarget.project.id}`}
                    className="inline-flex h-10 w-full items-center justify-center rounded-md border border-border bg-background px-4 text-sm text-foreground transition hover:bg-muted sm:w-auto"
                  >
                    打开项目工作台
                  </Link>
                </>
              ) : (
                <Button onClick={() => setIsCreateOpen(true)}>
                  <Plus className="mr-2 size-4" />
                  创建项目
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-3">
          <MetricPanel label="项目总数" value={projectStats.total} />
          <MetricPanel label="进行中" value={projectStats.active} />
          <MetricPanel label="已完成" value={projectStats.completed} />
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center rounded-md border border-dashed border-border bg-muted/35 text-sm text-foreground transition hover:bg-muted"
            onClick={() => setIsCreateOpen(true)}
          >
            <Plus className="mr-2 size-4" />
            新建项目
          </button>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-md border border-border bg-card/95">
          <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
            <div className="text-sm font-medium text-foreground">其他项目</div>
          </div>

          {projects.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="尚未建立创作档案"
                description="先创建第一个项目。"
                action={
                  <Button onClick={() => setIsCreateOpen(true)}>
                    <Plus className="mr-2 size-4" />
                    创建第一个项目
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="divide-y divide-border/70">
              {otherProjects.map((project) => (
                <div key={project.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-base font-medium text-foreground">{project.title}</div>
                      <StatusBadge status={project.status} />
                      <Badge variant="outline" className="border-border bg-background text-muted-foreground">
                        {formatProjectType(project.type)}
                      </Badge>
                    </div>
                    <div className="line-clamp-2 text-sm leading-6 text-muted-foreground">
                      {project.description?.trim() || '暂无项目简介'}
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      <span>更新时间 {formatDate(project.updated_at)}</span>
                      <span>{project.source_work || '原创项目'}</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <Button variant="ghost" size="sm" onClick={() => openEditDialog(project)}>
                      编辑
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(project)} disabled={deleteProjectMutation.isPending}>
                      删除
                    </Button>
                    <Link
                      to={`/projects/${project.id}`}
                      className="inline-flex h-9 w-full items-center justify-center rounded-md bg-muted/45 px-3 text-sm text-foreground transition hover:bg-muted sm:w-auto"
                    >
                      工作台
                    </Link>
                    <Link
                      to={`/projects/${project.id}`}
                      className="inline-flex h-9 w-full items-center justify-center rounded-md bg-amber-500 px-3 text-sm font-medium text-black transition hover:opacity-90 sm:w-auto"
                    >
                      继续写作
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-md border border-border bg-card/95">
            <div className="border-b border-border/70 px-5 py-4">
              <div className="text-sm font-medium text-foreground">待续章节</div>
            </div>
            <div className="space-y-3 p-4">
              {recentProjects.length === 0 ? (
                <SidebarNotice>先创建项目和章节。</SidebarNotice>
              ) : recentChaptersError ? (
                <SidebarNotice>待续章节加载失败，请刷新页面后重试。</SidebarNotice>
              ) : isRecentChaptersLoading && recentChapterCards.length === 0 ? (
                <LoadingState label="正在整理最近章节..." className="py-6" />
              ) : recentChapterCards.length === 0 ? (
                <SidebarNotice>最近项目里还没有章节记录。</SidebarNotice>
              ) : (
                recentChapterCards.map(({ project, chapter }) => (
                  <Link
                    key={chapter.id}
                    to={`/projects/${project.id}/editor/${chapter.id}`}
                    className="block rounded-md border border-border bg-background/90 p-4 transition hover:bg-muted/35"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="border-border bg-background text-muted-foreground">
                        {project.title}
                      </Badge>
                      <span>第 {chapter.order_index} 章</span>
                      <span>{formatDate(chapter.updated_at)}</span>
                    </div>
                    <div className="mt-2 text-sm font-medium text-foreground">{chapter.title}</div>
                    <div className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">
                      {chapter.summary?.trim() || chapter.notes?.trim() || '暂无章节摘要。'}
                    </div>
                    <div className="mt-3 inline-flex items-center gap-1 text-xs text-primary">
                      继续这一章
                      <ArrowRight className="size-3.5" />
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="rounded-md border border-border bg-card/95 p-4">
            <div className="text-sm font-medium text-foreground">接下来做什么</div>
            <div className="mt-4 grid gap-2">
              <QuickActionButton
                label="从最近章节继续写"
                description={
                  continueTarget
                    ? continueTarget.chapter
                      ? `${continueTarget.project.title} / ${continueTarget.chapter.title}`
                      : continueTarget.project.title
                    : '优先回到正文'
                }
                onClick={() =>
                  navigate(
                    continueTarget
                      ? continueTarget.chapter
                        ? `/projects/${continueTarget.project.id}/editor/${continueTarget.chapter.id}`
                        : `/projects/${continueTarget.project.id}`
                      : '/workspace',
                  )
                }
                icon={<Sparkles className="size-4" />}
              />
              <QuickActionButton
                label="整理角色资料"
                description="只在资料缺失时离开编辑器"
                onClick={() => navigate('/characters')}
                icon={<FileText className="size-4" />}
              />
            </div>
          </div>
        </div>
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
        description="调整项目基础信息"
        form={editForm}
        onChange={setEditForm}
        onSubmit={handleEditSubmit}
        pending={updateProjectMutation.isPending}
        submitLabel="保存修改"
      />

      <ProjectDialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open)
          if (!open) {
            setCreateForm(defaultFormState)
          }
        }}
        title="创建新项目"
        description="填写基础信息"
        form={createForm}
        onChange={setCreateForm}
        onSubmit={handleCreateSubmit}
        pending={createProjectMutation.isPending}
        submitLabel="创建项目"
      />
    </div>
  )
}

function MetricPanel({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-md border border-border bg-card/95 px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  )
}

function SidebarNotice({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-dashed border-border bg-muted/35 px-4 py-4 text-sm leading-6 text-muted-foreground">{children}</div>
}

function QuickActionButton({
  label,
  description,
  icon,
  onClick,
}: {
  label: string
  description?: string
  icon: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-12 items-center justify-between rounded-md border border-border bg-background/90 px-3 text-sm text-foreground transition hover:bg-muted"
    >
      <span className="inline-flex min-w-0 items-center gap-2">
        <span className="shrink-0">{icon}</span>
        <span className="min-w-0 text-left">
          <span className="block truncate">{label}</span>
          {description ? <span className="block truncate text-xs text-muted-foreground">{description}</span> : null}
        </span>
      </span>
      <Clock3 className="size-4 shrink-0 text-muted-foreground" />
    </button>
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={onSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground/85" htmlFor="project-title">
              项目标题
            </label>
            <Input
              id="project-title"
              value={form.title}
              onChange={(event) => onChange((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="例如：雪夜东京 / 平行世界支线"
              maxLength={200}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/85">项目类型</label>
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
              <label className="text-sm font-medium text-foreground/85">项目状态</label>
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
            <label className="text-sm font-medium text-foreground/85" htmlFor="project-source-work">
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
            <label className="text-sm font-medium text-foreground/85" htmlFor="project-description">
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
