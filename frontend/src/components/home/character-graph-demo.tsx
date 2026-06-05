import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, ArrowsLeftRight } from '@phosphor-icons/react'

/* ------------------------------------------------------------------ */
/*  Graph data                                                         */
/* ------------------------------------------------------------------ */

interface GraphNode {
  id: string
  name: string
  role: string
  emoji: string
  x: number
  y: number
  color: string
  personality?: string
  background?: string
  keyEvent?: string
  projects?: string[]
}

const nodes: GraphNode[] = [
  {
    id: 'protagonist',
    name: '莱纳',
    role: '主角',
    emoji: '对抗',
    x: 50,
    y: 45,
    color: 'emerald',
    personality: '沉默寡言，但内心炽热。对正义有近乎执拗的坚持。',
    background: '北境守护骑士团副团长，父亲是前团长。',
    keyEvent: '发现父亲遗留的银月戒指，揭开王室血统秘密。',
    projects: ['北境烽火', '银月编年史'],
  },
  {
    id: 'heroine',
    name: '艾琳',
    role: '女主',
    emoji: '🔮',
    x: 22,
    y: 25,
    color: 'sky',
    personality: '温柔而坚定，有着不为人知的过去。',
    background: '银月教团祭司，真实身份是失落王族后裔。',
    keyEvent: '用治愈术救了受伤的莱纳，两人在边境集市相遇。',
  },
  {
    id: 'rival',
    name: '洛维斯',
    role: '对手',
    emoji: '🗡️',
    x: 78,
    y: 25,
    color: 'slate',
    personality: '冷静、精于算计，但有自己的正义观。',
    background: '王室密探，奉命调查北境异动。',
    keyEvent: '在第20章与莱纳正面交锋，揭露了王室的秘密计划。',
  },
  {
    id: 'mentor',
    name: '老铁匠',
    role: '导师',
    emoji: '🔨',
    x: 22,
    y: 70,
    color: 'amber',
    personality: '话少但句句深意，似乎知道很多秘密。',
    background: '曾是骑士团的武器匠，退役后在边境小镇打铁。',
    keyEvent: '告诉莱纳戒指上的纹章属于"银月血脉"。',
  },
  {
    id: 'faction',
    name: '银月教团',
    role: '势力',
    emoji: '🌙',
    x: 78,
    y: 70,
    color: 'violet',
  },
]

