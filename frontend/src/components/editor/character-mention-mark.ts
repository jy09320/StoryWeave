import { Mark, mergeAttributes } from '@tiptap/core'

export const CharacterMentionMark = Mark.create({
  name: 'characterMention',

  inclusive: false,

  addAttributes() {
    return {
      characterId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-character-id'),
        renderHTML: (attributes) => ({ 'data-character-id': attributes.characterId }),
      },
      label: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-label'),
        renderHTML: (attributes) => ({ 'data-label': attributes.label }),
      },
      personality: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-personality'),
        renderHTML: (attributes) => ({ 'data-personality': attributes.personality }),
      },
      projectSummary: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-project-summary'),
        renderHTML: (attributes) => ({ 'data-project-summary': attributes.projectSummary }),
      },
      tooltip: {
        default: null,
        parseHTML: (element) => element.getAttribute('title'),
        renderHTML: (attributes) => ({ title: attributes.tooltip }),
      },
      description: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-description'),
        renderHTML: (attributes) => ({ 'data-description': attributes.description }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-character-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class:
          'storyweave-mention rounded-sm bg-sky-400/12 px-1.5 py-0.5 text-sky-200 decoration-transparent',
      }),
      0,
    ]
  },
})
