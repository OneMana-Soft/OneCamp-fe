"use client"

import { Color as TiptapColor } from '@tiptap/extension-color'
import { TextStyle as TiptapTextStyle } from '@tiptap/extension-text-style'
import { Plugin } from '@tiptap/pm/state'
import { colourName } from '@/lib/docColours'

// Text colour by name (N15): <span data-color="sky">; other colours go (lib/docColours).

const colourOf = (el: HTMLElement) => colourName(el.getAttribute('data-color') || el.style.color)

export const Color = TiptapColor.extend({
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        color: {
          default: null,
          parseHTML: colourOf,
          renderHTML: ({ color }) => (colourName(color) ? { 'data-color': colourName(color) } : {}),
        },
      },
    }]
  },
  addCommands() {
    return {
      ...this.parent?.(),
      setColor: (color) => ({ chain }) => (colourName(color) ? chain().setMark('textStyle', { color: colourName(color) }) : chain().unsetColor()).run(),
    }
  },
  // Enter leaves a colour behind (only a coloured caret is reset).
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleKeyDown: (view, event) => {
            if (event.key !== 'Enter') return false
            const { state } = view
            const type = state.schema.marks.textStyle
            const marks = state.storedMarks ?? state.selection.$from.marks()
            if (!type || !marks.some((m) => m.type === type && m.attrs.color)) return false
            view.dispatch(state.tr.setStoredMarks(marks.filter((m) => m.type !== type)))
            return false
          },
        },
      }),
    ]
  },
})

export const TextStyle = TiptapTextStyle.extend({
  parseHTML() {
    return [{ tag: 'span', consuming: false, getAttrs: (el) => (colourOf(el) ? {} : false) }]
  },
})
