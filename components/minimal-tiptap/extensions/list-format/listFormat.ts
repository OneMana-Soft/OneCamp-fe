"use client"

import { Extension, wrappingInputRule } from '@tiptap/core'
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    listFormat: {
      /** The numbered list at the caret (or the block menu's range) counts in this format. */
      setListFormat: (format: ListFormat, range?: { from: number; to: number } | null) => ReturnType
    }
  }
}

/** How a numbered list counts: 1, 2, 3; a, b, c; i, ii, iii (stored as <ol type>). */
export type ListFormat = '1' | 'a' | 'i'

/** A list with no format of its own counts by its depth among numbered lists: 1, then a, then i, then again. */
const DEPTH_FORMATS: ListFormat[] = ['1', 'a', 'i']

const isFormat = (v: unknown): v is ListFormat => v === '1' || v === 'a' || v === 'i'

/** The numbered list around a position, and how deep it is among numbered lists. */
export function orderedListAround($pos: ResolvedPos): { node: PMNode; pos: number; depth: number } | null {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name !== 'orderedList') continue
    let depth = 0
    for (let up = d - 1; up > 0; up--) if ($pos.node(up).type.name === 'orderedList') depth++
    return { node: $pos.node(d), pos: $pos.before(d), depth }
  }
  return null
}

/** Where a block-menu action looks: inside the range it was given, else at the caret. */
export const resolvedAt = (state: EditorState, range?: { from: number; to: number } | null) =>
  state.doc.resolve(range ? Math.min(range.from + 1, state.doc.content.size) : state.selection.from)

/** The format a numbered list shows: its own, else its depth's. Pure. */
export const listFormatOf = (list: { node: PMNode; depth: number }): ListFormat =>
  isFormat(list.node.attrs.type) ? list.node.attrs.type : DEPTH_FORMATS[list.depth % 3]

/**
 * Lettered and roman lists (B2; small-details K5, V14; editor.md P2-8): "a."
 * or "i." and a space at a line's start start one, as "1." starts a numbered
 * list; the block menu's List format picks one for a list; and a list with
 * none of its own counts 1, a, i by depth (partials/lists.css).
 */
export const ListFormatKeys = Extension.create({
  name: 'listFormat',

  addCommands() {
    return {
      setListFormat:
        (format, range) =>
        ({ state, tr, dispatch }) => {
          const list = orderedListAround(resolvedAt(state, range))
          if (!list) return false
          if (dispatch) tr.setNodeMarkup(list.pos, undefined, { ...list.node.attrs, type: format })
          return true
        },
    }
  },

  addInputRules() {
    const type = this.editor.schema.nodes.orderedList
    if (!type) return []
    return (['a', 'i'] as const).map((format) =>
      wrappingInputRule({ find: new RegExp(`^${format}\\.\\s$`), type, getAttributes: () => ({ start: 1, type: format }) }),
    )
  },
})
