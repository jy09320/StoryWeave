import { Outlet } from 'react-router-dom'
import { Sparkles, BookOpenText } from 'lucide-react'

export function AppShell() {
  return (
    <div className="min-h-screen bg-transparent">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-lg shadow-primary/15">
              <Sparkles className="size-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-primary/80">MyDaoDun</p>
              <h1 className="text-lg font-semibold text-white">AI 同人文写作平台</h1>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 md:flex">
            <BookOpenText className="size-4 text-primary" />
            MVP 第一阶段 · 项目 / 章节 / 编辑流
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col px-4 py-6 md:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  )
}
