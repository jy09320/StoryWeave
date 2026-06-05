import { useMemo, useState, type FormEvent } from 'react'
import { useScrollReveal, useStaggerReveal } from '@/hooks/use-scroll-reveal'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, PencilSimple, Sparkle } from '@phosphor-icons/react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/empty-state'
import { LoadingState } from '@/components/loading-state'
import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { formatProjectType } from '@/lib/format'
import {
  formatProjectChannel,
  PROJECT_CHANNEL_OPTIONS,
  PROJECT_GENRE_OPTIONS,
  PROJECT_TROPE_OPTIONS,
} from '@/lib/project-profile'
import { queryClient } from '@/lib/query-client'
import {
  createChapter,
  generateProjectDraft,
  getProject,
  updateProject,
  updateProjectWorldSetting,
} from '@/services/projects'
import type {
  ProjectChannel,
  ProjectDetail,
  ProjectDraftResult,
  ProjectPayload,
  ProjectStatus,
  ProjectType,
} from '@/types/api'

interface ProjectSettingsFormState {
  title: string
  description: string
  type: ProjectType
  source_work: string
  status: ProjectStatus
  channel: ProjectChannel | null
  genres: string[]
  tropes: string[]
  premise: string
}

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

function buildFormState(project: ProjectDetail): ProjectSettingsFormState {
  return {
    title: project.title,
    description: project.description ?? '',
    type: (project.type as ProjectType) ?? 'original',
    source_work: project.source_work ?? '',
    status: (project.status as ProjectStatus) ?? 'draft',
    channel: project.channel,
    genres: project.genres ?? [],
    tropes: project.tropes ?? [],
    premise: project.premise ?? '',
  }
}

function buildPayload(form: ProjectSettingsFormState): Partial<ProjectPayload> {
  return {
    title: form.title.trim(),
    description: form.description.trim() || null,
    type: form.type,
    source_work: form.source_work.trim() || null,
    status: form.status,
    channel: form.channel,
    genres: form.genres,
    tropes: form.tropes,
    premise: form.premise.trim() || null,
  }
}

function toggleTagValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

