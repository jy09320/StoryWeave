import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { FilePlus, FileArrowUp, PencilSimple, Trash, UserPlus } from '@phosphor-icons/react'
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
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { formatDate, formatProjectType, parseApiDate } from '@/lib/format'
import { formatProjectChannel } from '@/lib/project-profile'
import { queryClient } from '@/lib/query-client'
import {
  attachProjectCharacter,
  createChapter,
  deleteChapter,
  getProject,
  importProjectKnowledge,
  listCharacters,
} from '@/services/projects'
import type { Chapter, Character, ProjectDetail, ProjectImportResult } from '@/types/api'

interface ChapterDraftState {
  title: string
}

interface CharacterLinkDraftState {
  characterId: string
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

const defaultProjectImportDraft: ProjectImportDraftState = {
  sourceText: '',
  guidance: '',
}

function getLatestUpdatedChapter(chapters: Chapter[]) {
  if (!chapters.length) {
    return null
  }

  return [...chapters].sort(
    (left, right) => parseApiDate(right.updated_at).getTime() - parseApiDate(left.updated_at).getTime(),
  )[0]
}

export function ProjectWorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [newChapter, setNewChapter] = useState<ChapterDraftState>(defaultChapterDraft)
  const [characterLinkDraft, setCharacterLinkDraft] = useState<CharacterLinkDraftState>(defaultCharacterLinkDraft)
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

  const createChapterMutation = useMutation({
    mutationFn: createChapter,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      setNewChapter(defaultChapterDraft)
      toast.success('章节已创建')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const deleteChapterMutation = useMutation({
    mutationFn: deleteChapter,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      toast.success('章节已删除')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const attachCharacterMutation = useMutation({
    mutationFn: ({ projectId, characterId, roleLabel, summary }: { projectId: string; characterId: string; roleLabel: string; summary: string }) =>
      attachProjectCharacter(projectId, {
        character_id: characterId,
        role_label: roleLabel.trim() || null,
        summary: summary.trim() || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      setCharacterLinkDraft(defaultCharacterLinkDraft)
      toast.success('角色已加入项目')
    },
    onError: (error: Error) => toast.error(error.message),
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
      toast.success('项目资料导入完成')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const project = projectQuery.data ?? null
  const chapters = useMemo(() => project?.chapters ?? [], [project?.chapters])
  const latestChapter = useMemo(() => getLatestUpdatedChapter(chapters), [chapters])
  const projectCharacters = useMemo(() => project?.project_characters ?? [], [project?.project_characters])
  const availableCharacters = useMemo(() => {
    const linkedIds = new Set(projectCharacters.map((item) => item.character_id))
    return (charactersQuery.data ?? []).filter((character) => !linkedIds.has(character.id))
  }, [charactersQuery.data, projectCharacters])

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
    })
  }

  function handleDeleteChapter(chapter: Chapter) {
    const confirmed = window.confirm(`确认删除章节“${chapter.title}”吗？`)
    if (!confirmed) {
      return
    }
    deleteChapterMutation.mutate(chapter.id)
  }

  function handleAttachCharacter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!projectId || !characterLinkDraft.characterId) {
      toast.error('请先选择角色')
      return
    }

    attachCharacterMutation.mutate({
      projectId,
      characterId: characterLinkDraft.characterId,
      roleLabel: characterLinkDraft.roleLabel,
      summary: characterLinkDraft.summary,
    })
  }

  function handleImportProjectKnowledge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!projectImportDraft.sourceText.trim()) {
      toast.error('请先粘贴要导入的内容')
      return
    }

    importProjectKnowledgeMutation.mutate()
  }

