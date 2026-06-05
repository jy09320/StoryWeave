import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MagnifyingGlass, BookOpenText, Users, Sparkle, MapPin, Clock } from '@phosphor-icons/react'

/* ------------------------------------------------------------------ */
/*  Search scenarios                                                   */
/* ------------------------------------------------------------------ */

const searchScenarios = [
  {
    query: '主角第一次遇见艾琳是哪一章？',
    results: [
      {
        icon: BookOpenText,
        type: '章节定位',
        ref: '第 5 章《边境集市》',
        detail: '艾琳以流浪祭司的身份出现，用治愈术救了受伤的莱纳。这是两人的第一次相遇。',
        confidence: 98,
      },
      {
        icon: Users,
        type: '角色关联',
        ref: '莱纳 ↔ 艾琳',
        detail: '从此章开始建立联系，后续在第 12 章共同调查银月教团时关系加深。',
      },
    ],
  },
  {
    query: '戒指是在哪里拿到的？',
    results: [
      {
        icon: BookOpenText,
        type: '章节定位',
        ref: '第 17 章《雪夜》',
        detail: '莱纳在整理北境旧宅的书房时，从一个上锁的抽屉里发现了刻有银月纹章的戒指。',
        confidence: 96,
      },
      {
        icon: MapPin,
        type: '地点',
        ref: '北境旧宅 · 书房',
        detail: '此处也是莱纳父亲失踪前最后居住的地方。',
      },
    ],
  },
  {
    query: '银月教团的预言说了什么？',
    results: [
      {
        icon: BookOpenText,
        type: '章节定位',
        ref: '第 12 章《月蚀之塔》',
        detail: '当银月与北星重合之时，守护者的血脉将觉醒。这个伏笔尚未揭示完整含义。',
        confidence: 94,
      },
      {
        icon: Clock,
        type: '伏笔状态',
        ref: '未完成 · 待揭示',
        detail: '当前进度已到第 23 章，该预言仍未被触发。建议在近期章节推进。',
      },
    ],
  },
  {
    query: '洛维斯和莱纳是什么关系？',
    results: [
      {
        icon: Users,
        type: '角色关系',
        ref: '洛维斯 → 莱纳',
        detail: '洛维斯是莱纳父亲的旧部，现为北境城防统领。暗中守护莱纳，但莱纳并不知情。',
        confidence: 97,
      },
      {
        icon: BookOpenText,
        type: '首次出场',
        ref: '第 3 章《城墙之上》',
        detail: '洛维斯以城防统领身份首次出场，在莱纳面前刻意保持距离。',
      },
    ],
  },
] as const

/* ------------------------------------------------------------------ */
/*  Typewriter hook                                                    */
/* ------------------------------------------------------------------ */

function useTypewriter(text: string, speed = 55, startDelay = 400) {
  const [display, setDisplay] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    setDisplay('')
    setDone(false)
    let i = 0
    const start = setTimeout(() => {
      const timer = setInterval(() => {
        if (i < text.length) {
          setDisplay(text.slice(0, i + 1))
          i++
        } else {
          setDone(true)
          clearInterval(timer)
        }
      }, speed)
      return () => clearInterval(timer)
    }, startDelay)
    return () => clearTimeout(start)
  }, [text, speed, startDelay])

  return { display, done }
}

/* ------------------------------------------------------------------ */
/*  Result card                                                        */
/* ------------------------------------------------------------------ */

