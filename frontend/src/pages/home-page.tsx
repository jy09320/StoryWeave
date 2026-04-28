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
    title: '把写作现场放在一个界面里',
    description:
      '项目、章节、角色设定和世界观不再分散在文档、表格和聊天窗口中，创作过程可以持续回到同一个上下文。',
  },
  {
    icon: Bot,
    title: '让 AI 真正接入你的写作流',
    description:
      '续写、改写、润色和一致性检查不是孤立工具，而是和章节、设定、角色关系一起协作的生产环节。',
  },
  {
    icon: Layers3,
    title: '从灵感到定稿保持结构化推进',
    description:
      '从项目立项、章节拆分到正文编辑与回查，你可以明确知道下一步该推进哪里，而不是重新组织素材。',
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

const productHighlights = [
  '最近项目回流',
  '章节结构管理',
  '角色资料库',
  '世界观设定',
  'AI 续写与改写',
  '一致性检查',
] as const

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
    <div className="min-h-screen bg-[#0a0a0b] text-white">
      <section className="relative overflow-hidden border-b border-white/8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(245,158,11,0.24),transparent_30%),radial-gradient(circle_at_80%_18%,rgba(168,85,247,0.16),transparent_24%),linear-gradient(180deg,#09090b_0%,#0d0d10_52%,#111114_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,10,11,0.12)_0%,rgba(10,10,11,0.48)_48%,rgba(10,10,11,0.9)_100%)]" />

        <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 pb-12 pt-6 lg:px-10">
          <header className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-md border border-amber-500/20 bg-amber-500/10 text-amber-300">
                <Sparkles className="size-5" />
              </div>
              <div>
                <div className="text-sm font-semibold">StoryWeave</div>
                <div className="text-xs text-[#A1A1AA]">写作工作台</div>
              </div>
            </div>

            <nav className="hidden items-center gap-8 text-sm text-[#A1A1AA] md:flex">
              <a href="#product" className="transition hover:text-white">
                产品能力
              </a>
              <a href="#workflow" className="transition hover:text-white">
                工作流
              </a>
              <a href="#launch" className="transition hover:text-white">
                开始使用
              </a>
            </nav>

            <div className="flex items-center gap-3">
              <Link
                to="/workspace"
                className="hidden h-10 items-center justify-center rounded-md border border-white/10 bg-white/5 px-4 text-sm text-white transition hover:bg-white/10 md:inline-flex"
              >
                进入工作台
              </Link>
              <Link
                to="/ai-toolbox"
                className="inline-flex h-10 items-center justify-center rounded-md bg-amber-500 px-4 text-sm font-medium text-black transition hover:opacity-90"
              >
                体验 AI 写作
              </Link>
            </div>
          </header>

          <div className="grid flex-1 items-center gap-14 py-14 lg:grid-cols-[minmax(0,1.02fr)_minmax(440px,0.98fr)] lg:py-20">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-[#D4D4D8]">
                <Command className="size-3.5 text-amber-300" />
                面向小说、同人、系列长篇与设定驱动型创作
              </div>

              <h1 className="mt-6 max-w-5xl text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
                让你的写作工具
                <br />
                真正像一个产品，而不是一堆文档
              </h1>

              <p className="mt-6 max-w-2xl text-base leading-8 text-[#D4D4D8] sm:text-lg">项目、章节、角色、世界观与 AI 集中在同一处。</p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/workspace"
                  className="inline-flex h-11 items-center justify-center rounded-md bg-amber-500 px-5 text-sm font-medium text-black transition hover:opacity-90"
                >
                  打开产品工作台
                </Link>
                <Link
                  to="/characters"
                  className="inline-flex h-11 items-center justify-center rounded-md border border-white/10 bg-white/5 px-5 text-sm text-white transition hover:bg-white/10"
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
              <div className="absolute inset-x-10 top-6 h-28 bg-amber-500/10 blur-3xl" />
              <div className="relative overflow-hidden border border-white/10 bg-[#121216] shadow-[0_30px_120px_rgba(0,0,0,0.45)]">
                <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
                  <div>
                    <div className="text-sm font-medium text-white">StoryWeave Workspace</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                    <span className="h-2.5 w-2.5 rounded-full bg-white/30" />
                  </div>
                </div>

                <div className="grid gap-0 lg:grid-cols-[92px_minmax(0,1fr)]">
                  <aside className="border-b border-r border-white/8 bg-[#0d0d10] p-4 lg:border-b-0">
                    <div className="space-y-3">
                      <PreviewDot active icon={<Sparkles className="size-4" />} />
                      <PreviewDot icon={<BookOpenText className="size-4" />} />
                      <PreviewDot icon={<Users2 className="size-4" />} />
                      <PreviewDot icon={<Bot className="size-4" />} />
                    </div>
                  </aside>

                  <div className="grid gap-0 md:grid-cols-[220px_minmax(0,1fr)]">
                    <div className="border-r border-white/8 bg-[#101014] p-4">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-[#5A5A63]">Projects</div>
                      <div className="mt-4 space-y-2">
                        {(recentProjects.length > 0 ? recentProjects : fallbackProjects).map((project) => (
                          <div key={project.id} className="border border-white/8 bg-white/[0.03] p-3">
                            <div className="text-sm font-medium text-white">{project.title}</div>
                            <div className="mt-1 text-xs text-[#71717A]">
                              {formatProjectDate(project.updated_at)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="p-5">
                      <div className="flex flex-wrap gap-2">
                        {productHighlights.map((item) => (
                          <span
                            key={item}
                            className="inline-flex items-center gap-1 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-xs text-[#D4D4D8]"
                          >
                            <Check className="size-3 text-amber-300" />
                            {item}
                          </span>
                        ))}
                      </div>

                      <div className="mt-5 overflow-hidden border border-white/8 bg-black/20">
                        <div className="border-b border-white/8 px-4 py-3">
                          <div className="text-sm font-medium text-white">章节编辑区预览</div>
                        </div>
                        <div className="grid gap-5 p-4 xl:grid-cols-[minmax(0,1fr)_220px]">
                          <div className="space-y-3">
                            <div className="h-3 w-24 bg-white/15" />
                            <div className="h-3 w-full bg-white/8" />
                            <div className="h-3 w-[94%] bg-white/8" />
                            <div className="h-3 w-[88%] bg-white/8" />
                            <div className="h-3 w-[92%] bg-white/8" />
                            <div className="h-3 w-[86%] bg-white/8" />
                            <div className="h-3 w-[90%] bg-white/8" />
                          </div>

                          <div className="border border-amber-500/20 bg-amber-500/[0.06] p-4">
                            <div className="flex items-center gap-2 text-sm font-medium text-white">
                              <Sparkles className="size-4 text-amber-300" />
                              AI 建议
                            </div>
                            <div className="mt-3 space-y-2">
                              <div className="h-3 w-full bg-white/10" />
                              <div className="h-3 w-[88%] bg-white/10" />
                              <div className="h-3 w-[74%] bg-white/10" />
                            </div>
                            <div className="mt-4 inline-flex items-center gap-2 text-xs text-amber-200">
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

      <section id="product" className="border-b border-white/8 bg-[#111215]">
        <div className="mx-auto w-full max-w-7xl px-6 py-16 lg:px-10">
          <div className="max-w-2xl">
            <div className="text-[11px] uppercase tracking-[0.22em] text-[#71717A]">Product</div>
            <h2 className="mt-3 text-3xl font-semibold text-white">围绕长篇创作建立一套连续的工作方式</h2>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {featureGroups.map((feature) => {
              const Icon = feature.icon
              return (
                <article key={feature.title} className="border border-white/8 bg-white/[0.03] p-6">
                  <div className="flex size-11 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-amber-300">
                    <Icon className="size-5" />
                  </div>
                  <h3 className="mt-6 text-xl font-medium text-white">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-[#A1A1AA]">{feature.description}</p>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <section id="workflow" className="border-b border-white/8 bg-[#0c0d0f]">
        <div className="mx-auto grid w-full max-w-7xl gap-12 px-6 py-16 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:px-10">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-[#71717A]">Workflow</div>
            <h2 className="mt-3 text-3xl font-semibold text-white">从灵感落点到章节定稿，创作节奏保持连贯</h2>
          </div>

          <div className="grid gap-0 border-y border-white/8">
            {workflowSteps.map((step) => (
              <div
                key={step.index}
                className="grid gap-4 border-b border-white/8 py-6 last:border-b-0 md:grid-cols-[92px_minmax(0,1fr)]"
              >
                <div className="text-sm font-medium text-amber-300">{step.index}</div>
                <div>
                  <div className="text-lg font-medium text-white">{step.title}</div>
                  <div className="mt-2 text-sm leading-7 text-[#A1A1AA]">{step.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="launch" className="bg-[#09090b]">
        <div className="mx-auto grid w-full max-w-7xl gap-12 px-6 py-16 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-10">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-[#71717A]">Launch</div>
            <h2 className="mt-3 text-3xl font-semibold text-white">准备好开始写，就直接进入你的创作现场</h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[#A1A1AA]">直接进入你的创作现场。</p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/workspace"
                className="inline-flex h-11 items-center justify-center rounded-md bg-amber-500 px-5 text-sm font-medium text-black transition hover:opacity-90"
              >
                进入工作台
              </Link>
              <Link
                to="/ai-toolbox"
                className="inline-flex h-11 items-center justify-center rounded-md border border-white/10 bg-white/5 px-5 text-sm text-white transition hover:bg-white/10"
              >
                试用 AI 工具箱
              </Link>
            </div>
          </div>

          <div className="border border-white/8 bg-white/[0.03] p-6">
            <div className="text-sm font-medium text-white">最近项目</div>

            <div className="mt-5 space-y-3">
              {(recentProjects.length > 0 ? recentProjects : fallbackProjects).map((project) => (
                <Link
                  key={project.id}
                  to="/workspace"
                  className="flex items-center justify-between gap-3 border border-white/8 bg-black/20 px-4 py-4 transition hover:bg-white/[0.04]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-white">{project.title}</div>
                    <div className="mt-1 text-xs text-[#71717A]">{formatProjectDate(project.updated_at)}</div>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-[#71717A]" />
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
    <div className="border border-white/8 bg-white/[0.04] p-4">
      <div className="text-[11px] uppercase tracking-[0.22em] text-[#71717A]">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      {hint ? <div className="mt-1 text-xs text-[#A1A1AA]">{hint}</div> : null}
    </div>
  )
}

function PreviewDot({ icon, active = false }: { icon: React.ReactNode; active?: boolean }) {
  return (
    <div
      className={`flex size-12 items-center justify-center border transition ${
        active
          ? 'border-amber-500/20 bg-amber-500/10 text-amber-300'
          : 'border-white/8 bg-white/[0.03] text-[#71717A]'
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
    title: '北境灰烬',
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
