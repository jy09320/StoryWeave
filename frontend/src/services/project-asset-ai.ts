import { apiClient } from '@/lib/api-client'
import type {
  ProjectAssetFileUploadResponse,
  WorldSettingAnalyzeRequest,
  WorldSettingAnalyzeResponse,
  WorldSettingApplyRequest,
  WorldSettingApplyResponse,
  CharacterAnalyzeRequest,
  CharacterAnalyzeResponse,
  CharacterApplyRequest,
  CharacterApplyResponse,
} from '@/types/api'

export async function uploadProjectAssetFile(
  projectId: string,
  file: File,
): Promise<ProjectAssetFileUploadResponse> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await apiClient.post<ProjectAssetFileUploadResponse>(
    `/projects/${projectId}/ai-assets/files`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return data
}

export async function analyzeWorldSetting(
  projectId: string,
  payload: WorldSettingAnalyzeRequest,
): Promise<WorldSettingAnalyzeResponse> {
  const { data } = await apiClient.post<WorldSettingAnalyzeResponse>(
    `/projects/${projectId}/ai-assets/world-setting/analyze`,
    payload,
  )
  return data
}

export async function applyWorldSettingPatch(
  projectId: string,
  payload: WorldSettingApplyRequest,
): Promise<WorldSettingApplyResponse> {
  const { data } = await apiClient.post<WorldSettingApplyResponse>(
    `/projects/${projectId}/ai-assets/world-setting/apply`,
    payload,
  )
  return data
}

export async function analyzeCharacters(
  projectId: string,
  payload: CharacterAnalyzeRequest,
): Promise<CharacterAnalyzeResponse> {
  const { data } = await apiClient.post<CharacterAnalyzeResponse>(
    `/projects/${projectId}/ai-assets/characters/analyze`,
    payload,
  )
  return data
}

export async function applyCharacterPatch(
  projectId: string,
  payload: CharacterApplyRequest,
): Promise<CharacterApplyResponse> {
  const { data } = await apiClient.post<CharacterApplyResponse>(
    `/projects/${projectId}/ai-assets/characters/apply`,
    payload,
  )
  return data
}
