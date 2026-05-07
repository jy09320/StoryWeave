import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  BookOpenText,
  Bot,
  Check,
  Heart,
  Layers3,
  PenTool,
  Sparkles,
  Users2,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import heroArtwork from '@/assets/hero.png'
import { formatDate, parseApiDate } from '@/lib/format'
import { listProjects } from '@/services/projects'
import type { Project } from '@/types/api'

const resonanceCards = [
  {
    quote: '灵感来的时候，我找不到上次写到哪里了',
    note: '素材、大纲和正文各在一处，切换之间已经没了状态',
  },
  {
    quote: '角色设定写了，写着写着就对不上了',
    note: '卷数一多，靠记忆维持一致性太难了',
  },
  {
    quote: '让 AI 续写，它给的不是我的故事',
    note: '因为它根本不知道你的世界观和人物关系',
  },
] as const

const featureGroups = [
  {
    icon: PenTool,
    title: '所有素材，都在同一个地方',
    description: '不用切窗口，不用翻备忘录。角色卡、世界观、大纲和正文，打开一次，什么都在。',
  },
  {
    icon: Bot,
    title: 'AI 真的读过你的故事',
    description: '它知道你的主角叫什么，知道世界观的规则，知道上一章发生了什么。续写和改写，才真的是你的风格。',
  },
  {
    icon: Layers3,
    title: '每次打开，知道下一步去哪',
    description: '从立项到章节，从大纲到正文，进度一直在这里。不用靠记忆拼回写作状态。',
  },
] as const

const workflowSteps = [
  {
    index: '01',
    title: '给作品一个家',
    description: '新建项目，填上名字和方向。从这一刻起，所有创作都有了归处。',
  },
  {
    index: '02',
    title: '把设定收进来',
    description: '角色、世界观、规则 不是为了整理，是为了下次用的时候，它们都还在。',
  },
  {
    index: '03',
    title: '打开就写，写完就走',
    description: '章节和正文在同一处，AI 随时待命。你只需要专心写，其余的交给工作台。',
  },
] as const

