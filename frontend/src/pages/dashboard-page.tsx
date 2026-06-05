import { useEffect, useMemo, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Sparkle, Trash } from '@phosphor-icons/react'
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
import { formatDate, formatProjectType, parseApiDate } from '@/lib/format'
import {
  formatProjectChannel,
  PROJECT_CHANNEL_OPTIONS,
  PROJECT_GENRE_MAX,
  PROJECT_GENRE_OPTIONS,
  PROJECT_TROPE_MAX,
  PROJECT_TROPE_OPTIONS,
  summarizeProjectProfile,
} from '@/lib/project-profile'
import { queryClient } from '@/lib/query-client'
import { createProject, deleteProject, generateProjectDraft, listProjects, updateProject } from '@/services/projects'
import type { Project, ProjectChannel, ProjectDraftResult, ProjectPayload, ProjectStatus, ProjectType } from '@/types/api'

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

interface ProjectCreateFormState extends ProjectFormState {
  creation_mode: 'blank' | 'ai'
  channel: ProjectChannel | null
  genres: string[]
  tropes: string[]
  premise: string
}

const defaultFormState: ProjectFormState = {
  title: '',
  description: '',
  type: 'original',
  source_work: '',
  status: 'draft',
}

const defaultCreateFormState: ProjectCreateFormState = {
  ...defaultFormState,
  creation_mode: 'ai',
  channel: null,
  genres: [],
  tropes: [],
  premise: '',
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

function buildCreatePayload(
  form: ProjectCreateFormState,
  draft: ProjectDraftResult | null,
  selectedChapters?: string[],
): ProjectPayload {
  const resolvedDraft =
    draft && selectedChapters !== undefined
      ? { ...draft, outline_chapters: selectedChapters }
      : draft
  return {
    ...buildPayload(form),
    channel: form.channel,
    genres: form.genres,
    tropes: form.tropes,
    premise: form.premise.trim() || null,
    ai_draft: form.creation_mode === 'ai' ? resolvedDraft : null,
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

function toggleTagValue(values: string[], value: string, max?: number) {
  if (values.includes(value)) {
    return values.filter((item) => item !== value)
  }

  if (typeof max === 'number' && values.length >= max) {
    return values
  }

  return [...values, value]
}

const HEATMAP_WEEKS = 16
const HEATMAP_DAYS = HEATMAP_WEEKS * 7

function startOfDay(value: Date) {
  const next = new Date(value)
  next.setHours(0, 0, 0, 0)
  return next
}

function getDateKey(value: Date) {
  return value.toISOString().slice(0, 10)
}

function buildHeatmapDays(projects: Project[]) {
  const today = startOfDay(new Date())
  const start = new Date(today)
  start.setDate(today.getDate() - (HEATMAP_DAYS - 1))

  const counts = new Map<string, number>()

  for (const project of projects) {
    const updatedAt = startOfDay(parseApiDate(project.updated_at))
    if (updatedAt < start || updatedAt > today) {
      continue
    }

    const key = getDateKey(updatedAt)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return Array.from({ length: HEATMAP_DAYS }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    const key = getDateKey(date)
    const count = counts.get(key) ?? 0

    return {
      key,
      date,
      count,
      level: count >= 4 ? 4 : count >= 3 ? 3 : count >= 2 ? 2 : count >= 1 ? 1 : 0,
    }
  })
}

function getHeatmapCellClassName(level: number) {
  switch (level) {
    case 4:
      return 'bg-emerald-500'
    case 3:
      return 'bg-emerald-400'
    case 2:
      return 'bg-emerald-300'
    case 1:
      return 'bg-emerald-200'
    default:
      return 'bg-muted'
  }
}

function isCreateProjectFormState(form: ProjectFormState): form is ProjectCreateFormState {
  return 'creation_mode' in form && 'channel' in form && 'genres' in form && 'tropes' in form && 'premise' in form
}

export function DashboardPage() {
  const navigate = useNavigate()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [createForm, setCreateForm] = useState<ProjectCreateFormState>(defaultCreateFormState)
  const [editForm, setEditForm] = useState<ProjectFormState>(defaultFormState)
  const [projectDraft, setProjectDraft] = useState<ProjectDraftResult | null>(null)
  const [selectedOutlineChapters, setSelectedOutlineChapters] = useState<string[]>([])

  const projectsQuery = useQuery<Project[], Error>({
    queryKey: ['projects'],
    queryFn: listProjects,
  })

  const createProjectMutation = useMutation({
    mutationFn: createProject,
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
      setIsCreateOpen(false)
      setCreateForm(defaultCreateFormState)
      setProjectDraft(null)
      setSelectedOutlineChapters([])
      toast.success('项目已创建，已生成 AI 起步草案')
      navigate(`/projects/${project.id}`)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const generateDraftMutation = useMutation({
    mutationFn: generateProjectDraft,
    onSuccess: (draft) => {
      setProjectDraft(draft)
      setSelectedOutlineChapters(draft.outline_chapters)
      toast.success('AI 草案已生成')
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

  const projects = useMemo(
    () =>
      [...(projectsQuery.data ?? [])].sort(
        (left, right) => parseApiDate(right.updated_at).getTime() - parseApiDate(left.updated_at).getTime(),
      ),
    [projectsQuery.data],
  )

  const stats = useMemo(
    () => ({
      total: projects.length,
      active: projects.filter((item) => item.status === 'active').length,
      completed: projects.filter((item) => item.status === 'completed').length,
    }),
    [projects],
  )

  const heatmapDays = useMemo(() => buildHeatmapDays(projects), [projects])
  const createSummary = useMemo(
    () =>
      summarizeProjectProfile({
        channel: createForm.channel,
        genres: createForm.genres,
        tropes: createForm.tropes,
        premise: createForm.premise,
      }),
    [createForm.channel, createForm.genres, createForm.premise, createForm.tropes],
  )

  function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const payload = buildCreatePayload(createForm, projectDraft, selectedOutlineChapters)
    if (!payload.title) {
      toast.error('请输入项目标题')
      return
    }

    if (createForm.creation_mode === 'ai' && !projectDraft) {
      toast.error('请先生成 AI 草案')
      return
    }

    createProjectMutation.mutate(payload)
  }

  function handleGenerateDraft() {
    if (!createForm.title.trim()) {
      toast.error('请先填写项目标题')
      return
    }

    generateDraftMutation.mutate({
      title: createForm.title.trim(),
      description: createForm.description.trim() || null,
      type: createForm.type,
      source_work: createForm.source_work.trim() || null,
      channel: createForm.channel,
      genres: createForm.genres,
      tropes: createForm.tropes,
      premise: createForm.premise.trim() || null,
    })
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
    const confirmed = window.confirm(`确认删除项目“${project.title}”吗？该操作不可恢复。`)
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
        description={projectsQuery.error?.message || '请稍后重试。'}
        action={
          <Button variant="outline" onClick={() => projectsQuery.refetch()}>
            重新加载
          </Button>
        }
      />
    )
  }

  const featuredProject = projects[0] ?? null

  return (
    <div className="space-y-6 pb-10">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-xl border border-border bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] transition-all duration-200 hover:-translate-y-px hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="text-[11px] uppercase tracking-[0.22em] text-primary/80">Project Focus</div>
              {featuredProject ? (
                <>
                  <div className="space-y-2">
                    <div className="text-2xl font-semibold text-foreground">{featuredProject.title}</div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <StatusBadge status={featuredProject.status} />
                      <Badge variant="outline" className="border-border bg-background text-muted-foreground">
                        {formatProjectType(featuredProject.type)}
                      </Badge>
                      {featuredProject.channel ? (
                        <Badge variant="outline" className="border-border bg-background text-muted-foreground">
                          {formatProjectChannel(featuredProject.channel)}
                        </Badge>
                      ) : null}
                      {featuredProject.genres.slice(0, 2).map((genre) => (
                        <Badge key={genre} variant="outline" className="border-border bg-background text-muted-foreground">
                          {genre}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
                    {featuredProject.premise?.trim() || featuredProject.description?.trim() || '先从作品定位开始，把题材和核心看点定下来。'}
                  </p>
                </>
              ) : (
                <>
                  <div className="text-2xl font-semibold text-foreground">还没有项目</div>
                  <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
                    先创建一个项目，把频道、题材、标签和一句话故事定下来，再进入章节写作。
                  </p>
                </>
              )}
            </div>

            <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto">
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="mr-2 size-4" />
                创建项目
              </Button>
              {featuredProject ? (
                <Link
                  to={`/projects/${featuredProject.id}`}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm text-foreground transition hover:bg-sidebar"
                >
                  进入项目
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        <RecentActivityHeatmap days={heatmapDays} compact stats={stats} />
      </section>

      <section className="rounded-xl border border-border bg-card shadow-[0_1px_3px_rgba(0,0,0,0.03)] transition-all duration-200 hover:-translate-y-px hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
          <div className="text-sm font-medium text-foreground">项目列表</div>
          <Button variant="outline" size="sm" onClick={() => setIsCreateOpen(true)}>
            <Sparkle className="mr-2 size-4" />
            新建项目
          </Button>
        </div>

        {projects.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="还没有创作项目"
              description="从作品定位开始创建第一个项目。"
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
            {projects.map((project) => (
              <div key={project.id} className="grid gap-4 px-5 py-4 transition-colors hover:bg-muted/40 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="truncate text-base font-medium text-foreground">{project.title}</div>
                    <StatusBadge status={project.status} />
                    <Badge variant="outline" className="border-border bg-background text-muted-foreground">
                      {formatProjectType(project.type)}
                    </Badge>
                    {project.channel ? (
                      <Badge variant="outline" className="border-border bg-background text-muted-foreground">
                        {formatProjectChannel(project.channel)}
                      </Badge>
                    ) : null}
                    {project.genres.slice(0, 3).map((genre) => (
                      <Badge key={genre} variant="outline" className="border-border bg-background text-muted-foreground">
                        {genre}
                      </Badge>
                    ))}
                  </div>
                  <div className="line-clamp-2 text-sm leading-6 text-muted-foreground">
                    {project.premise?.trim() || project.description?.trim() || '暂无项目简介'}
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                    <span>更新于 {formatDate(project.updated_at)}</span>
                    <span>{project.source_work || '原创项目'}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => openEditDialog(project)}>
                    编辑
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(project)} disabled={deleteProjectMutation.isPending}>
                    <Trash className="mr-1 size-4" />
                    删除
                  </Button>
                  <Link
                    to={`/projects/${project.id}`}
                    className="inline-flex h-9 items-center justify-center rounded-lg bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-80"
                  >
                    打开项目
                  </Link>
                </div>
              </div>
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
        description="调整项目基础信息。"
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
            setCreateForm(defaultCreateFormState)
            setProjectDraft(null)
            setSelectedOutlineChapters([])
          }
        }}
        title="创建项目"
        description="先确认基础信息，再用标签引导 AI 生成项目草案。"
        form={createForm}
        onChange={setCreateForm}
        onSubmit={handleCreateSubmit}
        pending={createProjectMutation.isPending}
        submitLabel="创建并进入项目"
        createSummary={createSummary}
        projectDraft={projectDraft}
        generatingDraft={generateDraftMutation.isPending}
        onGenerateDraft={handleGenerateDraft}
        onResetDraft={() => { setProjectDraft(null); setSelectedOutlineChapters([]) }}
        selectedOutlineChapters={selectedOutlineChapters}
        onOutlineChaptersChange={setSelectedOutlineChapters}
      />
    </div>
  )
}

function RecentActivityHeatmap({
  days,
  compact = false,
  stats,
}: {
  days: Array<{ key: string; date: Date; count: number; level: number }>
  compact?: boolean
  stats?: { total: number; active: number; completed: number }
}) {
  const activeDays = days.filter((day) => day.count > 0).length
  const totalUpdates = days.reduce((sum, day) => sum + day.count, 0)
  const columns = Array.from({ length: Math.ceil(days.length / 7) }, (_, columnIndex) =>
    days.slice(columnIndex * 7, columnIndex * 7 + 7),
  )
  const monthLabels = columns.map((column) => column[0]?.date.toLocaleDateString('zh-CN', { month: 'short' }) ?? '')

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] transition-all duration-200 hover:-translate-y-px hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <div className="text-sm font-medium text-foreground">最近活跃热力板</div>
          <div className="text-xs text-muted-foreground">
            {compact ? '右侧展示最近 16 周的更新分布。' : '按项目最近更新时间聚合，观察最近 16 周的创作节奏。'}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span>{activeDays} 天有更新</span>
          <span>{totalUpdates} 次变更</span>
        </div>
      </div>

      {compact && stats ? (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <MiniMetric label="项目" value={stats.total} />
          <MiniMetric label="进行中" value={stats.active} />
          <MiniMetric label="完成" value={stats.completed} />
        </div>
      ) : null}

      <div className="mt-4 overflow-x-auto">
        <div className={compact ? 'min-w-[340px] space-y-2' : 'min-w-[680px] space-y-2'}>
          <div
            className={
              compact
                ? 'grid grid-cols-[repeat(16,minmax(0,1fr))] gap-1 px-5 text-[10px] text-muted-foreground'
                : 'grid grid-cols-[repeat(16,minmax(0,1fr))] gap-1 px-6 text-[10px] text-muted-foreground'
            }
          >
            {monthLabels.map((label, index) => (
              <div key={`${label}-${index}`} className="truncate">
                {index === 0 || label !== monthLabels[index - 1] ? label : ''}
              </div>
            ))}
          </div>

          <div className={compact ? 'grid grid-cols-[14px_minmax(0,1fr)] gap-2' : 'grid grid-cols-[20px_minmax(0,1fr)] gap-3'}>
            <div className="grid grid-rows-7 gap-1 pt-0.5 text-[10px] text-muted-foreground">
              <span>一</span>
              <span />
              <span>三</span>
              <span />
              <span>五</span>
              <span />
              <span>日</span>
            </div>

            <div className="grid grid-cols-[repeat(16,minmax(0,1fr))] gap-1">
              {columns.map((column, columnIndex) => (
                <div key={`column-${columnIndex}`} className="grid grid-rows-7 gap-1">
                  {column.map((day) => (
                    <div
                      key={day.key}
                      className={`${compact ? 'h-3 rounded-[3px]' : 'h-4 rounded-[4px]'} border border-border/40 ${getHeatmapCellClassName(day.level)}`}
                      title={`${day.date.toLocaleDateString('zh-CN')}：${day.count} 次更新`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2 text-[10px] text-muted-foreground">
        <span>低</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <span key={level} className={`h-3 w-3 rounded-[3px] border border-border/40 ${getHeatmapCellClassName(level)}`} />
        ))}
        <span>高</span>
      </div>
    </div>
  )
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/80 bg-sidebar px-3 py-2.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-foreground">{value}</div>
    </div>
  )
}

interface ProjectDialogProps<T extends ProjectFormState> {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  form: T
  onChange: Dispatch<SetStateAction<T>>
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  pending: boolean
  submitLabel: string
  trigger?: ReactNode
  createSummary?: ReturnType<typeof summarizeProjectProfile>
  projectDraft?: ProjectDraftResult | null
  generatingDraft?: boolean
  onGenerateDraft?: () => void
  onResetDraft?: () => void
  selectedOutlineChapters?: string[]
  onOutlineChaptersChange?: (chapters: string[]) => void
}

function ProjectDialog<T extends ProjectFormState>({
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
  createSummary,
  projectDraft = null,
  generatingDraft = false,
  onGenerateDraft,
  onResetDraft,
  selectedOutlineChapters = [],
  onOutlineChaptersChange,
}: ProjectDialogProps<T>) {
  const isCreateFlow = isCreateProjectFormState(form)
  const createForm = isCreateFlow ? (form as ProjectCreateFormState) : null
  const updateCreateForm = onChange as unknown as Dispatch<SetStateAction<ProjectCreateFormState>>
  const [step, setStep] = useState(1)

  useEffect(() => {
    if (!open) {
      setStep(1)
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form className="flex max-h-[82vh] flex-col" onSubmit={onSubmit}>
          <div className="flex-1 space-y-5 overflow-y-auto pr-1">
            {(step === 1 || !isCreateFlow) && (
              <>
                {isCreateFlow ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground/85">创建方式</label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() =>
                          updateCreateForm((prev) => ({
                            ...prev,
                            creation_mode: 'ai',
                          }))
                        }
                        className={[
                          'rounded-xl border px-4 py-4 text-left transition',
                          createForm?.creation_mode === 'ai'
                            ? 'border-primary bg-primary/10'
                            : 'border-border bg-background hover:bg-muted',
                        ].join(' ')}
                      >
                        <div className="text-sm font-medium text-foreground">AI 引导创建</div>
                        <div className="mt-1 text-xs leading-5 text-muted-foreground">先选频道、题材和标签，再生成项目草案。</div>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateCreateForm((prev) => ({
                            ...prev,
                            creation_mode: 'blank',
                          }))
                        }
                        className={[
                          'rounded-xl border px-4 py-4 text-left transition',
                          createForm?.creation_mode === 'blank'
                            ? 'border-primary bg-primary/10'
                            : 'border-border bg-background hover:bg-muted',
                        ].join(' ')}
                      >
                        <div className="text-sm font-medium text-foreground">空白创建</div>
                        <div className="mt-1 text-xs leading-5 text-muted-foreground">只建项目，不自动生成世界观和开篇建议。</div>
                      </button>
                    </div>
                  </div>
                ) : null}

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
                    <Select value={form.type} onValueChange={(value) => onChange((prev) => ({ ...prev, type: value as ProjectType }))}>
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
                    <Select value={form.status} onValueChange={(value) => onChange((prev) => ({ ...prev, status: value as ProjectStatus }))}>
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
              </>
            )}

            {isCreateFlow && step === 2 ? (
              <div className="space-y-5">
                <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground/85">频道</label>
                      <div className="flex flex-wrap gap-2">
                        {PROJECT_CHANNEL_OPTIONS.map((option) => {
                          const active = createForm?.channel === option.value
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() =>
                                updateCreateForm((prev) => ({
                                  ...prev,
                                  channel: prev.channel === option.value ? null : option.value,
                                }))
                              }
                              className={[
                                'inline-flex h-9 items-center rounded-full border px-4 text-sm transition',
                                active
                                  ? 'border-primary bg-primary/10 text-foreground'
                                  : 'border-border bg-background text-muted-foreground hover:bg-muted',
                              ].join(' ')}
                            >
                              {option.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <TagField
                      label="题材"
                      hint={`最多 ${PROJECT_GENRE_MAX} 个`}
                      options={PROJECT_GENRE_OPTIONS}
                      values={createForm?.genres ?? []}
                      max={PROJECT_GENRE_MAX}
                      onToggle={(value) =>
                        updateCreateForm((prev) => ({
                          ...prev,
                          genres: toggleTagValue(prev.genres, value, PROJECT_GENRE_MAX),
                        }))
                      }
                    />

                    <TagField
                      label="风格 / 标签"
                      hint={`最多 ${PROJECT_TROPE_MAX} 个`}
                      options={PROJECT_TROPE_OPTIONS}
                      values={createForm?.tropes ?? []}
                      max={PROJECT_TROPE_MAX}
                      onToggle={(value) =>
                        updateCreateForm((prev) => ({
                          ...prev,
                          tropes: toggleTagValue(prev.tropes, value, PROJECT_TROPE_MAX),
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground/85" htmlFor="project-premise">
                        一句话故事
                      </label>
                      <Textarea
                        id="project-premise"
                        value={createForm?.premise ?? ''}
                        onChange={(event) => updateCreateForm((prev) => ({ ...prev, premise: event.target.value }))}
                        placeholder="主角是谁，面临什么处境，会被什么冲突推着往前走。"
                        rows={6}
                        maxLength={4000}
                      />
                    </div>

                    {createSummary ? (
                      <div className="rounded-xl border border-border bg-muted/20 p-4">
                        <div className="text-sm font-medium text-foreground">当前引导信息</div>
                        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                          <div>频道：{createSummary.channelLabel}</div>
                          <div>题材：{createSummary.genresLabel}</div>
                          <div>标签：{createSummary.tropesLabel}</div>
                          <div>故事：{createSummary.premiseLabel}</div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                {createForm?.creation_mode === 'ai' ? (
                  <div className="space-y-4 rounded-xl border border-border bg-card px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-foreground">AI 项目草案</div>
                        <div className="mt-1 text-xs leading-5 text-muted-foreground">
                          根据当前标签生成项目摘要、世界观起始说明和前 3 章建议。
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {projectDraft ? (
                          <Button type="button" variant="outline" onClick={onResetDraft}>
                            清空草案
                          </Button>
                        ) : null}
                        <Button type="button" onClick={onGenerateDraft} disabled={generatingDraft}>
                          <Sparkle className="mr-2 size-4" />
                          {generatingDraft ? '生成中...' : projectDraft ? '重新生成' : '生成草案'}
                        </Button>
                      </div>
                    </div>

                    {projectDraft ? (
                      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
                        <div className="space-y-4">
                          <section className="rounded-lg border border-border/70 bg-background px-4 py-3">
                            <div className="text-sm font-medium text-foreground">项目摘要</div>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">{projectDraft.summary}</p>
                          </section>
                          <section className="rounded-lg border border-border/70 bg-background px-4 py-3">
                            <div className="text-sm font-medium text-foreground">{projectDraft.world_setting_title}</div>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                              {projectDraft.world_setting_overview}
                            </p>
                          </section>
                          <section className="rounded-lg border border-border/70 bg-background px-4 py-3">
                            <div className="text-sm font-medium text-foreground">结构化设定</div>
                            <div className="mt-3 space-y-3 text-sm text-muted-foreground">
                              <StructuredDraftBlock label="核心规则" value={projectDraft.world_setting_rules} />
                              <StructuredDraftBlock label="主要势力" value={projectDraft.world_setting_factions} />
                              <StructuredDraftBlock label="关键地点" value={projectDraft.world_setting_locations} />
                              <StructuredDraftBlock label="时间线" value={projectDraft.world_setting_timeline} />
                            </div>
                          </section>
                        </div>

                        <div className="space-y-4">
                          <section className="rounded-lg border border-border/70 bg-background px-4 py-3">
                            <div className="flex items-center justify-between">
                              <div className="text-sm font-medium text-foreground">
                                大纲章节
                                <span className="ml-2 text-xs font-normal text-muted-foreground">
                                  已选 {selectedOutlineChapters.length} / {projectDraft.outline_chapters.length} 章
                                </span>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  className="text-xs text-primary underline-offset-2 hover:underline"
                                  onClick={() => onOutlineChaptersChange?.(projectDraft.outline_chapters)}
                                >
                                  全选
                                </button>
                                <button
                                  type="button"
                                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                                  onClick={() => onOutlineChaptersChange?.([])}
                                >
                                  取消全选
                                </button>
                              </div>
                            </div>
                            <div className="mt-3 space-y-1.5">
                              {projectDraft.outline_chapters.map((chapter, index) => {
                                const checked = selectedOutlineChapters.includes(chapter)
                                return (
                                  <div
                                    key={`${chapter}-${index}`}
                                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                                      checked
                                        ? 'border-border/60 bg-background text-foreground'
                                        : 'border-border/30 bg-muted/30 text-muted-foreground line-through'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          onOutlineChaptersChange?.([...selectedOutlineChapters, chapter])
                                        } else {
                                          onOutlineChaptersChange?.(selectedOutlineChapters.filter((c) => c !== chapter))
                                        }
                                      }}
                                      className="h-3.5 w-3.5 shrink-0 accent-primary"
                                    />
                                    <span className="flex-1">{chapter}</span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onOutlineChaptersChange?.(selectedOutlineChapters.filter((c) => c !== chapter))
                                      }
                                      className="shrink-0 text-muted-foreground/50 hover:text-destructive"
                                      aria-label="移除章节"
                                    >
                                      ×
                                    </button>
                                  </div>
                                )
                              })}
                            </div>
                          </section>
                          <section className="rounded-lg border border-border/70 bg-background px-4 py-3">
                            <div className="text-sm font-medium text-foreground">待补充建议</div>
                            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                              {projectDraft.notes.map((note, index) => (
                                <div key={`${note}-${index}`}>{index + 1}. {note}</div>
                              ))}
                            </div>
                          </section>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                        先定好标签，再生成草案。
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            {isCreateFlow && step === 1 ? (
              <Button type="button" onClick={() => setStep(2)} disabled={!form.title.trim()}>
                下一步
              </Button>
            ) : (
              <>
                {isCreateFlow ? (
                  <Button type="button" variant="outline" onClick={() => setStep(1)}>
                    上一步
                  </Button>
                ) : null}
                <Button type="submit" disabled={pending}>
                  {pending ? '处理中...' : submitLabel}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function StructuredDraftBlock({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-foreground/85">{label}</div>
      <div>{value?.trim() || '本轮草案未生成该字段。'}</div>
    </div>
  )
}

function TagField({
  label,
  options,
  values,
  onToggle,
  hint,
  max,
}: {
  label: string
  options: string[]
  values: string[]
  onToggle: (value: string) => void
  hint?: string
  max?: number
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-medium text-foreground/85">{label}</label>
        <span className="text-xs text-muted-foreground">{hint ?? `已选 ${values.length} 项`}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = values.includes(option)
          const disabled = !active && typeof max === 'number' && values.length >= max

          return (
            <button
              key={option}
              type="button"
              onClick={() => {
                if (!disabled) {
                  onToggle(option)
                }
              }}
              disabled={disabled}
              className={[
                'inline-flex h-8 items-center rounded-full border px-3 text-sm transition',
                active
                  ? 'border-primary bg-primary/10 text-foreground'
                  : disabled
                    ? 'cursor-not-allowed border-border bg-muted/50 text-muted-foreground/60'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted',
              ].join(' ')}
            >
              {option}
            </button>
          )
        })}
      </div>
    </div>
  )
}
