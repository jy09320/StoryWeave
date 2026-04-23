import { apiClient } from '@/lib/api-client'
import type {
  Chapter,
  ChapterPayload,
  ChapterReorderItem,
  ChapterUpdatePayload,
  ChapterVersion,
  Project,
  ProjectDetail,
  ProjectPayload,
} from '@/types/api'

export async function listProjects() {
  const { data } = await apiClient.get<Project[]>('/projects/')
  return data
}

export async function createProject(payload: ProjectPayload) {
  const { data } = await apiClient.post<Project>('/projects/', payload)
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