  if (!projectId) {
    return (
      <EmptyState
        title="缺少项目标识"
        description="当前路由里没有有效的项目 ID。"
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

  if (projectQuery.isLoading) {
    return <LoadingState label="正在加载项目工作台..." />
  }

  if (projectQuery.isError || !project) {
    return (
      <EmptyState
        title="项目加载失败"
        description={projectQuery.error?.message || '请稍后重试。'}
        action={
          <Button variant="outline" onClick={() => projectQuery.refetch()}>
            重新加载
          </Button>
        }
      />
    )
  }

  const totalWords = chapters.reduce((sum, chapter) => sum + chapter.word_count, 0)

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{project.title}</h1>
            <StatusBadge status={project.status} />
            <Badge variant="outline" className="border-border bg-background text-muted-foreground">
              {formatProjectType(project.type)}
            </Badge>
            {project.channel ? (
              <Badge variant="outline" className="border-border bg-background text-muted-foreground">
                {formatProjectChannel(project.channel)}
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>{chapters.length} 章</span>
            <span>·</span>
            <span>{totalWords} 字</span>
            <span>·</span>
            <span>{projectCharacters.length} 角色</span>
          </div>
          <p className="max-w-4xl text-sm leading-7 text-muted-foreground">
            {project.premise?.trim() || project.description?.trim() || '还没有项目简介，建议先完善作品定位。'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {latestChapter ? (
            <Link
              to={`/projects/${project.id}/editor/${latestChapter.id}`}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-85"
            >
              <PencilSimple className="size-4" />
              继续写作
            </Link>
          ) : null}
          <Link
            to={`/projects/${project.id}/settings`}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm text-foreground transition hover:bg-sidebar"
          >
            项目设定
          </Link>
          <Button variant="outline" className="h-9 rounded-full px-4" onClick={() => setIsImportDialogOpen(true)}>
            <FileArrowUp className="size-4" />
            导入资料
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-xl border border-border bg-card shadow-[0_1px_3px_rgba(0,0,0,0.03)] transition-all duration-200 hover:-translate-y-px hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="font-semibold text-foreground">章节管理</h2>
            <span className="text-sm text-muted-foreground">共 {chapters.length} 章</span>
          </div>

          {chapters.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">还没有章节，先创建第一章。</div>
          ) : (
            <div className="divide-y divide-border">
              {chapters.map((chapter) => (
                <div key={chapter.id} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/50">
                  <span className="w-14 shrink-0 text-xs text-muted-foreground">第 {chapter.order_index} 章</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">{chapter.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {chapter.word_count} 字 · {formatDate(chapter.updated_at)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      to={`/projects/${project.id}/editor/${chapter.id}`}
                      className="inline-flex h-8 items-center rounded-lg bg-foreground px-3 text-xs font-medium text-background transition hover:opacity-80"
                    >
                      编辑
                    </Link>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-destructive hover:text-destructive"
                      disabled={deleteChapterMutation.isPending}
                      onClick={() => handleDeleteChapter(chapter)}
                    >
                      <Trash className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-border px-5 py-4">
            <form className="flex gap-2" onSubmit={handleCreateChapter}>
              <Input
                value={newChapter.title}
                onChange={(event) => setNewChapter({ title: event.target.value })}
                placeholder="输入新章节标题"
                maxLength={200}
                className="h-9 rounded-full border-border bg-muted/20 px-4 text-sm"
              />
              <Button className="h-9 shrink-0 rounded-full px-4" type="submit" disabled={createChapterMutation.isPending}>
                <FilePlus className="size-4" />
                {createChapterMutation.isPending ? '创建中...' : '新建章节'}
              </Button>
            </form>
          </div>
        </section>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <div className="rounded-xl border border-border bg-card px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)] transition-all duration-200 hover:-translate-y-px hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">项目设定</span>
              <Link to={`/projects/${project.id}/settings`} className="text-xs text-primary hover:underline">
                进入设定
              </Link>
            </div>
            <div className="space-y-3 text-xs leading-5 text-muted-foreground">
              <div>
                <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80">频道</div>
                <div>{formatProjectChannel(project.channel)}</div>
              </div>
              <div>
                <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80">题材</div>
                <div className="flex flex-wrap gap-1.5">
                  {project.genres.length > 0 ? (
                    project.genres.slice(0, 4).map((genre) => (
                      <Badge key={genre} variant="outline" className="border-border bg-background text-[11px] text-muted-foreground">
                        {genre}
                      </Badge>
                    ))
                  ) : (
                    <span>未设置</span>
                  )}
                </div>
              </div>
              <div>
                <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80">风格 / 套路</div>
                <div className="flex flex-wrap gap-1.5">
                  {project.tropes.length > 0 ? (
                    project.tropes.slice(0, 4).map((trope) => (
                      <Badge key={trope} variant="outline" className="border-border bg-background text-[11px] text-muted-foreground">
                        {trope}
                      </Badge>
                    ))
                  ) : (
                    <span>未设置</span>
                  )}
                </div>
              </div>
              <div>
                <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80">一句话故事</div>
                <p>{project.premise?.trim() || '未设置'}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)] transition-all duration-200 hover:-translate-y-px hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">世界观</span>
              <Link to={`/projects/${project.id}/world`} className="text-xs text-primary hover:underline">
                进入维护
              </Link>
            </div>
            {project.world_setting ? (
              <div className="space-y-2 text-xs leading-5 text-muted-foreground">
                <div className="font-medium text-foreground">{project.world_setting.title || '未命名世界观'}</div>
                {project.world_setting.overview?.trim() ? <p className="line-clamp-3">{project.world_setting.overview.trim()}</p> : null}
                {!project.world_setting.overview?.trim() ? <p>还没有世界观概述。</p> : null}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">尚未配置世界观。</p>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)] transition-all duration-200 hover:-translate-y-px hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">角色 · {projectCharacters.length}</span>
              <Link to={`/projects/${project.id}/characters`} className="text-xs text-primary hover:underline">
                打开角色库
              </Link>
            </div>

            {projectCharacters.length > 0 ? (
              <div className="mb-3 space-y-1.5">
                {projectCharacters.slice(0, 4).map((item) => (
                  <div key={item.id} className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2">
                    <span className="text-sm font-medium text-foreground">{item.character.name}</span>
                    {item.role_label ? <span className="text-xs text-muted-foreground">{item.role_label}</span> : null}
                  </div>
                ))}
              </div>
            ) : null}

            {availableCharacters.length > 0 ? (
              <form className="space-y-2" onSubmit={handleAttachCharacter}>
                <select
                  value={characterLinkDraft.characterId}
                  onChange={(event) => setCharacterLinkDraft((prev) => ({ ...prev, characterId: event.target.value }))}
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-primary"
                >
                  <option value="">选择角色绑定到项目</option>
                  {availableCharacters.map((character) => (
                    <option key={character.id} value={character.id}>
                      {character.name}
                    </option>
                  ))}
                </select>
                <Input
                  value={characterLinkDraft.roleLabel}
                  onChange={(event) => setCharacterLinkDraft((prev) => ({ ...prev, roleLabel: event.target.value }))}
                  placeholder="项目内定位，例如主角 / 导师 / 对手"
                />
                <Textarea
                  value={characterLinkDraft.summary}
                  onChange={(event) => setCharacterLinkDraft((prev) => ({ ...prev, summary: event.target.value }))}
                  rows={3}
                  placeholder="补充角色在当前项目里的作用或备注"
                />
                <Button type="submit" variant="outline" className="h-9 w-full" disabled={attachCharacterMutation.isPending}>
                  <UserPlus className="size-4" />
                  {attachCharacterMutation.isPending ? '绑定中...' : '绑定角色'}
                </Button>
              </form>
            ) : (
              <p className="text-xs text-muted-foreground">没有可绑定的新角色了。</p>
            )}
          </div>
        </aside>
      </div>

      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>导入项目资料</DialogTitle>
            <DialogDescription>粘贴已有设定、人物说明或大纲片段，系统会尝试提取角色和世界观信息。</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleImportProjectKnowledge}>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/85">待导入内容</label>
              <Textarea
                value={projectImportDraft.sourceText}
                onChange={(event) => setProjectImportDraft((prev) => ({ ...prev, sourceText: event.target.value }))}
                rows={12}
                placeholder="粘贴角色表、项目简介、已有世界观设定或原始素材"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/85">导入指引（可选）</label>
              <Textarea
                value={projectImportDraft.guidance}
                onChange={(event) => setProjectImportDraft((prev) => ({ ...prev, guidance: event.target.value }))}
                rows={3}
                placeholder="例如：保留已有命名，不覆盖现有角色关系。"
              />
            </div>
            {latestImportResult ? (
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-4 text-sm leading-6 text-foreground/85">
                已导入 {latestImportResult.imported_character_count} 个角色，
                新增 {latestImportResult.created_character_count} 个，
                {latestImportResult.world_setting_updated ? '并同步更新了世界观。' : '未修改当前世界观。'}
              </div>
            ) : null}
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
    </div>
  )
}
