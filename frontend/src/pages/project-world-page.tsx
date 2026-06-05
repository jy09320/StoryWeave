import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Brain, Sparkle, Users } from '@phosphor-icons/react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/empty-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { readEditorRouteContext } from '@/lib/editor-route-context'
import { queryClient } from '@/lib/query-client'
import { generateProjectDraft, getProject, updateProjectWorldSetting } from '@/services/projects'
import type { ProjectCharacter, ProjectDetail, ProjectDraftResult, WorldSetting, WorldSettingPayload } from '@/types/api'

interface WorldSettingDraftState {
  title: string
  overview: string
  rules: string
  factions: string
  locations: string
  timeline: string
  extra_notes: string
}

const defaultWorldSettingDraft: WorldSettingDraftState = {
  title: '',
  overview: '',
  rules: '',
  factions: '',
  locations: '',
  timeline: '',
  extra_notes: '',
}

function buildWorldSettingDraft(worldSetting: WorldSetting | null | undefined): WorldSettingDraftState {
  if (!worldSetting) {
    return defaultWorldSettingDraft
  }

  return {
    title: worldSetting.title ?? '',
    overview: worldSetting.overview ?? '',
    rules: worldSetting.rules ?? '',
    factions: worldSetting.factions ?? '',
    locations: worldSetting.locations ?? '',
    timeline: worldSetting.timeline ?? '',
    extra_notes: worldSetting.extra_notes ?? '',
  }
}

