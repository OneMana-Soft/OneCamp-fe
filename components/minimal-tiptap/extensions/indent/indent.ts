"use client"

import { Extension, type Editor } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state"
import { Mapping, ReplaceAroundStep, StepMap, type Step } from "@tiptap/pm/transform"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

import { suggestionMenuOpen } from "../suggestion-popup"
import { isSlashMenuOpen } from "../slash-command/slashCommand"
import { docKeymapOf } from "../doc-keymap/storage"
import { DIR_NODES, INDENT_NODES, MAX_INDENT } from "../block-commands/nodes"
import { blockOfResolved, carriesIndent, indentOf, outlineEnd, placeOf, childPos, LIST_ITEMS, type BlockRef } from "../block-commands/blocks"
import { selectedBlocks } from "../block-selection/blockSelection"
import { isRemote } from "../block-id/blockId"

/**
 * TAB NESTS ANY BLOCK (B1; editor.md P1-6, small-details T23). A block's
 * nesting is an attribute, `indent` (0–8), not a wrapper: changing it is a
 * setNodeMarkup, which Yjs keeps as an attribute change, so nobody's typing
 * inside the block is lost, as a structural move would lose it.
 *
 * It reads as an outline: the blocks after one that are indented deeper are
 * its children. Tab nests a block (and its children) one level under the
 * block above it, never more than one level deeper than that block; ⇧Tab
 * brings them back. A list item nests in its list first (A0's keymap does
 * that); a list's first item, which can't, nests the whole list.
 *
 * It runs ahead of A0's doc keymap (priority 160 against 150) and leaves it
 * every key that isn't a block's: a menu's Tab, code's indent, a list item's
 * own nesting, and Escape then Tab, the keyboard's way out of the text.
 */

/** Where nesting is drawn and read: the attribute on the block's outer element. */
export const INDENT_ATTR = "indent"

/** The new indents for blocks, with their children: null where nothing changes. */
export function indentTransaction(state: EditorState, targets: BlockRef[], delta: 1 | -1): Transaction | null {
  const tr = state.tr
  return indentInto(tr, targets, delta) ? tr : null
}

/** Writes the blocks' new indents (their children's too) into a transaction; true when one changed. */
export function indentInto(tr: Transaction, targets: BlockRef[], delta: 1 | -1): boolean {
  const doc = tr.doc
  const sorted = [...targets].filter((t) => carriesIndent(t.node)).sort((a, b) => a.pos - b.pos)
  const next = new Map<number, number>()
  let coveredTo = -1
  for (const t of sorted) {
    if (t.pos < coveredTo) continue
    const place = placeOf(doc, t.pos)
    const end = outlineEnd(place.parent, place.index)
    const now = indentOf(t.node)
    let want = Math.max(0, Math.min(MAX_INDENT, now + delta))
    if (delta > 0) {
      // Never deeper than one level under the block above (as it will be).
      if (place.index === 0) want = now
      else {
        const prevPos = childPos(place, place.index - 1)
        const prev = place.parent.child(place.index - 1)
        const prevIndent = next.get(prevPos) ?? indentOf(prev)
        want = Math.min(want, prevIndent + 1)
      }
    }
    const shift = want - now
    let p = t.pos
    for (let i = place.index; i < end; i++) {
      const child = place.parent.child(i)
      if (shift !== 0) next.set(p, Math.max(0, Math.min(MAX_INDENT, indentOf(child) + shift)))
      p += child.nodeSize
    }
    coveredTo = p
  }
  let changed = false
  for (const [pos, indent] of next) {
    const node = tr.doc.nodeAt(pos)
    if (node && carriesIndent(node) && indentOf(node) !== indent) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, [INDENT_ATTR]: indent })
      changed = true
    }
  }
  return changed
}

/** The innermost list item around the selection, and its list. */
function listItemAround(state: EditorState): { item: PMNode; list: PMNode; listPos: number; first: boolean; nestedList: boolean } | null {
  const $from = state.selection.$from
  for (let d = $from.depth; d > 1; d--) {
    if (LIST_ITEMS.includes($from.node(d).type.name)) {
      return {
        item: $from.node(d),
        list: $from.node(d - 1),
        listPos: $from.before(d - 1),
        first: $from.index(d - 1) === 0,
        nestedList: d - 2 > 0 && LIST_ITEMS.includes($from.node(d - 2).type.name),
      }
    }
  }
  return null
}

/**
 * The blocks nesting moves: the chosen ones, else the caret's (a list's
 * first item: the whole list). Null when it is a list item's or code's own
 * nesting (A0's keymap, the phone bar's sink and lift); empty where there is
 * no block (nothing moves, and focus stays in the text).
 */