export function ProjectSettingsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState<ProjectSettingsFormState | null>(null)
  const [draft, setDraft] = useState<ProjectDraftResult | null>(null)

  const headerRevealRef = useScrollReveal<HTMLDivElement>()
  const draftSectionRevealRef = useScrollReveal<HTMLElement>()
  const formStaggerRef = useStaggerReveal<HTMLFormElement>()

  const projectQuery = useQuery<ProjectDetail, Error>({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId ?? ''),
    enabled: Boolean(projectId),
  })

  const updateProjectMutation = useMutation({
    mutationFn: ({ projectId, payload }: { projectId: string; payload: Partial<ProjectPayload> }) =>
      updateProject(projectId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
      setIsEditing(false)
      toast.success('项目设定已更新')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const generateDraftMutation = useMutation({
    mutationFn: generateProjectDraft,
    onSuccess: (result) => {
      setDraft(result)
      toast.success('AI 草案已生成')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const applyDraftMutation = useMutation({
    mutationFn: async ({
      project,
      draft,
    }: {
      project: ProjectDetail
      draft: ProjectDraftResult
    }) => {
      await updateProject(project.id, {
        description: draft.summary,
      })

      await updateProjectWorldSetting(project.id, {
        title: draft.world_setting_title,
        overview: draft.world_setting_overview,
        rules: draft.world_setting_rules ?? project.world_setting?.rules ?? null,
        factions: draft.world_setting_factions ?? project.world_setting?.factions ?? null,
        locations: draft.world_setting_locations ?? project.world_setting?.locations ?? null,
        timeline: draft.world_setting_timeline ?? project.world_setting?.timeline ?? null,
        extra_notes: draft.notes.length > 0 ? draft.notes.join('\n') : project.world_setting?.extra_notes ?? null,
      })

      const existingTitles = new Set(project.chapters.map((chapter) => chapter.title.trim()))
      for (const [index, title] of draft.opening_chapters.entries()) {
        const normalized = title.trim()
        if (!normalized || existingTitles.has(normalized)) {
          continue
        }

        await createChapter({
          project_id: project.id,
          title: normalized,
          order_index: project.chapters.length + index + 1,
          notes: `来自 AI 项目草案的开篇建议，第 ${index + 1} 章。`,
        })
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast.success('AI 草案已应用到当前项目')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const project = projectQuery.data ?? null

  const currentForm = useMemo(() => {
    if (form) {
      return form
    }
    if (project) {
      return buildFormState(project)
    }
    return null
  }, [form, project])

  function handleStartEdit() {
    if (!project) {
      return
    }
    setForm(buildFormState(project))
    setIsEditing(true)
  }

  function handleCancelEdit() {
    setForm(project ? buildFormState(project) : null)
    setIsEditing(false)
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!projectId || !currentForm) {
      return
    }

    const payload = buildPayload(currentForm)
    if (!payload.title) {
      toast.error('请输入项目标题')
      return
    }

    updateProjectMutation.mutate({ projectId, payload })
  }

  function handleGenerateDraft() {
    if (!currentForm?.title.trim()) {
      toast.error('请先填写项目标题')
      return
    }

    generateDraftMutation.mutate({
      title: currentForm.title.trim(),
      description: currentForm.description.trim() || null,
      type: currentForm.type,
      source_work: currentForm.source_work.trim() || null,
      channel: currentForm.channel,
      genres: currentForm.genres,
      tropes: currentForm.tropes,
      premise: currentForm.premise.trim() || null,
    })
  }

  function handleApplyDraft() {
    if (!project || !draft) {
      return
    }
    applyDraftMutation.mutate({ project, draft })
  }

  if (!projectId) {
    return (
      <EmptyState
        title="缺少项目标识"
        description="当前路由中没有有效的项目 ID。"
        action={
          <Link
            to="/workspace"
            className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            返回工作台
          </Link>
        }
      />
    )
  }

  if (projectQuery.isLoading || !currentForm) {
    return <LoadingState label="正在加载项目设定..." />
  }

  if (projectQuery.isError || !project) {
    return (
      <EmptyState
        title="项目设定加载失败"
        description={projectQuery.error?.message || '请稍后重试。'}
        action={
          <Button variant="outline" onClick={() => projectQuery.refetch()}>
            重新加载
          </Button>
        }
      />
    )
  }

  return (
    <div className="space-y-6 pb-10">
      <div ref={headerRevealRef} className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Link to={`/projects/${project.id}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" />
            返回项目工作台
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{project.title}</h1>
            <StatusBadge status={project.status} />
            <Badge variant="outline">
              {formatProjectType(project.type)}
            </Badge>
            {project.channel ? (
              <Badge variant="outline">
                {formatProjectChannel(project.channel)}
              </Badge>
            ) : null}
          </div>
          <p className="max-w-4xl text-sm leading-7 text-muted-foreground">
            这里维护作品定位，也可以基于当前标签重新生成 AI 项目草案，再把草案回填到项目里。
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isEditing ? (
            <Button variant="outline" onClick={handleCancelEdit}>
              取消编辑
            </Button>
          ) : (
            <Button onClick={handleStartEdit}>
              <PencilSimple className="mr-2 size-4" />
              编辑设定
            </Button>
          )}
        </div>
      </div>

      <section ref={draftSectionRevealRef} className="rounded-xl border border-border bg-card px-5 py-5 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-px hover:shadow-[0_4px_16px_oklch(0.20_0.025_240/0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">AI 项目草案</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              基于当前项目标签和一句话故事，重新生成摘要、世界观开场与开篇章节建议。
            </p>
          </div>
          <div className="flex items-center gap-2">
            {draft ? (
              <Button type="button" variant="outline" onClick={() => setDraft(null)}>
                清空草案
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={handleGenerateDraft} disabled={generateDraftMutation.isPending}>
              <Sparkle className="mr-2 size-4" />
              {generateDraftMutation.isPending ? '生成中...' : draft ? '重新生成' : '生成草案'}
            </Button>
            <Button type="button" onClick={handleApplyDraft} disabled={!draft || applyDraftMutation.isPending}>
              {applyDraftMutation.isPending ? '应用中...' : '应用到当前项目'}
            </Button>
          </div>
        </div>

        {draft ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-4">
              <section className="rounded-lg border border-border/70 bg-background px-4 py-3">
                <div className="text-sm font-medium text-foreground">项目摘要</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{draft.summary}</p>
              </section>

              <section className="rounded-lg border border-border/70 bg-background px-4 py-3">
                <div className="text-sm font-medium text-foreground">{draft.world_setting_title}</div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                  {draft.world_setting_overview}
                </p>
              </section>
            </div>

            <div className="space-y-4">
              <section className="rounded-lg border border-border/70 bg-background px-4 py-3">
                <div className="text-sm font-medium text-foreground">开篇章节建议</div>
                <div className="mt-3 space-y-2">
                  {draft.opening_chapters.map((chapter, index) => (
                    <div key={`${chapter}-${index}`} className="rounded-md border border-border/60 px-3 py-2 text-sm text-muted-foreground">
                      {index + 1}. {chapter}
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-border/70 bg-background px-4 py-3">
                <div className="text-sm font-medium text-foreground">待补充建议</div>
                <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {draft.notes.map((note, index) => (
                    <div key={`${note}-${index}`}>{index + 1}. {note}</div>
                  ))}
                </div>
              </section>
              <section className="rounded-lg border border-border/70 bg-background px-4 py-3">
                <div className="text-sm font-medium text-foreground">结构化世界观字段</div>
                <div className="mt-3 space-y-3 text-sm text-muted-foreground">
                  <StructuredDraftBlock label="核心规则" value={draft.world_setting_rules} />
                  <StructuredDraftBlock label="主要势力" value={draft.world_setting_factions} />
                  <StructuredDraftBlock label="关键地点" value={draft.world_setting_locations} />
                  <StructuredDraftBlock label="时间线" value={draft.world_setting_timeline} />
                </div>
              </section>
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            生成后会在这里显示草案内容，并可一键应用到当前项目。
          </div>
        )}
      </section>

      <form ref={formStaggerRef} className="space-y-6" onSubmit={handleSave}>
        <section className="rounded-xl border border-border bg-card px-5 py-5 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-px hover:shadow-[0_4px_16px_oklch(0.20_0.025_240/0.06)]">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-foreground">基础信息</h2>
            <p className="mt-1 text-sm text-muted-foreground">维护项目名称、简介和基础属性。</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="项目标题">
              {isEditing ? (
                <Input value={currentForm.title} onChange={(event) => setForm((prev) => ({ ...(prev ?? currentForm), title: event.target.value }))} maxLength={200} />
              ) : (
                <ReadValue value={project.title} />
              )}
            </Field>

            <Field label="项目类型">
              {isEditing ? (
                <Select value={currentForm.type} onValueChange={(value) => setForm((prev) => ({ ...(prev ?? currentForm), type: value as ProjectType }))}>
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
              ) : (
                <ReadValue value={formatProjectType(project.type)} />
              )}
            </Field>

            <Field label="来源作品">
              {isEditing ? (
                <Input value={currentForm.source_work} onChange={(event) => setForm((prev) => ({ ...(prev ?? currentForm), source_work: event.target.value }))} maxLength={200} />
              ) : (
                <ReadValue value={project.source_work || '未设置'} muted={!project.source_work} />
              )}
            </Field>

            <Field label="项目状态">
              {isEditing ? (
                <Select value={currentForm.status} onValueChange={(value) => setForm((prev) => ({ ...(prev ?? currentForm), status: value as ProjectStatus }))}>
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
              ) : (
                <ReadValue value={project.status} />
              )}
            </Field>

            <Field label="项目简介" fullWidth>
              {isEditing ? (
                <Textarea
                  value={currentForm.description}
                  onChange={(event) => setForm((prev) => ({ ...(prev ?? currentForm), description: event.target.value }))}
                  rows={5}
                  maxLength={4000}
                />
              ) : (
                <ReadValue value={project.description || '未设置'} muted={!project.description} multiline />
              )}
            </Field>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card px-5 py-5 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-px hover:shadow-[0_4px_16px_oklch(0.20_0.025_240/0.06)]">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-foreground">创作定位</h2>
            <p className="mt-1 text-sm text-muted-foreground">明确频道、题材和标签，后续 AI 与工作流都围绕这里展开。</p>
          </div>
          <div className="space-y-5">
            <Field label="频道">
              {isEditing ? (
                <div className="flex flex-wrap gap-2">
                  {PROJECT_CHANNEL_OPTIONS.map((option) => {
                    const active = currentForm.channel === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({
                            ...(prev ?? currentForm),
                            channel: (prev ?? currentForm).channel === option.value ? null : option.value,
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
              ) : (
                <ReadValue value={formatProjectChannel(project.channel)} muted={!project.channel} />
              )}
            </Field>

            <TagGroup
              label="题材"
              values={currentForm.genres}
              readonly={!isEditing}
              options={PROJECT_GENRE_OPTIONS}
              onToggle={(value) =>
                setForm((prev) => ({
                  ...(prev ?? currentForm),
                  genres: toggleTagValue((prev ?? currentForm).genres, value),
                }))
              }
            />

            <TagGroup
              label="风格 / 标签"
              values={currentForm.tropes}
              readonly={!isEditing}
              options={PROJECT_TROPE_OPTIONS}
              onToggle={(value) =>
                setForm((prev) => ({
                  ...(prev ?? currentForm),
                  tropes: toggleTagValue((prev ?? currentForm).tropes, value),
                }))
              }
            />
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card px-5 py-5 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-px hover:shadow-[0_4px_16px_oklch(0.20_0.025_240/0.06)]">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-foreground">故事提要</h2>
            <p className="mt-1 text-sm text-muted-foreground">一句话描述这个项目最核心的设定或冲突。</p>
          </div>
          <Field label="一句话故事">
            {isEditing ? (
              <Textarea
                value={currentForm.premise}
                onChange={(event) => setForm((prev) => ({ ...(prev ?? currentForm), premise: event.target.value }))}
                rows={4}
                maxLength={4000}
              />
            ) : (
              <ReadValue value={project.premise || '未设置'} muted={!project.premise} multiline />
            )}
          </Field>
        </section>

        {isEditing ? (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleCancelEdit}>
              取消
            </Button>
            <Button type="submit" disabled={updateProjectMutation.isPending}>
              {updateProjectMutation.isPending ? '保存中...' : '保存设定'}
            </Button>
          </div>
        ) : null}
      </form>
    </div>
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

function Field({
  label,
  children,
  fullWidth = false,
}: {
  label: string
  children: React.ReactNode
  fullWidth?: boolean
}) {
  return (
    <div className={fullWidth ? 'space-y-2 sm:col-span-2' : 'space-y-2'}>
      <label className="text-sm font-medium text-foreground/85">{label}</label>
      {children}
    </div>
  )
}

function ReadValue({
  value,
  muted = false,
  multiline = false,
}: {
  value: string
  muted?: boolean
  multiline?: boolean
}) {
  return (
    <div
      className={
        multiline
          ? `rounded-md border border-border bg-muted/20 px-3 py-3 text-sm leading-6 ${muted ? 'text-muted-foreground' : 'text-foreground'}`
          : `min-h-9 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm ${muted ? 'text-muted-foreground' : 'text-foreground'}`
      }
    >
      {value}
    </div>
  )
}

function TagGroup({
  label,
  values,
  readonly,
  options,
  onToggle,
}: {
  label: string
  values: string[]
  readonly: boolean
  options: string[]
  onToggle: (value: string) => void
}) {
  return (
    <Field label={label}>
      {readonly ? (
        <div className="flex flex-wrap gap-2">
          {values.length > 0 ? (
            values.map((value) => (
              <Badge key={value} variant="outline">
                {value}
              </Badge>
            ))
          ) : (
            <ReadValue value="未设置" muted />
          )}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map((option) => {
            const active = values.includes(option)
            return (
              <button
                key={option}
                type="button"
                onClick={() => onToggle(option)}
                className={[
                  'inline-flex h-8 items-center rounded-full border px-3 text-sm transition',
                  active
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted',
                ].join(' ')}
              >
                {option}
              </button>
            )
          })}
        </div>
      )}
    </Field>
  )
}
