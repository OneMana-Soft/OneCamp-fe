"use client"

import { Mark, markInputRule, markPasteRule } from '@tiptap/core'
import { isDocColour, type DocColour } from '@/lib/docColours'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    highlight: {
      /** A background behind the selected text, one of the doc colours (yellow when none is named). */
      setHighlight: (colour?: string) => ReturnType
      unsetHighlight: () => ReturnType
    }
  }
}

/** The highlighter's own colour: what ==text== and a bare <mark> get. */
export const DEFAULT_HIGHLIGHT: DocColour = 'sun'

const colourOf = (v: unknown): DocColour => (isDocColour(v) ? v : DEFAULT_HIGHLIGHT)

/** ==text== as it is typed (K13): text that starts and ends with something other than a space. */
export const HIGHLIGHT_TYPED = /(?:^|\s)(==([^=\s](?:[^=]*[^=\s])?)==)$/
export const HIGHLIGHT_PASTED = /(?:^|\s)(==([^=\s](?:[^=]*[^=\s])?)==)/g

/**
 * A highlight (editor.md P1-2): text on one of the doc colours' tints, stored
 * by name (<mark data-color="sky">), so it reads in both themes and anywhere
 * the doc goes. Text colour (textStyle) and a highlight go together: every ink
 * reads on every tint (lib/docColours.test.ts).
 */
export const Highlight = Mark.create({
  name: 'highlight',

  addAttributes() {
    return {
      color: {
        default: DEFAULT_HIGHLIGHT,
        parseHTML: (el) => colourOf(el.getAttribute('data-color')),
        renderHTML: ({ color }) => ({ 'data-color': colourOf(color) }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'mark' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['mark', HTMLAttributes, 0]
  },

  addCommands() {
    return {
      setHighlight:
        (colour) =>
        ({ commands }) =>
          commands.setMark(this.name, { color: colourOf(colour) }),
      unsetHighlight:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name, { extendEmptyMarkRange: true }),
    }
  },

  addInputRules() {
    return [markInputRule({ find: HIGHLIGHT_TYPED, type: this.type })]
  },

  addPasteRules() {
    return [markPasteRule({ find: HIGHLIGHT_PASTED, type: this.type })]
  },
})
