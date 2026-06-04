import { useCallback, useMemo, useRef, useState, type MouseEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, useScroll, useTransform, useInView } from 'framer-motion'
import {
  ArrowRight,
  BookOpenText,
  Brain,
  Layers3,
  MessageCircleQuestion,
  Search,
  Sparkles,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import logoUrl from '@/assets/logo.png'
import { formatDate, parseApiDate } from '@/lib/format'
import { listProjects } from '@/services/projects'
import type { Project } from '@/types/api'

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const useCases = [
  '长篇小说',
  '跑团世界观',
  'OC 角色档案',
  '同人创作',
] as const

const resonanceCards = [
  {
    quote: '找不到上次写到哪',
    detail: '写了 20 万字以后，已经忘了主角和谁结过仇。',
  },
  {
    quote: '角色突然 OOC',
    detail: '三个月前埋的设定，自己先忘了。',
  },
  {
    quote: 'AI 续写不像自己',
    detail: '它写得通顺，但不是我的故事。',
  },
] as const

const featureGroups = [
  {
    icon: Brain,
    title: '故事记忆库',
    description: '搭载上下文记忆引擎：角色、设定、大纲统一管理。AI 构建你的专属创作数据库，读过你写的每一个字。',
    accent: true,
  },
  {
    icon: Layers3,
    title: '上下文续写',
    description: '自动检索关联章节再动笔。不会冒出未定义角色，不会跳过已埋伏笔。续写完美贴合你的风格。',
  },
  {
    icon: Search,
    title: '世界观检索',
    description: '自然语言查询你的故事宇宙。主角第一次遇见艾琳是哪一章？戒指是在哪里拿到的？直接回答。',
  },
] as const

const workflowSteps = [
  {
    index: '01',
    title: '创建项目',
    description: '新建作品，设定类型与方向。从这一刻起，所有素材都有了归处。',
  },
  {
    index: '02',
    title: '导入设定',
    description: '角色卡、世界观、剧情大纲——录入即记忆。AI 同步构建你的创作知识图谱。',
  },
  {
    index: '03',
    title: '开始写作',
    description: '打开编辑器就是完整上下文。AI 随时待命，你只管写，记忆交给偶记。',
  },
] as const

/* ------------------------------------------------------------------ */
/*  Animation variants                                                 */
/* ------------------------------------------------------------------ */

const appleEase = [0.22, 1, 0.36, 1] as [number, number, number, number]

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: (delay = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: appleEase, delay },
  }),
}

const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12 },
  },
}

const staggerItem = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: appleEase },
  },
}

/* ------------------------------------------------------------------ */
/*  Mouse-following glow card                                          */
/* ------------------------------------------------------------------ */

function GlowCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [active, setActive] = useState(false)

  const onMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }, [])

  return (
    <div
      ref={ref}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onMouseMove={onMove}
      className={`relative overflow-hidden ${className ?? ''}`}
      style={{
        '--glow-x': `${pos.x}px`,
        '--glow-y': `${pos.y}px`,
        '--glow-opacity': active ? 1 : 0,
      } as React.CSSProperties}
    >
      {/* Glow layer */}
      <div
        className="pointer-events-none absolute inset-0 z-10 transition-opacity duration-300"
        style={{
          opacity: active ? 1 : 0,
          background: `radial-gradient(400px circle at ${pos.x}px ${pos.y}px, rgba(16,185,129,0.07), transparent 60%)`,
        }}
      />
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Animated energy line for workflow                                  */
/* ------------------------------------------------------------------ */

function EnergyLine() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, amount: 0.5 })

  return (
    <div ref={ref} className="absolute top-0 left-[23px] h-full w-px lg:left-[35px]">
      {/* Background track */}
      <div className="absolute inset-0 bg-[#e5e5e7]" />
      {/* Animated fill */}
      <motion.div
        className="absolute top-0 left-0 w-full bg-gradient-to-b from-primary via-primary to-primary/40"
        initial={{ height: '0%' }}
        animate={isInView ? { height: '100%' } : { height: '0%' }}
        transition={{ duration: 1.2, ease: appleEase, delay: 0.3 }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

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

  const { scrollY } = useScroll()
  const navShadowOpacity = useTransform(scrollY, [0, 120], [0, 1])

  return (
    <div className="min-h-screen text-foreground">
      {/* ============================================================ */}
      {/*  Fixed acrylic navigation — floating, high-contrast           */}
      {/* ============================================================ */}
      <motion.header
        className="fixed inset-x-0 top-0 z-50 border-b border-black/6"
        style={{
          backdropFilter: 'blur(24px) saturate(1.8)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.8)',
          backgroundColor: 'rgba(255,253,249,0.88)',
          boxShadow: useTransform(
            navShadowOpacity,
            (v) => `0 1px 0 rgba(0,0,0,${0.04 + v * 0.04})`,
          ),
        }}
      >
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-6 lg:px-10">
          <div className="flex items-center gap-2.5">
            <img src={logoUrl} alt="偶记" className="h-20 w-auto object-contain" />
          </div>

          <nav className="hidden items-center gap-8 text-sm font-medium text-[#1D1D1F] md:flex">
            <a href="#product" className="transition hover:text-foreground">产品能力</a>
            <a href="#workflow" className="transition hover:text-foreground">工作流</a>
            <a href="#launch" className="transition hover:text-foreground">开始使用</a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              to="/workspace"
              className="hidden h-9 items-center justify-center rounded-full border border-black/8 bg-white/80 px-4 text-sm text-foreground transition hover:bg-white md:inline-flex"
            >
              进入工作台
            </Link>
            <Link
              to="/ai-toolbox"
              className="inline-flex h-9 items-center justify-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-80"
            >
              体验 AI 写作
            </Link>
          </div>
        </div>
      </motion.header>

      {/* ============================================================ */}
      {/*  Hero — headline + AI memory demo                            */}
      {/* ============================================================ */}
      {/* Hero — text only, centered in viewport */}
      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden pt-20 pb-12">
        {/* Subtle background glow */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(16,185,129,0.06), transparent),' +
              'radial-gradient(ellipse 40% 40% at 30% 60%, rgba(14,165,233,0.04), transparent)',
          }}
        />

        <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col items-center px-6 lg:px-10">
          {/* Continue-writing banner */}
          {recentProjects.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="mb-8 flex items-center gap-2.5 rounded-full border border-black/5 bg-white/85 px-4 py-2 shadow-[0_2px_16px_rgba(0,0,0,0.04)]"
              style={{ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
            >
              <span className="size-1.5 rounded-full bg-primary/60" />
              <span className="text-[13px] text-muted-foreground">继续写</span>
              <span className="max-w-40 truncate text-[13px] font-medium" style={{ color: '#1D1D1F' }}>{recentProjects[0].title}</span>
              <Link to="/workspace" className="flex shrink-0 items-center gap-1 text-[13px] text-primary hover:underline">
                <ArrowRight className="size-3" />
              </Link>
            </motion.div>
          )}

          {/* Centered headline */}
          <div className="flex flex-col items-center text-center">
            <motion.h1
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={0.15}
              className="mt-4 text-6xl font-bold leading-[1.12] text-[#1D1D1F] sm:text-7xl lg:text-8xl"
              style={{ letterSpacing: '-0.02em' }}
            >
              你的故事
              <br />
              <span className="relative inline-block bg-linear-to-r from-[#1D1D1F] to-emerald-700/80 bg-clip-text text-transparent">
                一直都在等你回来
              </span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={0.3}
              className="mt-4 max-w-xl text-lg leading-8 text-[#86868b]"
            >
              AI 记得你的角色、设定与剧情。
              <br />
              每次打开，都能从上次停下的地方继续写。
            </motion.p>

            {/* Use-case tags */}
            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={0.4}
              className="mt-3 flex flex-wrap items-center justify-center gap-2"
            >
              {useCases.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-black/5 bg-white/70 px-3.5 py-1 text-[13px] text-[#6e6e73]"
                >
                  ✓ {tag}
                </span>
              ))}
            </motion.div>

            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={0.5}
              className="mt-5 flex flex-wrap items-center justify-center gap-3"
            >
              <Link
                to="/workspace"
                className="inline-flex h-11 items-center justify-center rounded-full px-6 text-sm font-medium text-white shadow-[0_4px_20px_rgba(0,0,0,0.18)] transition hover:opacity-85 hover:shadow-[0_6px_28px_rgba(0,0,0,0.22)]"
                style={{ backgroundColor: '#000' }}
              >
                创建我的故事
              </Link>
              <a
                href="#product"
                className="inline-flex h-11 items-center justify-center rounded-full border border-black/8 bg-white/80 px-6 text-sm text-foreground transition hover:bg-white"
              >
                看看它能记住什么 ↓
              </a>
            </motion.div>
          </div>
        </div>
      </section>

      {/* AI Memory Demo — independent section, full visibility */}
      <section className="relative overflow-hidden border-b border-black/4 pb-24">
        <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col items-center px-6 lg:px-10">
          <motion.div
            className="relative w-full max-w-4xl"
            initial={{ opacity: 0, y: 50, rotateX: 4 }}
            whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 1, ease: appleEase }}
            style={{ perspective: 1200 }}
          >
            {/* Floating animation wrapper */}
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            >
              {/* Soft shadow */}
              <div className="absolute inset-x-12 -bottom-6 h-28 rounded-3xl bg-primary/5 blur-3xl" />
              <div className="absolute inset-x-4 -bottom-2 h-16 rounded-3xl bg-black/4 blur-2xl" />

              {/* Glowing border */}
              <div className="relative rounded-2xl p-px" style={{
                background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(14,165,233,0.15), rgba(16,185,129,0.1), transparent 60%)',
              }}>
                {/* Animated border glow sweep */}
                <motion.div
                  className="pointer-events-none absolute inset-0 rounded-2xl"
                  style={{
                    background: 'linear-gradient(90deg, transparent, rgba(16,185,129,0.12), transparent)',
                    backgroundSize: '200% 100%',
                  }}
                  animate={{ backgroundPosition: ['200% 0', '-200% 0'] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                />

                <div className="relative overflow-hidden rounded-2xl bg-white/95" style={{ backdropFilter: 'blur(8px)', boxShadow: '0 0 0 0.5px rgba(200,200,204,0.3), 0 8px 32px rgba(0,0,0,0.04), 0 40px 80px rgba(16,185,129,0.05), 0 80px 160px rgba(14,165,233,0.04), 0 20px 60px rgba(0,0,0,0.05)' }}>
                  {/* Title bar */}
                  <div className="flex items-center justify-between border-b border-black/4 px-5 py-3.5">
                    <div className="text-sm font-medium text-foreground/80">偶记 · 故事记忆</div>
                    <div className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full bg-emerald-400/70" />
                      <span className="size-2.5 rounded-full bg-sky-400/60" />
                      <span className="size-2.5 rounded-full bg-slate-300/60" />
                    </div>
                  </div>

                  <div className="grid gap-0 md:grid-cols-[2fr_3fr]">
                    {/* Left: Character profile */}
                    <div className="border-r border-black/4 p-7">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">角色档案</div>
                      <div className="mt-3 space-y-3">
                        <div className="rounded-xl bg-muted/20 p-3.5">
                          <div className="flex items-center gap-2">
                            <div className="size-7 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-xs">⚔️</span>
                            </div>
                            <div>
                              <div className="text-sm font-medium text-foreground/80">莱纳</div>
                              <div className="text-[11px] text-muted-foreground/60">王国骑士 · 主角</div>
                            </div>
                          </div>
                          <div className="mt-2.5 space-y-1.5 text-[12px] text-muted-foreground/80">
                            <div><span className="text-foreground/50">身份：</span>北境守护骑士团副团长</div>
                            <div><span className="text-foreground/50">最近剧情：</span>刚发现父亲失踪的真相</div>
                          </div>
                        </div>
                        <div className="rounded-xl bg-muted/20 p-3.5">
                          <div className="flex items-center gap-2">
                            <div className="size-7 rounded-full bg-sky-400/10 flex items-center justify-center">
                              <span className="text-xs">🔮</span>
                            </div>
                            <div>
                              <div className="text-sm font-medium text-foreground/80">艾琳</div>
                              <div className="text-[11px] text-muted-foreground/60">银月教团祭司 · 女主</div>
                            </div>
                          </div>
                        </div>
                        <div className="rounded-xl bg-muted/20 p-3.5">
                          <div className="text-[11px] uppercase tracking-widest text-muted-foreground/50">世界观</div>
                          <div className="mt-1 text-[12px] text-muted-foreground/80">北境七城 · 银月教团</div>
                        </div>
                        <div className="flex items-center gap-2 rounded-lg bg-amber-50/60 px-3 py-2">
                          <span className="text-[11px]">⚠️</span>
                          <span className="text-[11px] text-amber-700/70">未完成伏笔：银月教团的预言</span>
                        </div>
                      </div>
                    </div>

                    {/* Right: AI Q&A */}
                    <div className="p-7">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">向 AI 提问</div>
                      <div className="mt-3 space-y-3">
                        <div className="flex justify-end">
                          <div className="max-w-[85%] rounded-2xl rounded-br-md bg-foreground/6 px-3.5 py-2.5">
                            <div className="text-[12px] text-foreground/80">主角什么时候得到戒指的？</div>
                          </div>
                        </div>
                        <div className="flex justify-start">
                          <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-primary/6 px-3.5 py-2.5">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <Sparkles className="size-3 text-primary" />
                              <span className="text-[10px] font-medium text-primary/70">偶记</span>
                            </div>
                            <div className="text-[12px] leading-relaxed text-foreground/75">
                              第 17 章《雪夜》。<br />
                              莱纳在父亲遗物中发现了一枚刻有银月纹章的戒指，当时他正在整理北境旧宅的书房。
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <div className="max-w-[85%] rounded-2xl rounded-br-md bg-foreground/6 px-3.5 py-2.5">
                            <div className="text-[12px] text-foreground/80">艾琳第一次出场在哪章？</div>
                          </div>
                        </div>
                        <div className="flex justify-start">
                          <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-primary/6 px-3.5 py-2.5">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <Sparkles className="size-3 text-primary" />
                              <span className="text-[10px] font-medium text-primary/70">偶记</span>
                            </div>
                            <div className="text-[12px] leading-relaxed text-foreground/75">
                              第 5 章《边境集市》。她以流浪祭司的身份出现，用治愈术救了受伤的莱纳。
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  Resonance — pain points — grid with dot-matrix bg            */}
      {/* ============================================================ */}
      <section className="relative border-b border-black/4">
        {/* Dot matrix background */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.04) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />

        <motion.div
          className="relative mx-auto w-full max-w-7xl px-6 py-24 lg:px-10"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={staggerContainer}
        >
          <motion.h2
            variants={fadeUp}
            className="text-center text-2xl font-semibold tracking-tight text-[#1D1D1F] sm:text-3xl"
          >
            每个写故事的人，都有过这样的时刻
          </motion.h2>

          <div className="mt-14 grid gap-5 lg:grid-cols-3">
            {resonanceCards.map((card) => (
              <motion.div
                key={card.quote}
                variants={staggerItem}
                className="relative overflow-hidden rounded-2xl bg-white p-7 shadow-[0_20px_60px_rgba(0,0,0,0.04)] transition-shadow duration-300 hover:shadow-[0_24px_70px_rgba(0,0,0,0.07)]"
              >
                {/* Code-style quote marker */}
                <span className="font-mono text-sm text-primary/30 select-none">//</span>
                <p className="mt-3 text-lg font-semibold leading-7 text-[#1D1D1F]">{card.quote}</p>
                <p className="mt-3 text-sm leading-6 text-[#86868b]">{card.detail}</p>
              </motion.div>
            ))}
          </div>

          <motion.p variants={fadeUp} className="mt-12 text-center text-sm text-[#86868b]">
            偶记记得你的故事，帮你把这些都接住。
          </motion.p>
        </motion.div>
      </section>

      {/* ============================================================ */}
      {/*  AI Memory Demo — real case                                  */}
      {/* ============================================================ */}
      <section className="border-b border-black/4 bg-muted/20">
        <motion.div
          className="mx-auto w-full max-w-7xl px-6 py-24 lg:px-10"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={staggerContainer}
        >
          <motion.div variants={fadeUp} className="text-center">
            <div className="text-[11px] uppercase tracking-[0.22em] text-primary/70">它记住了什么</div>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#1D1D1F]">这才是 AI 记忆的真正样子</h2>
          </motion.div>

          <div className="mt-14 grid gap-6 lg:grid-cols-2">
            {/* Memory card */}
            <motion.div
              variants={staggerItem}
              className="rounded-2xl bg-white p-8 shadow-[0_20px_60px_rgba(0,0,0,0.04)]"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <BookOpenText className="size-4 text-primary" />
                项目：北境烽火
              </div>
              <div className="mt-4 space-y-3">
                <div>
                  <div className="text-[11px] uppercase tracking-widest text-muted-foreground/60">角色</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {['莱纳', '艾琳', '洛维斯'].map((name) => (
                      <span key={name} className="rounded-full bg-primary/8 px-2.5 py-0.5 text-xs text-foreground/70">{name}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-widest text-muted-foreground/60">世界观</div>
                  <div className="mt-1 text-sm text-foreground/70">北境七城</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-widest text-muted-foreground/60">最近剧情</div>
                  <div className="mt-1 text-sm text-foreground/70">主角发现王室血统的秘密</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-widest text-muted-foreground/60">未完成伏笔</div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-amber-400" />
                    <span className="text-sm text-foreground/70">银月教团的预言</span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* AI conversation */}
            <motion.div
              variants={staggerItem}
              className="rounded-2xl bg-white p-8 shadow-[0_20px_60px_rgba(0,0,0,0.04)]"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <MessageCircleQuestion className="size-4 text-primary" />
                向 AI 提问
              </div>
              <div className="mt-4 space-y-3">
                <div className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-md bg-foreground/6 px-4 py-2.5">
                    <div className="text-sm text-foreground/80">主角什么时候得到戒指的？</div>
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-primary/6 px-4 py-2.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Sparkles className="size-3 text-primary" />
                      <span className="text-[11px] font-medium text-primary/70">偶记</span>
                    </div>
                    <div className="text-sm leading-relaxed text-foreground/75">
                      第 17 章《雪夜》，从父亲遗物中获得。
                      <br />
                      当时莱纳正在整理北境旧宅的书房，在一个上锁的抽屉里发现了它。
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* ============================================================ */}
      {/*  Features — Bento layout + mouse-following glow              */}
      {/* ============================================================ */}
      <section id="product" className="border-b border-black/4">
        <motion.div
          className="mx-auto w-full max-w-7xl px-6 py-24 lg:px-10"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={staggerContainer}
        >
          <motion.div variants={fadeUp}>
            <div className="text-[11px] uppercase tracking-[0.22em] text-primary/70">核心能力</div>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#1D1D1F]">不只是写作工具，是故事的长期记忆</h2>
          </motion.div>

          {/* Bento grid: 1 large + 2 small */}
          <div className="mt-14 grid gap-4 lg:grid-cols-2 lg:grid-rows-2">
            {/* Large card — spans 2 rows */}
            <motion.div variants={staggerItem} className="lg:row-span-2">
              <GlowCard className="h-full rounded-2xl bg-white p-8 shadow-[0_20px_60px_rgba(0,0,0,0.04)] transition-all duration-300 hover:-translate-y-0.5">
                <div className="relative z-20 flex h-full flex-col">
                  <div className="flex size-12 items-center justify-center rounded-xl bg-linear-to-br from-emerald-500/15 to-sky-500/10 text-emerald-700">
                    <Brain className="size-6" />
                  </div>
                  <h3 className="mt-6 text-xl font-semibold text-[#1D1D1F]">{featureGroups[0].title}</h3>
                  <p className="mt-4 text-sm leading-8 text-[#86868b]">{featureGroups[0].description}</p>

                  {/* Tags — right after description */}
                  <div className="mt-5 flex flex-wrap gap-2">
                    {['角色档案', '世界观设定', '剧情大纲', '章节索引'].map((tag) => (
                      <span key={tag} className="rounded-full bg-primary/6 px-3 py-1 text-xs text-foreground/60">{tag}</span>
                    ))}
                  </div>

                  {/* Mini relationship graph wireframe */}
                  <div className="mt-6 rounded-xl border border-black/4 bg-muted/15 p-4">
                    <div className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-3">角色关系图谱</div>
                    <svg viewBox="0 0 280 100" className="w-full" fill="none">
                      {/* Nodes */}
                      <circle cx="60" cy="50" r="18" stroke="rgba(16,185,129,0.3)" strokeWidth="1" fill="rgba(16,185,129,0.05)" />
                      <text x="60" y="54" textAnchor="middle" fill="rgba(30,30,32,0.5)" fontSize="9" fontFamily="sans-serif">莱纳</text>
                      <circle cx="160" cy="30" r="18" stroke="rgba(14,165,233,0.3)" strokeWidth="1" fill="rgba(14,165,233,0.05)" />
                      <text x="160" y="34" textAnchor="middle" fill="rgba(30,30,32,0.5)" fontSize="9" fontFamily="sans-serif">艾琳</text>
                      <circle cx="160" cy="75" r="16" stroke="rgba(100,100,110,0.2)" strokeWidth="1" fill="rgba(100,100,110,0.03)" />
                      <text x="160" y="79" textAnchor="middle" fill="rgba(30,30,32,0.4)" fontSize="9" fontFamily="sans-serif">洛维斯</text>
                      <circle cx="250" cy="50" r="14" stroke="rgba(245,158,11,0.25)" strokeWidth="1" fill="rgba(245,158,11,0.04)" />
                      <text x="250" y="54" textAnchor="middle" fill="rgba(30,30,32,0.4)" fontSize="8" fontFamily="sans-serif">银月教团</text>
                      {/* Connections */}
                      <line x1="78" y1="42" x2="142" y2="33" stroke="rgba(16,185,129,0.15)" strokeWidth="1" strokeDasharray="3 3" />
                      <line x1="78" y1="58" x2="144" y2="72" stroke="rgba(100,100,110,0.12)" strokeWidth="1" strokeDasharray="3 3" />
                      <line x1="178" y1="36" x2="236" y2="47" stroke="rgba(245,158,11,0.12)" strokeWidth="1" strokeDasharray="3 3" />
                      <line x1="176" y1="70" x2="236" y2="55" stroke="rgba(100,100,110,0.1)" strokeWidth="1" strokeDasharray="3 3" />
                    </svg>
                  </div>
                </div>
              </GlowCard>
            </motion.div>

            {/* Small card 1 */}
            <motion.div variants={staggerItem}>
              <GlowCard className="h-full rounded-2xl bg-white p-7 shadow-[0_20px_60px_rgba(0,0,0,0.04)] transition-all duration-300 hover:-translate-y-0.5">
                <div className="relative z-20">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-linear-to-br from-emerald-500/15 to-sky-500/10 text-emerald-700">
                    <Layers3 className="size-5" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-[#1D1D1F]">{featureGroups[1].title}</h3>
                  <p className="mt-3 text-sm leading-7 text-[#86868b]">{featureGroups[1].description}</p>
                </div>
              </GlowCard>
            </motion.div>

            {/* Small card 2 */}
            <motion.div variants={staggerItem}>
              <GlowCard className="h-full rounded-2xl bg-white p-7 shadow-[0_20px_60px_rgba(0,0,0,0.04)] transition-all duration-300 hover:-translate-y-0.5">
                <div className="relative z-20">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-linear-to-br from-emerald-500/15 to-sky-500/10 text-emerald-700">
                    <Search className="size-5" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-[#1D1D1F]">{featureGroups[2].title}</h3>
                  <p className="mt-3 text-sm leading-7 text-[#86868b]">{featureGroups[2].description}</p>
                </div>
              </GlowCard>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* ============================================================ */}
      {/*  Workflow — energy line animation                            */}
      {/* ============================================================ */}
      <section id="workflow" className="border-b border-black/4">
        <motion.div
          className="mx-auto grid w-full max-w-7xl gap-12 px-6 py-24 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:px-10"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={staggerContainer}
        >
          <motion.div variants={fadeUp} className="lg:sticky lg:top-24 lg:self-center">
            <div className="text-[11px] uppercase tracking-[0.22em] text-primary/70">开始的方式</div>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#1D1D1F]">三步，把你的故事安顿好</h2>
          </motion.div>

          <motion.div variants={staggerContainer} className="relative">
            {/* Energy line — single continuous track */}
            <EnergyLine />

            <div className="space-y-0">
              {workflowSteps.map((step, idx) => (
                <motion.div
                  key={step.index}
                  variants={staggerItem}
                  className="relative flex gap-8 py-7 pl-14 lg:pl-16"
                >
                  {/* Step number — lights up when energy line reaches it */}
                  <motion.span
                    className="w-10 shrink-0 font-mono text-sm font-semibold tabular-nums tracking-wider"
                    initial={{ color: '#c8c8cc' }}
                    whileInView={{ color: '#1D1D1F' }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.3 + idx * 0.3 }}
                  >
                    {step.index}
                  </motion.span>
                  <div>
                    <div className="text-lg font-medium text-[#1D1D1F]">{step.title}</div>
                    <div className="mt-2 text-sm leading-7 text-[#86868b]">{step.description}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* ============================================================ */}
      {/*  CTA / Launch                                                */}
      {/* ============================================================ */}
      <section id="launch" className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/20 to-transparent" />

        <motion.div
          className="mx-auto grid w-full max-w-7xl gap-12 px-6 py-24 lg:grid-cols-[minmax(0,1fr)_380px] lg:px-10"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={staggerContainer}
        >
          <motion.div variants={fadeUp}>
            <div className="text-[11px] uppercase tracking-[0.22em] text-primary/70">开始使用</div>
            <h2 className="mt-3 text-4xl font-bold tracking-tight text-[#1D1D1F]">
              让 AI 读你的故事，
              <br />
              然后记住它
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-[#86868b]">
              导入你已有的小说，或者从零开始。偶记会记住每一个角色、每一条设定、每一章剧情。
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/workspace"
                className="inline-flex h-11 items-center justify-center rounded-full px-6 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(0,0,0,0.18)] transition hover:opacity-85 hover:shadow-[0_6px_28px_rgba(0,0,0,0.22)]"
                style={{ backgroundColor: '#000' }}
              >
                免费开始写
              </Link>
              <Link
                to="/ai-toolbox"
                className="inline-flex h-11 items-center justify-center rounded-full border border-black/8 bg-white/80 px-6 text-sm text-foreground transition hover:bg-white"
              >
                让 AI 先读你的旧稿
              </Link>
            </div>
          </motion.div>

          <motion.div
            variants={staggerItem}
            className="rounded-2xl bg-white p-6 shadow-[0_20px_60px_rgba(16,185,129,0.06)]"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Sparkles className="size-4 text-primary" />
              继续你的故事
            </div>

            <div className="mt-5 space-y-3">
              {(recentProjects.length > 0 ? recentProjects : fallbackProjects).map((project) => (
                <Link
                  key={project.id}
                  to="/workspace"
                  className="group flex items-center justify-between gap-3 rounded-xl bg-muted/20 px-4 py-4 transition hover:bg-primary/4"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{project.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{formatProjectDate(project.updated_at)}</div>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              ))}
            </div>
          </motion.div>
        </motion.div>
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatProjectDate(value: string) {
  if (!value) return '最近更新'
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
