export type ProjectStatus = 'draft' | 'active' | 'paused' | 'completed'
export type ProjectType = 'original' | 'fanfiction' | 'acg' | 'tv_movie'
export type ChapterStatus = 'draft' | 'writing' | 'review' | 'done'
export type ProjectAssetAIType = 'world_setting' | 'project_character'
export type ProjectAssetAIMessageRole = 'user' | 'system' | 'tool' | 'preview' | 'result'

export interface ProjectAssetAIMessage {
  id: string
  role: ProjectAssetAIMessageRole
  title?: string | null
  content: string
}

export interface ProjectAssetAICharacterAction {
  action: string
  target_name: string
  reason: string
}

export interface ProjectAssetAICharacterDraft {
  name: string
  role_label: string | null
  summary: string | null
}

export interface ProjectAssetAICharacterResult {
  detected_characters: ProjectAssetAICharacterDraft[]
  suggested_actions: ProjectAssetAICharacterAction[]
  pending_confirmations: string[]
  notes: string[]
}

export interface Chapter {
  id: string
  project_id: string
  title: string
  order_index: number
  content: string | null
  plain_text: string | null
  summary: string | null
  word_count: number
  status: ChapterStatus | string
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Character {
  id: string
  name: string
  alias: string | null
  description: string | null
  profile: string | null
  personality: string | null
  background: string | null
  relationship_notes: string | null
  tags: string | null
  created_at: string
  updated_at: string
}

export interface ProjectCharacter {
  id: string
  project_id: string
  character_id: string
  role_label: string | null
  summary: string | null
  sort_order: number
  created_at: string
  updated_at: string
  character: Character
}

export interface WorldSetting {
  id: string
  project_id: string
  title: string
  overview: string | null
  rules: string | null
  factions: string | null
  locations: string | null
  timeline: string | null
  extra_notes: string | null
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  title: string
  description: string | null
  type: ProjectType | string
  source_work: string | null
  status: ProjectStatus | string
  default_model_provider: string | null
  default_model_id: string | null
  created_at: string
  updated_at: string
}

export interface ProjectDetail extends Project {
  chapters: Chapter[]
  project_characters: ProjectCharacter[]
  world_setting: WorldSetting | null
}

export interface ProjectPayload {
  title: string
  description?: string | null
  type?: ProjectType
  source_work?: string | null
  status?: ProjectStatus
  default_model_provider?: string | null
  default_model_id?: string | null
}

export interface ChapterPayload {
  project_id: string
  title: string
  order_index?: number
  content?: string | null
  plain_text?: string | null
  notes?: string | null
}

export interface ChapterUpdatePayload {
  title?: string
  order_index?: number
  content?: string | null
  plain_text?: string | null
  summary?: string | null
  status?: ChapterStatus
  notes?: string | null
}

export interface CharacterPayload {
  name: string
  alias?: string | null
  description?: string | null
  profile?: string | null
  personality?: string | null
  background?: string | null
  relationship_notes?: string | null
  tags?: string | null
}

export interface ProjectCharacterPayload {
  character_id: string
  role_label?: string | null
  summary?: string | null
  sort_order?: number
}

export interface ProjectCharacterUpdatePayload {
  role_label?: string | null
  summary?: string | null
  sort_order?: number
}

export interface WorldSettingPayload {
  title?: string
  overview?: string | null
  rules?: string | null
  factions?: string | null
  locations?: string | null
  timeline?: string | null
  extra_notes?: string | null
}

export interface ProjectImportPayload {
  source_text: string
  guidance?: string | null
  model_provider?: string | null
  model_id?: string | null
}

export type ProjectWorldAutoCompleteMode = 'import' | 'command' | 'hybrid'

export interface ProjectWorldAutoCompletePayload {
  mode: ProjectWorldAutoCompleteMode
  source_text?: string | null
  command?: string | null
  guidance?: string | null
  model_provider?: string | null
  model_id?: string | null
}

export interface ProjectImportResult {
  created_character_count: number
  updated_character_count: number
  linked_character_count: number
  imported_character_count: number
  world_setting_updated: boolean
  notes: string[]
  characters: ProjectCharacter[]
  world_setting: WorldSetting | null
}

export interface ProjectWorldAutoCompleteResult {
  world_setting: WorldSetting
  notes: string[]
  applied_sources: string[]
  world_setting_updated: boolean
}

export interface ChapterReorderItem {
  id: string
  order_index: number
}

export interface ChapterVersion {
  id: string
  chapter_id: string
  content: string
  plain_text: string | null
  word_count: number | null
  change_note: string | null
  created_at: string
}

export interface AIGeneratePayload {
  project_id: string
  chapter_id?: string | null
  text: string
  instruction?: string
  model_provider?: string
  model_id?: string
  temperature?: number
  max_tokens?: number
}

// ---------------------------------------------------------------------------
// Project Asset AI — file upload, analyze, apply
// ---------------------------------------------------------------------------

export interface ProjectAssetFileUploadResponse {
  file_id: string
  filename: string
  extracted_text: string
  preview: string
  token_estimate: number
}

export interface WorldSettingPatch {
  title?: string | null
  overview?: string | null
  rules?: string | null
  factions?: string | null
  locations?: string | null
  timeline?: string | null
  extra_notes?: string | null
}

export interface WorldSettingAnalyzeRequest {
  message?: string
  source_text?: string | null
  command?: string | null
  guidance?: string | null
  file_ids?: string[]
}

export interface WorldSettingAnalyzeResponse {
  patch: WorldSettingPatch
  notes: string[]
  applied_sources: string[]
  tool_trace: string[]
}

export interface WorldSettingApplyRequest {
  patch: WorldSettingPatch
}

export interface WorldSettingApplyResponse {
  world_setting_updated: boolean
  world_setting: WorldSetting
}

export interface CharacterActionItem {
  action: 'create_and_attach' | 'update_project_character'
  name: string
  alias?: string | null
  description?: string | null
  profile?: string | null
  personality?: string | null
  background?: string | null
  relationship_notes?: string | null
  tags?: string | null
  role_label?: string | null
  summary?: string | null
}

export interface CharacterAnalyzeRequest {
  message?: string
  source_text?: string | null
  command?: string | null
  guidance?: string | null
  file_ids?: string[]
}

export interface CharacterAnalyzeResponse {
  actions: CharacterActionItem[]
  notes: string[]
  tool_trace: string[]
}

export interface CharacterApplyRequest {
  actions: CharacterActionItem[]
}

export interface CharacterApplyResponse {
  applied: string[]
  errors: string[]
}
