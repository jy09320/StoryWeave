import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkle, Database, MagnifyingGlass, FileText, ArrowRight } from '@phosphor-icons/react'

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const memorySteps = [
  { id: 'text', label: '文字片段', icon: FileText, detail: '第17章：莱纳在父亲遗物中发现了银月戒指…' },
  { id: 'vector', label: '向量化', icon: Database, detail: '语义编码 → 768维向量' },
  { id: 'store', label: '记忆存储', icon: Database, detail: '写入故事记忆库' },
  { id: 'retrieve', label: '精准召回', icon: MagnifyingGlass, detail: '命中：第17章·银月戒指' },
] as const

const qaPairs = [
  {
    q: '主角什么时候得到戒指的？',
    a: '第 17 章《雪夜》。莱纳在父亲遗物中发现了一枚刻有银月纹章的戒指，当时他正在整理北境旧宅的书房。',
  },
  {
    q: '艾琳第一次出场在哪章？',
    a: '第 5 章《边境集市》。她以流浪祭司的身份出现，用治愈术救了受伤的莱纳。',
  },
  {
    q: '银月教团的预言是什么？',
    a: '第 12 章提到：当银月与北星重合之时，守护者的血脉将觉醒。这个伏笔尚未揭示完整含义。',
  },
] as const

