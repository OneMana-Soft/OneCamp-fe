"use client"

import { Extension, combineTransactionSteps, getChangedRanges, type Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { BLOCK_COLOUR_NODES, blockColourValue, colourBlocksIn, colourTargets, recentColours, rememberColour, type BlockRange, type ColourPick } from './colourPicks'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockColor: {
      /** The chosen blocks (by id), else those in the range, else the caret's block, get the pick's colour (or lose that row's). */
      setBlockColour: (pick: ColourPick, range?: BlockRange | null, blocks?: readonly string[] | null) => ReturnType
      /** A pick where it belongs: the block menu's blocks, the selected text, or the caret's block. */
      applyColour: (pick: ColourPick, range?: BlockRange | null, blocks?: readonly string[] | null) => ReturnType
    }
  }
}

/** Blocks drawn by a node view of their own, which keeps no attribute it didn't make: their colour is a decoration. */
const VIEWED = ['taskItem']

function viewedIn(doc: PMNode, from: number, to: number) {
  const out: Decoration[] = []
  doc.nodesBetween(from, to, (node, pos) => {
    const value = VIEWED.includes(node.type.name) ? blockColourValue(node.attrs.blockColor) : null
    if (value) out.push(Decoration.node(pos, pos + node.nodeSize, { 'data-block-color': value }))
    return !node.isTextblock
  })
  return out
}

const key = new PluginKey<DecorationSet>('blockColour')

/** ⌘⇧H (Notion's key): the last colour used, again, on what is selected or the caret's block. */
export function reapplyLastColour(editor: Editor): boolean {
  if (!editor.isEditable) return false
  const last = recentColours()[0]
  if (last && editor.commands.applyColour(last)) rememberColour(last)
  return true
}

/**
 * A block's own colour (B2; editor.md P1-2, perf 4.5): blockColor on the
 * blocks that take one, "sky" for blue text or "sky_background" for a blue
 * background, drawn by name (data-block-color, partials/doc.css), so it reads
 * in both themes and means the same outside the app. A new line after a
 * coloured one starts plain.
 */
export const BlockColor = Extension.create({
  name: 'blockColor',

  addGlobalAttributes() {
    return [
      {
        types: BLOCK_COLOUR_NODES,
        attributes: {
          blockColor: {
            default: null,
            keepOnSplit: false,
            parseHTML: (el) => blockColourValue(el.getAttribute('data-block-color')),
            renderHTML: ({ blockColor }) => {
              const value = blockColourValue(blockColor)
              return value ? { 'data-block-color': value } : {}
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setBlockColour:
        (pick, range, blocks) =>
        ({ tr, dispatch }) => {
          const targets = colourTargets(tr, range, blocks)
          if (!targets.length) return false
          if (dispatch) colourBlocksIn(tr, targets, pick)
          return true
        },
      applyColour:
        (pick, range, blocks) =>
        ({ tr, commands }) => {
          if (range || blocks?.length) return commands.setBlockColour(pick, range, blocks)
          const { selection } = tr
          if (selection.empty || selection instanceof NodeSelection) return commands.setBlockColour(pick)
          if (!pick.background) return pick.colour ? commands.setColor(pick.colour) : commands.unsetColor()
          if (!commands.setHighlight) return false
          return pick.colour ? commands.setHighlight(pick.colour) : commands.unsetHighlight()
        },
    }
  },

  addKeyboardShortcuts() {
    return { 'Mod-Shift-h': () => reapplyLastColour(this.editor) }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: (_, state) => DecorationSet.create(state.doc, viewedIn(state.doc, 0, state.doc.content.size)),
          // Only where the doc changed: the blocks around each change, never the whole doc.
          apply(tr, set, before) {
            if (!tr.docChanged) return set
            let next = set.map(tr.mapping, tr.doc)
            for (const { newRange } of getChangedRanges(combineTransactionSteps(before.doc, [tr]))) {
              const from = Math.max(0, newRange.from - 1)
              const to = Math.min(tr.doc.content.size, newRange.to + 1)
              next = next.remove(next.find(from, to)).add(tr.doc, viewedIn(tr.doc, from, to))
            }
            return next
          },
        },
        props: {
          decorations: (state) => key.getState(state),
        },
      }),
    ]
  },
})