export function nestTargets(editor: Editor, delta: 1 | -1): BlockRef[] | null {
  const { state } = editor
  const chosen = selectedBlocks(state)
  if (chosen) return chosen
  if (editor.isActive("codeBlock")) return null
  const around = listItemAround(state)
  if (around) {
    const type = around.item.type.name
    if (delta > 0) {
      // A list item nests in its list when it can; the first can't: its list nests.
      if (editor.can().sinkListItem(type) || !around.first || around.nestedList) return null
    } else if (around.nestedList || indentOf(around.list) === 0) {
      // An indented list comes back first; then the item lifts out of it.
      return null
    }
    return [{ pos: around.listPos, node: around.list }]
  }
  const block = blockOfResolved(state.selection.$from)
  return block ? [block] : []
}

/** Tab (1) or ⇧Tab (-1): true when the key is the block's, false to leave it to A0's keymap. */
export function tabNests(editor: Editor, delta: 1 | -1): boolean {
  if (!editor.isEditable) return false
  if (docKeymapOf(editor)?.tabLeaves) return false
  if (suggestionMenuOpen(editor) || isSlashMenuOpen()) return false
  const targets = nestTargets(editor, delta)
  if (!targets) return false
  // Moved or not (the first block can't nest), focus stays in the text.
  const tr = indentTransaction(editor.state, targets, delta)
  if (tr) editor.view.dispatch(tr)
  return true
}

const layoutKey = new PluginKey<DecorationSet>("blockLayout")

/** The decoration that puts a block's indent and direction on its outer element. */
function layoutDeco(node: PMNode, pos: number): Decoration | null {
  const attrs: Record<string, string> = {}
  const indent = indentOf(node)
  if (indent > 0) attrs["data-indent"] = String(indent)
  const dir = DIR_NODES.includes(node.type.name) ? node.attrs.dir : null
  if (dir === "ltr" || dir === "rtl") attrs.dir = dir
  return Object.keys(attrs).length ? Decoration.node(pos, pos + node.nodeSize, attrs) : null
}

function decorationsIn(doc: PMNode, from: number, to: number): Decoration[] {
  const out: Decoration[] = []
  doc.nodesBetween(from, to, (node, pos) => {
    const d = layoutDeco(node, pos)
    if (d) out.push(d)
    return !node.isTextblock && !node.isAtom
  })
  return out
}

/**
 * The indent and direction on every block's outer element, a node view's
 * included (a React view doesn't draw its node's attributes). Built once with
 * the editor, then kept by mapping and by looking again only where a change
 * was (I20: no walk of the doc per key).
 */
function layoutPlugin() {
  return new Plugin<DecorationSet>({
    key: layoutKey,
    state: {
      init: (_, state) => DecorationSet.create(state.doc, decorationsIn(state.doc, 0, state.doc.content.size)),
      apply(tr, set, oldState) {
        if (!tr.docChanged) return set
        // What really changed, by comparing the two docs: y-prosemirror applies
        // a collaborator's keystroke as one replace of the whole doc, and its
        // steps would have every block looked at again.
        const start = oldState.doc.content.findDiffStart(tr.doc.content)
        if (start == null) return set.map(tr.mapping, tr.doc)
        const ends = oldState.doc.content.findDiffEnd(tr.doc.content)!
        const over = Math.max(0, start - Math.min(ends.a, ends.b))
        const endA = ends.a + over
        const endB = ends.b + over
        let next = set.map(new Mapping([new StepMap([start, endA - start, endB - start])]), tr.doc)
        next = next.remove(next.find(start, endB))
        return next.add(tr.doc, decorationsIn(tr.doc, start, endB))
      },
    },
    props: {
      decorations: (state) => layoutKey.getState(state),
    },
  })
}

/**
 * The attributes a block keeps when Turn into changes what it is: its indent
 * and its direction. Its id is BlockId's to keep (block-id/blockId.ts gives a
 * block rebuilt in its place the id it had).
 */
const KEPT_ON_TURN_INTO = [INDENT_ATTR, "dir"]


/** Where a step makes one node anew around its own content, in its place (setNodeMarkup, setBlockType, clearNodes' reset); else null. */
function rebuiltAt(step: Step): number | null {
  if (!(step instanceof ReplaceAroundStep)) return null
  const s = step as unknown as { from: number; to: number; gapFrom: number; gapTo: number; insert: number; structure: boolean; slice: { content: { childCount: number } } }
  if (!s.structure || s.insert !== 1 || s.gapFrom !== s.from + 1 || s.gapTo !== s.to - 1 || s.slice.content.childCount !== 1) return null
  return s.from
}

/**
 * Turn into makes each block anew without its attributes (clearNodes resets
 * it, then setNode gives it its new kind): it would lose its indent, its
 * direction and its id (so links and threads to it). Each block a change
 * rebuilt is compared with what it was before the whole change, however many
 * times it was rebuilt on the way, and what it lost is put back; in this
 * tab's own changes only (I6).
 */
export const keepOnTurnIntoKey = new PluginKey("keepOnTurnInto")

