import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CaretRight, Spinner, MapPin, MagnifyingGlass, Sword, User, Lightbulb, Network } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { clsx } from 'clsx'

import { EmptyState } from '@/components/empty-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { listAllStoryEntities, getStoryGraph, type StoryEntityListResponse } from '@/services/story-graph'
import { listProjects } from '@/services/projects'
import type { Project, StoryEntity, StoryEntityType, StoryRelation } from '@/types/api'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENTITY_TYPE_TABS: Array<{ key: StoryEntityType | 'all'; label: string; icon: typeof User }> = [
  { key: 'all', label: '全部', icon: MagnifyingGlass },
  { key: 'character', label: '角色', icon: User },
  { key: 'location', label: '地点', icon: MapPin },
  { key: 'object', label: '物品', icon: Sword },
  { key: 'concept', label: '概念', icon: Lightbulb },
]

const entityTypeLabel: Record<StoryEntityType, string> = {
  character: '角色',
  location: '地点',
  object: '物品',
  concept: '概念',
}

const entityTypeColor: Record<StoryEntityType, string> = {
  character: 'bg-blue-50 text-blue-600',
  location: 'bg-green-50 text-green-600',
  object: 'bg-amber-50 text-amber-600',
  concept: 'bg-purple-50 text-purple-600',
}

const entityTypeIcon: Record<StoryEntityType, typeof User> = {
  character: User,
  location: MapPin,
  object: Sword,
  concept: Lightbulb,
}

const PAGE_SIZE = 200

const spineColors = [
  'bg-violet-400',
  'bg-sky-400',
  'bg-emerald-400',
  'bg-amber-400',
  'bg-rose-400',
  'bg-indigo-400',
  'bg-teal-400',
]

// ---------------------------------------------------------------------------
// EntityRow
// ---------------------------------------------------------------------------

