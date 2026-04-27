import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, BookOpen, BrainCircuit, Globe2, Sparkles, Users2 } from 'lucide-react'
import { toast } from 'sonner'

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
import { formatDate } from '@/lib/format'
import { queryClient } from '@/lib/query-client'
import { getProject, updateProjectWorldSetting } from '@/services/projects'
import type { ProjectDetail, ProjectCharacter, WorldSetting, WorldSettingPayload } from '@/types/api'

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

  const projectQuery = useQuery<ProjectDetail, Error>({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId ?? ''),
    enabled: Boolean(projectId),
  })

  const project = projectQuery.data
  const worldSetting = project?.world_setting ?? null
  const projectCharacters = useMemo(() => project?.project_characters ?? [], [project?.project_characters])

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
      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border border-white/10 bg-white/6 shadow-lg shadow-black/5">
          <CardHeader className="gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                to={`/projects/${project.id}`}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-transparent px-3 text-sm font-medium text-white transition hover:bg-white/10"
              >
                <ArrowLeft className="size-4" />
                返回工作台
              </Link>
              <Link
                to={`/ai-toolbox?task=consistency&projectId=${project.id}`}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-primary/20 bg-primary/10 px-3 text-sm font-medium text-white transition hover:bg-primary/20"
              >
                <Sparkles className="size-4" />
                设定检查
              </Link>
            </div>
            <div className="space-y-3">
              <CardDescription className="text-primary/80">项目世界观</CardDescription>
              <CardTitle className="text-3xl text-white">{project.title}</CardTitle>
              <CardDescription className="max-w-3xl text-sm leading-7 text-slate-300">
                把项目级背景、规则、势力、地点和时间线沉淀成稳定上下文，后续可直接被编辑器与 AI 工具消费。
              </CardDescription>
            </div>
          </CardHeader>
          <CardFooter className="flex flex-wrap items-center gap-3 border-white/10 bg-white/4">
            <WorldMetricCard label="章节数量" value={`${project.chapters.length}`} hint="当前已纳入项目结构的章节" />
            <WorldMetricCard label="角色数量" value={`${projectCharacters.length}`} hint="已绑定到本项目的角色资产" />
            <WorldMetricCard
              label="最近更新"
              value={formatDate(worldSetting?.updated_at || project.updated_at)}
              hint="世界观或项目最近一次更新时间"
            />
          </CardFooter>
        </Card>

        <Card className="border border-white/10 bg-white/6 shadow-lg shadow-black/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl text-white">
              <Globe2 className="size-5 text-amber-300" />
              设定视角
            </CardTitle>
            <CardDescription>优先把会反复影响剧情推进的公共信息固定下来，减少章节写作时的来回补录。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <WorldGuideCard
              title="背景概览"
              description="时代气质、主要矛盾、世界运行方式。"
              icon={<BookOpen className="size-4 text-sky-300" />}
            />
            <WorldGuideCard
              title="核心规则"
              description="能力来源、技术边界、政治秩序和禁忌条件。"
              icon={<BrainCircuit className="size-4 text-violet-300" />}
            />
            <WorldGuideCard
              title="角色关联"
              description="检查当前角色阵列是否已经覆盖主要势力与冲突面。"
              icon={<Users2 className="size-4 text-emerald-300" />}
            />
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="space-y-6">
          <Card className="border border-white/10 bg-white/6">
            <CardHeader>
              <CardTitle className="text-xl text-white">{worldSetting ? '编辑世界观设定' : '创建世界观设定'}</CardTitle>
              <CardDescription>当前页面承接完整的项目级设定编辑。保存后，项目工作台和 AI 工具会读取这里的最新内容。</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-5" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-200">标题</label>
                  <Input
                    value={draft.title}
                    onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder="例如：蒸汽帝国边境纪事"
                    maxLength={200}
                  />
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-200">世界概览</label>
                    <Textarea
                      value={draft.overview}
                      onChange={(event) => setDraft((prev) => ({ ...prev, overview: event.target.value }))}
                      rows={6}
                      placeholder="概括时代背景、主线矛盾、社会气质和叙事氛围。"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-200">核心规则</label>
                    <Textarea
                      value={draft.rules}
                      onChange={(event) => setDraft((prev) => ({ ...prev, rules: event.target.value }))}
                      rows={6}
                      placeholder="例如：能力来源、科技或魔法边界、制度限制和越界代价。"
                    />
                  </div>
                </div>

                <Separator className="bg-white/10" />

                <div className="grid gap-5 md:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-200">势力摘要</label>
                    <Textarea
                      value={draft.factions}
                      onChange={(event) => setDraft((prev) => ({ ...prev, factions: event.target.value }))}
                      rows={5}
                      placeholder="记录主要阵营、利益冲突和联盟关系。"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-200">关键地点</label>
                    <Textarea
                      value={draft.locations}
                      onChange={(event) => setDraft((prev) => ({ ...prev, locations: event.target.value }))}
                      rows={5}
                      placeholder="记录重要城市、区域、据点和空间层级。"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-200">时间线摘要</label>
                    <Textarea
                      value={draft.timeline}
                      onChange={(event) => setDraft((prev) => ({ ...prev, timeline: event.target.value }))}
                      rows={5}
                      placeholder="列出关键历史节点、当前时间位置和未公开前史。"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-200">补充备注</label>
                  <Textarea
                    value={draft.extra_notes}
                    onChange={(event) => setDraft((prev) => ({ ...prev, extra_notes: event.target.value }))}
                    rows={6}
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
                    重置为当前已保存内容
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </section>

        <aside className="space-y-4">
          <Card className="border border-white/10 bg-white/6">
            <CardHeader>
              <CardTitle className="text-lg text-white">当前摘要</CardTitle>
              <CardDescription>这里展示已经保存进项目上下文的内容，方便你校对哪些信息已经生效。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-300">
              <SummaryBlock label="标题" value={worldSetting?.title || '尚未设置'} />
              <SummaryBlock label="概览" value={worldSetting?.overview?.trim() || '尚未填写世界观概览'} />
              <SummaryBlock label="规则" value={worldSetting?.rules?.trim() || '尚未填写世界规则'} />
            </CardContent>
          </Card>

          <Card className="border border-white/10 bg-white/6">
            <CardHeader>
              <CardTitle className="text-lg text-white">项目角色</CardTitle>
              <CardDescription>写世界观时可以顺手检查角色阵列有没有覆盖当前设定需要的势力和关系。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {projectCharacters.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 py-5 text-sm leading-6 text-slate-400">
                  当前项目还没有绑定角色。先补齐角色资产，再回到这里完善势力和关系会更顺手。
                </div>
              ) : (
                projectCharacters.map((item) => <ProjectCharacterCard key={item.id} item={item} />)
              )}
            </CardContent>
            <CardFooter className="border-white/10 bg-white/4">
              <Link
                to={`/projects/${project.id}`}
                className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-white/10 bg-transparent px-3 text-sm font-medium text-white transition hover:bg-white/10"
              >
                返回项目工作台管理角色
              </Link>
            </CardFooter>
          </Card>
        </aside>
      </div>
    </div>
  )
}

function WorldMetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="min-w-[148px] rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs leading-5 text-slate-400">{hint}</div>
    </div>
  )
}

function WorldGuideCard({
  title,
  description,
  icon,
}: {
  title: string
  description: string
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-xl border border-white/10 bg-white/8 p-2">{icon}</div>
        <div className="space-y-1">
          <div className="text-sm font-medium text-white">{title}</div>
          <p className="text-sm leading-6 text-slate-300">{description}</p>
        </div>
      </div>
    </div>
  )
}

function SummaryBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <p className="mt-2 text-sm leading-6 text-white">{value}</p>
    </div>
  )
}

function ProjectCharacterCard({ item }: { item: ProjectCharacter }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm font-medium text-white">{item.character.name}</div>
        {item.role_label ? (
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-slate-300">{item.role_label}</span>
        ) : null}
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-400">
        {item.summary?.trim() || item.character.description?.trim() || '暂无项目内角色说明。'}
      </p>
    </div>
  )
}
