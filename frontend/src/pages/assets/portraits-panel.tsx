import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Sparkle, User } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { clsx } from 'clsx'

import { EmptyState } from '@/components/empty-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { listCharacters } from '@/services/characters'
import { listProjects, getProject } from '@/services/projects'
import type { Character, Project, ProjectDetail } from '@/types/api'

// ---------------------------------------------------------------------------
// PortraitCard
// ---------------------------------------------------------------------------

function PortraitCard({ character }: { character: Character }) {
  const [loaded, setLoaded] = useState(false)

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-muted transition-shadow hover:shadow-md">
      <div className="aspect-square overflow-hidden bg-muted">
        {character.portrait_url ? (
          <img
            src={character.portrait_url}
            alt={character.name}
            className={clsx(
              'size-full object-cover transition duration-300 group-hover:scale-105',
              loaded ? 'opacity-100' : 'opacity-0',
            )}
            onLoad={() => setLoaded(true)}
          />
        ) : null}
        {!loaded && (
          <div className="flex size-full items-center justify-center">
            <User className="size-12 text-muted-foreground/30" />
          </div>
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 via-black/30 to-transparent p-3 pt-8">
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-medium text-white">{character.name}</h3>
            {character.alias ? (
              <p className="mt-0.5 truncate text-xs text-white/70">{character.alias}</p>
            ) : null}
          </div>
          <Link
            to="/assets/characters"
            className="shrink-0 rounded-md bg-white/20 px-2 py-1 text-[11px] text-white backdrop-blur-sm transition hover:bg-white/30"
          >
            查看
          </Link>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PortraitGroup
// ---------------------------------------------------------------------------

function PortraitGroup({
  title,
  characters,
  spineColor,
}: {
  title: string
  characters: Character[]
  spineColor: string
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className={clsx('h-3 w-1 rounded-full shrink-0', spineColor)} />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/60">{title}</span>
        <span className="text-xs text-muted-foreground/40">{characters.length} 个</span>
        <span className="flex-1 h-px bg-border/40" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 mb-8">
        {characters.map((character) => (
          <PortraitCard key={character.id} character={character} />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AssetsPortraitsPanel
// ---------------------------------------------------------------------------

const spineColors = [
  'bg-violet-400',
  'bg-sky-400',
  'bg-emerald-400',
  'bg-amber-400',
  'bg-rose-400',
  'bg-indigo-400',
  'bg-teal-400',
]

export function AssetsPortraitsPanel() {
  const charactersQuery = useQuery<Character[], Error>({
    queryKey: ['characters'],
    queryFn: () => listCharacters(),
    staleTime: 30_000,
  })

  const projectsQuery = useQuery<Project[], Error>({
    queryKey: ['projects'],
    queryFn: listProjects,
    staleTime: 60_000,
  })
  const projects = projectsQuery.data ?? []

  const projectDetailsQuery = useQuery<ProjectDetail[], Error>({
    queryKey: ['project-details-for-portraits', projects.map((p) => p.id).join(',')],
    queryFn: async () => {
      if (projects.length === 0) return []
      return Promise.all(projects.map((p) => getProject(p.id)))
    },
    enabled: projects.length > 0,
    staleTime: 60_000,
  })

  // characterId → Project[]
  const characterProjectsMap = useMemo<Map<string, Project[]>>(() => {
    const map = new Map<string, Project[]>()
    for (const detail of projectDetailsQuery.data ?? []) {
      const project = projects.find((p) => p.id === detail.id)
      if (!project) continue
      for (const pc of detail.project_characters) {
        const existing = map.get(pc.character_id) ?? []
        existing.push(project)
        map.set(pc.character_id, existing)
      }
    }
    return map
  }, [projectDetailsQuery.data, projects])

  const allCharacters = charactersQuery.data ?? []
  const charactersWithPortraits = useMemo(
    () => allCharacters.filter((c) => c.portrait_url),
    [allCharacters],
  )

  // Build groups
  const { groups, unassigned } = useMemo(() => {
    const projectMap = new Map<string, { project: Project; chars: Character[] }>()
    for (const character of charactersWithPortraits) {
      const projs = characterProjectsMap.get(character.id)
      if (projs && projs.length > 0) {
        for (const proj of projs) {
          if (!projectMap.has(proj.id)) {
            projectMap.set(proj.id, { project: proj, chars: [] })
          }
          const group = projectMap.get(proj.id)!
          if (!group.chars.some((c) => c.id === character.id)) {
            group.chars.push(character)
          }
        }
      }
    }
    // Sort by project list order
    const sorted = projects
      .map((p) => projectMap.get(p.id))
      .filter((g): g is { project: Project; chars: Character[] } => Boolean(g) && g!.chars.length > 0)

    const unassigned = charactersWithPortraits.filter(
      (c) => !characterProjectsMap.has(c.id) || (characterProjectsMap.get(c.id)?.length ?? 0) === 0,
    )
    return { groups: sorted, unassigned }
  }, [charactersWithPortraits, characterProjectsMap, projects])

  if (charactersQuery.isLoading) return <LoadingState label="正在加载形象资产…" />

  if (charactersQuery.isError) {
    return (
      <EmptyState
        title="加载失败"
        description={charactersQuery.error?.message || '请检查后端服务是否已启动。'}
        action={<Button variant="outline" onClick={() => charactersQuery.refetch()}>重新加载</Button>}
      />
    )
  }

  if (allCharacters.length === 0) {
    return (
      <EmptyState
        title="还没有角色"
        description="先在「角色」分类中创建角色，然后为它们生成形象。"
      />
    )
  }

  if (charactersWithPortraits.length === 0) {
    return (
      <EmptyState
        title="还没有形象资产"
        description={`当前有 ${allCharacters.length} 个角色，但尚未生成形象。前往角色详情页点击「生成形象」即可。`}
        action={
          <Link to="/assets/characters">
            <Button variant="outline">
              <Sparkle className="size-4" />
              前往角色库
            </Button>
          </Link>
        }
      />
    )
  }

  const hasGroups = groups.length > 0

  return (
    <div className="px-8 py-6 pb-12 overflow-auto h-full">
      {/* Header */}
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground tracking-tight">形象资产库</h2>
          <p className="mt-0.5 text-xs text-muted-foreground/60">
            已为 {charactersWithPortraits.length} / {allCharacters.length} 个角色生成形象
          </p>
        </div>
        <span className="text-sm text-muted-foreground/50">{charactersWithPortraits.length} 张</span>
      </div>

      {hasGroups ? (
        <>
          {groups.map((group, idx) => (
            <PortraitGroup
              key={group.project.id}
              title={group.project.title}
              characters={group.chars}
              spineColor={spineColors[idx % spineColors.length]}
            />
          ))}
          {unassigned.length > 0 && (
            <PortraitGroup
              title="未关联项目"
              characters={unassigned}
              spineColor="bg-muted-foreground/30"
            />
          )}
        </>
      ) : (
        // Flat grid before project data loads
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {charactersWithPortraits.map((character) => (
            <PortraitCard key={character.id} character={character} />
          ))}
        </div>
      )}
    </div>
  )
}
