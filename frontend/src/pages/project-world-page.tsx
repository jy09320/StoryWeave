import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, BrainCircuit, Sparkles, Users2 } from 'lucide-react'
import { toast } from 'sonner'

import { type ProjectAssetAIDraftState } from '@/components/project-asset-ai-dialog'
import { ProjectAssetAIPanel } from '@/components/project-asset-ai-panel'
import { EmptyState } from '@/components/empty-state'
import { LoadingState } from '@/components/loading-state'
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
import { Textarea } from '@/components/ui/textarea'
import { readEditorRouteContext } from '@/lib/editor-route-context'
import { formatDate } from '@/lib/format'
import { queryClient } from '@/lib/query-client'
import { getProject, updateProjectWorldSetting } from '@/services/projects'
import {
  analyzeWorldSetting,
  applyWorldSettingPatch,
  uploadProjectAssetFile,
} from '@/services/project-asset-ai'
import type {
  ProjectAssetAIMessage,
  ProjectCharacter,
  ProjectDetail,
  WorldSetting,
  WorldSettingPatch,
  WorldSettingPayload,
} from '@/types/api'

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

const defaultWorldAIDraft: ProjectAssetAIDraftState = {
  mode: 'hybrid',
  sourceText: '',
  command: '',
  guidance: '',
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
  const [worldAIDraft, setWorldAIDraft] = useState<ProjectAssetAIDraftState>(defaultWorldAIDraft)
  const [worldAIMessages, setWorldAIMessages] = useState<ProjectAssetAIMessage[]>([])
  const [latestWorldPatch, setLatestWorldPatch] = useState<WorldSettingPatch | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ file_id: string; filename: string }>>([])
  const [fileIds, setFileIds] = useState<string[]>([])

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

  const analyzeWorldSettingMutation = useMutation({
    mutationFn: () =>
      analyzeWorldSetting(projectId ?? '', {
        message: worldAIDraft.command.trim() || worldAIDraft.sourceText.trim() || '',
        source_text: worldAIDraft.sourceText.trim() || null,
        command: worldAIDraft.command.trim() || null,
        guidance: worldAIDraft.guidance.trim() || null,
        file_ids: fileIds,
      }),
    onSuccess: (result) => {
      setLatestWorldPatch(result.patch)
      setWorldAIMessages((prev) => [
        ...prev,
        {
          id: `world-result-${Date.now()}`,
          role: 'result',
          title: '世界观分析完成',
          content: [
            result.notes.length ? `备注：${result.notes.join('；')}` : '',
            result.applied_sources.length ? `参考来源：${result.applied_sources.join('、')}` : '',
            result.tool_trace.length ? `工具链：${result.tool_trace.join(' → ')}` : '',
          ].filter(Boolean).join('\n'),
        },
      ])
      toast.success('AI 分析完成，请确认后写入世界观')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const applyWorldPatchMutation = useMutation({
    mutationFn: () => applyWorldSettingPatch(projectId ?? '', { patch: latestWorldPatch! }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      setLatestWorldPatch(null)
      setWorldAIMessages((prev) => [
        ...prev,
        {
          id: `world-apply-${Date.now()}`,
          role: 'result',
          title: result.world_setting_updated ? '世界观已写入' : '世界观无需变更',
          content: result.world_setting_updated
            ? '结构化建议已成功写入当前项目世界观。'
            : '当前建议与已有内容一致，无字段发生变更。',
        },
      ])
      toast.success(result.world_setting_updated ? '世界观已更新' : '无需更新')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const uploadFileMutation = useMutation({
    mutationFn: (file: File) => uploadProjectAssetFile(projectId ?? '', file),
    onSuccess: (result) => {
      setUploadedFiles((prev) => [...prev, { file_id: result.file_id, filename: result.filename }])
      setFileIds((prev) => [...prev, result.file_id])
      setWorldAIDraft((prev) => ({
        ...prev,
        sourceText: prev.sourceText
          ? `${prev.sourceText}\n\n${result.preview}`
          : result.preview,
      }))
      toast.success(`已上传：${result.filename}（约 ${result.token_estimate} tokens）`)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  function handleWorldAIAssist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const hasSource = Boolean(worldAIDraft.sourceText.trim()) || fileIds.length > 0
    const hasCommand = Boolean(worldAIDraft.command.trim())

    if (!hasSource && !hasCommand) {
      toast.error('请至少输入资料、上传文件或填写指令')
      return
    }

    setWorldAIMessages([
      {
        id: `world-user-${Date.now()}`,
        role: 'user',
        title: '用户请求',
        content: [
          worldAIDraft.sourceText.trim() ? `资料：\n${worldAIDraft.sourceText.trim()}` : '',
          fileIds.length ? `已上传 ${fileIds.length} 个文件` : '',
          worldAIDraft.command.trim() ? `指令：\n${worldAIDraft.command.trim()}` : '',
          worldAIDraft.guidance.trim() ? `约束：\n${worldAIDraft.guidance.trim()}` : '',
        ].filter(Boolean).join('\n\n'),
      },
      {
        id: `world-system-${Date.now()}`,
        role: 'system',
        title: '正在分析',
        content: '正在读取当前项目世界观、已有角色，结合输入资料生成结构化建议，完成后请点击"应用写入"确认。',
      },
    ])

    analyzeWorldSettingMutation.mutate()
  }

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

  if (!projectId) {
    return (
      <EmptyState
        title="项目标识缺失"
        description="当前路由中没有有效的项目 ID，无法加载世界观设定。"
        action={
          <Link
            to="/"
            className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            返回首页
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
      {/* Top info bar */}
      <Card className="border border-border bg-card/95 shadow-[0_16px_36px_rgba(148,163,184,0.16)]">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center gap-3">
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
              <Sparkles className="size-4" />
              设定检查
            </Link>
          </div>
          <div className="space-y-1.5">
            <CardDescription className="text-primary/80">项目世界观</CardDescription>
            <CardTitle className="text-2xl text-foreground">{project.title}</CardTitle>
            {project.description?.trim() ? (
              <CardDescription className="max-w-3xl text-sm leading-6 text-muted-foreground">{project.description.trim()}</CardDescription>
            ) : null}
          </div>
        </CardHeader>
        <CardFooter className="flex flex-wrap items-center gap-3 border-border bg-muted/35">
          <WorldMetricCard label="章节数量" value={`${project.chapters.length}`} />
          <WorldMetricCard label="角色数量" value={`${projectCharacters.length}`} />
          <WorldMetricCard
            label="最近更新"
            value={formatDate(worldSetting?.updated_at || project.updated_at)}
          />
        </CardFooter>
      </Card>

      {/* Main layout: AI panel (left, primary) + edit form + sidebar (right) */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* AI panel — primary, always visible */}
        <div className="xl:sticky xl:top-4 xl:self-start xl:h-[calc(100vh-8rem)]">
          <ProjectAssetAIPanel
            assetType="world_setting"
            draft={worldAIDraft}
            onDraftChange={setWorldAIDraft}
            onSubmit={handleWorldAIAssist}
            isSubmitting={analyzeWorldSettingMutation.isPending}
            messages={worldAIMessages}
            latestWorldPatch={latestWorldPatch}
            onApplyWorldPatch={() => applyWorldPatchMutation.mutate()}
            isApplying={applyWorldPatchMutation.isPending}
            onFileUpload={async (file) => { await uploadFileMutation.mutateAsync(file) }}
            isUploadingFile={uploadFileMutation.isPending}
            uploadedFiles={uploadedFiles}
          />
        </div>

        {/* Right column: edit form + summary + characters */}
        <div className="space-y-6">
          <Card className="border border-border bg-card/95">
            <CardHeader>
              <CardTitle className="text-lg text-foreground">{worldSetting ? '编辑世界观设定' : '创建世界观设定'}</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground/85">标题</label>
                  <Input
                    value={draft.title}
                    onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder="例如：蒸汽帝国边境纪事"
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
                    placeholder="例如：能力来源、科技或魔法边界、制度限制和越界代价。"
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
                    placeholder="记录暂未结构化但需要长期保留的设定碎片、约束和创作边界。"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button type="submit" disabled={updateWorldSettingMutation.isPending}>
                    <BrainCircuit className="size-4" />
                    {updateWorldSettingMutation.isPending
                      ? '保存中...'
                      : worldSetting
                        ? '保存世界观修改'
                        : '创建世界观'}
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
            <CardContent className="space-y-3 text-sm text-foreground/85">
              <SummaryBlock label="标题" value={worldSetting?.title || '尚未设置'} />
              <SummaryBlock label="概览" value={worldSetting?.overview?.trim() || '尚未填写世界观概览'} />
              <SummaryBlock label="规则" value={worldSetting?.rules?.trim() || '尚未填写世界规则'} />
            </CardContent>
          </Card>

          <Card className="border border-border bg-card/95">
            <CardHeader>
              <CardTitle className="text-lg text-foreground">项目角色</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {projectCharacters.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted/35 px-4 py-5 text-sm leading-6 text-muted-foreground">
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
                <Users2 className="size-4 mr-2" />
                管理项目角色
              </Link>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  )
}

function WorldMetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-37 rounded-2xl border border-border bg-muted/35 px-4 py-3">
      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-xl font-semibold text-foreground">{value}</div>
      {hint ? <div className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</div> : null}
    </div>
  )
}

function SummaryBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <p className="mt-2 text-sm leading-6 text-foreground">{value}</p>
    </div>
  )
}

function ProjectCharacterCard({ item }: { item: ProjectCharacter }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
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
