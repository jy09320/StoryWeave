import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  BookOpenText,
  Bot,
  Check,
  ChevronRight,
  Command,
  Layers3,
  PenTool,
  Sparkles,
  Users2,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import heroArtwork from '@/assets/hero.png'
import { formatDate } from '@/lib/format'
import { listProjects } from '@/services/projects'
import type { Project } from '@/types/api'

const featureGroups = [
  {
    icon: PenTool,
    title: '把写作现场放在同一个界面里',
    description:
      '项目、章节、角色设定和世界观不再分散在文档、表格和聊天窗口里，创作过程可以持续回到同一份上下文。',
  },
  {
    icon: Bot,
    title: '让 AI 真正接入你的写作流',
    description:
      '续写、改写、润色和一致性检查不再是孤立工具，而是与章节、设定、角色关系协同工作的生产环节。',
  },
  {
    icon: Layers3,
    title: '从灵感到定稿保持结构化推进',
    description:
      '从项目立项、章节拆分到正文编辑与回查，你可以清楚知道下一步该推进哪里，而不是反复整理素材。',
  },
] as const

const workflowSteps = [
  {
    index: '01',
    title: '建立创作项目',
    description: '先定义作品方向、题材、阶段与目标，让首页和工作台都围绕同一部作品组织信息。',
  },
  {
    index: '02',
    title: '沉淀角色与设定',
    description: '把角色资料、关系、规则和世界观收进可复用资产，而不是散落在备注里。',
  },
  {
    index: '03',
    title: '进入章节级写作',
    description: '从章节结构直接进入正文编辑，随时回看上下文，减少从列表到文档的跳转损耗。',
  },
  {
    index: '04',
    title: '调用 AI 辅助推进',
    description: '在具体段落和章节上发起续写、改写与检查，让 AI 输出更贴近已有内容，而不是重新解释背景。',
  },
] as const

const productHighlights = ['最近项目回流', '章节结构管理', '角色资料库', '世界观设定', 'AI 续写与改写', '一致性检查'] as const

