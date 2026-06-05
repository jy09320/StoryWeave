import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, CaretDown, CaretRight, ArrowSquareOut, Spinner } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { clsx } from 'clsx'

import { EmptyState } from '@/components/empty-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/format'
import { getProject, listProjects } from '@/services/projects'
import type { ChapterStatus, Project, ProjectDetail } from '@/types/api'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const chapterStatusLabel: Record<ChapterStatus, string> = {
  draft: '草稿',
  writing: '写作中',
  review: '审阅',
  done: '已完成',
}

const chapterStatusStyle: Record<ChapterStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  writing: 'bg-sky-100 text-sky-600',
  review: 'bg-amber-100 text-amber-600',
  done: 'bg-emerald-100 text-emerald-600',
}

const projectStatusLabel: Record<string, string> = {
  draft: '草稿',
  writing: '写作中',
  review: '审阅中',
  done: '已完成',
  archived: '已归档',
}

const projectStatusStyle: Record<string, string> = {
  draft: 'text-muted-foreground',
  writing: 'text-sky-500',
  review: 'text-amber-500',
  done: 'text-emerald-500',
  archived: 'text-muted-foreground/50',
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProjectChapters({ projectId }: { projectId: string }) {
  const detailQuery = useQuery<ProjectDetail, Error>({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId),
    staleTime: 30_000,
  })

  if (detailQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 px-10 py-4 text-xs text-muted-foreground">
        <Spinner className="size-3 animate-spin" />
        加载章节中…
      </div>
    )
  }

  if (detailQuery.isError) {
    return (
      <div className="px-10 py-4 text-xs text-rose-500">
        加载失败：{detailQuery.error?.message || '未知错误'}
      </div>
    )
  }

  const chapters = [...(detailQuery.data?.chapters ?? [])].sort((a, b) => a.order_index - b.order_index)

  if (chapters.length === 0) {
    return (
      <div className="px-10 py-4 text-xs text-muted-foreground/60">
        暂无章节，去编辑器中创建吧
      </div>
    )
  }

  return (
    <div className="relative ml-10 border-l border-border/50">
      {chapters.map((chapter, i) => {
        const status = chapter.status as ChapterStatus
        const isLast = i === chapters.length - 1
        return (
          <div
            key={chapter.id}
            className={clsx(
              'group relative flex items-start gap-3 py-2.5 pl-5 pr-4 transition-colors hover:bg-muted/30',
              isLast ? 'pb-4' : '',
            )}
          >
            {/* Timeline dot */}
            <span className="absolute -left-1.5 top-4 size-2.5 rounded-full border-2 border-background bg-border group-hover:bg-primary/40 transition-colors" />

            {/* Chapter number */}
            <span className="mt-0.5 w-5 shrink-0 text-right text-[11px] font-mono text-muted-foreground/40">
              {chapter.order_index}
            </span>

            {/* Title */}
            <span className="min-w-0 flex-1 text-sm text-foreground/85 leading-snug pt-0.5">
              {chapter.title}
            </span>

            {/* Word count */}
            <span className="shrink-0 text-[11px] text-muted-foreground/50 pt-0.5">
              {(chapter.word_count ?? 0).toLocaleString()} 字
            </span>

            {/* Status badge */}
            <span className={clsx(
              'shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-none mt-0.5',
              chapterStatusStyle[status] ?? 'bg-muted text-muted-foreground',
            )}>
              {chapterStatusLabel[status] ?? status}
            </span>

            {/* Open link */}
            <Link
              to={`/projects/${chapter.project_id}/editor/${chapter.id}`}
              className="shrink-0 flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-muted hover:text-foreground"
              title="打开编辑器"
            >
              <ArrowSquareOut className="size-3" />
            </Link>
          </div>
        )
      })}
    </div>
  )
}

function ProjectRow({
  project,
  index,
  isExpanded,
  onToggle,
}: {
  project: Project
  index: number
  isExpanded: boolean
  onToggle: () => void
}) {
  const status = project.status as string
  const statusColor = projectStatusStyle[status] ?? 'text-muted-foreground'

  const spineColors = [
    'bg-violet-400',
    'bg-sky-400',
    'bg-emerald-400',
    'bg-amber-400',
    'bg-rose-400',
    'bg-indigo-400',
    'bg-teal-400',
  ]
  const spineColor = spineColors[index % spineColors.length]

  return (
    <div className={clsx(
      'rounded-xl border border-border/60 overflow-hidden transition-shadow',
      isExpanded ? 'shadow-sm' : 'hover:shadow-sm',
    )}>
      {/* Row header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-0 text-left group"
      >
        {/* Spine color bar */}
        <span className={clsx('w-1 self-stretch shrink-0 rounded-l-xl transition-all', spineColor, isExpanded ? 'opacity-100' : 'opacity-40 group-hover:opacity-70')} />

        <div className="flex flex-1 items-center gap-3 px-4 py-3.5">
          <BookOpen className={clsx('size-4 shrink-0 transition-colors', isExpanded ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground')} />

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium text-foreground">{project.title}</span>
              {status ? (
                <span className={clsx('text-[11px] shrink-0', statusColor)}>
                  {projectStatusLabel[status] ?? status}
                </span>
              ) : null}
            </div>
            {project.description ? (
              <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground/60">{project.description}</p>
            ) : null}
          </div>

          <span className="shrink-0 text-[11px] text-muted-foreground/40">{formatDate(project.updated_at)}</span>

          {isExpanded ? (
            <CaretDown className="size-3.5 shrink-0 text-muted-foreground transition-transform" />
          ) : (
            <CaretRight className="size-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded chapters */}
      {isExpanded && (
        <div className="border-t border-border/40 bg-muted/20 py-2">
          <ProjectChapters projectId={project.id} />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// StoriesPanel
// ---------------------------------------------------------------------------

export function AssetsStoriesPanel() {
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null)

  const projectsQuery = useQuery<Project[], Error>({
    queryKey: ['projects'],
    queryFn: listProjects,
    staleTime: 30_000,
  })

  if (projectsQuery.isLoading) {
    return <LoadingState label="正在加载项目列表…" />
  }

  if (projectsQuery.isError) {
    return (
      <EmptyState
        title="加载项目失败"
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

  if (projects.length === 0) {
    return (
      <EmptyState
        title="还没有项目"
        description="创建一个项目后，故事资产会按项目分组展示在这里。"
      />
    )
  }

  return (
    <div className="px-8 py-6 pb-12 overflow-auto h-full">
      {/* Header */}
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground tracking-tight">故事</h2>
          <p className="mt-0.5 text-xs text-muted-foreground/60">按项目分组查看所有章节</p>
        </div>
        <span className="text-sm text-muted-foreground/50">{projects.length} 个项目</span>
      </div>

      {/* Project list */}
      <div className="space-y-2">
        {projects.map((project, index) => (
          <ProjectRow
            key={project.id}
            project={project}
            index={index}
            isExpanded={expandedProjectId === project.id}
            onToggle={() =>
              setExpandedProjectId((prev) =>
                prev === project.id ? null : project.id,
              )
            }
          />
        ))}
      </div>
    </div>
  )
}
