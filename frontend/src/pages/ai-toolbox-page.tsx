import { BrainCircuit, ChevronRight, FileText, Sparkles, WandSparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

import { EmptyState } from '@/components/empty-state'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const TOOLBOX_SECTIONS = [
  {
    title: '章节生成与续写',
    description: '围绕当前章节继续写、补桥段、扩写场景，是最直接承接编辑器工作流的一组工具。',
    icon: Sparkles,
    items: ['章节续写', '场景扩写', '段落补全'],
    status: '已接入基础续写能力',
  },
  {
    title: '文本改写与润色',
    description: '面向已有文本做节奏调整、对白增强和叙述风格统一，适合后续作为编辑器侧高频工具。',
    icon: WandSparkles,
    items: ['对白增强', '语气调整', '文风统一'],
    status: '待接入独立任务类型',
  },
  {
    title: '设定一致性辅助',
    description: '服务于角色、世界观与章节上下文检查，帮助长篇项目维持设定稳定。',
    icon: BrainCircuit,
    items: ['角色设定检查', '世界观冲突检查', '时间线提醒'],
    status: '待接入项目级上下文',
  },
]

export function AIToolboxPage() {
  return (
    <div className="space-y-6 pb-8">
      <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="border border-white/10 bg-white/6 shadow-lg shadow-black/5">
          <CardHeader className="gap-4">
            <CardDescription className="text-primary/80">AI 工具箱</CardDescription>
            <CardTitle className="max-w-3xl text-3xl font-semibold leading-tight text-white">
              把续写、改写、润色和设定辅助聚合成统一入口
            </CardTitle>
            <CardDescription className="max-w-3xl text-sm leading-7 text-slate-300">
              这一页先承担产品入口与能力组织作用，后续再逐步接入真实工具流，让用户明确知道 AI 不止是“在编辑器里续写”。
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <HighlightMetric label="当前定位" value="统一工具入口" hint="承接 AI 写作能力发现与分发" />
            <HighlightMetric label="优先接入" value="章节续写" hint="已具备后端调用与结果接收链路" />
            <HighlightMetric label="下一阶段" value="改写 / 检查" hint="扩展任务类型与项目级上下文" />
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-white/6 shadow-lg shadow-black/5">
          <CardHeader>
            <CardTitle className="text-xl text-white">使用建议</CardTitle>
            <CardDescription>当前阶段先把工具关系说清，再逐步落地能力。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-300">
            <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
              适合把“创作中”“编辑中”“检查中”三类任务分开展示，避免所有 AI 功能只堆在一个面板里。
            </div>
            <Link
              to="/"
              className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-white/10 bg-transparent px-3 text-sm font-medium text-white transition hover:bg-white/10"
            >
              返回首页
            </Link>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-white">工具分组</h2>
          <p className="text-sm text-slate-400">先按创作任务分组，而不是按技术接口分组。</p>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          {TOOLBOX_SECTIONS.map((section) => {
            const Icon = section.icon

            return (
              <Card key={section.title} className="border border-white/10 bg-white/6 shadow-lg shadow-black/5">
                <CardHeader className="gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-2xl border border-white/10 bg-black/10">
                      <Icon className="size-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg text-white">{section.title}</CardTitle>
                      <CardDescription>{section.status}</CardDescription>
                    </div>
                  </div>
                  <CardDescription className="text-sm leading-7 text-slate-300">{section.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {section.items.map((item) => (
                      <span key={item} className="rounded-full border border-white/10 bg-black/10 px-3 py-1 text-xs text-slate-300">
                        {item}
                      </span>
                    ))}
                  </div>
                  <div className="rounded-2xl border border-dashed border-white/10 bg-black/5 p-4 text-sm leading-6 text-slate-400">
                    当前作为入口占位，后续将逐步接入独立任务参数区、结果区与回写动作。
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      <section>
        <Card className="border border-white/10 bg-white/6 shadow-lg shadow-black/5">
          <CardHeader>
            <CardTitle className="text-xl text-white">接下来优先落地</CardTitle>
            <CardDescription>把页面入口和产品叙事先建立起来，再逐步接入真实工具能力。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3">
              <NextStepCard title="第一步" description="把首页与编辑器增加 AI 工具箱入口，形成统一跳转路径。" />
              <NextStepCard title="第二步" description="先接入章节续写、文本改写两类高频任务。" />
              <NextStepCard title="第三步" description="补项目级上下文后，再加入设定一致性检查能力。" />
            </div>
          </CardContent>
        </Card>
      </section>

      <EmptyState
        title="当前页面已完成入口搭建"
        description="本页已作为 AI 工具箱入口页落地。下一轮开发将继续补首页入口、编辑器跳转和工具任务细分。"
        action={
          <Link
            to="/"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            返回创作首页
            <ChevronRight className="size-4" />
          </Link>
        }
      />
    </div>
  )
}

function HighlightMetric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-400">{hint}</p>
    </div>
  )
}

function NextStepCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
      <div className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-white">
        <FileText className="size-4 text-primary" />
        {title}
      </div>
      <p className="text-sm leading-6 text-slate-400">{description}</p>
    </div>
  )
}