export function HomePage() {
  const projectsQuery = useQuery<Project[], Error>({
    queryKey: ['projects'],
    queryFn: listProjects,
    staleTime: 60_000,
  })

  const projects = projectsQuery.data ?? []
  const recentProjects = useMemo(
    () =>
      [...projects]
        .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime())
        .slice(0, 3),
    [projects],
  )

  const projectStats = useMemo(
    () => ({
      total: projects.length,
      active: projects.filter((project) => project.status === 'active').length,
      draft: projects.filter((project) => project.status === 'draft').length,
    }),
    [projects],
  )

  return (
    <div className="min-h-screen text-foreground">
      <section className="relative overflow-hidden border-b border-border/70">
        <div className="absolute inset-x-0 top-0 h-[440px] bg-[radial-gradient(circle_at_16%_18%,rgba(16,185,129,0.14),transparent_28%),radial-gradient(circle_at_82%_14%,rgba(14,165,233,0.08),transparent_22%),linear-gradient(180deg,rgba(255,253,248,0.84)_0%,rgba(248,245,237,0.66)_55%,rgba(242,241,234,0)_100%)]" />

        <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 pb-12 pt-6 lg:px-10">
          <header className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
                <Sparkles className="size-5" />
              </div>
              <div>
                <div className="text-sm font-semibold">StoryWeave</div>
                <div className="text-xs text-muted-foreground">写作工作台</div>
              </div>
            </div>

            <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
              <a href="#product" className="transition hover:text-foreground">
                产品能力
              </a>
              <a href="#workflow" className="transition hover:text-foreground">
                工作流
              </a>
              <a href="#launch" className="transition hover:text-foreground">
                开始使用
              </a>
            </nav>

            <div className="flex items-center gap-3">
              <Link
                to="/workspace"
                className="hidden h-10 items-center justify-center rounded-md border border-border bg-background/90 px-4 text-sm text-foreground transition hover:bg-muted md:inline-flex"
              >
                进入工作台
              </Link>
              <Link
                to="/ai-toolbox"
                className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
              >
                体验 AI 写作
              </Link>
            </div>
          </header>

          <div className="grid flex-1 items-center gap-14 py-14 lg:grid-cols-[minmax(0,1.02fr)_minmax(440px,0.98fr)] lg:py-20">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1 text-xs text-muted-foreground">
                <Command className="size-3.5 text-primary" />
                面向小说、同人、系列长篇与设定驱动型创作
              </div>

              <h1 className="mt-6 max-w-5xl text-4xl font-semibold leading-tight text-foreground sm:text-5xl lg:text-6xl">
                让你的写作工具
                <br />
                真正像一个产品，而不是一堆文档
              </h1>

              <p className="mt-6 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
                项目、章节、角色、世界观与 AI 集中在同一处。
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/workspace"
                  className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
                >
                  打开产品工作台
                </Link>
                <Link
                  to="/characters"
                  className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-background/90 px-5 text-sm text-foreground transition hover:bg-muted"
                >
                  查看角色资产
                </Link>
              </div>

              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                <MetricTile label="项目总数" value={String(projectStats.total)} />
                <MetricTile label="活跃项目" value={String(projectStats.active)} />
                <MetricTile label="草稿项目" value={String(projectStats.draft)} />
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-x-10 top-8 h-28 bg-primary/10 blur-3xl" />
              <div className="relative overflow-hidden rounded-md border border-border bg-card/95 shadow-[0_24px_60px_rgba(148,163,184,0.18)]">
                <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
                  <div className="text-sm font-medium text-foreground">StoryWeave Workspace</div>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-primary/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-sky-400/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                  </div>
                </div>

                <div className="grid gap-0 lg:grid-cols-[92px_minmax(0,1fr)]">
                  <aside className="border-b border-r border-border/70 bg-muted/35 p-4 lg:border-b-0">
                    <div className="space-y-3">
                      <PreviewDot active icon={<Sparkles className="size-4" />} />
                      <PreviewDot icon={<BookOpenText className="size-4" />} />
                      <PreviewDot icon={<Users2 className="size-4" />} />
                      <PreviewDot icon={<Bot className="size-4" />} />
                    </div>
                  </aside>

                  <div className="grid gap-0 md:grid-cols-[220px_minmax(0,1fr)]">
                    <div className="border-r border-border/70 bg-muted/20 p-4">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Projects</div>
                      <div className="mt-4 space-y-2">
                        {(recentProjects.length > 0 ? recentProjects : fallbackProjects).map((project) => (
                          <div key={project.id} className="rounded-md border border-border bg-background/90 p-3">
                            <div className="text-sm font-medium text-foreground">{project.title}</div>
                            <div className="mt-1 text-xs text-muted-foreground">{formatProjectDate(project.updated_at)}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="relative p-5">
                      <div className="flex flex-wrap gap-2">
                        {productHighlights.map((item) => (
                          <span
                            key={item}
                            className="inline-flex items-center gap-1 rounded-full border border-border bg-background/90 px-3 py-1 text-xs text-muted-foreground"
                          >
                            <Check className="size-3 text-primary" />
                            {item}
                          </span>
                        ))}
                      </div>

                      <div className="mt-5 overflow-hidden rounded-md border border-border bg-muted/20">
                        <div className="border-b border-border/70 px-4 py-3">
                          <div className="text-sm font-medium text-foreground">章节编辑区预览</div>
                        </div>
                        <div className="grid gap-5 p-4 xl:grid-cols-[minmax(0,1fr)_220px]">
                          <div className="space-y-3">
                            <div className="h-3 w-24 rounded-full bg-primary/18" />
                            <div className="h-3 w-full rounded-full bg-muted" />
                            <div className="h-3 w-[94%] rounded-full bg-muted" />
                            <div className="h-3 w-[88%] rounded-full bg-muted" />
                            <div className="h-3 w-[92%] rounded-full bg-muted" />
                            <div className="h-3 w-[86%] rounded-full bg-muted" />
                            <div className="h-3 w-[90%] rounded-full bg-muted" />
                          </div>

                          <div className="rounded-md border border-primary/18 bg-primary/8 p-4">
                            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                              <Sparkles className="size-4 text-primary" />
                              AI 建议
                            </div>
                            <div className="mt-3 space-y-2">
                              <div className="h-3 w-full rounded-full bg-primary/12" />
                              <div className="h-3 w-[88%] rounded-full bg-primary/12" />
                              <div className="h-3 w-[74%] rounded-full bg-primary/12" />
                            </div>
                            <div className="mt-4 inline-flex items-center gap-2 text-xs text-primary">
                              查看任务结果
                              <ChevronRight className="size-3.5" />
                            </div>
                          </div>
                        </div>
                      </div>

                      <img
                        src={heroArtwork}
                        alt="StoryWeave 产品视觉"
                        className="pointer-events-none absolute bottom-[-44px] right-[-24px] hidden w-48 opacity-70 xl:block"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="product" className="border-b border-border/70">
        <div className="mx-auto w-full max-w-7xl px-6 py-16 lg:px-10">
          <div className="max-w-2xl">
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Product</div>
            <h2 className="mt-3 text-3xl font-semibold text-foreground">围绕长篇创作建立一套连续的工作方式</h2>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {featureGroups.map((feature) => {
              const Icon = feature.icon
              return (
                <article key={feature.title} className="rounded-md border border-border bg-card/95 p-6 shadow-[0_12px_30px_rgba(148,163,184,0.12)]">
                  <div className="flex size-11 items-center justify-center rounded-md border border-primary/18 bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </div>
                  <h3 className="mt-6 text-xl font-medium text-foreground">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">{feature.description}</p>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <section id="workflow" className="border-b border-border/70">
        <div className="mx-auto grid w-full max-w-7xl gap-12 px-6 py-16 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:px-10">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Workflow</div>
            <h2 className="mt-3 text-3xl font-semibold text-foreground">从灵感落点到章节定稿，创作节奏保持连贯</h2>
          </div>

          <div className="grid gap-0 rounded-md border border-border bg-card/90">
            {workflowSteps.map((step) => (
              <div
                key={step.index}
                className="grid gap-4 border-b border-border/70 px-6 py-6 last:border-b-0 md:grid-cols-[92px_minmax(0,1fr)]"
              >
                <div className="text-sm font-medium text-primary">{step.index}</div>
                <div>
                  <div className="text-lg font-medium text-foreground">{step.title}</div>
                  <div className="mt-2 text-sm leading-7 text-muted-foreground">{step.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="launch">
        <div className="mx-auto grid w-full max-w-7xl gap-12 px-6 py-16 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-10">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Launch</div>
            <h2 className="mt-3 text-3xl font-semibold text-foreground">准备好开始写，就直接进入你的创作现场</h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">首页负责总览与入口，工作台负责持续推进作品。</p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/workspace"
                className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
              >
                进入工作台
              </Link>
              <Link
                to="/ai-toolbox"
                className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-background/90 px-5 text-sm text-foreground transition hover:bg-muted"
              >
                试用 AI 工具箱
              </Link>
            </div>
          </div>

          <div className="rounded-md border border-border bg-card/95 p-6 shadow-[0_12px_30px_rgba(148,163,184,0.12)]">
            <div className="text-sm font-medium text-foreground">最近项目</div>

            <div className="mt-5 space-y-3">
              {(recentProjects.length > 0 ? recentProjects : fallbackProjects).map((project) => (
                <Link
                  key={project.id}
                  to="/workspace"
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/90 px-4 py-4 transition hover:bg-muted/35"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{project.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{formatProjectDate(project.updated_at)}</div>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function MetricTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-border bg-card/95 p-4 shadow-[0_12px_28px_rgba(148,163,184,0.1)]">
      <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  )
}

function PreviewDot({ icon, active = false }: { icon: React.ReactNode; active?: boolean }) {
  return (
    <div
      className={`flex size-12 items-center justify-center rounded-md border transition ${
        active
          ? 'border-primary/20 bg-primary/10 text-primary'
          : 'border-border bg-background/90 text-muted-foreground'
      }`}
    >
      {icon}
    </div>
  )
}

function formatProjectDate(value: string) {
  if (!value) {
    return '最近更新'
  }

  return `更新于 ${formatDate(value)}`
}

const fallbackProjects: Project[] = [
  {
    id: 'fallback-1',
    title: '北境烬火',
    description: null,
    type: 'original',
    source_work: null,
    status: 'active',
    default_model_provider: null,
    default_model_id: null,
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-28T09:30:00.000Z',
  },
  {
    id: 'fallback-2',
    title: '潮汐档案',
    description: null,
    type: 'original',
    source_work: null,
    status: 'draft',
    default_model_provider: null,
    default_model_id: null,
    created_at: '2026-04-02T00:00:00.000Z',
    updated_at: '2026-04-27T14:20:00.000Z',
  },
  {
    id: 'fallback-3',
    title: '镜城回声',
    description: null,
    type: 'fanfiction',
    source_work: null,
    status: 'active',
    default_model_provider: null,
    default_model_id: null,
    created_at: '2026-04-03T00:00:00.000Z',
    updated_at: '2026-04-26T18:15:00.000Z',
  },
]
