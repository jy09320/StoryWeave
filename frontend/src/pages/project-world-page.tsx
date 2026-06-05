import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Sparkle } from '@phosphor-icons/react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/empty-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { AssetWorkspace, type TreeNode, type Tab } from '@/components/asset-workspace/AssetWorkspace'
import { WorldSettingEditor } from '@/components/asset-workspace/WorldSettingEditor'
import { readEditorRouteContext } from '@/lib/editor-route-context'
import { queryClient } from '@/lib/query-client'
import { generateProjectDraft, getProject, updateProjectWorldSetting } from '@/services/projects'
import type { ProjectDetail, ProjectDraftResult, WorldSettingPayload } from '@/types/api'

export function ProjectWorldPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [aiDraft, setAiDraft] = useState<ProjectDraftResult | null>(null)

  const projectQuery = useQuery<ProjectDetail, Error>({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId ?? ''),
    enabled: Boolean(projectId),
  })

  const project = projectQuery.data
  const editorRouteContext = useMemo(() => readEditorRouteContext(), [])
  const returnToEditor = editorRouteContext && editorRouteContext.projectId === projectId ? editorRouteContext : null

  // Workspace state
  const [openTabs, setOpenTabs] = useState<Tab[]>([
    { id: 'overview', label: '总览' },
  ])
  const [activeTabId, setActiveTabId] = useState<string | null>('overview')

  const treeNodes = useMemo((): TreeNode[] => {
    const fields = [
      { id: 'overview', label: '总览' },
      { id: 'rules', label: '世界规则' },
      { id: 'factions', label: '势力分布' },
      { id: 'locations', label: '重要地点' },
      { id: 'timeline', label: '时间线' },
      { id: 'extra_notes', label: '备注' },
    ]
    return fields.map((f) => ({
      id: f.id,
      label: f.label,
      type: 'leaf' as const,
    }))
  }, [])

  const handleNodeSelect = useCallback(
    (nodeId: string) => {
      if (!openTabs.find((t) => t.id === nodeId)) {
        const node = treeNodes.find((n) => n.id === nodeId)
        if (node) {
          setOpenTabs((prev) => [...prev, { id: node.id, label: node.label }])
        }
      }
      setActiveTabId(nodeId)
    },
    [openTabs, treeNodes],
  )

  const handleTabClose = useCallback(
    (tabId: string) => {
      setOpenTabs((prev) => {
        const next = prev.filter((t) => t.id !== tabId)
        if (activeTabId === tabId) {
          setActiveTabId(next.length > 0 ? next[next.length - 1].id : null)
        }
        return next
      })
    },
    [activeTabId],
  )

  const handleDirtyChange = useCallback(
    (dirty: boolean) => {
      if (activeTabId) {
        setOpenTabs((prev) =>
          prev.map((t) => (t.id === activeTabId ? { ...t, dirty } : t)),
        )
      }
    },
    [activeTabId],
  )

  // AI draft generation
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

  const applyDraftMutation = useMutation({
    mutationFn: (payload: WorldSettingPayload) =>
      updateProjectWorldSetting(projectId ?? '', payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      setAiDraft(null)
      toast.success('AI 草案已应用并保存')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

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

    applyDraftMutation.mutate({
      title: aiDraft.world_setting_title,
      overview: aiDraft.world_setting_overview,
      rules: aiDraft.world_setting_rules ?? null,
      factions: aiDraft.world_setting_factions ?? null,
      locations: aiDraft.world_setting_locations ?? null,
      timeline: aiDraft.world_setting_timeline ?? null,
      extra_notes: aiDraft.notes.length > 0 ? aiDraft.notes.join('\n') : null,
    })
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
    <div className="flex h-[calc(100vh-120px)] flex-col gap-4">
      {/* Top: navigation and AI draft controls */}
      <div className="shrink-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={
              returnToEditor
                ? `/projects/${returnToEditor.projectId}/editor/${returnToEditor.chapterId}`
                : `/projects/${project.id}`
            }
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

        {/* AI draft toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {aiDraft ? (
            <Button type="button" variant="outline" onClick={() => setAiDraft(null)}>
              清空草案
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={handleGenerateAIDraft}
            disabled={generateDraftMutation.isPending}
          >
            <Sparkle className="mr-2 size-4" />
            {generateDraftMutation.isPending ? '生成中...' : 'AI 生成草案'}
          </Button>
          <Button
            type="button"
            onClick={handleApplyAIDraft}
            disabled={!aiDraft || applyDraftMutation.isPending}
          >
            {applyDraftMutation.isPending ? '应用中...' : '应用到编辑区'}
          </Button>
        </div>

        {/* AI draft preview */}
        {aiDraft ? (
          <div className="rounded-xl border border-border bg-background px-4 py-4">
            <div className="text-sm font-medium text-foreground">
              {aiDraft.world_setting_title}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {aiDraft.world_setting_overview}
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <AIDraftInfo label="核心规则" value={aiDraft.world_setting_rules} />
              <AIDraftInfo label="主要势力" value={aiDraft.world_setting_factions} />
              <AIDraftInfo label="关键地点" value={aiDraft.world_setting_locations} />
              <AIDraftInfo label="时间线" value={aiDraft.world_setting_timeline} />
            </div>
          </div>
        ) : null}
      </div>

      {/* Bottom: asset workspace */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <AssetWorkspace
          treeNodes={treeNodes}
          selectedNodeId={activeTabId}
          onNodeSelect={handleNodeSelect}
          onCreateNew={() => {}}
          searchValue=""
          onSearchChange={() => {}}
          dimension={null}
          typeFilter={null}
          tabs={openTabs}
          activeTabId={activeTabId}
          onTabSelect={setActiveTabId}
          onTabClose={handleTabClose}
          renderEditor={(tabId) => (
            <WorldSettingEditor
              key={tabId}
              projectId={projectId!}
              field={
                tabId as
                  | 'overview'
                  | 'rules'
                  | 'factions'
                  | 'locations'
                  | 'timeline'
                  | 'extra_notes'
              }
              onDirtyChange={handleDirtyChange}
            />
          )}
        />
      </div>
    </div>
  )
}

function AIDraftInfo({
  label,
  value,
}: {
  label: string
  value: string | null | undefined
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/25 px-3 py-3">
      <div className="text-xs font-medium text-foreground/85">{label}</div>
      <div className="mt-1 text-sm leading-6 text-muted-foreground">
        {value?.trim() || '本轮草案未生成该字段。'}
      </div>
    </div>
  )
}