const heroCapabilities = ['结构化章节管理', 'AI 上下文感知', '角色设定资产', '多模型接入', '一致性检查'] as const

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
        .sort((left, right) => parseApiDate(right.updated_at).getTime() - parseApiDate(left.updated_at).getTime())
        .slice(0, 3),
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
                <div className="text-xs text-muted-foreground">你的故事空间</div>
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

          {recentProjects.length > 0 && (
            <div className="mt-4 flex items-center gap-3 rounded-md border border-border bg-card/80 px-5 py-3">
              <span className="text-sm text-muted-foreground">还没写完？</span>
              <span className="truncate text-sm font-medium text-foreground">{recentProjects[0].title}</span>
              <Link to="/workspace" className="ml-auto flex shrink-0 items-center gap-1 text-sm text-primary hover:underline">
                继续 <ArrowRight className="size-3.5" />
              </Link>
            </div>
          )}

          <div className="grid flex-1 items-center gap-14 py-14 lg:grid-cols-[minmax(0,1.02fr)_minmax(440px,0.98fr)] lg:py-20">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1 text-xs text-muted-foreground">
                <Heart className="size-3.5 text-primary" />
                写作是一件值得被好好对待的事
              </div>

              <h1 className="mt-6 max-w-5xl text-4xl font-semibold leading-tight text-foreground sm:text-5xl lg:text-6xl">
                你的故事
                <br />
                一直都在等你回来
              </h1>

              <p className="mt-6 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
                章节、角色、设定与 AI 都在这里。每次打开，就是接着上次离开的地方继续。
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/workspace"
                  className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
                >
                  开始写作
                </Link>
                <a
                  href="#product"
                  className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-background/90 px-5 text-sm text-foreground transition hover:bg-muted"
                >
                  了解功能 ↓
                </a>
              </div>

              <div className="mt-10 flex flex-wrap gap-2">
                {heroCapabilities.map((cap) => (
                  <span
                    key={cap}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/90 px-3 py-1.5 text-xs text-muted-foreground"
                  >
                    <Check className="size-3 text-primary" />
                    {cap}
                  </span>
                ))}
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

                <div className="grid gap-0 lg:grid-cols-[72px_minmax(0,1fr)]">
                  <aside className="border-b border-r border-border/70 bg-muted/35 p-3 lg:border-b-0">
                    <div className="space-y-3">
                      <PreviewDot active icon={<Sparkles className="size-4" />} label="工作台" />
                      <PreviewDot icon={<BookOpenText className="size-4" />} label="章节" />
                      <PreviewDot icon={<Users2 className="size-4" />} label="角色" />
                      <PreviewDot icon={<Bot className="size-4" />} label="AI" />
                    </div>
                  </aside>

                  <div className="grid gap-0 md:grid-cols-[200px_minmax(0,1fr)]">
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

                    <div className="relative p-4">
                      <div className="flex gap-1 border-b border-border/70 pb-2">
                        {['第一章', '第二章', '第三章'].map((tab, i) => (
                          <span
                            key={tab}
                            className={`rounded-t-md px-3 py-1 text-xs ${i === 0 ? 'border border-b-background border-border bg-background font-medium text-foreground' : 'text-muted-foreground'}`}
                          >
                            {tab}
                          </span>
                        ))}
                      </div>

                      <div className="mt-3 space-y-1.5">
                        <div className="h-2.5 w-[92%] rounded-full bg-muted" />
                        <div className="h-2.5 w-full rounded-full bg-muted" />
                        <div className="h-2.5 w-[85%] rounded-full bg-muted" />
                        <div className="flex items-center gap-1">
                          <div className="h-2.5 w-[70%] rounded-full bg-muted" />
                          <div className="h-3.5 w-0.5 animate-pulse rounded-full bg-primary" />
                        </div>
                        <div className="h-2.5 w-[88%] rounded-full bg-muted/60" />
                        <div className="h-2.5 w-[78%] rounded-full bg-muted/60" />
                      </div>

                      <div className="mt-4 rounded-md border border-primary/20 bg-primary/8 p-3">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                          <Sparkles className="size-3.5 text-primary" />
                          AI 助手
                        </div>
                        <div className="mt-2 space-y-1.5">
                          <div className="h-2 w-full rounded-full bg-primary/12" />
                          <div className="h-2 w-[82%] rounded-full bg-primary/12" />
                        </div>
                        <div className="mt-2 text-xs text-primary/70">生成中…</div>
                      </div>

                      <img
                        src={heroArtwork}
                        alt="StoryWeave 产品视觉"
                        className="pointer-events-none absolute -bottom-11 -right-6 hidden w-40 opacity-60 xl:block"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border/70">
        <div className="mx-auto w-full max-w-7xl px-6 py-16 lg:px-10">
          <h2 className="text-center text-2xl font-semibold text-foreground sm:text-3xl">
            每个写故事的人，都有过这样的时刻
          </h2>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {resonanceCards.map((card) => (
              <div key={card.quote} className="rounded-md border border-border bg-card/95 p-6 shadow-[0_12px_30px_rgba(148,163,184,0.1)]">
                <p className="text-base font-medium leading-7 text-foreground before:mr-0.5 before:text-primary before:content-['“'] after:ml-0.5 after:text-primary after:content-['”']">
                  {card.quote}
                </p>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">{card.note}</p>
              </div>
            ))}
          </div>

          <p className="mt-10 text-center text-sm text-muted-foreground">
            StoryWeave 记得你的故事，帮你把这些都接住。
          </p>
        </div>
      </section>

      <section id="product" className="border-b border-border/70">
        <div className="mx-auto w-full max-w-7xl px-6 py-16 lg:px-10">
          <div className="max-w-2xl">
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">它能帮你做的事</div>
            <h2 className="mt-3 text-3xl font-semibold text-foreground">让写作少一些摩擦，多一点流动</h2>
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
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">开始的方式</div>
            <h2 className="mt-3 text-3xl font-semibold text-foreground">三步，把你的故事安顿好</h2>
          </div>

          <div className="grid gap-0 rounded-md border border-border bg-card/90">
            {workflowSteps.map((step, idx) => (
              <div
                key={step.index}
                className="grid gap-4 border-b border-border/70 px-6 py-6 last:border-b-0 md:grid-cols-[72px_minmax(0,1fr)]"
              >
                <div className="relative flex flex-col items-center">
                  <span className="text-sm font-medium text-primary">{step.index}</span>
                  {idx < workflowSteps.length - 1 && <div className="absolute top-6 h-full w-px bg-border" />}
                </div>
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
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">开始写作</div>
            <h2 className="mt-3 text-3xl font-semibold text-foreground">你的下一个故事，从这里开始</h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">已经有故事在等你？直接打开工作台继续。</p>

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
            <div className="text-sm font-medium text-foreground">继续你的故事</div>

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

function PreviewDot({ icon, active = false, label }: { icon: React.ReactNode; active?: boolean; label?: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`flex size-10 items-center justify-center rounded-md border transition ${
          active ? 'border-primary/20 bg-primary/10 text-primary' : 'border-border bg-background/90 text-muted-foreground'
        }`}
      >
        {icon}
      </div>
      {label && <span className="text-[10px] text-muted-foreground">{label}</span>}
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
    channel: null,
    genres: [],
    tropes: [],
    premise: null,
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
    channel: null,
    genres: [],
    tropes: [],
    premise: null,
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
    channel: null,
    genres: [],
    tropes: [],
    premise: null,
    default_model_provider: null,
    default_model_id: null,
    created_at: '2026-04-03T00:00:00.000Z',
    updated_at: '2026-04-26T18:15:00.000Z',
  },
]
