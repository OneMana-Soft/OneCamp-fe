"use client"

import { Extension, type Editor } from "@tiptap/core"
import { NodeSelection, Plugin, PluginKey, type EditorState } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"

import { docKeymapOf } from "../doc-keymap/storage"
import { BlockSelection } from "../block-selection/blockSelection"
import type { BlockRef } from "./blocks"
import { blockUnder } from "./blockUnder"
import { deleteBlocks, duplicateBlocks, insertLine, moveBlocks, targetBlocks, textSelectionOf, type BlockTarget } from "./commands"
import { blockEffectsPlugin } from "./effects"
import { requestBlockMenu } from "./menuRequest"
import { copyBlockLink } from "../block-link/blockLink"
import { firstLine } from "../block-handle/blockDrag"
import { feedback } from "@/lib/ui/feedback"

/**
 * THE BLOCKS' KEYS AND COMMANDS (B1; small-details S3, S7–S9, S11, A10, M5).
 *
 *   ⌘/         the block menu, from the keyboard (focus in its search)
 *   ⌘D         a copy of the block below it, its children with it
 *   ⌘⇧↑ ⌘⇧↓    the block moves past the one above or below
 *   ⌥⇧L        a link to the block
 *   ⌫ Del      with blocks chosen, they go
 *
 * And on a phone a 500 ms long-press on a block opens the block sheet (M5).
 *
 * The block menu's actions (register.ts) run these as commands, so the menu,
 * the sheet and the keys do one thing each, one way. Each takes the blocks a
 * menu named (its range) or, without one, the chosen blocks or the caret's.
 */

/** The blocks a menu named, by their ids or their range; none: the chosen blocks or the caret's. */
type Range = BlockTarget

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    blockCommands: {
      /** The blocks past the block above (-1) or below (1). */
      moveBlocks: (dir: -1 | 1, range?: Range) => ReturnType
      /** A copy of each block, right below it. */
      duplicateBlocks: (range?: Range) => ReturnType
      /** The blocks, gone. */
      deleteBlocks: (range?: Range) => ReturnType
      /** Copies a link to the (first) block. */
      copyBlockLink: (range?: Range) => ReturnType
      /** The blocks' text, selected: what Comment and Turn into act on. */
      selectBlockText: (range?: Range) => ReturnType
      /** An empty line under the caret's block, the caret in it (the phone bar's +). */
      addLineBelow: () => ReturnType
    }
  }
}

/** The block menu for the chosen blocks or the caret's, standing at the first one's line. */
function openBlockMenu(editor: Editor, via: "keys" | "press", blocks?: BlockRef[]): boolean {
  const { state, view } = editor
  const target = blocks ?? targetBlocks(state)
  if (!target.length) return false
  const line = firstLine(view, target[0])
  const el = view.nodeDOM(target[0].pos) as HTMLElement | null
  const left = el?.getBoundingClientRect?.().left ?? (view.dom as HTMLElement).getBoundingClientRect().left
  const anchor = { left: Math.max(8, left - 8), top: line?.top ?? 0, bottom: line?.bottom ?? 0 }
  // The blocks show as chosen while their menu is up (and typing can't replace them).
  const sel = new BlockSelection(state.doc, target.map((b) => b.pos))
  if (!sel.eq(state.selection)) view.dispatch(state.tr.setSelection(sel))
  return requestBlockMenu(editor, { blocks: target.map((b) => b.pos), anchor, via })
}

/** Runs a builder on the editor's state and dispatches what it made; true when the key was the blocks'. */
function run(editor: Editor, make: (state: EditorState) => unknown): boolean {
  if (!editor.isEditable) return false
  const keys = docKeymapOf(editor)
  if (keys) keys.tabLeaves = false
  const tr = make(editor.state)
  if (tr) editor.view.dispatch(tr as Parameters<EditorView["dispatch"]>[0])
  return true
}

/** How long a finger holds a block for its sheet, and how far it may wander. */
const LONG_PRESS_MS = 500
const PRESS_SLOP = 10

/**
 * A phone's long-press on a block opens the block sheet. Only a finger; the
 * press moves nothing and the sheet's actions run on the block it held.
 */
