"use client"

import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    quoteSize: {
      /** The quote at the caret (or in the block menu's range) is large, or back to its usual size. */
      setQuoteSize: (size: 'large' | null, range?: { from: number; to: number } | null) => ReturnType
    }
  }
}

/** The quote around a position (the block menu's range, else the caret). */
export function quoteAround(state: EditorState, range?: { from: number; to: number } | null): { node: PMNode; pos: number } | null {
  const $pos = state.doc.resolve(range ? Math.min(range.from + 1, state.doc.content.size) : state.selection.from)
  for (let d = $pos.depth; d > 0; d--) if ($pos.node(d).type.name === 'blockquote') return { node: $pos.node(d), pos: $pos.before(d) }
  return null
}

/**
 * A large quote (B2; editor.md P2-8, Notion's "quote size"): a pull quote at
 * 20/30, set from the block menu. An attribute of the doc's quotes only: a
 * message's quote never has it.
 */
export const QuoteSize = Extension.create({
  name: 'quoteSize',

  addGlobalAttributes() {
    return [
      {
        types: ['blockquote'],
        attributes: {
          quoteSize: {
            default: null,
            parseHTML: (el) => (el.getAttribute('data-quote-size') === 'large' ? 'large' : null),
            renderHTML: ({ quoteSize }) => (quoteSize === 'large' ? { 'data-quote-size': 'large' } : {}),
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setQuoteSize:
        (size, range) =>
        ({ state, tr, dispatch }) => {
          const quote = quoteAround(state, range)
          if (!quote) return false
          if (dispatch) tr.setNodeMarkup(quote.pos, undefined, { ...quote.node.attrs, quoteSize: size })
          return true
        },
    }
  },
})
