import { NavLink, Outlet } from 'react-router-dom'
import { clsx } from 'clsx'
import { Users, BookOpen, Network, Image } from '@phosphor-icons/react'

const assetNavItems = [
  {
    to: '/assets/characters',
    label: '角色',
    icon: Users,
    desc: '人物档案',
    color: 'text-violet-500',
    activeBg: 'bg-violet-500/8',
    activeIndicator: 'bg-violet-500',
  },
  {
    to: '/assets/stories',
    label: '故事',
    icon: BookOpen,
    desc: '章节进度',
    color: 'text-sky-500',
    activeBg: 'bg-sky-500/8',
    activeIndicator: 'bg-sky-500',
  },
  {
    to: '/assets/graph-entities',
    label: '知识图谱',
    icon: Network,
    desc: '世界构建',
    color: 'text-emerald-500',
    activeBg: 'bg-emerald-500/8',
    activeIndicator: 'bg-emerald-500',
  },
  {
    to: '/assets/portraits',
    label: '形象',
    icon: Image,
    desc: 'AI 生成肖像',
    color: 'text-amber-500',
    activeBg: 'bg-amber-500/8',
    activeIndicator: 'bg-amber-500',
  },
]

export function AssetsPage() {
  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="w-48 shrink-0 border-r border-border bg-sidebar flex flex-col py-5 px-3 gap-1">
        <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/50 select-none">
          我的资产
        </p>

        {assetNavItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200',
                  isActive
                    ? [item.activeBg, 'ring-1 ring-border/60 shadow-sm']
                    : 'hover:bg-muted/60 hover:shadow-sm',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* Active indicator stripe */}
                  {isActive && (
                    <span
                      className={clsx(
                        'absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full',
                        item.activeIndicator,
                      )}
                    />
                  )}

                  {/* Icon container */}
                  <span
                    className={clsx(
                      'flex size-8 shrink-0 items-center justify-center rounded-lg transition-transform duration-200',
                      isActive
                        ? [item.color, 'bg-background shadow-sm scale-105']
                        : 'bg-muted/60 text-muted-foreground group-hover:text-foreground group-hover:bg-muted',
                    )}
                  >
                    <Icon className="size-4" />
                  </span>

                  {/* Text */}
                  <div className="min-w-0 flex-1">
                    <div
                      className={clsx(
                        'text-sm font-medium leading-none transition-colors',
                        isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground',
                      )}
                    >
                      {item.label}
                    </div>
                    <div
                      className={clsx(
                        'mt-1 text-[11px] leading-none transition-colors',
                        isActive ? 'text-muted-foreground' : 'text-muted-foreground/50 group-hover:text-muted-foreground/80',
                      )}
                    >
                      {item.desc}
                    </div>
                  </div>
                </>
              )}
            </NavLink>
          )
        })}

        {/* Bottom decoration */}
        <div className="mt-auto pt-4 border-t border-border/50">
          <div className="rounded-xl bg-muted/40 p-3 text-center">
            <div className="text-[10px] text-muted-foreground/60 leading-relaxed">
              创作素材库
              <br />
              <span className="text-muted-foreground/40">统一管理你的世界</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Content */}
      <div className="min-w-0 flex-1 overflow-hidden h-full">
        <Outlet />
      </div>
    </div>
  )
}