function longPress(editor: Editor) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let start: { x: number; y: number; id: number } | null = null
  let fired = false
  const stop = () => {
    if (timer) clearTimeout(timer)
    timer = null
    start = null
  }
  return new Plugin({
    key: new PluginKey("blockLongPress"),
    props: {
      handleDOMEvents: {
        pointerdown: (view, event) => {
          fired = false
          if (event.pointerType !== "touch" || !event.isPrimary) return false
          stop()
          start = { x: event.clientX, y: event.clientY, id: event.pointerId }
          timer = setTimeout(() => {
            timer = null
            const at = start
            start = null
            if (!at || view.isDestroyed) return
            const block = blockUnder(view, at.x, at.y)
            if (!block) return
            fired = true
            // The press fires (design v3, mobile F3): the block lifts, and a phone that can, buzzes.
            feedback("impact", view.nodeDOM(block.pos) as Element | null)
            openBlockMenu(editor, "press", [block])
          }, LONG_PRESS_MS)
          return false
        },
        pointermove: (_view, event) => {
          if (start && event.pointerId === start.id && Math.hypot(event.clientX - start.x, event.clientY - start.y) > PRESS_SLOP) stop()
          return false
        },
        pointerup: () => {
          stop()
          return false
        },
        pointercancel: () => {
          stop()
          return false
        },
        // Android's own long-press menu, and the click that ends a press that opened the sheet.
        contextmenu: (_view, event) => {
          if (!fired) return false
          event.preventDefault()
          return true
        },
        click: (_view, event) => {
          if (!fired) return false
          fired = false
          event.preventDefault()
          return true
        },
      },
    },
  })
}

export const BlockCommands = Extension.create({
  name: "blockCommands",
  // Ahead of A0's doc keymap (150), whose ⌘D copies only a line.
  priority: 160,

  addCommands() {
    return {
      moveBlocks:
        (dir, range) =>
        ({ state }) =>
          !!moveBlocks(state, targetBlocks(state, range), dir),
      duplicateBlocks:
        (range) =>
        ({ state }) =>
          !!duplicateBlocks(state, targetBlocks(state, range)),
      deleteBlocks:
        (range) =>
        ({ state }) =>
          !!deleteBlocks(state, targetBlocks(state, range)),
      copyBlockLink:
        (range) =>
        ({ state, editor, dispatch }) => {
          const [block] = targetBlocks(state, range)
          if (!block) return false
          // After this command's own transaction: the link may give the block its id.
          if (dispatch) queueMicrotask(() => void copyBlockLink(editor as Editor, block))
          return true
        },
      selectBlockText:
        (range) =>
        ({ state, tr }) => {
          const sel = textSelectionOf(state.doc, targetBlocks(state, range))
          if (!sel) return false
          tr.setSelection(sel)
          return true
        },
      addLineBelow:
        () =>
        ({ state }) => {
          const [block] = targetBlocks(state)
          return !!block && !!insertLine(state, block, false)
        },
    }
  },

  addKeyboardShortcuts() {
    const editor = this.editor
    const chosenOnly = (make: (state: EditorState) => unknown) => () =>
      editor.state.selection instanceof BlockSelection || (editor.state.selection instanceof NodeSelection && !editor.state.selection.node.isInline) ? run(editor, make) : false
    return {
      "Mod-/": () => openBlockMenu(editor, "keys"),
      "Mod-d": () => run(editor, (state) => duplicateBlocks(state, targetBlocks(state))),
      "Mod-Shift-ArrowUp": () => run(editor, (state) => moveBlocks(state, targetBlocks(state), -1)),
      "Mod-Shift-ArrowDown": () => run(editor, (state) => moveBlocks(state, targetBlocks(state), 1)),
      "Alt-Shift-l": () => {
        const [block] = targetBlocks(editor.state)
        if (!block) return false
        void copyBlockLink(editor, block)
        return true
      },
      Backspace: chosenOnly((state) => deleteBlocks(state, targetBlocks(state))),
      Delete: chosenOnly((state) => deleteBlocks(state, targetBlocks(state))),
    }
  },

  addProseMirrorPlugins() {
    return [blockEffectsPlugin(), longPress(this.editor)]
  },
})

