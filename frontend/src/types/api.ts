export type ProjectStatus = 'draft' | 'active' | 'paused' | 'completed'
export type ProjectType = 'original' | 'fanfiction' | 'acg' | 'tv_movie'
export type ChapterStatus = 'draft' | 'writing' | 'review' | 'done'

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
