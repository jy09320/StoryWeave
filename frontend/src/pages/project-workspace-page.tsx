import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowUpDown,
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
  updateProjectCharacter,
} from '@/services/projects'
import type {
  Chapter,
  ChapterReorderItem,
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

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{project.title}</h1>
            <StatusBadge status={project.status} />
            <span className="rounded-full border border-border bg-muted/45 px-2.5 py-0.5 text-xs text-muted-foreground">
              {formatProjectType(project.type)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>{chapters.length} 章</span>
            <span>·</span>
            <span>{totalWords} 字</span>
            <span>·</span>
            <span>{projectCharacters.length} 角色</span>
            <span>·</span>
            <span>{worldSetting?.title?.trim() ? '世界观已配置' : '世界观待完善'}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedChapter ? (
            <Link
              to={`/projects/${project.id}/editor/${selectedChapter.id}`}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              <PenSquare className="size-4" />
              继续写
            </Link>
          ) : null}
          <Link
            to={`/projects/${project.id}/world`}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-background px-4 text-sm text-foreground transition hover:bg-muted"
          >
            <Globe2 className="size-4" />
            世界观
          </Link>
          <Link
            to={`/projects/${project.id}/characters`}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-background px-4 text-sm text-foreground transition hover:bg-muted"
          >
            <Users2 className="size-4" />
            角色
          </Link>
          <Button variant="outline" className="h-9 rounded-full px-4" onClick={() => setIsImportDialogOpen(true)}>
            <FileUp className="size-4" />
            导入
          </Button>
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">

        {/* ── Left: Chapter list ── */}
        <section className="rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="font-semibold text-foreground">章节管理</h2>
            <span className="text-sm text-muted-foreground">共 {chapters.length} 章</span>
          </div>

          {chapters.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">还没有章节，在下方创建第一章。</div>
          ) : (
            <div className="divide-y divide-border">
              {chapters.map((chapter, index) => (
                <div key={chapter.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="w-12 shrink-0 text-xs text-muted-foreground">第 {chapter.order_index} 章</span>
                  <StatusBadge status={chapter.status} className="shrink-0 py-0.5 text-[11px]" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">{chapter.title}</div>
                    <div className="text-xs text-muted-foreground">{chapter.word_count} 字 · {formatDate(chapter.updated_at)}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Link
                      to={`/projects/${project.id}/editor/${chapter.id}`}
                      className="inline-flex h-7 items-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition hover:opacity-90"
                    >
                      编辑
                    </Link>
                    <Button
                      type="button" variant="ghost" size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground"
                      disabled={index === 0 || reorderMutation.isPending}
                      onClick={() => moveChapter(chapter, 'up')}
                    >
                      <ArrowUpDown className="size-3.5 rotate-90" />
                    </Button>
                    <Button
                      type="button" variant="ghost" size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground"
                      disabled={index === chapters.length - 1 || reorderMutation.isPending}
                      onClick={() => moveChapter(chapter, 'down')}
                    >
                      <ArrowUpDown className="size-3.5 -rotate-90" />
                    </Button>
                    <Button
                      type="button" variant="ghost" size="sm"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      disabled={deleteChapterMutation.isPending}
                      onClick={() => handleDeleteChapter(chapter)}
                    >
                      <Trash2 className="size-3.5" />
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
                onChange={(e) => setNewChapter({ title: e.target.value })}
                placeholder="新章节标题"
                maxLength={200}
                className="h-9 rounded-full border-border bg-muted/20 px-4 text-sm"
              />
              <Button className="h-9 shrink-0 rounded-full px-4" type="submit" disabled={createChapterMutation.isPending}>
                <FilePlus2 className="size-4" />
                {createChapterMutation.isPending ? '创建中...' : '新建'}
              </Button>
            </form>
          </div>
        </section>

        {/* ── Right sidebar ── */}
        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">

          {/* 热力图 */}
          <div className="rounded-2xl border border-border bg-card px-5 py-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">创作活跃</span>
              <span className="text-xs text-muted-foreground">{activeDays} / 21 天</span>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {activityMap.map((item) => (
                <div key={item.key} title={`${item.label} · ${item.words} 字`} className="space-y-0.5">
                  <div className={[
                    'h-5 rounded border border-border/40 transition',
                    item.count === 0 ? 'bg-muted/35'
                      : item.words > 3000 ? 'bg-emerald-400/80'
                        : item.words > 1000 ? 'bg-emerald-400/55'
                          : 'bg-emerald-400/30',
                  ].join(' ')} />
                  <div className="text-center text-[9px] text-muted-foreground">{item.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 世界观摘要 */}
          <div className="rounded-2xl border border-border bg-card px-5 py-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">世界观</span>
              <Link to={`/projects/${project.id}/world`} className="text-xs text-primary hover:underline">
                编辑
              </Link>
            </div>
            {worldSetting ? (
              <div className="space-y-2 text-xs leading-5 text-muted-foreground">
                <div><span className="font-medium text-foreground">{worldSetting.title || '未命名'}</span></div>
                {worldSetting.overview?.trim() ? <p className="line-clamp-2">{worldSetting.overview.trim()}</p> : null}
                {worldSetting.rules?.trim() ? <p className="line-clamp-2">{worldSetting.rules.trim()}</p> : null}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">尚未配置世界观。</p>
            )}
          </div>

          {/* 角色绑定 */}
          <div className="rounded-2xl border border-border bg-card px-5 py-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">角色 · {projectCharacters.length}</span>
              <Link to={`/projects/${project.id}/characters`} className="text-xs text-primary hover:underline">
                角色库
              </Link>
            </div>

            {projectCharacters.length > 0 ? (
              <div className="mb-3 space-y-1.5">
                {projectCharacters.slice(0, 3).map((item) => (
                  <div key={item.id} className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2">
                    <span className="text-sm font-medium text-foreground">{item.character.name}</span>
                    {item.role_label ? (
                      <span className="text-xs text-muted-foreground">{item.role_label}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {availableCharacters.length > 0 ? (
              <form className="space-y-2" onSubmit={handleAttachCharacter}>
                <select
                  value={characterLinkDraft.characterId}
                  onChange={(e) => setCharacterLinkDraft((prev) => ({ ...prev, characterId: e.target.value }))}
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-primary"
                >
                  <option value="">选择角色绑定</option>
                  {availableCharacters.map((character) => (
                    <option key={character.id} value={character.id}>{character.name}</option>
                  ))}
                </select>
                <Button type="submit" variant="outline" className="h-8 w-full rounded-lg text-xs" disabled={attachCharacterMutation.isPending}>
                  <UserPlus className="size-3.5" />
                  {attachCharacterMutation.isPending ? '绑定中...' : '绑定到项目'}
                </Button>
              </form>
            ) : null}
          </div>

        </aside>
      </div>

      {/* ── Dialogs ── */}
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
                onChange={(e) => setProjectImportDraft((prev) => ({ ...prev, sourceText: e.target.value }))}
                rows={12}
                placeholder="粘贴角色表、项目简介、已有世界观设定或原始素材。"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/85">导入指引（可选）</label>
              <Textarea
                value={projectImportDraft.guidance}
                onChange={(e) => setProjectImportDraft((prev) => ({ ...prev, guidance: e.target.value }))}
                rows={3}
                placeholder="例如：保留已有命名，不覆盖现有角色关系。"
              />
            </div>
            {latestImportResult ? (
              <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-4 text-sm leading-6 text-foreground/85">
                已导入 {latestImportResult.imported_character_count} 个角色，新增 {latestImportResult.created_character_count} 个，
                {latestImportResult.world_setting_updated ? '并同步更新了世界观。' : '未修改当前世界观。'}
              </div>
            ) : null}
            <Separator />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsImportDialogOpen(false)}>关闭</Button>
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
                  onChange={(e) => setCharacterLinkEditDraft((prev) => ({ ...prev, roleLabel: e.target.value }))}
                  placeholder="例如：主角 / 搭档 / 对手 / 导师"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/85">项目内备注</label>
                <Textarea
                  value={characterLinkEditDraft.summary}
                  onChange={(e) => setCharacterLinkEditDraft((prev) => ({ ...prev, summary: e.target.value }))}
                  rows={5}
                  placeholder="补充该角色在当前项目中的关系、冲突、弧线或使用约束"
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setEditingProjectCharacter(null); setCharacterLinkEditDraft(defaultCharacterLinkEditState) }}>
                  取消
                </Button>
                <Button type="submit" disabled={updateProjectCharacterMutation.isPending}>
                  {updateProjectCharacterMutation.isPending ? '保存中...' : '保存'}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