function ResultCard({
  result,
  index,
}: {
  result: (typeof searchScenarios)[number]['results'][number]
  index: number
}) {
  const Icon = result.icon

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, delay: index * 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-xl border border-black/5 bg-white/80 p-4"
      style={{ backdropFilter: 'blur(6px)' }}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-primary/70">
              {result.type}
            </span>
            {'confidence' in result && result.confidence && (
              <span className="rounded-full bg-emerald-50 px-2 py-px text-[10px] font-medium text-emerald-600">
                {result.confidence}% 匹配
              </span>
            )}
          </div>
          <div className="mt-1 text-sm font-semibold text-foreground">{result.ref}</div>
          <div className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground/80">{result.detail}</div>
        </div>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Knowledge sidebar                                                  */
/* ------------------------------------------------------------------ */

function KnowledgeSidebar() {
  const entries = [
    { label: '角色', count: 12, color: 'bg-emerald-500' },
    { label: '世界观', count: 5, color: 'bg-sky-500' },
    { label: '章节', count: 23, color: 'bg-violet-500' },
    { label: '伏笔', count: 4, color: 'bg-amber-500' },
  ]

  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60">故事知识库</div>
      <div className="grid grid-cols-2 gap-2">
        {entries.map((entry, idx) => (
          <motion.div
            key={entry.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 + idx * 0.1 }}
            className="rounded-xl border border-black/5 bg-white/60 p-3"
          >
            <div className="flex items-center gap-1.5">
              <span className={`size-1.5 rounded-full ${entry.color}`} />
              <span className="text-[11px] text-muted-foreground/70">{entry.label}</span>
            </div>
            <div className="mt-1 text-lg font-semibold text-foreground/80">{entry.count}</div>
          </motion.div>
        ))}
      </div>

      <div className="mt-4 space-y-1.5">
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60">活跃伏笔</div>
        {['银月教团的预言', '父亲失踪的真相', '洛维斯的秘密使命'].map((item, idx) => (
          <motion.div
            key={item}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 + idx * 0.12 }}
            className="flex items-center gap-2 rounded-lg bg-amber-50/40 px-3 py-2"
          >
            <motion.span
              className="size-1.5 rounded-full bg-amber-400"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity, delay: idx * 0.3 }}
            />
            <span className="text-[11px] text-foreground/70">{item}</span>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function WorldviewSearchDemo() {
  const [scenarioIdx, setScenarioIdx] = useState(0)
  const [phase, setPhase] = useState<'typing' | 'searching' | 'results'>('typing')
  const [cycleKey, setCycleKey] = useState(0)

  const scenario = searchScenarios[scenarioIdx]
  const { display: typedQuery, done: typingDone } = useTypewriter(scenario.query, 55, 500)

  // Phase transitions
  useEffect(() => {
    if (typingDone && phase === 'typing') {
      const t = setTimeout(() => setPhase('searching'), 300)
      return () => clearTimeout(t)
    }
  }, [typingDone, phase])

  useEffect(() => {
    if (phase === 'searching') {
      const t = setTimeout(() => setPhase('results'), 1200)
      return () => clearTimeout(t)
    }
  }, [phase])

  // Cycle to next scenario
  useEffect(() => {
    if (phase === 'results') {
      const t = setTimeout(() => {
        setScenarioIdx((prev) => (prev + 1) % searchScenarios.length)
        setPhase('typing')
        setCycleKey((k) => k + 1)
      }, 4000)
      return () => clearTimeout(t)
    }
  }, [phase])

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="relative rounded-2xl p-px" style={{
        background: 'linear-gradient(135deg, rgba(16,185,129,0.18), rgba(14,165,233,0.12), rgba(16,185,129,0.08), transparent 60%)',
      }}>
        {/* Animated border glow */}
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-2xl"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(16,185,129,0.1), transparent)',
            backgroundSize: '200% 100%',
          }}
          animate={{ backgroundPosition: ['200% 0', '-200% 0'] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
        />

        <div className="relative overflow-hidden rounded-2xl bg-white/95" style={{
          backdropFilter: 'blur(8px)',
          boxShadow: '0 0 0 0.5px rgba(200,200,204,0.3), 0 8px 32px rgba(0,0,0,0.04), 0 40px 80px rgba(16,185,129,0.05)',
        }}>
          {/* Title bar */}
          <div className="flex items-center justify-between border-b border-black/4 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <Sparkle className="size-4 text-primary" />
              <div className="text-sm font-medium text-foreground/80">偶记 · 世界观检索</div>
            </div>
            <div className="text-[11px] text-muted-foreground/50">自然语言查询你的故事宇宙</div>
          </div>

          <div className="grid gap-0 lg:grid-cols-[200px_1fr]">
            {/* Left: Knowledge sidebar */}
            <div className="border-r border-black/4 p-5">
              <KnowledgeSidebar />
            </div>

            {/* Right: Search demo */}
            <div className="p-6">
              {/* Search bar */}
              <div className="relative flex items-center gap-3 rounded-xl border border-black/8 bg-muted/15 px-4 py-3">
                <MagnifyingGlass className="size-4 shrink-0 text-muted-foreground/40" />
                <div className="flex-1 text-sm text-foreground/80 font-serif">
                  {typedQuery}
                  {phase === 'typing' && (
                    <motion.span
                      className="inline-block w-px h-4 bg-primary/60 ml-0.5 align-middle"
                      animate={{ opacity: [1, 0] }}
                      transition={{ duration: 0.5, repeat: Infinity }}
                    />
                  )}
                </div>
                {phase !== 'typing' && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1"
                  >
                    <span className="text-[10px] font-medium text-primary">检索中</span>
                  </motion.div>
                )}
              </div>

              {/* Searching animation */}
              <AnimatePresence mode="wait">
                {phase === 'searching' && (
                  <motion.div
                    key={`searching-${cycleKey}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="mt-4 space-y-2"
                  >
                    {['扫描角色关系图谱', '检索章节索引', '匹配语义向量'].map((step, idx) => (
                      <motion.div
                        key={step}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.25 }}
                        className="flex items-center gap-2.5 rounded-lg bg-primary/4 px-3.5 py-2"
                      >
                        <motion.div
                          className="size-1.5 rounded-full bg-primary"
                          animate={{ scale: [1, 1.6, 1], opacity: [1, 0.5, 1] }}
                          transition={{ duration: 0.8, delay: idx * 0.25, repeat: Infinity }}
                        />
                        <span className="text-[12px] text-foreground/60">{step}</span>
                      </motion.div>
                    ))}
                  </motion.div>
                )}

                {/* Results */}
                {phase === 'results' && (
                  <motion.div
                    key={`results-${cycleKey}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="mt-4 space-y-2.5"
                  >
                    {scenario.results.map((result, idx) => (
                      <ResultCard key={`${cycleKey}-${idx}`} result={result} index={idx} />
                    ))}

                    {/* Source indicator */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5 }}
                      className="mt-3 flex items-center gap-2 rounded-lg bg-primary/4 px-3 py-2"
                    >
                      <MagnifyingGlass className="size-3 text-primary/60" />
                      <span className="text-[11px] text-primary/70">
                        基于你的故事《北境烽火》检索 · {scenario.results.length} 条相关记忆
                      </span>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