function EntityRow({
  entity,
  isSelected,
  onSelect,
}: {
  entity: StoryEntity
  isSelected: boolean
  onSelect: () => void
}) {
  const type = entity.entity_type as StoryEntityType
  const Icon = entityTypeIcon[type] ?? User

  return (
    <button
      type="button"
      onClick={onSelect}
      className={clsx(
        'group relative w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
        isSelected ? 'bg-primary/8' : 'hover:bg-muted/50',
      )}
    >
      {isSelected && (
        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-primary" />
      )}
      <span className={clsx('flex size-7 shrink-0 items-center justify-center rounded-md text-[11px]', entityTypeColor[type] ?? 'bg-muted text-muted-foreground')}>
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{entity.canonical_name}</div>
        {entity.aliases?.length > 0 ? (
          <div className="truncate text-[11px] text-muted-foreground/60">{entity.aliases.join('、')}</div>
        ) : entity.description ? (
          <div className="line-clamp-1 text-[11px] text-muted-foreground/60">{entity.description}</div>
        ) : null}
      </div>
      <span className="shrink-0 text-[11px] text-muted-foreground/40">{entity.mention_count}次</span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// EntityDetailPanel
// ---------------------------------------------------------------------------

function EntityDetailPanel({
  entity,
  relations,
  isLoadingRelations,
}: {
  entity: StoryEntity
  relations: StoryRelation[]
  isLoadingRelations: boolean
}) {
  const type = entity.entity_type as StoryEntityType
  const aliases = entity.aliases ?? []
  const tags = entity.tags ?? []

  return (
    <div className="px-8 py-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-bold text-foreground">{entity.canonical_name}</h3>
            <span className={clsx('rounded-md px-2 py-0.5 text-xs font-medium', entityTypeColor[type] ?? 'bg-muted text-muted-foreground')}>
              {entityTypeLabel[type] ?? type}
            </span>
          </div>
          {aliases.length > 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">别名：{aliases.join('、')}</p>
          ) : null}
        </div>
        <Link
          to={`/projects/${entity.project_id}/graph`}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground shrink-0"
        >
          <Network className="size-3" />
          查看图谱
        </Link>
      </div>

      {/* Description */}
      {entity.description ? (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/60">描述</span>
            <span className="flex-1 h-px bg-border/40" />
          </div>
          <p className="text-sm leading-7 text-foreground/85">{entity.description}</p>
        </div>
      ) : null}

      {/* Meta */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        {[
          { label: '首次出现', value: `第 ${entity.first_seen_chapter_order} 章` },
          { label: '最后出现', value: `第 ${entity.last_seen_chapter_order} 章` },
          { label: '提及次数', value: `${entity.mention_count} 次` },
        ].map((item) => (
          <div key={item.label} className="rounded-lg bg-muted/30 px-3 py-2.5">
            <div className="text-[11px] text-muted-foreground/60">{item.label}</div>
            <div className="mt-1 text-sm font-medium text-foreground">{item.value}</div>
          </div>
        ))}
      </div>

      {/* Tags */}
      {tags.length > 0 ? (
        <div className="mb-6 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span key={tag} className="rounded-md bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      {/* Relations */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/60">关联关系</span>
          <span className="flex-1 h-px bg-border/40" />
        </div>
        {isLoadingRelations ? (
          <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
            <Spinner className="size-3 animate-spin" />加载中…
          </div>
        ) : relations.length > 0 ? (
          <div className="space-y-1.5">
            {relations.map((rel) => {
              const isSource = rel.source_entity_name === entity.canonical_name
              const otherName = isSource ? rel.target_entity_name : rel.source_entity_name
              return (
                <div key={rel.id} className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs">
                  <span className="text-muted-foreground/70">{entity.canonical_name}</span>
                  <CaretRight className="size-3 text-muted-foreground/40" />
                  <span className="rounded-md bg-muted px-2 py-0.5 text-foreground/70">{rel.relation_type}</span>
                  <CaretRight className="size-3 text-muted-foreground/40" />
                  <span className="font-medium text-foreground">{otherName}</span>
                  {!isSource && <span className="ml-1 text-[10px] text-muted-foreground/40">(被指向)</span>}
                  {rel.status_after ? (
                    <span className="ml-auto text-muted-foreground/50">{rel.status_after}</span>
                  ) : null}
                </div>
              )
            })}
          </div>
        ) : (
          <p className="py-2 text-xs text-muted-foreground/50">暂无关联关系</p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AssetsGraphPanel
// ---------------------------------------------------------------------------

export function AssetsGraphPanel() {
  const [activeType, setActiveType] = useState<StoryEntityType | 'all'>('all')
  const [keyword, setKeyword] = useState('')
  const [debouncedKeyword, setDebouncedKeyword] = useState('')
  const [selectedEntity, setSelectedEntity] = useState<StoryEntity | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedKeyword(keyword), 300)
    return () => clearTimeout(timer)
  }, [keyword])

  // Fetch all entities (large page size — grouping replaces pagination)
  const entitiesQuery = useQuery<StoryEntityListResponse, Error>({
    queryKey: ['story-entities', activeType, debouncedKeyword],
    queryFn: () =>
      listAllStoryEntities({
        entity_type: activeType === 'all' ? undefined : activeType,
        keyword: debouncedKeyword || undefined,
        page: 1,
        page_size: PAGE_SIZE,
      }),
    staleTime: 30_000,
  })

  const projectsQuery = useQuery<Project[], Error>({
    queryKey: ['projects'],
    queryFn: listProjects,
    staleTime: 60_000,
  })

  const items = entitiesQuery.data?.items ?? []
  const total = entitiesQuery.data?.total ?? 0
  const projects = projectsQuery.data ?? []

  // projectId → Project title map
  const projectTitleMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of projects) map.set(p.id, p.title)
    return map
  }, [projects])

  // Group entities by project_id, preserving project order from projects list
  const groups = useMemo(() => {
    const map = new Map<string, StoryEntity[]>()
    for (const entity of items) {
      const list = map.get(entity.project_id) ?? []
      list.push(entity)
      map.set(entity.project_id, list)
    }
    // Sort groups by project list order
    const projectIds = projects.map((p) => p.id)
    const sorted = Array.from(map.entries()).sort(([a], [b]) => {
      const ia = projectIds.indexOf(a)
      const ib = projectIds.indexOf(b)
      if (ia === -1 && ib === -1) return 0
      if (ia === -1) return 1
      if (ib === -1) return -1
      return ia - ib
    })
    return sorted.map(([projectId, entities]) => ({
      projectId,
      title: projectTitleMap.get(projectId) ?? '未知项目',
      entities,
    }))
  }, [items, projects, projectTitleMap])

  // Relations for selected entity
  const relationsQuery = useQuery({
    queryKey: ['story-graph-for-relations', selectedEntity?.project_id],
    queryFn: () => getStoryGraph(selectedEntity!.project_id),
    enabled: Boolean(selectedEntity),
    staleTime: 60_000,
  })

  const filteredRelations = useMemo(() => {
    if (!selectedEntity || !relationsQuery.data) return []
    const name = selectedEntity.canonical_name
    return relationsQuery.data.relations.filter(
      (rel) => rel.source_entity_name === name || rel.target_entity_name === name,
    )
  }, [selectedEntity, relationsQuery.data])

  if (entitiesQuery.isLoading) return <LoadingState label="正在加载实体列表…" />

  if (entitiesQuery.isError) {
    return (
      <EmptyState
        title="加载失败"
        description={entitiesQuery.error?.message || '请检查后端服务是否已启动。'}
        action={<Button variant="outline" onClick={() => entitiesQuery.refetch()}>重新加载</Button>}
      />
    )
  }

  return (
    <div className="flex h-full">
      {/* Left: grouped entity list */}
      <aside className="w-72 shrink-0 border-r border-border bg-sidebar flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border/60 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-foreground">知识图谱</div>
            <span className="text-[11px] text-muted-foreground/50">{total} 个实体</span>
          </div>
          {/* Search */}
          <div className="relative">
            <MagnifyingGlass className="pointer-events-none absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/50" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索实体…"
              className="h-7 w-full rounded-md border border-border/60 bg-background/60 pl-7 pr-3 text-xs text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-primary/40"
            />
          </div>
        </div>

        {/* Type filter pills */}
        <div className="flex gap-1 px-3 py-2 border-b border-border/40 shrink-0 flex-wrap">
          {ENTITY_TYPE_TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveType(tab.key)}
                className={clsx(
                  'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition',
                  activeType === tab.key
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="size-3" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Grouped list */}
        <div className="flex-1 overflow-y-auto py-1">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <p className="text-xs text-muted-foreground/50">
                {keyword || activeType !== 'all' ? '没有匹配的实体' : '暂无实体数据'}
              </p>
            </div>
          ) : (
            groups.map((group, idx) => (
              <div key={group.projectId} className="mb-1">
                <div className="flex items-center gap-2 px-3 py-1.5">
                  <span className={clsx('h-2.5 w-1 rounded-full shrink-0', spineColors[idx % spineColors.length])} />
                  <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                    {group.title}
                  </span>
                  <span className="ml-auto text-[10px] text-muted-foreground/40">{group.entities.length}</span>
                </div>
                {group.entities.map((entity) => (
                  <EntityRow
                    key={entity.id}
                    entity={entity}
                    isSelected={selectedEntity?.id === entity.id}
                    onSelect={() => setSelectedEntity((prev) => prev?.id === entity.id ? null : entity)}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Right: detail */}
      <section className="min-w-0 flex-1 overflow-auto bg-background">
        {selectedEntity ? (
          <EntityDetailPanel
            entity={selectedEntity}
            relations={filteredRelations}
            isLoadingRelations={relationsQuery.isLoading}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <Network className="mx-auto mb-3 size-10 text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground/50">选择一个实体查看详情</p>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