/**
 * Whether keepOnTurnInto answers a transaction: the person's own change only.
 * Never its own, and never another plugin's appended one (an id given, a
 * row tidied): two plugins that each answered the other's would append to
 * each other for ever, and ProseMirror asks again until nobody appends.
 */
const answers = (t: Transaction) => t.docChanged && !isRemote(t) && !t.getMeta(keepOnTurnIntoKey) && !t.getMeta("appendedTransaction")

function keepOnTurnInto(trs: readonly Transaction[], oldState: EditorState, newState: EditorState): Transaction | null {
  if (trs.some(isRemote) || !trs.some(answers)) return null
  const maps = trs.flatMap((t) => t.mapping.maps)
  const fixes = new Map<number, Record<string, unknown>>()
  let k = 0
  for (const t of trs) {
    const mine = answers(t)
    for (const step of t.steps) {
      const at = mine ? rebuiltAt(step) : null
      if (at !== null) {
        // What the block was before the change, and what it is now.
        const was = oldState.doc.nodeAt(new Mapping(maps.slice(0, k)).invert().map(at, 1))
        const pos = new Mapping(maps.slice(k)).map(at, 1)
        const node = newState.doc.nodeAt(pos)
        // Only a block that changed kind (Turn into): a change of its own
        // attributes (Tab, ⇧Tab, a direction) is what was asked for.
        if (was && node && !node.isInline && was.type !== node.type) {
          const attrs: Record<string, unknown> = { ...(fixes.get(pos) ?? {}) }
          for (const name of KEPT_ON_TURN_INTO) {
            const v = was.attrs[name]
            if (!node.type.spec.attrs?.[name] || v == null || v === 0 || node.attrs[name] === v) continue
            if (node.attrs[name] == null || node.attrs[name] === 0) attrs[name] = v
          }
          if (Object.keys(attrs).length) fixes.set(pos, attrs)
        }
      }
      k++
    }
  }
  if (!fixes.size) return null
  const tr = newState.tr
  for (const [pos, attrs] of fixes) {
    const node = tr.doc.nodeAt(pos)
    if (node && Object.entries(attrs).some(([name, v]) => node.attrs[name] !== v)) tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs })
  }
  // Appended only when something changes.
  if (!tr.docChanged) return null
  tr.setMeta(keepOnTurnIntoKey, true)
  // A Markdown shortcut ("## ") is a change of type too: its ⌘Z, kept by the
  // input rules until the next change, is carried past this part of it.
  for (const plugin of newState.plugins) {
    if (!(plugin.spec as { isInputRules?: boolean }).isInputRules) continue
    const rule = plugin.getState(newState)
    if (rule) tr.setMeta(plugin, rule)
  }
  // In history with the edit it answers: y-prosemirror writes a view's whole
  // update to Yjs with the history flag of the last transaction applied, and
  // this one is often the last. Out of it only when what it answers was.
  const own = (t: Transaction) => t.docChanged && !isRemote(t) && t.getMeta("addToHistory") !== false
  const inHistory = trs.some((t) => own(t) || own((t.getMeta("appendedTransaction") as Transaction | undefined) ?? t))
  return inHistory ? tr : tr.setMeta("addToHistory", false)
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    indent: {
      /** Nests the chosen blocks, or the caret's, one level deeper (1) or shallower (-1), as Tab does. */
      nestBlocks: (delta: 1 | -1) => ReturnType
    }
  }
}

export const Indent = Extension.create({
  name: "indent",
  priority: 160,

  addGlobalAttributes() {
    return [
      {
        types: INDENT_NODES,
        attributes: {
          [INDENT_ATTR]: {
            default: 0,
            keepOnSplit: true,
            parseHTML: (el: HTMLElement) => {
              const n = parseInt(el.getAttribute("data-indent") ?? "", 10)
              return Number.isFinite(n) ? Math.min(MAX_INDENT, Math.max(0, n)) : 0
            },
            renderHTML: (attrs: Record<string, unknown>) => (typeof attrs.indent === "number" && attrs.indent > 0 ? { "data-indent": String(attrs.indent) } : {}),
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      nestBlocks:
        (delta) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false
          const targets = nestTargets(editor as Editor, delta)
          if (!targets?.length) return false
          // True only when an indent changes, asked dry too: the phone bar's
          // buttons read it, and a change of nothing still reaches Yjs.
          if (!dispatch) return indentTransaction(editor.state, targets, delta) !== null
          return indentInto(tr, targets, delta)
        },
    }
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => tabNests(this.editor, 1),
      "Shift-Tab": () => tabNests(this.editor, -1),
    }
  },

  addProseMirrorPlugins() {
    return [
      layoutPlugin(),
      new Plugin({
        key: keepOnTurnIntoKey,
        appendTransaction: (trs, oldState, newState) => (trs.some((t) => t.docChanged) ? keepOnTurnInto(trs, oldState, newState) : null),
      }),
    ]
  },
})
