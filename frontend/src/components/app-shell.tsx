import { Outlet, NavLink } from 'react-router-dom'
import { Sparkles, Users2, Home } from 'lucide-react'
import { clsx } from 'clsx'

const navItems = [
  { to: '/', label: '首页', icon: Home, end: true },
  { to: '/characters', label: '角色库', icon: Users2, end: false },
]

export function AppShell() {
  return (
    <div className="min-h-screen bg-transparent selection:bg-primary/30 selection:text-primary-foreground">
      <header className="sticky top-0 z-30 w-full border-b border-white/5 bg-slate-950/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <div className="group relative">
              <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-tr from-primary to-violet-500 opacity-20 blur group-hover:opacity-40 transition duration-500" />
              <div className="relative flex size-10 items-center justify-center rounded-2xl bg-slate-900 border border-white/10 text-primary shadow-2xl">
                <Sparkles className="size-5 animate-pulse" />
              </div>
            </div>
            <div className="hidden sm:block">
              <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-primary/60">StoryWeave</p>
              <h1 className="text-base font-bold tracking-tight text-white">AI 创作工坊</h1>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <nav className="flex items-center gap-1.5">
              {navItems.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      clsx(
                        'group relative flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-300',
                        isActive
                          ? 'text-white'
                          : 'text-slate-400 hover:text-white hover:bg-white/5'
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon className={clsx("size-4 transition-transform group-hover:scale-110", isActive ? "text-primary" : "text-slate-500 group-hover:text-slate-300")} />
                        {item.label}
                        {isActive && (
                          <div className="absolute -bottom-[13px] left-0 h-[2px] w-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
                        )}
                      </>
                    )}
                  </NavLink>
                )
              })}
            </nav>
            
            <div className="h-4 w-[1px] bg-white/10" />

            <div className="hidden items-center gap-2 rounded-xl border border-white/5 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-slate-400 lg:flex">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              MVP v1.0 · 系统就绪
            </div>
          </div>
        </div>
      </header>


      <main className="mx-auto flex max-w-7xl flex-col px-4 py-6 md:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  )
}
