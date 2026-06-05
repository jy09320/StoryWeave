import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Brain, MagnifyingGlass, PencilLine, CheckCircle, Sparkle } from '@phosphor-icons/react'

/* ------------------------------------------------------------------ */
/*  Pipeline stages                                                    */
/* ------------------------------------------------------------------ */

const stages = [
  {
    id: 'planner',
    label: '规划',
    sublabel: 'Planner',
    icon: Brain,
    color: 'emerald',
    description: '分析当前剧情走向，规划续写方向',
    detail: '检测到：莱纳刚发现父亲的秘密 → 下一步应展开银月教团线索',
    animation: 'mindmap',
  },
  {
    id: 'retriever',
    label: '检索',
    sublabel: 'Retriever',
    icon: MagnifyingGlass,
    color: 'sky',
    description: '从记忆库中检索相关上下文',
    detail: '召回 3 段相关记忆：第12章预言、第17章戒指、角色关系图',
    animation: 'search',
  },
  {
    id: 'writer',
    label: '生成',
    sublabel: 'Writer',
    icon: PencilLine,
    color: 'violet',
    description: '流式生成续写文本',
    detail: '',
    animation: 'typewriter',
  },
  {
    id: 'checker',
    label: '校验',
    sublabel: 'Checker',
    icon: CheckCircle,
    color: 'amber',
    description: '校验连续性与一致性',
    detail: '完成 时间线一致  完成 角色性格匹配  完成 伏笔衔接  完成 世界观无矛盾',
    animation: 'checklist',
  },
] as const

