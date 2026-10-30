"use client"

import type { Editor } from "@tiptap/core"
import { NodeSelection } from "@tiptap/pm/state"
import { Languages, Type } from "@/lib/icons"
import { fuzzyMatch } from "@/components/ui/CommandList"
import { NO_BUS, busFor } from "@/components/docEditor/registry/commandBus"
import { actionGroupsFor, blockLabelFor, currentTurnIntoLabel, turnIntoFor, type ShownAction } from "@/components/docEditor/registry/readers"
import { chordGlyphs } from "@/components/docEditor/registry/shortcuts"
import type { ActionContext } from "@/components/docEditor/registry/types"
import type { BlockMenuRequest } from "@/components/minimal-tiptap/extensions/block-commands/menuRequest"
import { BLOCK_MENU_GROUPS } from "@/components/minimal-tiptap/extensions/block-commands/actions"
import { BlockSelection, selectionForMenu } from "@/components/minimal-tiptap/extensions/block-selection/blockSelection"
import { isBlock, spanOf, textRange, type BlockRef } from "@/components/minimal-tiptap/extensions/block-commands/blocks"
import { directionOf, directionTargets, type BlockDirection } from "@/components/minimal-tiptap/extensions/block-dir/blockDir"
import { newBlockId } from "@/components/minimal-tiptap/extensions/block-id/blockId"

/**
 * The block menu's rows (B1), shared by its popover (BlockMenuPopover.tsx)
 * and the phone's sheet (BlockSheet.tsx); both load on first use.
 */

/** One row of the menu, or of a list beside it. */
export interface MenuRow {
  id: string
  label: string
  icon?: React.ElementType
  keys?: string[]
  /** It opens a list beside it. */
  list?: "turn" | "dir"
  danger?: boolean
  checked?: boolean
  group: string
  /** More words it is found by. */
  words?: string
  run(): void
}

interface MenuRows {
  main: MenuRow[]
  turn: MenuRow[]
  dir: MenuRow[]
}

const mac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
const WORDS: Record<string, string> = { "⌘": "Ctrl", "⌥": "Alt", "⇧": "Shift" }
const keysOf = (chord: string | undefined) => (chord ? chordGlyphs(chord).map((k) => (mac() ? k : WORDS[k] ?? k)) : undefined)

/** The blocks a request names, if they are all still there. */
export function blocksOf(editor: Editor, request: BlockMenuRequest): BlockRef[] | null {
  const out: BlockRef[] = []
  for (const pos of request.blocks) {
    const node = pos < editor.state.doc.content.size ? editor.state.doc.nodeAt(pos) : null
    if (!node || !isBlock(node)) return null
    out.push({ pos, node })
  }
  return out.length ? out : null
}

/** Blocks side by side, as ranges: what one text selection can hold. */
function sideBySide(blocks: BlockRef[]): Array<{ from: number; to: number }> {
  const out: Array<{ from: number; to: number }> = []
  for (const b of [...blocks].sort((x, y) => x.pos - y.pos)) {
    const last = out[out.length - 1]
    if (last && last.to === b.pos) last.to = b.pos + b.node.nodeSize
    else out.push({ from: b.pos, to: b.pos + b.node.nodeSize })
  }
  return out
}

/** The blocks' ids in document order (ctx.state.blocks), when every one has its id. */
function idsOf(blocks: BlockRef[]): string[] | undefined {
  const ids = [...blocks].sort((a, b) => a.pos - b.pos).map((b) => b.node.attrs.blockId as unknown)
  return ids.length && ids.every((id) => typeof id === "string" && id !== "") ? (ids as string[]) : undefined
}

/**
 * What an action is given: this doc, its editor and bus, the blocks' ids and
 * the range they span, where the menu stood, and what opened it (`via`:
 * "press" is the phone's sheet, where an action leaves the doc's focus, and
 * the keyboard, alone).
 */
function contextFor(editor: Editor, docId: string, gate: { ai: boolean }, blocks: BlockRef[], request: Pick<BlockMenuRequest, "anchor" | "via">): ActionContext {
  const ids = idsOf(blocks)
  return {
    docId,
    editor,
    canEdit: editor.isEditable,
    bus: busFor(editor) ?? NO_BUS,
    gate,
    state: { ...(ids ? { blocks: ids } : {}), range: spanOf(blocks), anchor: request.anchor, via: request.via },
  }
}

/**
 * Each block named by its id before an action runs: one without an id yet
 * (a doc older than block ids, before the server gave it theirs) is given
 * one here, in this tab's own change (A1's rule), as a link to it would be.
 */
function giveIds(editor: Editor, blocks: BlockRef[]): void {
  const missing = blocks.filter((b) => !b.node.attrs.blockId && b.node.type.spec.attrs?.blockId)
  if (!missing.length || !editor.isEditable) return
  const tr = editor.state.tr
  for (const b of missing) tr.setNodeMarkup(b.pos, undefined, { ...b.node.attrs, blockId: newBlockId() })
  editor.view.dispatch(tr.setMeta("addToHistory", false))
}

