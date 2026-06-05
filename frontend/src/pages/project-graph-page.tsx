import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import * as d3 from 'd3'
import { Lightning, BookOpen, FunnelSimple, MapPin, Network, ArrowClockwise, Sparkle, Tag, Users, X } from '@phosphor-icons/react'

import { EmptyState } from '@/components/empty-state'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { getStoryGraph } from '@/services/projects'
import type { StoryGraph } from '@/types/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NodeCategory = 'character' | 'location' | 'object' | 'concept' | 'event' | 'open_loop'

interface GraphNode extends d3.SimulationNodeDatum {
  id: string
  name: string
  category: NodeCategory
  description?: string | null
  detail?: string
  mentionCount: number
  tags: string[]
  meta?: Record<string, unknown>
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode
  target: string | GraphNode
  label: string
  kind: 'relation' | 'participation' | 'loop_assoc'
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_CONFIG: Record<NodeCategory, { label: string; color: string; icon: typeof Users }> = {
  character:  { label: '角色', color: '#3b82f6', icon: Users },
  location:   { label: '地点', color: '#22c55e', icon: MapPin },
  object:     { label: '物品', color: '#f59e0b', icon: Tag },
  concept:    { label: '概念', color: '#a855f7', icon: Sparkle },
  event:      { label: '事件', color: '#f97316', icon: BookOpen },
  open_loop:  { label: '伏笔', color: '#ef4444', icon: Lightning },
}

const ALL_CATEGORIES = Object.keys(CATEGORY_CONFIG) as NodeCategory[]

// ---------------------------------------------------------------------------
// Data transform
// ---------------------------------------------------------------------------

function buildGraphData(graph: StoryGraph, activeFilters: Set<NodeCategory>) {
  const nodes: GraphNode[] = []
  const links: GraphLink[] = []
  const nodeIds = new Set<string>()

  // Entities → nodes
  for (const entity of graph.entities) {
    const category = entity.entity_type as NodeCategory
    if (!activeFilters.has(category)) continue
    const id = `entity:${entity.id}`
    nodeIds.add(id)
    nodes.push({
      id,
      name: entity.canonical_name,
      category,
      description: entity.description,
      mentionCount: entity.mention_count ?? 1,
      tags: entity.tags ?? [],
      meta: { aliases: entity.aliases, first_chapter: entity.first_seen_chapter_order, last_chapter: entity.last_seen_chapter_order },
    })
  }

  // Events → nodes
  if (activeFilters.has('event')) {
    for (const event of graph.events) {
      const id = `event:${event.id}`
      nodeIds.add(id)
      nodes.push({
        id,
        name: event.title,
        category: 'event',
        description: event.summary,
        detail: event.event_type,
        mentionCount: 1,
        tags: event.tags ?? [],
        meta: { event_type: event.event_type, location: event.location, chapter_order: event.chapter_order },
      })

      // Event → participant links
      for (const participant of event.participants ?? []) {
        const targetNode = nodes.find(n => n.name === participant && n.category !== 'event')
        if (targetNode) {
          links.push({ source: id, target: targetNode.id, label: '参与', kind: 'participation' })
        }
      }
    }
  }

  // Relations → links
  for (const rel of graph.relations) {
    const sourceNode = nodes.find(n => n.name === rel.source_entity_name)
    const targetNode = nodes.find(n => n.name === rel.target_entity_name)
    if (sourceNode && targetNode) {
      links.push({
        source: sourceNode.id,
        target: targetNode.id,
        label: rel.relation_type,
        kind: 'relation',
      })
    }
  }

  // Open loops → nodes + links
  if (activeFilters.has('open_loop')) {
    for (const loop of graph.open_loops) {
      const id = `loop:${loop.id}`
      nodeIds.add(id)
      nodes.push({
        id,
        name: loop.label,
        category: 'open_loop',
        description: loop.description,
        detail: `${loop.priority} · ${loop.status}`,
        mentionCount: loop.mention_count ?? 1,
        tags: [],
        meta: { priority: loop.priority, status: loop.status },
      })

      for (const entityName of loop.related_entities ?? []) {
        const targetNode = nodes.find(n => n.name === entityName)
        if (targetNode) {
          links.push({ source: id, target: targetNode.id, label: '关联', kind: 'loop_assoc' })
        }
      }
    }
  }

  return { nodes, links }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FunnelSimpleBar({
  activeFilters,
  onToggle,
  stats,
}: {
  activeFilters: Set<NodeCategory>
  onToggle: (cat: NodeCategory) => void
  stats: Record<NodeCategory, number>
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FunnelSimple className="size-4 text-muted-foreground" />
      {ALL_CATEGORIES.map(cat => {
        const config = CATEGORY_CONFIG[cat]
        const Icon = config.icon
        const active = activeFilters.has(cat)
        const count = stats[cat] ?? 0
        return (
          <button
            key={cat}
            type="button"
            onClick={() => onToggle(cat)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
              active
                ? 'border-transparent text-white shadow-sm'
                : 'border-border bg-transparent text-muted-foreground hover:bg-muted/50'
            }`}
            style={active ? { backgroundColor: config.color } : undefined}
          >
            <Icon className="size-3" />
            {config.label}
            <span className={active ? 'opacity-80' : 'text-muted-foreground/70'}>{count}</span>
          </button>
        )
      })}
    </div>
  )
}

function NodeDetailPanel({
  node,
  graph,
  onClose,
}: {
  node: GraphNode
  graph: StoryGraph
  onClose: () => void
}) {
  const config = CATEGORY_CONFIG[node.category]
  const Icon = config.icon

  // Find related edges
  const relatedRelations = graph.relations.filter(
    r => r.source_entity_name === node.name || r.target_entity_name === node.name,
  )
  const relatedLoops = graph.open_loops.filter(
    l => (l.related_entities ?? []).includes(node.name),
  )
  const relatedEvents = graph.events.filter(
    e => (e.participants ?? []).includes(node.name),
  )

  return (
    <div className="absolute right-4 top-4 z-30 w-[340px] max-h-[calc(100vh-12rem)] overflow-y-auto rounded-xl border border-border bg-card/95 shadow-[0_1px_3px_rgba(0,0,0,0.04)] backdrop-blur">
      <div className="flex items-start justify-between gap-3 p-4 pb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-xl text-white"
            style={{ backgroundColor: config.color }}
          >
            <Icon className="size-4.5" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-foreground">{node.name}</h3>
            <p className="text-xs text-muted-foreground">{config.label}{node.detail ? ` · ${node.detail}` : ''}</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <X className="size-4" />
        </button>
      </div>

      {node.description && (
        <div className="px-4 pb-3">
          <p className="text-xs leading-relaxed text-muted-foreground">{node.description}</p>
        </div>
      )}

      {node.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-3">
          {node.tags.map(tag => (
            <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
          ))}
        </div>
      )}

      <Separator />

      <div className="space-y-3 p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Network className="size-3.5" />
          <span>提及 {node.mentionCount} 次</span>
          {node.meta?.first_chapter != null && (
            <span>· 第 {(node.meta.first_chapter as number) + 1}–{(node.meta.last_chapter as number) + 1} 章</span>
          )}
        </div>

        {relatedRelations.length > 0 && (
          <div>
            <h4 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">关系</h4>
            <div className="space-y-1">
              {relatedRelations.map(r => {
                const other = r.source_entity_name === node.name ? r.target_entity_name : r.source_entity_name
                return (
                  <div key={r.id} className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">{node.name}</span>
                    <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">{r.relation_type}</span>
                    <span className="text-foreground">{other}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {relatedEvents.length > 0 && (
          <div>
            <h4 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">参与事件</h4>
            <div className="space-y-1">
              {relatedEvents.map(e => (
                <div key={e.id} className="flex items-center gap-2 text-xs">
                  <span className="rounded bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-medium text-orange-600 dark:text-orange-400">{e.event_type}</span>
                  <span className="text-foreground">{e.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {relatedLoops.length > 0 && (
          <div>
            <h4 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">关联伏笔</h4>
            <div className="space-y-1">
              {relatedLoops.map(l => (
                <div key={l.id} className="flex items-center gap-2 text-xs">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    l.priority === 'high' ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
                  }`}>{l.priority}</span>
                  <span className="text-foreground">{l.label}</span>
                  <span className="text-muted-foreground">({l.status === 'open' ? '未解' : '已解'})</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function GraphStats({ graph }: { graph: StoryGraph }) {
  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      <span>实体 {graph.entities.length}</span>
      <span>事件 {graph.events.length}</span>
      <span>关系 {graph.relations.length}</span>
      <span>伏笔 {graph.open_loops.length}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// D3 Graph Renderer (inner component)
// ---------------------------------------------------------------------------

function ForceGraph({
  nodes,
  links,
  selectedNodeId,
  onSelectNode,
  width,
  height,
}: {
  nodes: GraphNode[]
  links: GraphLink[]
  selectedNodeId: string | null
  onSelectNode: (id: string | null) => void
  width: number
  height: number
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null)
  const selectedNodeIdRef = useRef(selectedNodeId)
  const onSelectNodeRef = useRef(onSelectNode)

  // Keep refs up to date without triggering d3 rebuild
  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId
  }, [selectedNodeId])

  useEffect(() => {
    onSelectNodeRef.current = onSelectNode
  }, [onSelectNode])

  // Main d3 setup — only rebuilds when graph data or container size changes
  useEffect(() => {
    if (!svgRef.current || width === 0 || height === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    if (nodes.length === 0) return

    // Zoom behavior
    const g = svg.append('g')
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 5])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })
    svg.call(zoom)

    // Center the view
    svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(0.85))

    // Arrow markers for directed links
    const defs = svg.append('defs')
    for (const kind of ['relation', 'participation', 'loop_assoc'] as const) {
      const color = kind === 'relation' ? '#64748b' : kind === 'participation' ? '#f97316' : '#ef4444'
      defs.append('marker')
        .attr('id', `arrow-${kind}`)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 20)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', color)
        .attr('opacity', 0.6)
    }

    // Links
    const linkGroup = g.append('g').attr('class', 'links')
    const link = linkGroup.selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', d => d.kind === 'relation' ? '#64748b' : d.kind === 'participation' ? '#f97316' : '#ef4444')
      .attr('stroke-opacity', 0.35)
      .attr('stroke-width', d => d.kind === 'relation' ? 1.5 : 1)
      .attr('stroke-dasharray', d => d.kind === 'participation' ? '4,3' : d.kind === 'loop_assoc' ? '2,2' : 'none')
      .attr('marker-end', d => `url(#arrow-${d.kind})`)

    // Link labels — hidden by default, shown on hover
    const linkLabelGroup = g.append('g').attr('class', 'link-labels')
    const linkLabel = linkLabelGroup.selectAll('text')
      .data(links.filter(l => l.kind === 'relation'))
      .join('text')
      .text(d => d.label)
      .attr('font-size', 9)
      .attr('fill', '#94a3b8')
      .attr('text-anchor', 'middle')
      .attr('dy', -4)
      .attr('opacity', 0)

    // Node groups
    const nodeGroup = g.append('g').attr('class', 'nodes')
    const node = nodeGroup.selectAll('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'pointer')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .call(d3.drag<SVGGElement, GraphNode>()
        .on('start', (event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>, d: GraphNode) => {
          if (!event.active) simulation.alphaTarget(0.3).restart()
          d.fx = d.x
          d.fy = d.y
        })
        .on('drag', (event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>, d: GraphNode) => {
          d.fx = event.x
          d.fy = event.y
        })
        .on('end', (event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>, d: GraphNode) => {
          if (!event.active) simulation.alphaTarget(0)
          d.fx = null
          d.fy = null
        }) as any,
      )

    const nodeRadius = (d: GraphNode) => Math.max(7, Math.min(22, 7 + d.mentionCount * 1.5))

    // Node circles
    node.append('circle')
      .attr('r', nodeRadius)
      .attr('fill', d => CATEGORY_CONFIG[d.category].color)
      .attr('fill-opacity', 0.85)
      .attr('stroke', d => CATEGORY_CONFIG[d.category].color)
      .attr('stroke-width', 2)
      .attr('stroke-opacity', 0.3)

    // Node labels — hidden by default, shown on hover / when selected
    const labelGroup = node.append('g')
      .attr('pointer-events', 'none')
      .attr('opacity', 0)

    // pill background
    labelGroup.append('rect')
      .attr('rx', 4)
      .attr('ry', 4)
      .style('fill', 'rgba(255,255,255,0.92)')
      .attr('stroke', d => CATEGORY_CONFIG[d.category].color)
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.7)

    labelGroup.append('text')
      .text(d => d.name)
      .attr('font-size', 11)
      .attr('font-weight', 600)
      .style('fill', '#1e293b')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')

    // size the pill rect to the text after render
    labelGroup.each(function(d) {
      const g = d3.select(this)
      const txt = g.select('text').node() as SVGTextElement | null
      if (!txt) return
      const bbox = txt.getBBox()
      const pad = { x: 6, y: 3 }
      const r = nodeRadius(d)
      const yOffset = -(r + 6 + bbox.height / 2 + pad.y)
      g.attr('transform', `translate(0, ${yOffset})`)
      g.select('rect')
        .attr('x', -bbox.width / 2 - pad.x)
        .attr('y', -bbox.height / 2 - pad.y)
        .attr('width', bbox.width + pad.x * 2)
        .attr('height', bbox.height + pad.y * 2)
    })

    // Interactions
    node.on('click', (event, d) => {
      event.stopPropagation()
      const current = selectedNodeIdRef.current
      onSelectNodeRef.current(d.id === current ? null : d.id)
    })

    node.on('mouseenter', function (_, d) {
      const connectedIds = new Set<string>()
      connectedIds.add(d.id)
      links.forEach(l => {
        const sid = typeof l.source === 'string' ? l.source : l.source.id
        const tid = typeof l.target === 'string' ? l.target : l.target.id
        if (sid === d.id) connectedIds.add(tid)
        if (tid === d.id) connectedIds.add(sid)
      })

      // dim unconnected nodes
      node.select('circle')
        .transition().duration(180)
        .attr('fill-opacity', (n: unknown) => connectedIds.has((n as GraphNode).id) ? 1 : 0.12)
        .attr('stroke-opacity', (n: unknown) => connectedIds.has((n as GraphNode).id) ? 0.8 : 0.04)

      // show labels only for hovered + connected nodes
      node.select('g')
        .transition().duration(180)
        .attr('opacity', (n: unknown) => connectedIds.has((n as GraphNode).id) ? 1 : 0)

      // dim unrelated links
      link.transition().duration(180)
        .attr('stroke-opacity', l => {
          const sid = typeof l.source === 'string' ? l.source : l.source.id
          const tid = typeof l.target === 'string' ? l.target : l.target.id
          return sid === d.id || tid === d.id ? 0.8 : 0.04
        })
        .attr('stroke-width', l => {
          const sid = typeof l.source === 'string' ? l.source : l.source.id
          const tid = typeof l.target === 'string' ? l.target : l.target.id
          return sid === d.id || tid === d.id ? 2.5 : 0.8
        })

      linkLabel.transition().duration(180)
        .attr('opacity', l => {
          const sid = typeof l.source === 'string' ? l.source : l.source.id
          const tid = typeof l.target === 'string' ? l.target : l.target.id
          return sid === d.id || tid === d.id ? 1 : 0
        })
    })

    node.on('mouseleave', function () {
      node.select('circle')
        .transition().duration(250)
        .attr('fill-opacity', 0.85)
        .attr('stroke-opacity', 0.3)

      // restore: keep selected node label visible
      node.select('g')
        .transition().duration(250)
        .attr('opacity', (n: unknown) => (n as GraphNode).id === selectedNodeIdRef.current ? 1 : 0)

      link.transition().duration(250)
        .attr('stroke-opacity', 0.3)
        .attr('stroke-width', d => d.kind === 'relation' ? 1.5 : 1)
      linkLabel.transition().duration(250)
        .attr('opacity', 0)
    })

    svg.on('click', () => onSelectNodeRef.current(null))

    // Simulation — stronger repulsion + longer links to spread nodes out
    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(links).id(d => d.id).distance(d => {
        const s = d.source as GraphNode
        const t = d.target as GraphNode
        return 120 + (s.mentionCount + t.mentionCount) * 4
      }).strength(0.4))
      .force('charge', d3.forceManyBody().strength(-450).distanceMax(600))
      .force('center', d3.forceCenter(0, 0).strength(0.05))
      .force('collision', d3.forceCollide().radius((d: d3.SimulationNodeDatum) => nodeRadius(d as GraphNode) + 28))

    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as GraphNode).x!)
        .attr('y1', d => (d.source as GraphNode).y!)
        .attr('x2', d => (d.target as GraphNode).x!)
        .attr('y2', d => (d.target as GraphNode).y!)

      linkLabel
        .attr('x', d => ((d.source as GraphNode).x! + (d.target as GraphNode).x!) / 2)
        .attr('y', d => ((d.source as GraphNode).y! + (d.target as GraphNode).y!) / 2)

      node.attr('transform', d => `translate(${d.x},${d.y})`)
    })

    simulationRef.current = simulation

    return () => {
      simulation.stop()
    }
  }, [nodes, links, width, height])

  // Update label visibility when selection changes — lightweight DOM update, no rebuild
  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('g.nodes > g').each(function(d) {
      const isSelected = (d as GraphNode).id === selectedNodeId
      d3.select(this).select('g').attr('opacity', isSelected ? 1 : null)
    })
  }, [selectedNodeId])

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className="rounded-xl border border-border bg-card/40"
      style={{ background: 'radial-gradient(circle at 50% 50%, hsl(var(--card) / 0.6), hsl(var(--card) / 0.2))' }}
    />
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function ProjectGraphPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [activeFilters, setActiveFilters] = useState<Set<NodeCategory>>(new Set(ALL_CATEGORIES))
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  const graphQuery = useQuery<StoryGraph, Error>({
    queryKey: ['story-graph', projectId],
    queryFn: () => getStoryGraph(projectId ?? ''),
    enabled: Boolean(projectId),
  })

  const graph = graphQuery.data

  // Compute stats
  const stats = useMemo(() => {
    if (!graph) return {} as Record<NodeCategory, number>
    return {
      character: graph.entities.filter(e => e.entity_type === 'character').length,
      location: graph.entities.filter(e => e.entity_type === 'location').length,
      object: graph.entities.filter(e => e.entity_type === 'object').length,
      concept: graph.entities.filter(e => e.entity_type === 'concept').length,
      event: graph.events.length,
      open_loop: graph.open_loops.length,
    }
  }, [graph])

  // Build graph data
  const { nodes, links } = useMemo(() => {
    if (!graph) return { nodes: [], links: [] }
    return buildGraphData(graph, activeFilters)
  }, [graph, activeFilters])

  // Find selected node
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null
    return nodes.find(n => n.id === selectedNodeId) ?? null
  }, [nodes, selectedNodeId])

  // Toggle filter
  const toggleFilter = useCallback((cat: NodeCategory) => {
    setActiveFilters(prev => {
      const next = new Set(prev)
      if (next.has(cat)) {
        next.delete(cat)
      } else {
        next.add(cat)
      }
      return next
    })
    setSelectedNodeId(null)
  }, [])

  const hasData = graph && (graph.entities.length > 0 || graph.events.length > 0 || graph.relations.length > 0)

  // Measure container — re-run when hasData changes so the observer attaches
  // after the loading spinner is replaced by the actual graph container.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    // 立即读一次当前尺寸，避免 ResizeObserver 首次不触发
    setDimensions({
      width: Math.floor(el.getBoundingClientRect().width),
      height: Math.floor(el.getBoundingClientRect().height),
    })

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setDimensions({
          width: Math.floor(entry.contentRect.width),
          height: Math.floor(entry.contentRect.height),
        })
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasData])

  if (graphQuery.isLoading) {
    return <LoadingState label="正在加载知识图谱..." className="mx-auto mt-20 max-w-md" />
  }

  if (graphQuery.isError) {
    return (
      <div className="mx-auto mt-20 max-w-md">
        <EmptyState
          title="加载失败"
          description={graphQuery.error?.message ?? '无法加载图谱数据，请稍后重试。'}
        />
      </div>
    )
  }

  if (!hasData) {
    return (
      <div className="mx-auto mt-20 max-w-md">
        <EmptyState
          title="暂无图谱数据"
          description="开始撰写章节后，系统会自动提取角色、事件和关系，生成知识图谱。"
        />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-4">
        <FunnelSimpleBar activeFilters={activeFilters} onToggle={toggleFilter} stats={stats} />
        <div className="flex items-center gap-3">
          <GraphStats graph={graph!} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => graphQuery.refetch()}
            disabled={graphQuery.isFetching}
          >
            <ArrowClockwise className={`size-3.5 ${graphQuery.isFetching ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>
      </div>

      {/* Graph area */}
      <div ref={containerRef} className="relative flex-1 min-h-0">
        {nodes.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">当前筛选条件下无节点，请调整筛选器。</p>
          </div>
        ) : (
          <ForceGraph
            nodes={nodes}
            links={links}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            width={dimensions.width}
            height={dimensions.height}
          />
        )}

        {/* Detail panel */}
        {selectedNode && graph && (
          <NodeDetailPanel
            node={selectedNode}
            graph={graph}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>
    </div>
  )
}
