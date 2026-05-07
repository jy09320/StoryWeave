import type { EditorUtilityAction } from '@/lib/editor-utility-context'

export const EDITOR_AI_DRAFT_KEY = 'storyweave.editor-ai-draft'
export const EDITOR_AI_DRAFT_EVENT = 'storyweave:editor-ai-draft'
export const EDITOR_AI_COMMAND_EVENT = 'storyweave:editor-ai-command'
export const EDITOR_AI_PREVIEW_KEY = 'storyweave.editor-ai-preview'
export const EDITOR_AI_PREVIEW_EVENT = 'storyweave:editor-ai-preview'

export type EditorAIApplyMode = 'append-chapter' | 'append-after-selection'

export interface EditorAIDraftContext {
  projectId: string
  chapterId: string
  chapterTitle: string | null
  plainText: string
  updatedAt: string
}

export interface EditorAICommand {
  projectId: string
  chapterId: string
  type: 'apply-generated-text' | 'discard-generated-text'
  text?: string
  mode?: EditorAIApplyMode
  selectionAction?: EditorUtilityAction | null
}

export interface EditorAIPreviewContext {
  projectId: string
  chapterId: string
  text: string
  isStreaming: boolean
  updatedAt: string
}

export function readEditorAIDraftContext() {
  const raw = window.sessionStorage.getItem(EDITOR_AI_DRAFT_KEY)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as EditorAIDraftContext
  } catch {
    window.sessionStorage.removeItem(EDITOR_AI_DRAFT_KEY)
    return null
  }
}

export function writeEditorAIDraftContext(context: EditorAIDraftContext | null) {
  if (context) {
    window.sessionStorage.setItem(EDITOR_AI_DRAFT_KEY, JSON.stringify(context))
  } else {
    window.sessionStorage.removeItem(EDITOR_AI_DRAFT_KEY)
  }

  window.dispatchEvent(
    new CustomEvent(EDITOR_AI_DRAFT_EVENT, {
      detail: context,
    }),
  )
}

export function readEditorAIPreviewContext() {
  const raw = window.sessionStorage.getItem(EDITOR_AI_PREVIEW_KEY)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as EditorAIPreviewContext
  } catch {
    window.sessionStorage.removeItem(EDITOR_AI_PREVIEW_KEY)
    return null
  }
}

export function writeEditorAIPreviewContext(context: EditorAIPreviewContext | null) {
  if (context) {
    window.sessionStorage.setItem(EDITOR_AI_PREVIEW_KEY, JSON.stringify(context))
  } else {
    window.sessionStorage.removeItem(EDITOR_AI_PREVIEW_KEY)
  }

  window.dispatchEvent(
    new CustomEvent(EDITOR_AI_PREVIEW_EVENT, {
      detail: context,
    }),
  )
}

export function dispatchEditorAICommand(command: EditorAICommand) {
  window.dispatchEvent(
    new CustomEvent(EDITOR_AI_COMMAND_EVENT, {
      detail: command,
    }),
  )
}