const characters = [
  { name: '莱纳', role: '王国骑士 · 主角', emoji: '冲突', color: 'emerald', status: '刚发现父亲失踪的真相' },
  { name: '艾琳', role: '银月教团祭司 · 女主', emoji: '🔮', color: 'sky', status: '正在调查教团内部的异动' },
] as const

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function MemoryFlowDemo() {
  const [activeStep, setActiveStep] = useState(0)
  const [qaIndex, setQaIndex] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)

  /* Auto-cycle memory steps */
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % memorySteps.length)
    }, 2200)
    return () => clearInterval(timer)
  }, [])

  /* Auto-cycle Q&A pairs */
  useEffect(() => {
    const cycle = () => {
      setShowAnswer(false)
      setTimeout(() => setShowAnswer(true), 600)
    }
    cycle()
    const timer = setInterval(() => {
      setQaIndex((prev) => (prev + 1) % qaPairs.length)
      cycle()
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="w-full max-w-5xl mx-auto">
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

        <div className="relative overflow-hidden rounded-2xl bg-white/95" style={{
          backdropFilter: 'blur(8px)',
          boxShadow: '0 0 0 0.5px rgba(200,200,204,0.3), 0 8px 32px rgba(0,0,0,0.04), 0 40px 80px rgba(16,185,129,0.05)',
        }}>
          {/* Title bar */}
          <div className="flex items-center justify-between border-b border-black/4 px-5 py-3.5">
            <div className="text-sm font-medium text-foreground/80">偶记 · 故事记忆系统</div>
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-emerald-400/70" />
              <span className="size-2.5 rounded-full bg-sky-400/60" />
              <span className="size-2.5 rounded-full bg-slate-300/60" />
            </div>
          </div>

          <div className="grid gap-0 lg:grid-cols-[1fr_1.2fr_1fr]">
            {/* Left: Character cards */}
            <div className="border-r border-black/4 p-5">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">角色档案</div>
              <div className="mt-3 space-y-2.5">
                {characters.map((char) => (
                  <motion.div
                    key={char.name}
                    className="rounded-xl bg-muted/20 p-3"
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`size-7 rounded-full flex items-center justify-center ${char.color === 'emerald' ? 'bg-primary/10' : 'bg-sky-400/10'}`}>
                        <span className="text-xs">{char.emoji}</span>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-foreground/80">{char.name}</div>
                        <div className="text-[11px] text-muted-foreground/60">{char.role}</div>
                      </div>
                    </div>
                    <div className="mt-2 text-[12px] text-muted-foreground/80">
                      <span className="text-foreground/50">最近剧情：</span>{char.status}
                    </div>
                  </motion.div>
                ))}

                {/* World-building */}
                <div className="rounded-xl bg-muted/20 p-3">
                  <div className="text-[11px] uppercase tracking-widest text-muted-foreground/50">世界观</div>
                  <div className="mt-1 text-[12px] text-muted-foreground/80">北境七城 · 银月教团</div>
                </div>

                {/* Foreshadowing */}
                <motion.div
                  className="flex items-center gap-2 rounded-lg bg-amber-50/60 px-3 py-2"
                  animate={{ opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <span className="text-[11px]">注意</span>
                  <span className="text-[11px] text-amber-700/70">未完成伏笔：银月教团的预言</span>
                </motion.div>
              </div>
            </div>

            {/* Middle: Memory flow animation */}
            <div className="border-r border-black/4 p-5">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70 mb-3">记忆数据流</div>
              <div className="relative flex flex-col items-center gap-1">
                {memorySteps.map((step, idx) => {
                  const Icon = step.icon
                  const isActive = idx === activeStep
                  const isPast = idx < activeStep

                  return (
                    <div key={step.id} className="flex flex-col items-center w-full">
                      <motion.div
                        className={`relative flex items-center gap-3 w-full rounded-xl px-4 py-3 transition-all duration-500 ${
                          isActive
                            ? 'bg-primary/8 border border-primary/20'
                            : isPast
                              ? 'bg-primary/3 border border-primary/8'
                              : 'bg-muted/15 border border-transparent'
                        }`}
                        animate={isActive ? { scale: [1, 1.02, 1] } : {}}
                        transition={{ duration: 0.8, repeat: isActive ? Infinity : 0 }}
                      >
                        <div className={`size-8 rounded-lg flex items-center justify-center transition-all duration-500 ${
                          isActive ? 'bg-primary/15 text-primary' : isPast ? 'bg-primary/8 text-primary/60' : 'bg-muted/20 text-muted-foreground/40'
                        }`}>
                          <Icon className="size-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`text-xs font-medium transition-colors duration-500 ${
                            isActive ? 'text-foreground' : 'text-muted-foreground/60'
                          }`}>
                            {step.label}
                          </div>
                          <AnimatePresence mode="wait">
                            {isActive && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="text-[11px] text-muted-foreground/70 mt-0.5 truncate"
                              >
                                {step.detail}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                        {isActive && (
                          <motion.div
                            className="size-2 rounded-full bg-primary"
                            animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
                            transition={{ duration: 1, repeat: Infinity }}
                          />
                        )}
                      </motion.div>
                      {idx < memorySteps.length - 1 && (
                        <div className="flex flex-col items-center my-0.5">
                          <motion.div
                            className="w-px h-3"
                            style={{ backgroundColor: isPast ? 'rgba(16,185,129,0.3)' : 'rgba(0,0,0,0.06)' }}
                            animate={idx === activeStep ? { height: [8, 16, 8] } : {}}
                            transition={{ duration: 0.8, repeat: Infinity }}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Right: AI Q&A */}
            <div className="p-5">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70 mb-3">向 AI 提问</div>
              <div className="space-y-3">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`q-${qaIndex}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="flex justify-end"
                  >
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-foreground/6 px-3.5 py-2.5">
                      <div className="text-[12px] text-foreground/80">{qaPairs[qaIndex].q}</div>
                    </div>
                  </motion.div>
                </AnimatePresence>

                <AnimatePresence>
                  {showAnswer && (
                    <motion.div
                      key={`a-${qaIndex}`}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.5 }}
                      className="flex justify-start"
                    >
                      <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-primary/6 px-3.5 py-2.5">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Sparkle className="size-3 text-primary" />
                          <span className="text-[10px] font-medium text-primary/70">偶记</span>
                        </div>
                        <div className="text-[12px] leading-relaxed text-foreground/75">
                          {qaPairs[qaIndex].a}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Memory recall indicator */}
                <motion.div
                  className="flex items-center gap-2 rounded-lg bg-primary/4 px-3 py-2 mt-2"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 3, repeat: Infinity }}
                >
                  <MagnifyingGlass className="size-3 text-primary/60" />
                  <span className="text-[11px] text-primary/70">记忆召回：精准匹配到具体章节</span>
                  <ArrowRight className="size-3 text-primary/40" />
                </motion.div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