export function ProjectWorldPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [draft, setDraft] = useState<WorldSettingDraftState>(defaultWorldSettingDraft)
  const [aiDraft, setAiDraft] = useState<ProjectDraftResult | null>(null)

  const projectQuery = useQuery<ProjectDetail, Error>({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId ?? ''),
    enabled: Boolean(projectId),
  })

  const project = projectQuery.data
  const worldSetting = project?.world_setting ?? null
  const projectCharacters = useMemo(() => project?.project_characters ?? [], [project?.project_characters])
  const editorRouteContext = useMemo(() => readEditorRouteContext(), [])
  const returnToEditor = editorRouteContext && editorRouteContext.projectId === projectId ? editorRouteContext : null

  useEffect(() => {
    if (projectQuery.data) {
      setDraft(buildWorldSettingDraft(projectQuery.data.world_setting))
    }
  }, [projectQuery.data])

  const updateWorldSettingMutation = useMutation({
    mutationFn: (payload: WorldSettingPayload) => updateProjectWorldSetting(projectId ?? '', payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      toast.success('世界观设定已保存')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const generateDraftMutation = useMutation({
    mutationFn: generateProjectDraft,
    onSuccess: (result) => {
      setAiDraft(result)
      toast.success('AI 世界观草案已生成')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const title = draft.title.trim()
    if (!title) {
      toast.error('请先填写世界观标题')
      return
    }

    updateWorldSettingMutation.mutate({
      title,
      overview: draft.overview.trim() || null,
      rules: draft.rules.trim() || null,
      factions: draft.factions.trim() || null,
      locations: draft.locations.trim() || null,
      timeline: draft.timeline.trim() || null,
      extra_notes: draft.extra_notes.trim() || null,
    })
  }

  function handleGenerateAIDraft() {
    if (!project) {
      return
    }

    generateDraftMutation.mutate({
      title: project.title,
      description: project.description,
      type: project.type as any,
      source_work: project.source_work,
      channel: project.channel,
      genres: project.genres,
      tropes: project.tropes,
      premise: project.premise,
    })
  }

  function handleApplyAIDraft() {
    if (!aiDraft) {
      return
    }

    setDraft((prev) => ({
      ...prev,
      title: aiDraft.world_setting_title,
      overview: aiDraft.world_setting_overview,
      rules: aiDraft.world_setting_rules ?? prev.rules,
      factions: aiDraft.world_setting_factions ?? prev.factions,
      locations: aiDraft.world_setting_locations ?? prev.locations,
      timeline: aiDraft.world_setting_timeline ?? prev.timeline,
      extra_notes: aiDraft.notes.length > 0 ? aiDraft.notes.join('\n') : prev.extra_notes,
    }))
    toast.success('AI 草案已回填到编辑区，记得保存')
  }

  if (!projectId) {
    return (
      <EmptyState
        title="项目标识缺失"
        description="当前路由中没有有效的项目 ID，无法加载世界观设定。"
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
    return <LoadingState label="正在加载项目世界观..." />
  }

  if (projectQuery.isError || !project) {
    return (
      <EmptyState
        title="世界观设定加载失败"
        description={projectQuery.error?.message || '未能读取当前项目，请稍后重试。'}
        action={
          <Button variant="outline" onClick={() => projectQuery.refetch()}>
            重新加载
          </Button>
        }
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to={returnToEditor ? `/projects/${returnToEditor.projectId}/editor/${returnToEditor.chapterId}` : `/projects/${project.id}`}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-muted"
        >
          <ArrowLeft className="size-4" />
          {returnToEditor ? '返回当前章节' : '返回工作台'}
        </Link>
        <Link
          to={`/ai-toolbox?task=consistency&projectId=${project.id}${returnToEditor ? `&chapterId=${returnToEditor.chapterId}` : ''}`}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-primary/20 bg-primary/10 px-3 text-sm font-medium text-primary transition hover:bg-primary/15"
        >
          <Sparkle className="size-4" />
          设定巡检模板
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-6">
          <Card className="border border-border bg-card/95">
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-lg text-foreground">{worldSetting ? '编辑世界观设定' : '创建世界观设定'}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    保留手工编辑，同时支持基于当前项目标签即时生成结构化世界观草案。
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {aiDraft ? (
                    <Button type="button" variant="outline" onClick={() => setAiDraft(null)}>
                      清空草案
                    </Button>
                  ) : null}
                  <Button type="button" variant="outline" onClick={handleGenerateAIDraft} disabled={generateDraftMutation.isPending}>
                    <Sparkle className="mr-2 size-4" />
                    {generateDraftMutation.isPending ? '生成中...' : 'AI 生成草案'}
                  </Button>
                  <Button type="button" onClick={handleApplyAIDraft} disabled={!aiDraft}>
                    应用到编辑区
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {aiDraft ? (
                <div className="rounded-xl border border-border bg-background px-4 py-4">
                  <div className="text-sm font-medium text-foreground">{aiDraft.world_setting_title}</div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{aiDraft.world_setting_overview}</p>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <AIDraftInfo label="核心规则" value={aiDraft.world_setting_rules} />
                    <AIDraftInfo label="主要势力" value={aiDraft.world_setting_factions} />
                    <AIDraftInfo label="关键地点" value={aiDraft.world_setting_locations} />
                    <AIDraftInfo label="时间线" value={aiDraft.world_setting_timeline} />
                  </div>
                </div>
              ) : null}

              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground/85">标题</label>
                  <Input
                    value={draft.title}
                    onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder="例如：蒸汽帝国边境纪元"
                    maxLength={200}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground/85">世界概览</label>
                  <Textarea
                    value={draft.overview}
                    onChange={(event) => setDraft((prev) => ({ ...prev, overview: event.target.value }))}
                    rows={4}
                    placeholder="概括时代背景、主线矛盾、社会气质和叙事氛围。"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground/85">核心规则</label>
                  <Textarea
                    value={draft.rules}
                    onChange={(event) => setDraft((prev) => ({ ...prev, rules: event.target.value }))}
                    rows={4}
                    placeholder="例如：力量来源、科技或魔法边界、制度限制和越界代价。"
                  />
                </div>

                <Separator className="bg-border" />

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground/85">势力摘要</label>
                  <Textarea
                    value={draft.factions}
                    onChange={(event) => setDraft((prev) => ({ ...prev, factions: event.target.value }))}
                    rows={3}
                    placeholder="记录主要阵营、利益冲突和联盟关系。"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground/85">关键地点</label>
                  <Textarea
                    value={draft.locations}
                    onChange={(event) => setDraft((prev) => ({ ...prev, locations: event.target.value }))}
                    rows={3}
                    placeholder="记录重要城市、区域、据点和空间层级。"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground/85">时间线摘要</label>
                  <Textarea
                    value={draft.timeline}
                    onChange={(event) => setDraft((prev) => ({ ...prev, timeline: event.target.value }))}
                    rows={3}
                    placeholder="列出关键历史节点、当前时间位置和未公开前史。"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground/85">补充备注</label>
                  <Textarea
                    value={draft.extra_notes}
                    onChange={(event) => setDraft((prev) => ({ ...prev, extra_notes: event.target.value }))}
                    rows={4}
                    placeholder="记录尚未结构化但需要长期保留的设定碎片、约束和创作边界。"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button type="submit" disabled={updateWorldSettingMutation.isPending}>
                    <Brain className="size-4" />
                    {updateWorldSettingMutation.isPending ? '保存中...' : worldSetting ? '保存世界观修改' : '创建世界观'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDraft(buildWorldSettingDraft(worldSetting))}
                    disabled={updateWorldSettingMutation.isPending}
                  >
                    重置
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="border border-border bg-card/95">
            <CardHeader>
              <CardTitle className="text-lg text-foreground">当前摘要</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <SummaryBlock label="标题" value={worldSetting?.title || '尚未设置'} />
              <SummaryBlock label="概览" value={worldSetting?.overview?.trim() || '尚未填写世界观概览'} />
              <SummaryBlock label="规则" value={worldSetting?.rules?.trim() || '尚未填写世界规则'} />
              <SummaryBlock label="势力" value={worldSetting?.factions?.trim() || '尚未填写势力摘要'} />
              <SummaryBlock label="地点" value={worldSetting?.locations?.trim() || '尚未填写关键地点'} />
              <SummaryBlock label="时间线" value={worldSetting?.timeline?.trim() || '尚未填写时间线'} />
            </CardContent>
          </Card>

          <Card className="border border-border bg-card/95">
            <CardHeader>
              <CardTitle className="text-lg text-foreground">项目角色</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {projectCharacters.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-muted/35 px-4 py-5 text-sm leading-6 text-muted-foreground">
                  当前项目还没有绑定角色。
                </div>
              ) : (
                projectCharacters.map((item) => <ProjectCharacterCard key={item.id} item={item} />)
              )}
            </CardContent>
            <CardFooter className="border-border bg-muted/35">
              <Link
                to={`/projects/${project.id}/characters`}
                className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                <Users className="mr-2 size-4" />
                管理项目角色
              </Link>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  )
}

function AIDraftInfo({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/25 px-3 py-3">
      <div className="text-xs font-medium text-foreground/85">{label}</div>
      <div className="mt-1 text-sm leading-6 text-muted-foreground">{value?.trim() || '本轮草案未生成该字段。'}</div>
    </div>
  )
}

function SummaryBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/35 p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <p className="mt-2 text-sm leading-6 text-foreground">{value}</p>
    </div>
  )
}

function ProjectCharacterCard({ item }: { item: ProjectCharacter }) {
  return (
    <div className="rounded-xl border border-border bg-muted/35 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm font-medium text-foreground">{item.character.name}</div>
        {item.role_label ? (
          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{item.role_label}</span>
        ) : null}
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {item.summary?.trim() || item.character.description?.trim() || '暂无项目内角色说明。'}
      </p>
    </div>
  )
}
