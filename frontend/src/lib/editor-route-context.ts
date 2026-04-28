export const EDITOR_ROUTE_CONTEXT_KEY = 'storyweave.editor-route-context'

export interface EditorRouteContext {
  projectId: string
  projectTitle: string | null
  chapterId: string
  chapterTitle: string | null
  updatedAt: string
}

export function readEditorRouteContext() {
  const raw = window.sessionStorage.getItem(EDITOR_ROUTE_CONTEXT_KEY)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as EditorRouteContext
  } catch {
    window.sessionStorage.removeItem(EDITOR_ROUTE_CONTEXT_KEY)
    return null
  }
}

export function writeEditorRouteContext(context: EditorRouteContext | null) {
  if (context) {
    window.sessionStorage.setItem(EDITOR_ROUTE_CONTEXT_KEY, JSON.stringify(context))
  } else {
    window.sessionStorage.removeItem(EDITOR_ROUTE_CONTEXT_KEY)
  }
}
