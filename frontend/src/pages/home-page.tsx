import { useQuery } from '@tanstack/react-query'
import { Link, Navigate } from 'react-router-dom'
import { ArrowRight, BookOpen, Sparkles } from 'lucide-react'

import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/contexts/auth-context'
import { formatDate } from '@/lib/format'
import { listProjects } from '@/services/projects'
import type { Project } from '@/types/api'

export function HomePage() {
  const { token, isLoading } = useAuth()

  const projectsQuery = useQuery<Project[], Error>({
    queryKey: ['projects'],
    queryFn: listProjects,
    enabled: Boolean(token),
  })

  if (isLoading) {
    return <LoadingState label="正在加载..." />
  }

  if (token) {
    return <Navigate to="/workspace" replace />
  }

  const recentProjects = (projectsQuery.data ?? []).slice(0, 3)

  return (
    <main className="min-h-screen bg-[#f6f7fb] text-foreground">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-12">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
          <section className="space-y-6">
            <Badge variant="outline" className="border-border bg-background text-muted-foreground">
              StoryWeave
            </Badge>
            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                从作品定位开始，把网文项目建得更清楚。
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground">
                创建项目时先确定频道、题材、风格和一句话故事，再进入章节、角色、世界观的实际创作。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                to="/login"
                className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
              >
                登录进入工作台
                <ArrowRight className="ml-2 size-4" />
              </Link>
              <Link
                to="/register"
                className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-background px-5 text-sm text-foreground transition hover:bg-muted"
              >
                注册账号
              </Link>
            </div>
          </section>

          <aside className="rounded-2xl border border-border bg-card p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Sparkles className="size-4 text-primary" />
              创建流程
            </div>
            <div className="mt-4 space-y-3">
              {[
                '1. 基础信息：项目名、简介、作品类型',
                '2. 创作定位：频道、题材、风格、套路',
                '3. 承接到项目：进入后继续维护设定、章节和角色',
              ].map((item) => (
                <div key={item} className="rounded-md border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                  {item}
                </div>
              ))}
            </div>

            <div className="mt-6 border-t border-border pt-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <BookOpen className="size-4 text-primary" />
                示例项目
              </div>
              <div className="mt-3 space-y-3">
                {(recentProjects.length > 0
                  ? recentProjects
                  : [
                      {
                        id: 'demo-1',
                        title: '青云修仙录',
                        description: '男频仙侠升级流',
                        type: 'original',
                        source_work: null,
                        status: 'active',
                        channel: 'male',
                        genres: ['仙侠'],
                        tropes: ['爽文', '逆袭'],
                        premise: '一个被逐出宗门的少年，靠模拟能力逆天改命。',
                        default_model_provider: null,
                        default_model_id: null,
                        created_at: '2026-05-01T00:00:00.000Z',
                        updated_at: '2026-05-06T10:00:00.000Z',
                      },
                      {
                        id: 'demo-2',
                        title: '长夜婚书',
                        description: '女频古言权谋',
                        type: 'original',
                        source_work: null,
                        status: 'draft',
                        channel: 'female',
                        genres: ['言情', '历史'],
                        tropes: ['权谋', '先婚后爱'],
                        premise: '一场联姻把两人卷入皇权斗争，也逼出了彼此的真心。',
                        default_model_provider: null,
                        default_model_id: null,
                        created_at: '2026-05-02T00:00:00.000Z',
                        updated_at: '2026-05-05T14:30:00.000Z',
                      },
                    ]).map((project) => (
                  <div key={project.id} className="rounded-md border border-border bg-background px-4 py-3">
                    <div className="text-sm font-medium text-foreground">{project.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {project.premise || project.description || `最近更新 ${formatDate(project.updated_at)}`}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6">
              <Link
                to="/login"
                className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
              >
                开始创建项目
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