const typewriterText = '莱纳将戒指举到烛光下，银月纹章在火光中微微闪烁。他想起了父亲生前常说的话——"银月之下，真相从不沉睡"。此刻，他终于明白了这句话的含义。'

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function MindMapAnimation() {
  const nodes = [
    { x: 50, y: 30, label: '当前剧情', size: 'lg' },
    { x: 20, y: 65, label: '银月线索', size: 'sm' },
    { x: 80, y: 65, label: '父亲秘密', size: 'sm' },
    { x: 50, y: 85, label: '续写方向', size: 'md' },
  ]

  return (
    <div className="relative h-24 w-full">
      <svg className="absolute inset-0 size-full" viewBox="0 0 100 100">
        {/* Connections */}
        {[[0, 1], [0, 2], [1, 3], [2, 3]].map(([from, to], idx) => (
          <motion.line
            key={idx}
            x1={nodes[from].x}
            y1={nodes[from].y}
            x2={nodes[to].x}
            y2={nodes[to].y}
            stroke="rgba(16,185,129,0.25)"
            strokeWidth="0.5"
            strokeDasharray="2 2"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.8, delay: idx * 0.3 }}
          />
        ))}
      </svg>
      {nodes.map((node, idx) => (
        <motion.div
          key={idx}
          className="absolute flex items-center justify-center"
          style={{
            left: `${node.x}%`,
            top: `${node.y}%`,
            transform: 'translate(-50%, -50%)',
          }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, delay: idx * 0.25, type: 'spring' }}
        >
          <div className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${
            node.size === 'lg'
              ? 'bg-primary/15 text-primary border border-primary/20'
              : node.size === 'md'
                ? 'bg-primary/10 text-primary/80 border border-primary/15'
                : 'bg-muted/30 text-muted-foreground/70 border border-black/5'
          }`}>
            {node.label}
          </div>
        </motion.div>
      ))}
    </div>
  )
}

function SearchAnimation() {
  const items = [
    { text: '第12章 · 银月预言', delay: 0 },
    { text: '第17章 · 父亲的戒指', delay: 0.4 },
    { text: '角色关系 · 莱纳↔艾琳', delay: 0.8 },
  ]

  return (
    <div className="space-y-1.5">
      {items.map((item, idx) => (
        <motion.div
          key={idx}
          className="flex items-center gap-2 rounded-lg bg-sky-50/40 px-3 py-1.5"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: item.delay }}
        >
          <motion.div
            className="size-1.5 rounded-full bg-sky-400"
            animate={{ scale: [1, 1.5, 1] }}
            transition={{ duration: 1, delay: item.delay + 0.3, repeat: Infinity, repeatDelay: 2 }}
          />
          <span className="text-[11px] text-foreground/70">{item.text}</span>
        </motion.div>
      ))}
    </div>
  )
}

function TypewriterAnimation() {
  const [displayText, setDisplayText] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    if (currentIndex < typewriterText.length) {
      const timer = setTimeout(() => {
        setDisplayText((prev) => prev + typewriterText[currentIndex])
        setCurrentIndex((prev) => prev + 1)
      }, 40)
      return () => clearTimeout(timer)
    } else {
      // Reset after a pause
      const resetTimer = setTimeout(() => {
        setDisplayText('')
        setCurrentIndex(0)
      }, 3000)
      return () => clearTimeout(resetTimer)
    }
  }, [currentIndex])

  return (
    <div className="text-[11px] leading-relaxed text-foreground/70 font-serif">
      {displayText}
      <motion.span
        className="inline-block w-px h-3.5 bg-primary/60 ml-0.5 align-middle"
        animate={{ opacity: [1, 0] }}
        transition={{ duration: 0.6, repeat: Infinity }}
      />
    </div>
  )
}

function ChecklistAnimation() {
  const checks = [
    { label: '时间线一致', delay: 0 },
    { label: '角色性格匹配', delay: 0.5 },
    { label: '伏笔衔接', delay: 1.0 },
    { label: '世界观无矛盾', delay: 1.5 },
  ]

  return (
    <div className="space-y-1">
      {checks.map((check, idx) => (
        <motion.div
          key={idx}
          className="flex items-center gap-2"
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: check.delay }}
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.3, delay: check.delay + 0.2, type: 'spring' }}
          >
            <CheckCircle className="size-3.5 text-emerald-500" />
          </motion.div>
          <span className="text-[11px] text-foreground/70">{check.label}</span>
        </motion.div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function PipelineDemo() {
  const [activeStage, setActiveStage] = useState(0)
  const [cycleKey, setCycleKey] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStage((prev) => {
        if (prev === stages.length - 1) {
          // Reset cycle
          setCycleKey((k) => k + 1)
          return 0
        }
        return prev + 1
      })
    }, 3500)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="relative rounded-2xl bg-white/95 p-6" style={{
        backdropFilter: 'blur(8px)',
        boxShadow: '0 0 0 0.5px rgba(200,200,204,0.3), 0 8px 32px rgba(0,0,0,0.04), 0 40px 80px rgba(16,185,129,0.05)',
      }}>
        {/* Title bar */}
        <div className="flex items-center justify-between border-b border-black/4 pb-4 mb-5">
          <div className="flex items-center gap-2">
            <Sparkle className="size-4 text-primary" />
            <div className="text-sm font-medium text-foreground/80">偶记 · 智能续写流水线</div>
          </div>
          <div className="text-[11px] text-muted-foreground/50">四阶段 Pipeline</div>
        </div>

        {/* Timeline */}
        <div className="flex items-center gap-1 mb-6">
          {stages.map((stage, idx) => {
            const Icon = stage.icon
            const isActive = idx === activeStage
            const isPast = idx < activeStage

            return (
              <div key={stage.id} className="flex items-center flex-1">
                <motion.div
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-500 flex-1 ${
                    isActive
                      ? 'bg-primary/8 border border-primary/20'
                      : isPast
                        ? 'bg-primary/4 border border-primary/10'
                        : 'bg-muted/15 border border-transparent'
                  }`}
                  animate={isActive ? { scale: [1, 1.03, 1] } : {}}
                  transition={{ duration: 1, repeat: isActive ? Infinity : 0 }}
                >
                  <div className={`size-7 rounded-lg flex items-center justify-center transition-all duration-500 ${
                    isActive ? 'bg-primary/15 text-primary' : isPast ? 'bg-primary/8 text-primary/60' : 'bg-muted/20 text-muted-foreground/40'
                  }`}>
                    <Icon className="size-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className={`text-xs font-medium transition-colors duration-500 ${
                      isActive ? 'text-foreground' : 'text-muted-foreground/60'
                    }`}>
                      {stage.label}
                    </div>
                    <div className="text-[10px] text-muted-foreground/40">{stage.sublabel}</div>
                  </div>
                </motion.div>

                {/* Connector */}
                {idx < stages.length - 1 && (
                  <div className="flex items-center px-1">
                    <motion.div
                      className="w-6 h-px"
                      style={{ backgroundColor: isPast ? 'rgba(16,185,129,0.3)' : 'rgba(0,0,0,0.06)' }}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Stage detail */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`${activeStage}-${cycleKey}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4 }}
            className="rounded-xl bg-muted/15 border border-black/4 p-5"
          >
            <div className="flex items-center gap-2 mb-2">
              {(() => {
                const Icon = stages[activeStage].icon
                return <Icon className="size-4 text-primary" />
              })()}
              <span className="text-sm font-medium text-foreground/80">
                {stages[activeStage].label}：{stages[activeStage].description}
              </span>
            </div>

            {/* Stage-specific animation */}
            <div className="mt-3">
              {stages[activeStage].animation === 'mindmap' && <MindMapAnimation />}
              {stages[activeStage].animation === 'search' && <SearchAnimation />}
              {stages[activeStage].animation === 'typewriter' && <TypewriterAnimation />}
              {stages[activeStage].animation === 'checklist' && <ChecklistAnimation />}
            </div>

            {/* Detail text */}
            {stages[activeStage].detail && (stages[activeStage].animation as string) !== 'typewriter' && (
              <div className="mt-3 text-[11px] text-muted-foreground/60">
                {stages[activeStage].detail}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
