export type ProjectStatus = 'draft' | 'active' | 'paused' | 'completed'
export type ProjectType = 'original' | 'fanfiction' | 'acg' | 'tv_movie'
export type ProjectChannel = 'male' | 'female' | 'general'
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
  channel: ProjectChannel | null
  genres: string[]
  tropes: string[]
  premise: string | null
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
  channel?: ProjectChannel | null
  genres?: string[]
  tropes?: string[]
  premise?: string | null
  default_model_provider?: string | null
  default_model_id?: string | null
  ai_draft?: ProjectDraftResult | null
}

export interface ProjectDraftPayload {
  title: string
  description?: string | null
  type?: ProjectType
  source_work?: string | null
  channel?: ProjectChannel | null
  genres?: string[]
  tropes?: string[]
  premise?: string | null
  model_provider?: string | null
  model_id?: string | null
}

export interface ProjectDraftResult {
  summary: string
  world_setting_title: string
  world_setting_overview: string
  world_setting_rules: string | null
  world_setting_factions: string | null
  world_setting_locations: string | null
  world_setting_timeline: string | null
  opening_chapters: string[]
  outline_chapters: string[]
  notes: string[]
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

export interface ChapterMemory {
  id: string
  chapter_id: string
  summary_short: string | null
  summary_long: string | null
  key_events: Record<string, unknown>[]
  character_state_changes: Record<string, unknown>[]
  relationship_changes: Record<string, unknown>[]
  open_loops: Record<string, unknown>[]
  resolved_loops: Record<string, unknown>[]
  timeline_markers: Record<string, unknown>[]
  important_objects: Record<string, unknown>[]
  knowledge_state_changes: Record<string, unknown>[]
  updated_at: string
}

export interface ChapterMemoryUpdatePayload {
  summary_short?: string | null
  summary_long?: string | null
  key_events?: Record<string, unknown>[]
  character_state_changes?: Record<string, unknown>[]
  relationship_changes?: Record<string, unknown>[]
  open_loops?: Record<string, unknown>[]
  resolved_loops?: Record<string, unknown>[]
  timeline_markers?: Record<string, unknown>[]
  important_objects?: Record<string, unknown>[]
  knowledge_state_changes?: Record<string, unknown>[]
}

export interface AIGeneratePayload {
  project_id: string
  chapter_id?: string | null
  text: string
  instruction?: string
  model_provider?: string | null
  model_id?: string | null
  temperature?: number
  max_tokens?: number
}

export interface AIContextPreviewSection {
  title: string
  content: string
}

export interface AIContextPreviewResponse {
  intent: string
  sections: AIContextPreviewSection[]
  final_instruction: string
  metadata: {
    project_found?: boolean
    chapter_found?: boolean
    recent_memory_count?: number
    has_previous_chapter_tail?: boolean
    has_story_memory?: boolean
    retrieved_chunk_count?: number
    retrieval_query_terms?: string[]
  }
}

export interface AIRetrievalPreviewChunk {
  chunk_id: string
  chapter_id: string
  chapter_order: number
  chunk_index: number
  scene_label: string | null
  content: string
  content_short: string | null
  characters: string[]
  tags: string[]
  start_offset: number | null
  end_offset: number | null
  score: number
  matched_terms: string[]
  match_reasons: string[]
}

export interface AIRetrievalPreviewResponse {
  query_terms: string[]
  chunks: AIRetrievalPreviewChunk[]
  metadata: {
    project_found?: boolean
    chapter_found?: boolean
    candidate_count?: number
    matched_count?: number
    returned_count?: number
  }
}

export interface AIContinuationIssue {
  issue: string
  reason: string
  evidence: string
  suggestion: string
}

export interface AIContinuationReport {
  severity: 'low' | 'medium' | 'high' | string
  summary: string
  timeline_conflicts: AIContinuationIssue[]
  character_conflicts: AIContinuationIssue[]
  world_rule_conflicts: AIContinuationIssue[]
  knowledge_boundary_conflicts: AIContinuationIssue[]
  open_loop_misalignment: AIContinuationIssue[]
  evidence?: unknown[]
  check_status?: 'completed' | 'skipped' | 'failed' | string
}

export interface AIContinuationGenerateResponse {
  final_content: string
  continuity_report: AIContinuationReport
  warnings: string[]
  fallbacks: string[]
  trace: AIContinuationTraceStep[]
  metadata: Record<string, unknown>
}

export interface AIContinuationDebugResponse extends AIContinuationGenerateResponse {
  plan: Record<string, unknown>
  context_bundle: Record<string, unknown>
  draft: Record<string, unknown>
}

export interface AIContinuationTraceStep {
  step_key: string
  label: string
  status: 'pending' | 'running' | 'completed' | 'skipped' | 'failed' | string
  started_at?: string | null
  finished_at?: string | null
  duration_ms?: number | null
  input_summary?: Record<string, unknown>
  output_summary?: Record<string, unknown>
  warnings: string[]
  fallbacks: string[]
  payload_ref?: string | null
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

// ---------------------------------------------------------------------------
// Conversational chat (LangGraph agent)
// ---------------------------------------------------------------------------

export interface AssetChatRequest {
  message: string
  asset_type: 'world_setting' | 'project_character'
  session_id: string
  file_ids?: string[]
}

export type AssetChatSSEEventType = 'text' | 'tool_call' | 'draft_ready' | 'error' | 'done'

export interface AssetChatSSETextEvent {
  type: 'text'
  content: string
}

export interface AssetChatSSEToolCallEvent {
  type: 'tool_call'
  name: string
  args: Record<string, unknown>
}

export interface AssetChatSSEDraftReadyEvent {
  type: 'draft_ready'
  asset_type: 'world_setting' | 'project_character'
  patch: WorldSettingPatch | null
  actions: CharacterActionItem[] | null
  notes: string[]
  applied_sources?: string[]
}

export interface AssetChatSSEErrorEvent {
  type: 'error'
  error: string
}

export interface AssetChatSSEDoneEvent {
  type: 'done'
}

export type AssetChatSSEEvent =
  | AssetChatSSETextEvent
  | AssetChatSSEToolCallEvent
  | AssetChatSSEDraftReadyEvent
  | AssetChatSSEErrorEvent
  | AssetChatSSEDoneEvent
