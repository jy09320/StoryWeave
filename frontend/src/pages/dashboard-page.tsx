import { useMemo, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { BookOpen, PenSquare, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/empty-state'
import { LoadingState } from '@/components/loading-state'
import { StatusBadge } from '@/components/status-badge'
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
} from '@/services/projects'
import type { Project, ProjectPayload, ProjectStatus, ProjectType } from '@/types/api'

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

  const projects = projectsQuery.data ?? []

  return (
    <div className="space-y-6 pb-8">
      <section className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
        <Card className="border border-white/10 bg-white/6 shadow-2xl shadow-black/10">
          <CardHeader className="gap-3">
            <CardDescription className="text-primary/80">MVP Phase 1 · 项目管理</CardDescription>
            <CardTitle className="text-3xl font-semibold text-white">
              从项目卡片进入你的 AI 写作工作台
            </CardTitle>
            <CardDescription className="max-w-2xl text-sm leading-7 text-slate-300">
              当前优先打通项目创建、章节管理与编辑器工作流。先把项目骨架建立起来，再逐步接入 AI 续写与正式富文本编辑能力。
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-col items-start gap-3 border-white/10 bg-white/4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/10 px-3 py-1">
                <BookOpen className="size-4 text-primary" />
                {projectStats.total} 个项目
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/10 px-3 py-1">
                <PenSquare className="size-4 text-primary" />
                {projectStats.active} 个进行中
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
              description="填写基础信息，快速建立一个可进入章节工作台的写作项目。"
              form={createForm}
              onChange={setCreateForm}
              onSubmit={handleCreateSubmit}
              pending={createProjectMutation.isPending}
              trigger={
                <Button>
                  <Plus className="size-4" />
                  新建项目
                </Button>
              }
              submitLabel="创建项目"
            />
          </CardFooter>
        </Card>

        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
          <StatCard label="草稿项目" value={projectStats.draft} hint="等待继续补全设定" />
          <StatCard label="进行中" value={projectStats.active} hint="适合立即进入工作台" />
          <StatCard label="已完成" value={projectStats.completed} hint="可继续扩展番外章节" />
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-white">项目列表</h2>
            <p className="text-sm text-slate-400">支持项目创建、编辑、删除，并可直接进入项目工作区。</p>
          </div>
        </div>

        {projects.length === 0 ? (
          <EmptyState
            title="还没有写作项目"
            description="先创建第一个项目，随后进入章节工作台开始组织内容。"
            action={
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="size-4" />
                创建第一个项目
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {projects.map((project: Project) => (
              <Card key={project.id} className="border border-white/10 bg-white/6 shadow-lg shadow-black/5">
                <CardHeader className="gap-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <CardTitle className="text-xl text-white">{project.title}</CardTitle>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <StatusBadge status={project.status} />
                        <span className="rounded-full border border-white/10 px-2.5 py-1">
                          {formatProjectType(project.type)}
                        </span>
                        <span>最近更新 {formatDate(project.updated_at)}</span>
                      </div>
                    </div>
                    <CardAction className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEditDialog(project)}>
                        编辑
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(project)}
                        disabled={deleteProjectMutation.isPending}
                      >
                        <Trash2 className="size-4" />
                        删除
                      </Button>
                    </CardAction>
                  </div>
                  <CardDescription className="text-sm leading-7 text-slate-300">
                    {project.description?.trim() || '暂无项目简介，建议补充主线设定、风格目标与创作边界。'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-slate-300">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <InfoBlock label="项目类型" value={formatProjectType(project.type)} />
                    <InfoBlock label="来源作品" value={project.source_work || '未设置'} />
                    <InfoBlock label="默认模型提供商" value={project.default_model_provider || '未设置'} />
                    <InfoBlock label="默认模型" value={project.default_model_id || '未设置'} />
                  </div>
                </CardContent>
                <CardFooter className="justify-between border-white/10 bg-white/4">
                  <span className="text-xs text-slate-400">创建于 {formatDate(project.created_at)}</span>
                  <Link
                    to={`/projects/${project.id}`}
                    className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90"
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

function StatCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <Card className="border border-white/10 bg-white/6">
      <CardContent className="space-y-2 py-5">
        <p className="text-sm text-slate-400">{label}</p>
        <p className="text-3xl font-semibold text-white">{value}</p>
        <p className="text-xs text-slate-500">{hint}</p>
      </CardContent>
    </Card>
  )
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm text-slate-200">{value}</p>
    </div>
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