const connections = [
  { from: 'protagonist', to: 'heroine', label: '命运交织', color: 'rgba(14,165,233,0.25)' },
  { from: 'protagonist', to: 'rival', label: '亦敌亦友', color: 'rgba(100,112,130,0.2)' },
  { from: 'protagonist', to: 'mentor', label: '师徒', color: 'rgba(245,158,11,0.2)' },
  { from: 'heroine', to: 'faction', label: '隶属', color: 'rgba(139,92,246,0.2)' },
  { from: 'rival', to: 'faction', label: '调查', color: 'rgba(100,112,130,0.15)' },
  { from: 'mentor', to: 'protagonist', label: '守护', color: 'rgba(245,158,11,0.15)' },
]

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function CharacterGraphDemo() {
  const [activeNode, setActiveNode] = useState<string | null>(null)
  const [autoIndex, setAutoIndex] = useState(0)

  // Auto-cycle through character nodes
  useEffect(() => {
    const characterIds = nodes.filter((n) => n.personality).map((n) => n.id)
    const timer = setInterval(() => {
      setAutoIndex((prev) => (prev + 1) % characterIds.length)
      setActiveNode(characterIds[autoIndex])
    }, 4000)
    return () => clearInterval(timer)
  }, [autoIndex])

  // Set initial active
  useEffect(() => {
    const characterIds = nodes.filter((n) => n.personality).map((n) => n.id)
    setActiveNode(characterIds[0])
  }, [])

  const activeData = nodes.find((n) => n.id === activeNode)

  const getNodeById = (id: string) => nodes.find((n) => n.id === id)

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="relative rounded-2xl bg-white/95 p-6" style={{
        backdropFilter: 'blur(8px)',
        boxShadow: '0 0 0 0.5px rgba(200,200,204,0.3), 0 8px 32px rgba(0,0,0,0.04), 0 40px 80px rgba(16,185,129,0.05)',
      }}>
        {/* Title bar */}
        <div className="flex items-center justify-between border-b border-black/4 pb-4 mb-5">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-primary" />
            <div className="text-sm font-medium text-foreground/80">偶记 · 角色图谱</div>
          </div>
          <div className="text-[11px] text-muted-foreground/50">关系网络 · 点击节点查看详情</div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          {/* Left: Graph visualization */}
          <div className="relative aspect-[4/3] rounded-xl bg-muted/10 border border-black/4 overflow-hidden">
            {/* Background grid */}
            <div
              className="absolute inset-0 opacity-30"
              style={{
                backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.06) 1px, transparent 1px)',
                backgroundSize: '20px 20px',
              }}
            />

            {/* SVG connections */}
            <svg className="absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              {connections.map((conn, idx) => {
                const from = getNodeById(conn.from)
                const to = getNodeById(conn.to)
                if (!from || !to) return null

                const isActive = activeNode === conn.from || activeNode === conn.to

                return (
                  <g key={idx}>
                    <motion.line
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      stroke={conn.color}
                      strokeWidth={isActive ? 0.4 : 0.2}
                      strokeDasharray={isActive ? 'none' : '1 1'}
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1, strokeWidth: isActive ? 0.4 : 0.2 }}
                      transition={{ duration: 1, delay: idx * 0.15 }}
                    />
                    {/* Connection label */}
                    {isActive && (
                      <motion.text
                        x={(from.x + to.x) / 2}
                        y={(from.y + to.y) / 2 - 2}
                        textAnchor="middle"
                        fill="rgba(30,30,32,0.4)"
                        fontSize="2.5"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3 }}
                      >
                        {conn.label}
                      </motion.text>
                    )}
                  </g>
                )
              })}
            </svg>

            {/* Nodes */}
            {nodes.map((node) => {
              const isActive = node.id === activeNode
              const isProtagonist = node.id === 'protagonist'
              const nodeSize = isProtagonist ? 'size-12' : 'size-9'

              return (
                <motion.div
                  key={node.id}
                  className="absolute cursor-pointer"
                  style={{
                    left: `${node.x}%`,
                    top: `${node.y}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  onClick={() => setActiveNode(node.id)}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <motion.div
                    className={`${nodeSize} rounded-full flex items-center justify-center transition-all duration-300 ${
                      isActive
                        ? 'bg-primary/15 border-2 border-primary/30 shadow-[0_1px_3px_rgba(0,0,0,0.03)] shadow-primary/10'
                        : isProtagonist
                          ? 'bg-white border-2 border-primary/15 shadow-[0_1px_3px_rgba(0,0,0,0.03)]'
                          : 'bg-white border border-black/10 shadow-sm'
                    }`}
                    animate={isActive ? { scale: [1, 1.08, 1] } : {}}
                    transition={{ duration: 1.5, repeat: isActive ? Infinity : 0 }}
                  >
                    <span className={isProtagonist ? 'text-lg' : 'text-sm'}>{node.emoji}</span>
                  </motion.div>
                  <div className={`mt-1 text-center ${isProtagonist ? 'text-xs font-medium' : 'text-[10px]'} text-foreground/70`}>
                    {node.name}
                  </div>
                  <div className="text-[9px] text-center text-muted-foreground/50">{node.role}</div>
                </motion.div>
              )
            })}
          </div>

          {/* Right: Character detail card */}
          <div className="flex flex-col">
            <AnimatePresence mode="wait">
              {activeData && activeData.personality && (
                <motion.div
                  key={activeData.id}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.35 }}
                  className="flex-1 rounded-xl bg-muted/15 border border-black/4 p-5"
                >
                  {/* Character header */}
                  <div className="flex items-center gap-3">
                    <div className={`size-10 rounded-full flex items-center justify-center ${
                      activeData.color === 'emerald' ? 'bg-primary/10'
                        : activeData.color === 'sky' ? 'bg-sky-400/10'
                        : activeData.color === 'amber' ? 'bg-amber-400/10'
                        : activeData.color === 'violet' ? 'bg-violet-400/10'
                        : 'bg-slate-400/10'
                    }`}>
                      <span className="text-lg">{activeData.emoji}</span>
                    </div>
                    <div>
                      <div className="text-base font-semibold text-foreground">{activeData.name}</div>
                      <div className="text-[11px] text-muted-foreground/60">{activeData.role}</div>
                    </div>
                  </div>

                  {/* Character details */}
                  <div className="mt-4 space-y-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground/50 mb-1">性格</div>
                      <div className="text-[12px] text-foreground/70 leading-relaxed">{activeData.personality}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground/50 mb-1">背景</div>
                      <div className="text-[12px] text-foreground/70 leading-relaxed">{activeData.background}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground/50 mb-1">关键事件</div>
                      <div className="text-[12px] text-foreground/70 leading-relaxed">{activeData.keyEvent}</div>
                    </div>
                  </div>

                  {/* Cross-project reuse */}
                  {activeData.projects && activeData.projects.length > 1 && (
                    <motion.div
                      className="mt-4 flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/10 px-3 py-2"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                    >
                      <ArrowsLeftRight className="size-3.5 text-primary/60" />
                      <span className="text-[11px] text-primary/70">跨项目复用：</span>
                      <div className="flex gap-1.5">
                        {activeData.projects.map((proj) => (
                          <span key={proj} className="rounded-full bg-primary/8 px-2 py-0.5 text-[10px] text-foreground/60">
                            {proj}
                          </span>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Legend */}
            <div className="mt-3 flex flex-wrap gap-3">
              {[
                { label: '盟友', color: 'bg-sky-400/30' },
                { label: '对手', color: 'bg-slate-400/30' },
                { label: '师徒', color: 'bg-amber-400/30' },
                { label: '势力', color: 'bg-violet-400/30' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <div className={`size-2 rounded-full ${item.color}`} />
                  <span className="text-[10px] text-muted-foreground/50">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
