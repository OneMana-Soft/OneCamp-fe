"use client"

import { Extension } from "@tiptap/core"
import type { EditorState } from "@tiptap/pm/state"
import { DIR_NODES } from "../block-commands/nodes"
import { LIST_ITEMS, type BlockRef } from "../block-commands/blocks"
import { blocksOfSelection } from "../block-selection/blockSelection"

/**
 * TEXT DIRECTION PER BLOCK (B1; small-details A1–A2). With none set, a block
 * takes its direction from its own first letters (doc.css: unicode-bidi
 * plaintext), so a Hebrew line in an English doc already sits on the right.
 * Set from the block menu, `dir` fixes it: "rtl" puts the text, a list's
 * bullets and a quote's bar on the right whatever the letters, "ltr" the
 * other way. It is drawn by the indent extension's layout decorations, so a
 * callout or a toggle (React views) carries it too. A list item's direction
 * is its list's: the bullets go to one side together.
 */

export type BlockDirection = "ltr" | "rtl" | null

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    blockDir: {
      /** Sets the chosen blocks' (or the caret's block's) direction; null is automatic. */
      setBlockDir: (dir: BlockDirection) => ReturnType
    }
  }
}

/** The blocks a direction goes on: the chosen ones or the caret's, a list item's list. */
export function directionTargets(state: EditorState): BlockRef[] {
  const out: BlockRef[] = []
  for (const b of blocksOfSelection(state)) {
    let target = b
    if (LIST_ITEMS.includes(b.node.type.name)) {
      const $p = state.doc.resolve(b.pos)
      target = { pos: $p.before(), node: $p.parent }
    }
    if (DIR_NODES.includes(target.node.type.name) && !out.some((o) => o.pos === target.pos)) out.push(target)
  }
  return out
}

/** The direction the blocks share: "ltr", "rtl", null (automatic), or undefined when they differ. */
export function directionOf(state: EditorState): BlockDirection | undefined {
  const dirs = new Set(directionTargets(state).map((b) => (b.node.attrs.dir as BlockDirection) ?? null))
  return dirs.size === 1 ? [...dirs][0] : undefined
}

export const BlockDir = Extension.create({
  name: "blockDir",

  addGlobalAttributes() {
    return [
      {
        types: DIR_NODES,
        attributes: {
          dir: {
            default: null,
            keepOnSplit: true,
            parseHTML: (el: HTMLElement) => {
              const d = el.getAttribute("dir")
              return d === "ltr" || d === "rtl" ? d : null
            },
            renderHTML: (attrs: Record<string, unknown>) => (attrs.dir === "ltr" || attrs.dir === "rtl" ? { dir: attrs.dir } : {}),
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setBlockDir:
        (dir) =>
        ({ state, tr, dispatch }) => {
          const targets = directionTargets(state)
          if (!targets.length) return false
          if (!dispatch) return true
          for (const t of targets) {
            const node = tr.doc.nodeAt(t.pos)
            if (node && node.attrs.dir !== dir) tr.setNodeMarkup(t.pos, undefined, { ...node.attrs, dir })
          }
          return true
        },
    }
  },
})
