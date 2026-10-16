"use client"

import { Extension, type Editor } from "@tiptap/core"
import { Fragment, Slice, type Node as PMNode } from "@tiptap/pm/model"
import { NodeSelection, Plugin, PluginKey, Selection, SelectionRange, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state"
import { AttrStep, ReplaceAroundStep, type Mappable, type Step } from "@tiptap/pm/transform"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

import { suggestionMenuOpen } from "../suggestion-popup"
import { isSlashMenuOpen } from "../slash-command/slashCommand"
import { docKeymapOf } from "../doc-keymap/storage"
import { adjacentBlock, blockOfResolved, blocksBetween, isBlock, removalRange, standAlone, textRange, type BlockRef } from "../block-commands/blocks"
import { blockUnder } from "../block-commands/blockUnder"
import { blocksWithIds } from "../block-commands/blockIds"

/**
 * BLOCK SELECTION (B1; small-details S1, S3, S4, V6). Notion's way of
 * choosing blocks rather than text: Esc selects the block the caret is in (or
 * the blocks a text selection touches) and Esc again goes back to the text;
 * ↑ ↓ move to the block above or below, ⇧↑ ⇧↓ take in more, ↩ edits, ⌫
 * deletes; ⇧-click extends a block selection and ⌘⇧-click adds or removes one
 * block, so the chosen blocks may sit apart.
 *
 * The selection is a Selection of its own (BlockSelection): copy, cut and
 * paste work on whole blocks, and typing does nothing to them. Each chosen
 * block wears `block-selected` (index.css: the selection colour at 60 %, r6).
 * One block a menu acts on is a NodeSelection (WAVE_B_CONTRACTS), which
 * selectedBlocks reads too.
 */

/** Several blocks, or one, chosen as blocks; apart or together. */
export class BlockSelection extends Selection {
  /** The chosen blocks' positions, in document order. */
  readonly blocks: readonly number[]
  /** Where ⇧↑ ⇧↓ and ⇧-click extend from, and to. */
  readonly anchorBlock: number
  readonly headBlock: number

  constructor(doc: PMNode, blocks: readonly number[], anchorBlock?: number, headBlock?: number) {
    const sorted = [...new Set(blocks)].sort((a, b) => a - b)
    const ranges: SelectionRange[] = []
    for (const pos of sorted) {
      const end = pos + doc.nodeAt(pos)!.nodeSize
      const last = ranges[ranges.length - 1]
      // Blocks side by side are one range: copy and delete take them together.
      if (last && last.$to.pos === pos) ranges[ranges.length - 1] = new SelectionRange(last.$from, doc.resolve(end))
      else ranges.push(new SelectionRange(doc.resolve(pos), doc.resolve(end)))
    }
    super(ranges[0].$from, ranges[ranges.length - 1].$to, ranges)
    this.blocks = sorted
    this.anchorBlock = anchorBlock !== undefined && sorted.includes(anchorBlock) ? anchorBlock : sorted[0]
    this.headBlock = headBlock !== undefined && sorted.includes(headBlock) ? headBlock : sorted[sorted.length - 1]
  }

  override get $from() {
    return this.ranges[0].$from
  }

  override get $to() {
    return this.ranges[this.ranges.length - 1].$to
  }

  /**
   * The first chosen block, as a NodeSelection's node: what reads a
   * selection's node treats chosen blocks as blocks, not as text (the
   * selection bar stays away; the block menu has their actions).
   */
  get node(): PMNode {
    return this.$from.doc.nodeAt(this.blocks[0])!
  }

  /** Whether the blocks sit together, one range of siblings. */
  get together(): boolean {
    return this.ranges.length === 1
  }

  /** The chosen blocks, with their nodes. */
  refs(doc: PMNode = this.$from.doc): BlockRef[] {
    return this.blocks.map((pos) => ({ pos, node: doc.nodeAt(pos)! }))
  }

  override map(doc: PMNode, mapping: Mappable): Selection {
    const before = this.$from.doc
    // The same block where it went: by its id, or (before it has one) its
    // kind. A change of its attributes (an indent, its id given) keeps it
    // chosen, as a change to what it holds does.
    const keep = (pos: number) => {
      const old = before.nodeAt(pos)
      const r = mapping.mapResult(pos, 1)
      const node = r.pos <= doc.content.size ? doc.nodeAt(r.pos) : null
      if (!old || !node || !isBlock(node)) return null
      const same = old.attrs.blockId ? node.attrs.blockId === old.attrs.blockId : !r.deletedAcross && node.type === old.type
      return same ? r.pos : null
    }
    const blocks = this.blocks.map(keep).filter((p): p is number => p !== null)
    if (!blocks.length) return TextSelection.near(doc.resolve(Math.min(doc.content.size, mapping.map(this.from))))
    return new BlockSelection(doc, blocks, keep(this.anchorBlock) ?? undefined, keep(this.headBlock) ?? undefined)
  }

  override content(): Slice {
    const doc = this.$from.doc
    if (this.together) return doc.slice(this.from, this.to, true)
    // Apart: each block on its own, in order; an item in a list of its kind.
    return new Slice(Fragment.fromArray(this.blocks.map((pos) => standAlone(doc.nodeAt(pos)!, doc.resolve(pos).parent.type))), 0, 0)
  }

  override replace(tr: Transaction, content: Slice = Slice.empty) {
    // Each range goes whole (deleteRange takes a list with all its items, a
    // column the blocks leave empty goes too), from the last, so the first
    // one's place is where content goes.
    const ranges = [...this.ranges].reverse()
    const mapFrom = tr.steps.length
    for (const r of ranges) {
      const { from, to } = removalRange(tr.doc, r.$from.pos, r.$to.pos)
      tr.deleteRange(from, to)
    }
    if (content.size) {
      const at = tr.mapping.slice(mapFrom).map(this.ranges[0].$from.pos)
      tr.replaceRange(at, at, content)
    }
  }

  override eq(other: Selection): boolean {
    return other instanceof BlockSelection && other.blocks.length === this.blocks.length && other.blocks.every((p, i) => p === this.blocks[i])
  }

  override toJSON() {
    return { type: "ocBlocks", blocks: [...this.blocks], anchor: this.anchorBlock, head: this.headBlock }
  }

  static override fromJSON(doc: PMNode, json: { blocks?: unknown; anchor?: unknown; head?: unknown }): Selection {
    const blocks = Array.isArray(json.blocks) ? json.blocks.filter((p): p is number => typeof p === "number" && !!doc.nodeAt(p) && isBlock(doc.nodeAt(p)!)) : []
    if (!blocks.length) return Selection.atStart(doc)
    return new BlockSelection(doc, blocks, json.anchor as number, json.head as number)
  }
}
BlockSelection.prototype.visible = false
Selection.jsonID("ocBlocks", BlockSelection)

/** A selection of blocks: a BlockSelection, or one block a NodeSelection holds. */
export function selectedBlocks(state: EditorState): BlockRef[] | null {
  const { selection } = state
  if (selection instanceof BlockSelection) return selection.refs(state.doc)
  if (selection instanceof NodeSelection && isBlock(selection.node)) return [{ pos: selection.from, node: selection.node }]
  return null
}

/** What chooses these blocks as a menu acts on them: one block a NodeSelection, several a BlockSelection. */
export function selectionForMenu(doc: PMNode, blocks: BlockRef[]): Selection {
  return blocks.length === 1 ? NodeSelection.create(doc, blocks[0].pos) : new BlockSelection(doc, blocks.map((b) => b.pos))
}

/** The blocks a text selection touches, at one level. */
export function blocksOfSelection(state: EditorState): BlockRef[] {
  const chosen = selectedBlocks(state)
  if (chosen) return chosen
  const { $from, $to } = state.selection
  const a = blockOfResolved($from)
  const b = blockOfResolved($to)
  if (!a) return []
  if (!b || a.pos === b.pos) return [a]
  return blocksBetween(state.doc, a.pos, b.pos)
}

/** Back from blocks to the text: the caret at the end of the last one, or near it. */
export function caretAfterBlocks(doc: PMNode, blocks: BlockRef[]): Selection {
  const last = blocks[blocks.length - 1]
  const r = textRange(last.node, last.pos)
  return r ? TextSelection.create(doc, r.end) : Selection.near(doc.resolve(Math.min(doc.content.size, last.pos + last.node.nodeSize)), -1)
}

export const blockSelectionKey = new PluginKey("blockSelection")

const BLOCK_ID = "blockId"

/**
 * After a collaborator's edit, the shared doc's update replaces the whole doc
 * and y-prosemirror puts back a text selection: the same blocks are found
 * again by their ids, or by the text range when they have none.
 */
function restoreAfterRemote(old: BlockSelection, state: EditorState): Transaction | null {
  const ids = old.refs().map((b) => b.node.attrs[BLOCK_ID]).filter((id): id is string => typeof id === "string")
  let blocks: number[] = []
  if (ids.length === old.blocks.length) {
    blocks = blocksWithIds(state.doc, ids).map((b) => b.pos)
  } else {
    blocks = blocksOfSelection(state).map((b) => b.pos)
  }
  if (!blocks.length) return null
  return state.tr.setSelection(new BlockSelection(state.doc, blocks)).setMeta(blockSelectionKey, true)
}

/** A step that changes only one node's attributes (setNodeMarkup, setNodeAttribute), at pos. */
const markupAt = (step: Step, pos: number) =>
  (step instanceof AttrStep && step.pos === pos) ||
  (step instanceof ReplaceAroundStep && step.from === pos && step.insert === 1 && step.gapFrom === step.from + 1 && step.gapTo === step.to - 1 && step.slice.content.childCount === 1 && step.slice.content.firstChild!.content.size === 0)

/**
 * A block a menu holds (a NodeSelection) stays held through a change of its
 * own attributes alone: an id given to it as it moved, an indent, a
 * direction, a colour. ProseMirror maps a NodeSelection through
 * setNodeMarkup as deleted, and the menu's next action, or the phone's sheet
 * following its block, would find a caret instead.
 */
function keepHeldBlock(trs: readonly Transaction[], old: NodeSelection, state: EditorState): Transaction | null {
  if (state.selection instanceof NodeSelection || !isBlock(old.node)) return null
  if (trs.some((tr) => tr.selectionSet) || !trs.some((tr) => tr.docChanged)) return null
  if (!trs.every((tr) => tr.steps.every((step) => markupAt(step, old.from)))) return null
  const node = state.doc.nodeAt(old.from)
  if (!node || node.type !== old.node.type || !NodeSelection.isSelectable(node)) return null
  return state.tr.setSelection(NodeSelection.create(state.doc, old.from)).setMeta(blockSelectionKey, true)
}

function setBlocks(editor: Editor, blocks: BlockRef[], anchor?: number, head?: number): boolean {
  if (!blocks.length) return false
  const tr = editor.state.tr.setSelection(new BlockSelection(editor.state.doc, blocks.map((b) => b.pos), anchor, head))
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

/** Esc: choose the caret's block, or the blocks a text selection touches; Esc again: back to the text. */
export function escapeToBlocks(editor: Editor): boolean {
  if (suggestionMenuOpen(editor) || isSlashMenuOpen()) return false
  const { state } = editor
  // Escape, then Tab leaves the editor (A0's way out for the keyboard): this
  // handler runs ahead of A0's keymap, so it arms it itself.
  const keys = docKeymapOf(editor)
  if (keys) keys.tabLeaves = true
  const chosen = chosenAsBlocks(state)
  if (chosen) {
    editor.view.dispatch(state.tr.setSelection(caretAfterBlocks(state.doc, chosen)))
    return true
  }
  const blocks = blocksOfSelection(state)
  return setBlocks(editor, blocks)
}

/** Blocks chosen as blocks: a block selection, or a block (not an image or an embed) a NodeSelection holds. */
function chosenAsBlocks(state: EditorState): BlockRef[] | null {
  const sel = state.selection
  if (sel instanceof BlockSelection) return sel.refs(state.doc)
  if (sel instanceof NodeSelection && isBlock(sel.node) && !sel.node.isAtom) return [{ pos: sel.from, node: sel.node }]
  return null
}

/** ↑ ↓ with blocks chosen: the block above or below instead; with ⇧, one more. */
export function stepBlocks(editor: Editor, dir: -1 | 1, extend: boolean): boolean {
  const { state } = editor
  const sel = state.selection
  if (!(sel instanceof BlockSelection)) return false
  const keys = docKeymapOf(editor)
  if (keys) keys.tabLeaves = false
  const doc = state.doc
  if (!extend) {
    const edge = sel.refs()[dir > 0 ? sel.blocks.length - 1 : 0]
    const next = adjacentBlock(doc, edge, dir)
    return next ? setBlocks(editor, [next]) : true
  }
  const head = { pos: sel.headBlock, node: doc.nodeAt(sel.headBlock)! }
  const next = adjacentBlock(doc, head, dir)
  if (!next) return true
  return setBlocks(editor, blocksBetween(doc, sel.anchorBlock, next.pos), sel.anchorBlock, next.pos)
}

/** ↩ with blocks chosen: edit the last one, its text's end. */
export function editBlocks(editor: Editor): boolean {
  const { state } = editor
  if (!(state.selection instanceof BlockSelection)) return false
  editor.view.dispatch(state.tr.setSelection(caretAfterBlocks(state.doc, state.selection.refs())).scrollIntoView())
  return true
}

/**
 * ⇧-click with blocks chosen extends to the clicked block; ⌘⇧-click adds the
 * clicked block, or takes it out when it is in. Anything else is left to the
 * text (⇧-click from a caret extends the text, as everywhere).
 */
export function clickBlocks(state: EditorState, block: BlockRef, toggle: boolean): Selection | null {
  const sel = state.selection
  if (toggle) {
    const chosen = selectedBlocks(state) ?? []
    const contains = (a: BlockRef, b: BlockRef) => a.pos <= b.pos && a.pos + a.node.nodeSize >= b.pos + b.node.nodeSize
    const exact = chosen.some((b) => b.pos === block.pos)
    // A block inside a chosen one, or holding one, takes their place.
    const kept = chosen.filter((b) => b.pos !== block.pos && !contains(b, block) && !contains(block, b))
    const next = exact ? kept : [...kept, block]
    if (!next.length) {
      const r = textRange(block.node, block.pos)
      return r ? TextSelection.create(state.doc, r.end) : null
    }
    return new BlockSelection(state.doc, next.map((b) => b.pos), block.pos, block.pos)
  }
  if (sel instanceof BlockSelection) return new BlockSelection(state.doc, blocksBetween(state.doc, sel.anchorBlock, block.pos).map((b) => b.pos), sel.anchorBlock, block.pos)
  if (sel instanceof NodeSelection && isBlock(sel.node)) return new BlockSelection(state.doc, blocksBetween(state.doc, sel.from, block.pos).map((b) => b.pos), sel.from, block.pos)
  return null
}

function decorations(state: EditorState): DecorationSet | null {
  const chosen = selectedBlocks(state)
  if (!chosen) return null
  return DecorationSet.create(
    state.doc,
    chosen.map((b) => Decoration.node(b.pos, b.pos + b.node.nodeSize, { class: "block-selected" })),
  )
}

export const BlockSelectionExtension = Extension.create({
  name: "blockSelection",
  // Ahead of the link's keys (1000), which collapse any selection on Esc, and
  // of A0's doc keymap (150). The arrows and ↩ act only on chosen blocks; Esc
  // is the blocks' everywhere but in an open menu.
  priority: 1050,

  addKeyboardShortcuts() {
    const editor = this.editor
    return {
      Escape: () => escapeToBlocks(editor),
      ArrowUp: () => stepBlocks(editor, -1, false),
      ArrowDown: () => stepBlocks(editor, 1, false),
      "Shift-ArrowUp": () => stepBlocks(editor, -1, true),
      "Shift-ArrowDown": () => stepBlocks(editor, 1, true),
      Enter: () => editBlocks(editor),
    }
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        key: blockSelectionKey,
        appendTransaction(trs, oldState, newState) {
          // Never in answer to itself alone: it only ever puts a selection back.
          if (trs.every((t) => t.getMeta(blockSelectionKey))) return null
          const old = oldState.selection
          if (old instanceof NodeSelection) return keepHeldBlock(trs, old, newState)
          if (!(old instanceof BlockSelection) || newState.selection instanceof BlockSelection) return null
          if (!trs.some((tr) => (tr.getMeta("y-sync$") as { isChangeOrigin?: boolean } | undefined)?.isChangeOrigin)) return null
          return restoreAfterRemote(old, newState)
        },
        props: {
          decorations,
          // Typing over chosen blocks does nothing (as in Notion): ↩ edits.
          handleTextInput: (view) => !!chosenAsBlocks(view.state),
          handleDOMEvents: {
            mousedown: (view, event) => {
              if (event.button !== 0 || !event.shiftKey || !editor.isEditable) return false
              const block = blockUnder(view, event.clientX, event.clientY)
              if (!block) return false
              const next = clickBlocks(view.state, block, event.metaKey || event.ctrlKey)
              if (!next) return false
              event.preventDefault()
              view.dispatch(view.state.tr.setSelection(next))
              view.focus()
              return true
            },
          },
        },
      }),
    ]
  },
})
