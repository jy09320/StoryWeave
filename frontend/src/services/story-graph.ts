import type { StoryEntity, StoryGraph } from '@/types/api'
import { apiClient } from '@/lib/api-client'

export interface StoryEntityListResponse {
  items: StoryEntity[]
  total: number
}

export async function listAllStoryEntities(params?: {
  entity_type?: string
  keyword?: string
  page?: number
  page_size?: number
}): Promise<StoryEntityListResponse> {
  const { data } = await apiClient.get<StoryEntityListResponse>('/projects/story-entities', {
    params: params && Object.fromEntries(
      Object.entries(params).filter(([, v]) => v != null),
    ),
  })
  return data
}

export async function getStoryGraph(projectId: string): Promise<StoryGraph> {
  const { data } = await apiClient.get<StoryGraph>(`/projects/${projectId}/story-graph`)
  return data
}
