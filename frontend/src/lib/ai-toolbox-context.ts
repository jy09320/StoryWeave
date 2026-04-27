export const TOOLBOX_INPUT_DRAFT_KEY = 'storyweave.toolbox-input-draft'

export interface ToolboxInputDraft {
  task: string
  projectId: string | null
  chapterId: string | null
  input: string
  createdAt: string
}

export function readToolboxInputDraft() {
  const raw = window.sessionStorage.getItem(TOOLBOX_INPUT_DRAFT_KEY)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as ToolboxInputDraft
  } catch {
    window.sessionStorage.removeItem(TOOLBOX_INPUT_DRAFT_KEY)
    return null
  }
}

export function writeToolboxInputDraft(draft: ToolboxInputDraft | null) {
  if (draft) {
    window.sessionStorage.setItem(TOOLBOX_INPUT_DRAFT_KEY, JSON.stringify(draft))
  } else {
    window.sessionStorage.removeItem(TOOLBOX_INPUT_DRAFT_KEY)
  }
}
