export const EDITOR_UTILITY_CONTEXT_KEY = 'storyweave.editor-utility-context'
export const EDITOR_UTILITY_CONTEXT_EVENT = 'storyweave:editor-utility-context'

export type EditorUtilityAction = 'polish' | 'expand' | 'rewrite' | 'consistency'

export interface EditorUtilityContext {
  projectId: string
  projectTitle: string | null
  chapterId: string
  chapterTitle: string | null
  action: EditorUtilityAction
  selectedText: string
  updatedAt: string
}

export function readEditorUtilityContext() {
  const raw = window.sessionStorage.getItem(EDITOR_UTILITY_CONTEXT_KEY)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as EditorUtilityContext
  } catch {
    window.sessionStorage.removeItem(EDITOR_UTILITY_CONTEXT_KEY)
    return null
  }
}

export function writeEditorUtilityContext(context: EditorUtilityContext | null) {
  if (context) {
    window.sessionStorage.setItem(EDITOR_UTILITY_CONTEXT_KEY, JSON.stringify(context))
  } else {
    window.sessionStorage.removeItem(EDITOR_UTILITY_CONTEXT_KEY)
  }

  window.dispatchEvent(
    new CustomEvent(EDITOR_UTILITY_CONTEXT_EVENT, {
      detail: context,
    }),
  )
}
