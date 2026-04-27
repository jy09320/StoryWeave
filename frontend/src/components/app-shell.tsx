import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import {
  BookCopy,
  ChevronRight,
  Home,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Settings2,
  Sparkles,
  Users2,
} from 'lucide-react'
import { NavLink, Outlet, useLocation, useParams } from 'react-router-dom'

import { formatDate } from '@/lib/format'
import { getProject } from '@/services/projects'
import type { ProjectDetail } from '@/types/api'

const primaryNavItems = [
  { to: '/', label: '首页', icon: Home, end: true },
  { to: '/characters', label: '角色库', icon: Users2, end: false },
  { to: '/ai-toolbox', label: 'AI 工具箱', icon: Sparkles, end: false },
  { to: '/settings', label: '设置', icon: Settings2, end: false },
]

type UtilityTabKey = 'characters' | 'world' | 'ai'

const utilityTabs: Array<{ key: UtilityTabKey; label: string }> = [
  { key: 'characters', label: '角色' },
  { key: 'world', label: '设定' },
  { key: 'ai', label: 'AI' },
]

export function AppShell() {
  const location = useLocation()
  const { projectId, chapterId } = useParams<{ projectId?: string; chapterId?: string }>()
  const [isProjectTreeOpen, setIsProjectTreeOpen] = useState(true)
  const [isUtilityOpen, setIsUtilityOpen] = useState(false)
  const [activeUtilityTab, setActiveUtilityTab] = useState<UtilityTabKey>('characters')

  const isProjectScoped = Boolean(projectId) && location.pathname.startsWith(`/projects/${projectId}`)

  const projectQuery = useQuery<ProjectDetail, Error>({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId ?? ''),
    enabled: isProjectScoped,
    staleTime: 60_000,
  })

  useEffect(() => {
    if (!isProjectScoped) {
      setIsProjectTreeOpen(false)
      setIsUtilityOpen(false)
    } else {
      setIsProjectTreeOpen(true)
    }
  }, [isProjectScoped])

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey)) {
        return
      }

      const key = event.key.toLowerCase()
      if (key === 'b' && isProjectScoped) {
        event.preventDefault()
        setIsProjectTreeOpen((prev) => !prev)
      }

      if (key === 'j' && isProjectScoped) {
        event.preventDefault()
        setIsUtilityOpen((prev) => !prev)
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [isProjectScoped])

  const pageMeta = useMemo(() => {
    const project = projectQuery.data
    const activeChapter = project?.chapters.find((item) => item.id === chapterId) ?? null

    if (location.pathname === '/') {
      return {
        eyebrow: 'Dashboard',
        title: '最近进展',
        description: '优先回到上次正在推进的作品，而不是重新找入口。',
      }
    }

    if (location.pathname === '/characters') {
      return {
        eyebrow: 'Characters',
        title: '角色资产库',
        description: '维护可复用的角色资料，并逐步接入项目与编辑器上下文。',
      }
    }

    if (location.pathname === '/ai-toolbox') {
      return {
        eyebrow: 'AI Toolbox',
        title: 'AI 任务工作台',
        description: '把续写、改写和一致性检查收敛到结构化任务流中。',
      }
    }

    if (location.pathname === '/settings') {
      return {
        eyebrow: 'Settings',
        title: '工作台设置',
        description: '后续在这里统一管理偏好、快捷键和运行时策略。',
      }
    }

    if (isProjectScoped && location.pathname.includes('/editor/')) {
      return {
        eyebrow: project?.title ?? '章节编辑器',
        title: activeChapter?.title ?? '章节编辑器',
        description: activeChapter
          ? `第 ${activeChapter.order_index} 章 · ${activeChapter.word_count} 字`
          : '围绕正文、设定和 AI 辅助组织沉浸式写作体验。',
      }
    }

    if (isProjectScoped && location.pathname.endsWith('/world')) {
      return {
        eyebrow: project?.title ?? '项目设定',
        title: '世界观编辑',
        description: '维护项目级规则、势力、地点与时间线，让设定可被复用。',
      }
    }

    if (isProjectScoped) {
      return {
        eyebrow: 'Workspace',
        title: project?.title ?? '项目工作台',
        description: project?.description?.trim() || '在同一视角下管理章节结构、角色资产与世界观入口。',
      }
    }

    return {
      eyebrow: 'StoryWeave',
      title: '创作工作台',
      description: '统一承接项目、编辑器、角色资产与 AI 写作流。',
    }
  }, [chapterId, isProjectScoped, location.pathname, projectQuery.data])

  const project = projectQuery.data ?? null
  const projectChapters = project?.chapters ?? []
  const projectCharacters = project?.project_characters ?? []
  const worldSetting = project?.world_setting ?? null

  return (
    <div className="flex h-screen bg-[#18181B] text-[#E4E4E7] selection:bg-amber-500/30 selection:text-white">
      <aside className="flex w-16 shrink-0 flex-col items-center border-r border-white/5 bg-[#09090B] py-4">
        <div className="flex size-10 items-center justify-center rounded-md border border-white/10 bg-white/5 text-amber-400">
          <Sparkles className="size-4" />
        </div>

        <nav className="mt-6 flex flex-1 flex-col items-center gap-2">
          {primaryNavItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                title={item.label}
                className={({ isActive }) =>
                  clsx(
                    'flex size-11 items-center justify-center rounded-md transition',
                    isActive
                      ? 'bg-white/10 text-white'
                      : 'text-[#A1A1AA] hover:bg-white/5 hover:text-white',
                  )
                }
              >
                <Icon className="size-4" />
                <span className="sr-only">{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="mt-4 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-200">
          就绪
        </div>
      </aside>

      {isProjectScoped && isProjectTreeOpen ? (
        <aside className="hidden w-60 shrink-0 border-r border-white/5 bg-[#111113] md:flex md:flex-col">
          <div className="border-b border-white/5 px-4 py-4">
            <div className="text-[11px] uppercase tracking-[0.22em] text-[#52525B]">Project</div>
            <div className="mt-2 text-sm font-semibold text-white">{project?.title ?? '正在加载项目...'}</div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3">
            <div className="space-y-1">
              <SectionLabel>导航</SectionLabel>
              <ProjectTreeLink to={`/projects/${projectId}`} label="项目大盘" active={location.pathname === `/projects/${projectId}`} />
              <ProjectTreeLink
                to={`/projects/${projectId}/world`}
                label="世界观设定"
                active={location.pathname === `/projects/${projectId}/world`}
              />
            </div>

            <div className="mt-5 space-y-1">
              <SectionLabel>章节树</SectionLabel>
              {projectQuery.isLoading ? (
                <SidebarHint>正在加载章节结构...</SidebarHint>
              ) : projectChapters.length > 0 ? (
                projectChapters.map((chapter) => (
                  <ProjectTreeLink
                    key={chapter.id}
                    to={`/projects/${projectId}/editor/${chapter.id}`}
                    label={chapter.title}
                    meta={`第 ${chapter.order_index} 章`}
                    active={chapter.id === chapterId}
                  />
                ))
              ) : (
                <SidebarHint>当前项目还没有章节，先在工作台中创建结构。</SidebarHint>
              )}
            </div>

            <div className="mt-5 space-y-1">
              <SectionLabel>辅助入口</SectionLabel>
              <ProjectTreeLink to="/characters" label="全局角色库" active={location.pathname === '/characters'} />
              <ProjectTreeStatic label="回收站" meta="后续接入" />
            </div>
          </div>
        </aside>
      ) : null}

      <div className="flex min-w-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-white/5 bg-[#18181B]/95 backdrop-blur">
            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                {isProjectScoped ? (
                  <button
                    type="button"
                    className="inline-flex size-9 items-center justify-center rounded-md border border-white/8 bg-white/5 text-[#A1A1AA] transition hover:text-white"
                    onClick={() => setIsProjectTreeOpen((prev) => !prev)}
                  >
                    {isProjectTreeOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
                  </button>
                ) : null}

                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-[#52525B]">{pageMeta.eyebrow}</div>
                  <div className="truncate text-lg font-semibold text-white">{pageMeta.title}</div>
                  <div className="truncate text-sm text-[#A1A1AA]">{pageMeta.description}</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isProjectScoped ? (
                  <>
                    <button
                      type="button"
                      className="hidden h-9 items-center gap-2 rounded-md border border-white/8 bg-white/5 px-3 text-sm text-[#A1A1AA] transition hover:text-white md:inline-flex"
                      onClick={() => setIsUtilityOpen((prev) => !prev)}
                    >
                      {isUtilityOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
                      参考抽屉
                    </button>
                    <div className="hidden rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200 xl:block">
                      Ctrl+B 侧栏 · Ctrl+J 抽屉
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-5">
            <Outlet />
          </main>
        </div>

        {isProjectScoped && isUtilityOpen ? (
          <aside className="hidden w-[300px] shrink-0 border-l border-white/5 bg-[#111113] xl:flex xl:flex-col">
            <div className="border-b border-white/5 px-4 py-4">
              <div className="flex items-center gap-2">
                {utilityTabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveUtilityTab(tab.key)}
                    className={clsx(
                      'rounded-md px-3 py-1.5 text-sm transition',
                      activeUtilityTab === tab.key
                        ? 'bg-white/10 text-white'
                        : 'text-[#A1A1AA] hover:bg-white/5 hover:text-white',
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {activeUtilityTab === 'characters' ? (
                <div className="space-y-3">
                  <SectionLabel>角色速查</SectionLabel>
                  {projectCharacters.length > 0 ? (
                    projectCharacters.map((item) => (
                      <div key={item.id} className="rounded-md border border-white/8 bg-white/4 p-3">
                        <div className="text-sm font-medium text-white">{item.character.name}</div>
                        <div className="mt-1 text-xs text-[#A1A1AA]">
                          {item.role_label || item.summary || item.character.personality || '暂无项目摘要'}
                        </div>
                      </div>
                    ))
                  ) : (
                    <SidebarHint>当前项目还没有已绑定角色。</SidebarHint>
                  )}
                </div>
              ) : null}

              {activeUtilityTab === 'world' ? (
                <div className="space-y-3">
                  <SectionLabel>世界观词条</SectionLabel>
                  <UtilityInfoCard title="标题" value={worldSetting?.title || '尚未填写'} />
                  <UtilityInfoCard title="概览" value={worldSetting?.overview || '暂无概览'} />
                  <UtilityInfoCard title="规则" value={worldSetting?.rules || '暂无规则'} />
                </div>
              ) : null}

              {activeUtilityTab === 'ai' ? (
                <div className="space-y-3">
                  <SectionLabel>AI 任务台</SectionLabel>
                  <ProjectTreeLink
                    to={`/ai-toolbox?task=continue&projectId=${projectId}${chapterId ? `&chapterId=${chapterId}` : ''}`}
                    label="续写任务"
                    meta="延续当前章节"
                    active={false}
                  />
                  <ProjectTreeLink
                    to={`/ai-toolbox?task=rewrite&projectId=${projectId}${chapterId ? `&chapterId=${chapterId}` : ''}`}
                    label="改写任务"
                    meta="聚焦当前段落"
                    active={false}
                  />
                  <ProjectTreeLink
                    to={`/ai-toolbox?task=consistency&projectId=${projectId}${chapterId ? `&chapterId=${chapterId}` : ''}`}
                    label="设定检查"
                    meta="检查角色与世界观"
                    active={false}
                  />
                  <SidebarHint>
                    这部分先作为侧向入口存在。后续会把选区级改写和上下文联动真正下沉到编辑器内。
                  </SidebarHint>
                </div>
              ) : null}
            </div>

            <div className="border-t border-white/5 px-4 py-3 text-xs text-[#52525B]">
              {project ? `最近更新 ${formatDate(project.updated_at)}` : '等待项目上下文'}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-2 text-[11px] uppercase tracking-[0.22em] text-[#52525B]">{children}</div>
}

function SidebarHint({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-dashed border-white/8 bg-white/3 px-3 py-3 text-xs leading-6 text-[#A1A1AA]">{children}</div>
}

function ProjectTreeLink({
  to,
  label,
  meta,
  active,
}: {
  to: string
  label: string
  meta?: string
  active: boolean
}) {
  return (
    <NavLink
      to={to}
      className={clsx(
        'flex items-center justify-between rounded-md px-3 py-2.5 transition',
        active ? 'bg-white/10 text-white' : 'text-[#A1A1AA] hover:bg-white/5 hover:text-white',
      )}
    >
      <div className="min-w-0">
        <div className="truncate text-sm">{label}</div>
        {meta ? <div className="truncate text-xs text-[#52525B]">{meta}</div> : null}
      </div>
      <ChevronRight className="size-4 shrink-0" />
    </NavLink>
  )
}

function ProjectTreeStatic({ label, meta }: { label: string; meta?: string }) {
  return (
    <div className="flex items-center justify-between rounded-md px-3 py-2.5 text-[#52525B]">
      <div>
        <div className="text-sm">{label}</div>
        {meta ? <div className="text-xs">{meta}</div> : null}
      </div>
      <BookCopy className="size-4" />
    </div>
  )
}

function UtilityInfoCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-md border border-white/8 bg-white/4 p-3">
      <div className="text-xs uppercase tracking-[0.18em] text-[#52525B]">{title}</div>
      <div className="mt-2 text-sm leading-6 text-[#E4E4E7]">{value}</div>
    </div>
  )
}