/** The name of what is chosen: "Heading 2", "Page", or "3 blocks". */
export function chosenLabel(editor: Editor, blocks: BlockRef[], gate: { ai: boolean }): string {
  if (blocks.length > 1) return `${blocks.length} blocks`
  // A block with no text (a page, an image) by its own name: the caret's
  // block was the text it was last in, so a page's sheet said "Text".
  const node = blocks[0]?.node
  const own = node?.isAtom ? blockLabelFor(node.type.name, gate) : undefined
  return own ?? currentTurnIntoLabel(editor, turnIntoFor(gate))
}

/** Selects the blocks as an action needs them (WAVE_B_CONTRACTS), and gives it its context. */
export function prepare(editor: Editor, docId: string, gate: { ai: boolean }, request: BlockMenuRequest): ActionContext | null {
  const named = blocksOf(editor, request)
  if (!named) return null
  giveIds(editor, named)
  // An id is an attribute: the blocks are where they were.
  const blocks = blocksOf(editor, request)
  if (!blocks) return null
  const sel = selectionForMenu(editor.state.doc, blocks)
  if (!sel.eq(editor.state.selection)) editor.view.dispatch(editor.state.tr.setSelection(sel))
  return contextFor(editor, docId, gate, blocks, request)
}

/** After one of B1's own actions: a block left node-selected rests chosen (typing can't replace it). */
export function settle(editor: Editor) {
  const sel = editor.state.selection
  if (!editor.isDestroyed && sel instanceof NodeSelection && isBlock(sel.node) && !sel.node.isAtom) {
    editor.view.dispatch(editor.state.tr.setSelection(new BlockSelection(editor.state.doc, [sel.from])))
  }
}

/**
 * The rows: Turn into, the registered actions in their groups, Text
 * direction; and the two lists' own. `done` closes the menu (refocus: back to
 * the doc, rather than to what an action opened; the phone's sheet stays open
 * for a move).
 */
export function menuRows(editor: Editor, docId: string, gate: { ai: boolean }, request: BlockMenuRequest, done: (refocus: boolean, actionId?: string) => void): MenuRows {
  const blocks = blocksOf(editor, request) ?? []
  const ctx = contextFor(editor, docId, gate, blocks, request)
  const editable = editor.isEditable
  const runShown = (a: ShownAction) => () => {
    done(false, a.action.id)
    const fresh = prepare(editor, docId, gate, request)
    if (!fresh) return
    void Promise.resolve(a.action.run(fresh)).finally(() => {
      if (a.action.id.startsWith("block.")) settle(editor)
    })
  }
  const main: MenuRow[] = []
  if (editable && blocks.some((b) => textRange(b.node, b.pos))) main.push({ id: "turn", label: "Turn into", icon: Type, list: "turn", group: "style", run: () => {} })
  for (const g of actionGroupsFor("blockMenu", ctx, BLOCK_MENU_GROUPS)) {
    for (const a of g.actions) {
      main.push({ id: a.action.id, label: a.label, icon: a.icon, keys: keysOf(a.action.shortcut), danger: !!a.action.destructive, group: g.group, words: (a.action.aliases ?? []).join(" "), run: runShown(a) })
    }
  }
  // While the menu is up, its blocks are the editor's selection (the handle and ⌘/ chose them).
  const dirTargets = blocks.length ? directionTargets(editor.state) : []
  if (editable && dirTargets.length) {
    let at = -1
    main.forEach((r, i) => {
      if (r.group === "style") at = i
    })
    main.splice(at + 1, 0, { id: "dir", label: "Text direction", icon: Languages, list: "dir", group: "style", run: () => {} })
  }

  const one = blocks.length === 1
  const turn: MenuRow[] = turnIntoFor(gate).map((t) => ({
    id: `turn.${t.id}`,
    label: t.label,
    icon: t.icon,
    group: "Turn into",
    checked: one && t.isActive(editor),
    run: () => {
      done(false)
      const now = blocksOf(editor, request)
      if (!now) return
      // Turned as a selection is (the selection bar's Turn into): each run of
      // blocks side by side, the last first so the others keep their places
      // (blocks chosen apart turn alone); then the caret at the end.
      for (const run of sideBySide(now).reverse()) {
        editor.commands.selectBlockText(run)
        t.run(editor)
      }
      editor.commands.setTextSelection(editor.state.selection.to)
    },
  }))
  const current: BlockDirection | undefined = dirTargets.length ? directionOf(editor.state) : undefined
  const dirRow = (id: BlockDirection, label: string, words: string): MenuRow => ({
    id: `dir.${id ?? "auto"}`,
    label,
    group: "Text direction",
    checked: current === id,
    words,
    run: () => {
      done(true)
      if (!prepare(editor, docId, gate, request)) return
      // The phone's sheet leaves the doc without its keyboard.
      ;(request.via === "press" ? editor.chain() : editor.chain().focus()).setBlockDir(id).run()
      settle(editor)
    },
  })
  const dir = [dirRow(null, "Automatic", "auto from the text"), dirRow("ltr", "Left to right", "ltr"), dirRow("rtl", "Right to left", "rtl hebrew arabic")]
  return { main, turn, dir }
}

/** The rows a search finds: every action and every list's entry, by their words. */
export function searchRows(rows: MenuRows, query: string): MenuRow[] {
  const q = query.trim()
  if (!q) return rows.main
  const all = [...rows.main.filter((r) => !r.list), ...rows.turn, ...rows.dir]
  return all.filter((r) => fuzzyMatch(r.label, q) || (!!r.words && r.words.toLowerCase().includes(q.toLowerCase())))
}

