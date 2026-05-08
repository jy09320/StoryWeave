import { apiClient } from '@/lib/api-client'
import type {
  Chapter,
  ChapterMemory,
  ChapterMemoryUpdatePayload,
  ChapterPayload,
  ChapterReorderItem,
  ChapterUpdatePayload,
  ChapterVersion,
  Character,
  CharacterPayload,
  Project,
  ProjectCharacter,
  ProjectCharacterPayload,
  ProjectCharacterUpdatePayload,
  ProjectDraftPayload,
  ProjectDraftResult,
  ProjectDetail,
  ProjectImportPayload,
  ProjectImportResult,
  ProjectPayload,
  ProjectWorldAutoCompletePayload,
  ProjectWorldAutoCompleteResult,
  WorldSetting,
  WorldSettingPayload,
} from '@/types/api'

export async function listProjects() {
  const { data } = await apiClient.get<Project[]>('/projects/')
  return data
}

export async function createProject(payload: ProjectPayload) {
  const { data } = await apiClient.post<Project>('/projects/', payload)
  return data
}

export async function generateProjectDraft(payload: ProjectDraftPayload) {
  const { data } = await apiClient.post<ProjectDraftResult>('/projects/draft', payload)
  return data
}

export async function updateProject(projectId: string, payload: Partial<ProjectPayload>) {
  const { data } = await apiClient.put<Project>(`/projects/${projectId}`, payload)
  return data
}

export async function deleteProject(projectId: string) {
  await apiClient.delete(`/projects/${projectId}`)
}

export async function getProject(projectId: string) {
  const { data } = await apiClient.get<ProjectDetail>(`/projects/${projectId}`)
  return data
}

export async function createChapter(payload: ChapterPayload) {
  const { data } = await apiClient.post<Chapter>('/chapters/', payload)
  return data
}

export async function updateChapter(chapterId: string, payload: ChapterUpdatePayload) {
  const { data } = await apiClient.put<Chapter>(`/chapters/${chapterId}`, payload)
  return data
}

export async function deleteChapter(chapterId: string) {
  await apiClient.delete(`/chapters/${chapterId}`)
}

export async function reorderChapters(projectId: string, payload: ChapterReorderItem[]) {
  const { data } = await apiClient.put<Chapter[]>(`/chapters/reorder/${projectId}`, payload)
  return data
}

export async function listChapterVersions(chapterId: string) {
  const { data } = await apiClient.get<ChapterVersion[]>(`/chapters/${chapterId}/versions`)
  return data
}

export async function getChapterMemory(chapterId: string): Promise<ChapterMemory | null> {
  try {
    const { data } = await apiClient.get<ChapterMemory>(`/chapters/${chapterId}/memory`)
    return data
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as { response?: { status?: number } }
      if (axiosError.response?.status === 404) return null
    }
    throw error
  }
}

export async function updateChapterMemory(chapterId: string, payload: ChapterMemoryUpdatePayload) {
  const { data } = await apiClient.put<ChapterMemory>(`/chapters/${chapterId}/memory`, payload)
  return data
}

export async function refreshChapterMemory(chapterId: string) {
  const { data } = await apiClient.post<ChapterMemory>(`/chapters/${chapterId}/memory/refresh`)
  return data
}

export async function listCharacters(keyword?: string) {
  const { data } = await apiClient.get<Character[]>('/characters/', {
    params: keyword?.trim() ? { keyword: keyword.trim() } : undefined,
  })
  return data
}

export async function getCharacter(characterId: string) {
  const { data } = await apiClient.get<Character>(`/characters/${characterId}`)
  return data
}

export async function createCharacter(payload: CharacterPayload) {
  const { data } = await apiClient.post<Character>('/characters/', payload)
  return data
}

export async function updateCharacter(characterId: string, payload: Partial<CharacterPayload>) {
  const { data } = await apiClient.put<Character>(`/characters/${characterId}`, payload)
  return data
}

export async function deleteCharacter(characterId: string) {
  await apiClient.delete(`/characters/${characterId}`)
}

export async function listProjectCharacters(projectId: string) {
  const { data } = await apiClient.get<ProjectCharacter[]>(`/projects/${projectId}/characters`)
  return data
}

export async function attachProjectCharacter(projectId: string, payload: ProjectCharacterPayload) {
  const { data } = await apiClient.post<ProjectCharacter>(`/projects/${projectId}/characters`, payload)
  return data
}

export async function updateProjectCharacter(
  projectId: string,
  linkId: string,
  payload: ProjectCharacterUpdatePayload,
) {
  const { data } = await apiClient.put<ProjectCharacter>(`/projects/${projectId}/characters/${linkId}`, payload)
  return data
}

export async function deleteProjectCharacter(projectId: string, linkId: string) {
  await apiClient.delete(`/projects/${projectId}/characters/${linkId}`)
}

export async function getProjectWorldSetting(projectId: string) {
  const { data } = await apiClient.get<WorldSetting | null>(`/projects/${projectId}/world-setting`)
  return data
}

export async function updateProjectWorldSetting(projectId: string, payload: WorldSettingPayload) {
  const { data } = await apiClient.put<WorldSetting>(`/projects/${projectId}/world-setting`, payload)
  return data
}

export async function importProjectKnowledge(projectId: string, payload: ProjectImportPayload) {
  const { data } = await apiClient.post<ProjectImportResult>(`/projects/${projectId}/import`, payload)
  return data
}

export async function autocompleteProjectWorldSetting(projectId: string, payload: ProjectWorldAutoCompletePayload) {
  const { data } = await apiClient.post<ProjectWorldAutoCompleteResult>(`/projects/${projectId}/world-setting/autocomplete`, payload)
  return data
}
